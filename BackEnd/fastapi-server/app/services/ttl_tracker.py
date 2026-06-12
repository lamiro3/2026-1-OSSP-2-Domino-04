"""
services/ttl_tracker.py

재난문자 TTL 추적기.

재난 감지 직후부터 아래 시퀀스로 '재난이 아직 유효한지' 확인:
  +1h → +3h → +8h → +12h → +24h → +12h → +8h → +3h → +1h
  (각 체크 간격, 누적 72시간)

각 체크 시점에 해당 area_nm의 서울 API를 호출해,
원래 감지된 dst_msg가 응답에서 사라졌으면 DB의 expires_at을 즉시 NOW()로 업데이트.
72시간 모두 소진 시 자동 만료.

API 호출 실패 시: 보수적으로 '아직 유효'로 처리 (조기 만료 방지).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import text

from app.database import SessionLocal
from app.services.seoul_api import SeoulApiClient

logger = logging.getLogger(__name__)

# 각 체크 간의 간격 (시간 단위) — 누적 72시간
_TTL_SEQUENCE_HOURS = [1, 3, 8, 12, 24, 12, 8, 3, 1]

# 체커 루프 간격: 1분마다 만료 여부 확인
_CHECKER_INTERVAL_S = 60


def _cumulative_hours(index: int) -> int:
    """0~index 구간의 누적 시간 반환."""
    return sum(_TTL_SEQUENCE_HOURS[: index + 1])


@dataclass
class TtlState:
    db_id: int
    dst_msg: str        # 재난문자 원문 — 종료 판단 기준
    area_nm: str        # 서울 API 폴링 대상 핫스팟명
    received_at: datetime
    check_index: int = 0
    next_check_at: datetime = field(init=False)

    def __post_init__(self) -> None:
        self.next_check_at = self.received_at + timedelta(hours=_cumulative_hours(0))

    def advance(self) -> None:
        """다음 시퀀스로 이동."""
        self.check_index += 1
        self.next_check_at = self.received_at + timedelta(
            hours=_cumulative_hours(self.check_index)
        )

    @property
    def is_exhausted(self) -> bool:
        return self.check_index >= len(_TTL_SEQUENCE_HOURS)


class TtlTracker:
    """
    활성 재난의 TTL 시퀀스를 관리.

    사용법 (scheduler.py):
        tracker = TtlTracker()
        asyncio.create_task(tracker.run(), name="scheduler-ttl")
        tracker.register(db_id, dst_msg, area_nm, received_at)
    """

    def __init__(self, api_client: SeoulApiClient | None = None) -> None:
        self._api = api_client or SeoulApiClient()
        self._active: dict[int, TtlState] = {}
        self._lock = asyncio.Lock()

    # ── 공개 API ─────────────────────────────────

    def register(
        self,
        db_id: int,
        dst_msg: str,
        area_nm: str,
        received_at: datetime,
    ) -> None:
        """새 재난 등록. 이미 등록된 db_id는 무시."""
        if db_id in self._active:
            return
        state = TtlState(
            db_id=db_id,
            dst_msg=dst_msg,
            area_nm=area_nm,
            received_at=received_at,
        )
        self._active[db_id] = state
        logger.info(
            "[TtlTracker] 등록 — id=%d area=%s 다음 체크: %s (+%dh)",
            db_id,
            area_nm,
            state.next_check_at.strftime("%Y-%m-%d %H:%M"),
            _TTL_SEQUENCE_HOURS[0],
        )

    async def run(self) -> None:
        """1분마다 체크 루프 실행 (asyncio.Task로 구동)."""
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("[TtlTracker] 체크 루프 오류: %s", exc)
            await asyncio.sleep(_CHECKER_INTERVAL_S)

    @property
    def active_count(self) -> int:
        return len(self._active)

    # ── 내부 로직 ─────────────────────────────────

    async def _tick(self) -> None:
        now = datetime.now()
        async with self._lock:
            due = [s for s in self._active.values() if now >= s.next_check_at]

        to_expire: list[int] = []

        for state in due:
            still_active = await self._is_still_active(state)

            if not still_active:
                logger.info(
                    "[TtlTracker] 재난 종료 — id=%d (메시지가 API에서 사라짐)",
                    state.db_id,
                )
                to_expire.append(state.db_id)
                continue

            async with self._lock:
                state.advance()
                if state.is_exhausted:
                    logger.info("[TtlTracker] 72시간 만료 — id=%d", state.db_id)
                    to_expire.append(state.db_id)
                else:
                    logger.info(
                        "[TtlTracker] 재난 지속 — id=%d 다음 체크: %s (+%dh)",
                        state.db_id,
                        state.next_check_at.strftime("%Y-%m-%d %H:%M"),
                        _TTL_SEQUENCE_HOURS[state.check_index],
                    )

        if to_expire:
            await self._expire_many(to_expire)
            async with self._lock:
                for db_id in to_expire:
                    self._active.pop(db_id, None)

    async def _is_still_active(self, state: TtlState) -> bool:
        """서울 API에서 해당 area의 재난문자 중 state.dst_msg가 있으면 True."""
        try:
            citydata = await self._api.fetch_citydata(state.area_nm)
            if citydata is None or not citydata.disasters:
                return False
            return any(d.dst_msg == state.dst_msg for d in citydata.disasters)
        except Exception as exc:
            # API 오류 시 조기 만료 방지를 위해 보수적으로 유효 처리
            logger.warning("[TtlTracker] API 조회 실패 — 유효 유지 (id=%d): %s", state.db_id, exc)
            return True

    async def _expire_many(self, db_ids: list[int]) -> None:
        """DisasterAlerts.expires_at을 NOW()로 일괄 업데이트."""
        db = SessionLocal()
        try:
            for db_id in db_ids:
                db.execute(
                    text(
                        "UPDATE DisasterAlerts "
                        "SET expires_at = NOW(), updated_at = NOW() "
                        "WHERE id = :id"
                    ),
                    {"id": db_id},
                )
            db.commit()
            logger.info("[TtlTracker] DB 만료 처리 완료 — %s", db_ids)
        except Exception as exc:
            db.rollback()
            logger.error("[TtlTracker] DB 만료 처리 실패: %s", exc)
        finally:
            db.close()
