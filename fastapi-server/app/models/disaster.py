"""
models/disaster.py

DisasterAlerts 테이블 SQLAlchemy 모델.

테이블 구조 (Sequelize 마이그레이션 기준):
    id            INT PK AUTO_INCREMENT
    event_id      VARCHAR(16) UNIQUE      ← dedup 키 (SHA256[:16])
    dst_se_nm     VARCHAR(50)             ← 재난 유형 (화재, 홍수 등)
    danger_level  ENUM(safe/caution/danger)
    message       TEXT                    ← 재난문자 원본
    coordinates   POINT(SRID 4326)        ← LLM이 추출한 위경도
    radius_m      INT                     ← 위험 반경 (m)
    weight_penalty INT                    ← 경로 알고리즘 페널티
    received_at   DATETIME
    expires_at    DATETIME
    created_at    DATETIME
    updated_at    DATETIME

주의:
    Sequelize 마이그레이션이 Express 쪽에서 테이블을 생성.
    이 파일은 FastAPI에서 읽기/쓰기 전용으로 사용.
    테이블 생성(create_all)은 하지 않음.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from geoalchemy2 import Geometry
from sqlalchemy import (
    DateTime,
    Enum,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class DangerLevel(str, PyEnum):
    SAFE    = "safe"
    CAUTION = "caution"
    DANGER  = "danger"


class DisasterAlert(Base):
    """
    DisasterAlerts 테이블 ORM 모델.

    사용 예시:
        # 저장
        alert = DisasterAlert.from_event(event, lat=37.57, lng=126.97)
        session.add(alert)
        await session.commit()

        # 현재 활성 재난 조회
        alerts = await DisasterAlert.get_active(session)
    """

    __tablename__ = "DisasterAlerts"

    # ── 컬럼 ──────────────────────────────────────

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    event_id: Mapped[str | None] = mapped_column(
        String(16), unique=True, nullable=True, index=True,
        comment="SHA256[:16] dedup 키"
    )
    dst_se_nm: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
        comment="재난 유형명 (화재, 홍수 등)"
    )
    danger_level: Mapped[str | None] = mapped_column(
        Enum("safe", "caution", "danger"), nullable=True, default="safe",
        comment="위험 등급"
    )
    message: Mapped[str] = mapped_column(
        Text, nullable=False,
        comment="재난문자 원본 텍스트"
    )
    coordinates: Mapped[object] = mapped_column(
        Geometry("POINT", srid=4326), nullable=False,
        comment="위험 중심 좌표 (LLM 추출)"
    )
    radius_m: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="위험 반경 (m)"
    )
    weight_penalty: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="경로 알고리즘 페널티 점수"
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(),
        comment="재난문자 수신 시각"
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False,
        comment="만료 시각 (이후 경로 페널티 해제)"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    # ── 인덱스 ────────────────────────────────────

    __table_args__ = (
        Index("disaster_alerts_received_at_idx", "received_at"),
        # SPATIAL 인덱스는 Sequelize 마이그레이션에서 이미 생성됨
        # (geoalchemy2는 SPATIAL INDEX 자동 생성 안 함)
    )

    # ── 팩토리 메서드 ─────────────────────────────

    @classmethod
    def from_event(
        cls,
        event_id: str,
        dst_se_nm: str,
        danger_level: str,
        message: str,
        lat: float,
        lng: float,
        radius_m: int,
        weight_penalty: int,
        received_at: datetime,
        expires_at: datetime,
    ) -> DisasterAlert:
        """
        event_detector의 DisasterMessage + LLM 좌표 추출 결과로
        DisasterAlert 인스턴스 생성.

        사용 예시 (disaster.py 라우터):
            alert = DisasterAlert.from_event(
                event_id    = event.event_id,
                dst_se_nm   = event.dst_se_nm,
                danger_level= event.danger_level.value,
                message     = event.dst_msg,
                lat         = 37.5796,   # Gemini가 추출한 좌표
                lng         = 126.9770,
                radius_m    = 500,
                weight_penalty = _penalty_for(event.danger_level),
                received_at = event.detected_at,
                expires_at  = expires_at,
            )
        """
        return cls(
            event_id=event_id,
            dst_se_nm=dst_se_nm,
            danger_level=danger_level,
            message=message,
            # GeoAlchemy2 WKT 형식으로 좌표 저장
            coordinates=f"SRID=4326;POINT({lng} {lat})",
            radius_m=radius_m,
            weight_penalty=weight_penalty,
            received_at=received_at,
            expires_at=expires_at,
        )

    # ── 쿼리 헬퍼 ────────────────────────────────

    @staticmethod
    async def exists_by_event_id(session, event_id: str) -> bool:
        """
        같은 event_id가 이미 DB에 있는지 확인 (dedup).

        사용 예시:
            if await DisasterAlert.exists_by_event_id(session, event.event_id):
                return  # 중복 — 저장 스킵
        """
        from sqlalchemy import select, exists as sa_exists
        stmt = select(
            sa_exists().where(DisasterAlert.event_id == event_id)
        )
        result = await session.execute(stmt)
        return result.scalar()

    @staticmethod
    async def get_active(session) -> list[DisasterAlert]:
        """
        현재 시각 기준 만료되지 않은 재난 알림 전체 조회.
        경로 위험 판단 엔진에서 사용.

        사용 예시:
            active = await DisasterAlert.get_active(session)
            for alert in active:
                if is_on_route(alert.coordinates, route_points):
                    trigger_reroute()
        """
        from sqlalchemy import select
        stmt = (
            select(DisasterAlert)
            .where(DisasterAlert.expires_at > func.now())
            .order_by(DisasterAlert.received_at.desc())
        )
        result = await session.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def get_recent(session, hours: int = 24) -> list[DisasterAlert]:
        """
        최근 N시간 이내 수신된 재난 조회 (만료 여부 무관).
        이력 조회용.
        """
        from sqlalchemy import select
        from datetime import timedelta
        cutoff = datetime.now() - timedelta(hours=hours)
        stmt = (
            select(DisasterAlert)
            .where(DisasterAlert.received_at >= cutoff)
            .order_by(DisasterAlert.received_at.desc())
        )
        result = await session.execute(stmt)
        return result.scalars().all()

    def __repr__(self) -> str:
        return (
            f"<DisasterAlert id={self.id} "
            f"event_id={self.event_id} "
            f"level={self.danger_level} "
            f"msg={self.message[:30]!r}>"
        )