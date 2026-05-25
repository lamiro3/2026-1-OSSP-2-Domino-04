"""
disaster.py (router)
---------------------
Thin HTTP layer — validates input, delegates to disaster_service, shapes response.
All business logic lives in app/services/disaster_service.py.
"""

import os
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.services import disaster_service

router = APIRouter(tags=["Disaster"])

SEOUL_API_KEY = os.getenv("SEOUL_API_KEY")


class AlertRequest(BaseModel):
    alert_text: str


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
