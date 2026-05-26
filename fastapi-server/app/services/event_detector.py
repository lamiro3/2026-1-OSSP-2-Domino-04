"""
services/event_detector.py

새로 수신된 재난문자·사고통제 데이터에서 '신규 이벤트'를 감지하는 모듈.
Scheduler가 5분마다 폴링한 결과를 여기에 넘기면:
  1. 이전 폴링과 비교해 신규 항목을 추출
  2. 위험 등급(DangerLevel) 분류
  3. 경로 교차 여부 판단
  4. 신규 위험이 있으면 콜백(on_new_event)을 호출 → router에서 사용자 push

의존성:
  - database.py  : DisasterLog DB 저장 (중복 방지)
  - cache.py     : 직전 폴링 snapshot 보관
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Callable, Awaitable

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# 1. 데이터 구조 정의
# ──────────────────────────────────────────────

class DangerLevel(str, Enum):
    """위험 등급 — 앱 UI 배너 색상과 1:1 대응"""
    SAFE    = "safe"     # 초록  : 경로 영향 없음
    CAUTION = "caution"  # 노랑  : 인접 구간 주의
    DANGER  = "danger"   # 빨강  : 경로 상 직접 위험


@dataclass
class DisasterMessage:
    """
    서울시 API LIVE_DST_MESSAGE 응답 항목 (5개 필드).
    API 원문 필드명을 그대로 유지해 파싱 오류를 최소화.
    """
    area_nm: str            # 핫스팟 장소명  (예: "경복궁")
    dst_se_nm: str          # 재난유형명     (예: "화재", "홍수")
    dst_msg: str            # 재난문자 내용
    rcptn_rgn_nm: str       # 수신지역명
    crt_dt: str             # 생성일시       (예: "2026-05-23 09:51:00")

    # ── 파생 필드 (API 응답에는 없음, 내부 생성) ──
    event_id: str = field(init=False)
    danger_level: DangerLevel = field(init=False, default=DangerLevel.SAFE)
    detected_at: datetime = field(init=False, default_factory=datetime.now)

    def __post_init__(self):
        # 중복 dedup 키: 내용 + 생성일시의 해시
        # → 같은 재난이 5분 뒤에 또 응답에 포함돼도 동일 ID
        raw = f"{self.dst_msg.strip()}{self.crt_dt.strip()}"
        self.event_id = hashlib.sha256(raw.encode()).hexdigest()[:16]
        self.danger_level = _classify_danger(self.dst_se_nm, self.dst_msg)


@dataclass
class AccidentEvent:
    """
    서울시 API ACDNT_CNTRL_STTS 응답 항목 (주요 9개 필드 중 경로 판단에 필요한 것).
    """
    area_nm: str            # 핫스팟 장소명
    acdnt_type: str         # 사고통제유형  (예: "사고", "공사", "행사")
    acdnt_dtl_type: str     # 세부유형
    acdnt_occr_dt: str      # 사고발생일시
    exp_clr_dt: str         # 해제예정일시  (없으면 빈 문자열)

    event_id: str = field(init=False)
    danger_level: DangerLevel = field(init=False, default=DangerLevel.SAFE)
    detected_at: datetime = field(init=False, default_factory=datetime.now)

    def __post_init__(self):
        raw = f"{self.acdnt_type}{self.area_nm}{self.acdnt_occr_dt}"
        self.event_id = hashlib.sha256(raw.encode()).hexdigest()[:16]
        self.danger_level = _classify_danger(self.acdnt_type, self.acdnt_dtl_type)


# Union 타입 alias
DangerEvent = DisasterMessage | AccidentEvent


# ──────────────────────────────────────────────
# 2. 위험 등급 분류 (키워드 기반)
# ──────────────────────────────────────────────

# 위험도 높음: 즉각 경로 변경 트리거
_DANGER_KEYWORDS = {
    "화재", "폭발", "가스누출", "붕괴", "홍수", "지진",
    "테러", "총기", "위험물", "방사능", "대규모", "전면통제",
}

# 주의: 경로 인접 시 알림만
_CAUTION_KEYWORDS = {
    "사고", "공사", "집회", "시위", "부분통제", "정체",
    "낙석", "침수", "강풍", "미세먼지", "황사",
}


def _classify_danger(type_str: str, detail_str: str) -> DangerLevel:
    """
    재난유형·사고유형 문자열에서 위험 등급을 결정.
    키워드 매칭 기반 — 추후 ML 모델로 교체 가능하도록 함수로 분리.
    """
    combined = f"{type_str} {detail_str}".upper()

    for kw in _DANGER_KEYWORDS:
        if kw in combined:
            return DangerLevel.DANGER

    for kw in _CAUTION_KEYWORDS:
        if kw in combined:
            return DangerLevel.CAUTION

    return DangerLevel.SAFE


# ──────────────────────────────────────────────
# 3. EventDetector 클래스
# ──────────────────────────────────────────────

# 콜백 타입: 신규 이벤트 목록을 받아 비동기 처리
EventCallback = Callable[[list[DangerEvent]], Awaitable[None]]


class EventDetector:
    """
    폴링 결과를 받아 신규 이벤트만 추출하고 콜백을 호출.

    사용 예시 (scheduler.py):
        detector = EventDetector(on_new_event=route_router.handle_danger_events)
        new_events = await detector.process_disaster(raw_api_response)
    """

    def __init__(self, on_new_event: EventCallback | None = None):
        # 이미 감지된 event_id 집합 — 메모리 내 dedup
        # 서버 재시작 시 DB에서 최근 N건 복원 필요 (→ load_seen_ids 참고)
        self._seen_ids: set[str] = set()

        # 외부 콜백 (route_router가 등록)
        self._on_new_event = on_new_event

    # ── DB에서 이미 처리한 ID 로드 (서버 시작 시 1회 호출) ──
    def load_seen_ids(self) -> None:
        """
        재시작 후 중복 알림 방지를 위해 DB에서 최근 24시간 event_id를 로드.

        database.py의 동기 SessionLocal을 직접 사용해 async 마이그레이션 없이
        scheduler.start() 에서 즉시 호출 가능.

        쿼리 대상: DisasterAlerts.event_id WHERE received_at > NOW() - 24h
        NULL event_id(레거시 행)는 자동 제외.
        """
        from datetime import timedelta
        from sqlalchemy import text
        from app.database import SessionLocal  # 순환 import 방지

        cutoff = datetime.now() - timedelta(hours=24)
        db = SessionLocal()
        try:
            rows = db.execute(
                text(
                    "SELECT event_id FROM DisasterAlerts "
                    "WHERE received_at >= :cutoff AND event_id IS NOT NULL"
                ),
                {"cutoff": cutoff},
            ).fetchall()
            self._seen_ids = {row.event_id for row in rows}
            logger.info("[EventDetector] 서버 재시작 — DB에서 기존 이벤트 %d건 복원", len(self._seen_ids))
        except Exception as exc:
            # DB 연결 실패해도 서버 기동은 계속 진행 (재난 누락보다 서비스 중단이 더 치명적)
            logger.warning("[EventDetector] load_seen_ids 실패 (빈 set으로 진행): %s", exc)
            self._seen_ids = set()
        finally:
            db.close()

    # ── 재난문자 처리 ──
    async def process_disaster(
        self,
        raw_items: list[dict],
    ) -> list[DisasterMessage]:
        """
        LIVE_DST_MESSAGE API 응답 파싱 → 신규 항목 추출 → 콜백 호출.

        Args:
            raw_items: API 응답의 LIVE_DST_MESSAGE 리스트 (dict 형태)

        Returns:
            이번 폴링에서 새로 감지된 DisasterMessage 목록
        """
        parsed = [
            DisasterMessage(
                area_nm=item.get("AREA_NM", ""),
                dst_se_nm=item.get("DST_SE_NM", ""),
                dst_msg=item.get("DST_MSG", ""),
                rcptn_rgn_nm=item.get("RCPTN_RGN_NM", ""),
                crt_dt=item.get("CRT_DT", ""),
            )
            for item in raw_items
            if item.get("DST_MSG")  # 빈 항목 제외
        ]

        new_events = self._filter_new(parsed)

        if new_events:
            logger.info(
                f"[EventDetector] 재난문자 신규 {len(new_events)}건 감지: "
                + ", ".join(e.dst_se_nm for e in new_events)
            )
            await self._dispatch(new_events)

        return new_events

    # ── 사고통제 처리 ──
    async def process_accident(
        self,
        raw_items: list[dict],
    ) -> list[AccidentEvent]:
        """
        ACDNT_CNTRL_STTS API 응답 파싱 → 신규 항목 추출 → 콜백 호출.
        """
        parsed = [
            AccidentEvent(
                area_nm=item.get("AREA_NM", ""),
                acdnt_type=item.get("ACDNT_TYPE", ""),
                acdnt_dtl_type=item.get("ACDNT_DTL_TYPE", ""),
                acdnt_occr_dt=item.get("ACDNT_OCCR_DT", ""),
                exp_clr_dt=item.get("EXP_CLR_DT", ""),
            )
            for item in raw_items
            if item.get("ACDNT_TYPE")
        ]

        new_events = self._filter_new(parsed)

        if new_events:
            logger.info(
                f"[EventDetector] 사고통제 신규 {len(new_events)}건 감지: "
                + ", ".join(e.acdnt_type for e in new_events)
            )
            await self._dispatch(new_events)

        return new_events

    # ── 내부 유틸 ──

    def _filter_new(self, events: list[DangerEvent]) -> list[DangerEvent]:
        """_seen_ids에 없는 이벤트만 반환하고 seen에 추가"""
        new = [e for e in events if e.event_id not in self._seen_ids]
        for e in new:
            self._seen_ids.add(e.event_id)
        return new

    async def _dispatch(self, events: list[DangerEvent]) -> None:
        """콜백이 등록돼 있으면 호출"""
        if self._on_new_event:
            try:
                await self._on_new_event(events)
            except Exception as exc:
                logger.error(f"[EventDetector] 콜백 실행 오류: {exc}")

    def register_callback(self, callback: EventCallback) -> None:
        """런타임에 콜백 교체 (테스트·벤치마킹용)"""
        self._on_new_event = callback

    @property
    def seen_count(self) -> int:
        return len(self._seen_ids)