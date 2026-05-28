"""
disaster.py (router)
---------------------
Thin HTTP layer — validates input, delegates to disaster_service, shapes response.
All business logic lives in app/services/disaster_service.py.
"""

import hashlib
import logging
import os
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import disaster_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Disaster"])

SEOUL_API_KEY = os.getenv("SEOUL_API_KEY")


class AlertRequest(BaseModel):
    alert_text: str


class SimulateRequest(BaseModel):
    alert_text: str
    dst_se_nm: str = "기타"    # 재난 유형명 (화재·홍수·가스누출 등)
    expires_hours: int = 2     # 몇 시간 뒤 만료할지


# ---------------------------------------------------------------------------
# GET /disaster/seoul/latest
# ---------------------------------------------------------------------------

@router.get("/seoul/latest")
async def get_latest_seoul_disasters():
    """Proxy the Seoul Open API to return the 5 most recent emergency alerts."""
    if not SEOUL_API_KEY:
        raise HTTPException(status_code=500, detail="SEOUL_API_KEY is not configured")

    url = f"http://openapi.seoul.go.kr:8088/{SEOUL_API_KEY}/json/ListEmergencyDisasterMsg/1/5/"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url)
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Seoul API call failed")
        data = response.json()

    if "ListEmergencyDisasterMsg" not in data:
        return {"status": "success", "data": [], "note": "No recent alerts"}

    result = [
        {"date": row.get("STR_DATE"), "msg": row.get("MSG")}
        for row in data["ListEmergencyDisasterMsg"]["row"]
    ]
    return {"status": "success", "data": result}


# ---------------------------------------------------------------------------
# POST /disaster/analyze
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def analyze_disaster(request: AlertRequest):
    """Analyze a single alert text with Gemini to extract location and radius."""
    parsed = disaster_service.analyze_alert(request.alert_text)
    return {"status": "success", "analysis": parsed}


# ---------------------------------------------------------------------------
# POST /disaster/fetch-and-save
# ---------------------------------------------------------------------------

@router.post("/fetch-and-save")
async def fetch_analyze_save(db: Session = Depends(get_db)):
    """Fetch Seoul alerts, analyze with Gemini, save new ones to DB."""
    if not SEOUL_API_KEY:
        raise HTTPException(status_code=500, detail="SEOUL_API_KEY is not configured")

    result = await disaster_service.fetch_and_save_alerts(SEOUL_API_KEY, db)
    return {"status": "success", **result}


# ---------------------------------------------------------------------------
# GET /disaster/active
# ---------------------------------------------------------------------------

@router.get("/active")
def get_active_disasters(db: Session = Depends(get_db)):
    """Return all disaster alerts that have not yet expired."""
    data = disaster_service.get_active_alerts(db)
    return {"status": "success", "count": len(data), "data": data}


# ---------------------------------------------------------------------------
# GET /disaster/nearby
# ---------------------------------------------------------------------------

@router.get("/nearby")
def get_nearby_disasters(
    lat: float,
    lng: float,
    search_radius: float = 1000.0,
    db: Session = Depends(get_db),
):
    """
    Return active disaster alerts near a given coordinate.

    Query params:
      lat, lng       -- point to search around (WGS-84)
      search_radius  -- additional buffer in metres (default 1000 m)
    """
    data = disaster_service.get_alerts_near_point(lat, lng, search_radius, db)
    return {"status": "success", "count": len(data), "data": data}


# ---------------------------------------------------------------------------
# process_and_save — scheduler 콜백(main.py)이 호출하는 내부 함수
# ---------------------------------------------------------------------------

async def process_and_save(
    event_id: str,
    dst_se_nm: str,
    dst_msg: str,
    danger_level: str,
    db: Session,
) -> bool:
    """
    EventDetector가 감지한 신규 재난을 Gemini로 분석해 DB에 저장.

    실제 테이블 컬럼: message, coordinates, radius_m, weight_penalty,
                      received_at, expires_at, created_at, updated_at
    (event_id·dst_se_nm·danger_level 컬럼은 마이그레이션에 없으므로 제외)

    Returns:
        True  — 저장 성공
        False — 분석 실패 또는 중복 (skip)
    """
    # 중복 체크 — message 기준 (event_id 컬럼 없음)
    existing = db.execute(
        text("SELECT id FROM DisasterAlerts WHERE message = :msg LIMIT 1"),
        {"msg": dst_msg},
    ).fetchone()
    if existing:
        return False

    # Gemini 분석
    try:
        parsed = disaster_service.analyze_alert(dst_msg)
    except Exception as exc:
        logger.warning("[process_and_save] Gemini 분석 실패: %s", exc)
        return False

    lat        = float(parsed["lat"])
    lng        = float(parsed["lng"])
    radius_m   = int(parsed["radius"])
    penalty    = disaster_service.calculate_weight_penalty(radius_m)
    received_at = datetime.now()
    expires_at  = received_at + timedelta(hours=2)

    try:
        db.execute(
            text("""
                INSERT INTO DisasterAlerts
                    (message, coordinates, radius_m, weight_penalty,
                     received_at, expires_at, created_at, updated_at)
                VALUES
                    (:message, ST_GeomFromText(:point, 4326), :radius_m, :penalty,
                     :received_at, :expires_at, NOW(), NOW())
            """),
            {
                "message":     dst_msg,
                "point":       f"POINT({lat} {lng})",
                "radius_m":    radius_m,
                "penalty":     penalty,
                "received_at": received_at,
                "expires_at":  expires_at,
            },
        )
        db.commit()
        logger.info("[process_and_save] 저장 완료 — lat=%s, lng=%s, radius=%sm", lat, lng, radius_m)
        return True
    except Exception as exc:
        db.rollback()
        logger.error("[process_and_save] DB 저장 실패: %s", exc)
        return False


# ---------------------------------------------------------------------------
# POST /disaster/simulate  — 발표 데모 / 테스트용
# ---------------------------------------------------------------------------

@router.post("/simulate")
async def simulate_disaster(request: SimulateRequest, db: Session = Depends(get_db)):
    """
    재난문자를 직접 입력해 Gemini 분석 → DB 저장까지 한 번에 실행.
    실제 서울시 API 없이 재난 시나리오를 삽입할 때 사용.

    실제 테이블 컬럼(마이그레이션 기준):
      message, coordinates, radius_m, weight_penalty,
      received_at, expires_at, created_at, updated_at

    중복(동일 message)은 저장되지 않고 status='skipped' 반환.
    """
    # 중복 체크 — message 기준
    existing = db.execute(
        text("SELECT id FROM DisasterAlerts WHERE message = :msg LIMIT 1"),
        {"msg": request.alert_text},
    ).fetchone()
    if existing:
        return {
            "status": "skipped",
            "reason": "동일한 재난문자가 이미 DB에 존재합니다",
            "existing_id": existing.id,
        }

    # Gemini 분석
    try:
        parsed = disaster_service.analyze_alert(request.alert_text)
    except HTTPException as exc:
        raise exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gemini 분석 오류: {exc}")

    lat       = float(parsed["lat"])
    lng       = float(parsed["lng"])
    radius_m  = int(parsed["radius"])
    penalty   = disaster_service.calculate_weight_penalty(radius_m)
    received_at = datetime.now()
    expires_at  = received_at + timedelta(hours=request.expires_hours)

    # DB 저장 — 실제 컬럼만 사용
    try:
        db.execute(
            text("""
                INSERT INTO DisasterAlerts
                    (message, coordinates, radius_m, weight_penalty,
                     received_at, expires_at, created_at, updated_at)
                VALUES
                    (:message, ST_GeomFromText(:point, 4326), :radius_m, :penalty,
                     :received_at, :expires_at, NOW(), NOW())
            """),
            {
                "message":     request.alert_text,
                "point":       f"POINT({lat} {lng})",
                "radius_m":    radius_m,
                "penalty":     penalty,
                "received_at": received_at,
                "expires_at":  expires_at,
            },
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB 저장 실패: {exc}")

    return {
        "status":     "saved",
        "alert_text": request.alert_text,
        "analysis": {
            "lat":      lat,
            "lng":      lng,
            "radius_m": radius_m,
            "penalty":  penalty,
        },
        "expires_at": str(expires_at),
    }
