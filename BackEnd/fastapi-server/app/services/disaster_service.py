"""
disaster_service.py
-------------------
Business logic for disaster alert processing.

Responsibilities:
  - Build Gemini prompts and parse responses
  - Calculate weight penalties
  - DB read: active alerts, spatial proximity queries
  - DB write: fetch-and-save pipeline

Routers import from here; they own only HTTP plumbing (request/response).
"""

import os
import json
import httpx
from datetime import datetime, timedelta

from fastapi import HTTPException
from google import genai
from sqlalchemy.orm import Session
from sqlalchemy import text

# ---------------------------------------------------------------------------
# Gemini client (module-level singleton)
# ---------------------------------------------------------------------------

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = "models/gemini-2.5-flash"

if not GEMINI_API_KEY:
    print("[ERROR] GEMINI_API_KEY is not set in .env")

_gemini_client = genai.Client(api_key=GEMINI_API_KEY)


# ---------------------------------------------------------------------------
# Prompt helpers
# ---------------------------------------------------------------------------

def build_gemini_prompt(alert_text: str) -> str:
    return f"""
    The following is a Seoul emergency alert: "{alert_text}"
    Analyze this message and extract the central location (lat, lng) of the disaster,
    and estimate the danger radius in metres that users should avoid.
    Respond ONLY in pure JSON, no markdown:
    Example: {{"lat": 37.5665, "lng": 126.9780, "radius": 500}}
    """


def parse_gemini_response(raw_text: str) -> dict:
    clean = raw_text.strip().replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail=f"Cannot parse Gemini response as JSON: {clean}"
        )
    if not all(k in parsed for k in ("lat", "lng", "radius")):
        raise HTTPException(
            status_code=502,
            detail=f"Gemini response missing required fields (lat, lng, radius): {parsed}"
        )
    return parsed


def calculate_weight_penalty(radius_m: int) -> int:
    if radius_m <= 200:
        return 30
    elif radius_m <= 500:
        return 60
    return 100


# ---------------------------------------------------------------------------
# Gemini: analyze a single alert text
# ---------------------------------------------------------------------------

def analyze_alert(alert_text: str) -> dict:
    """Call Gemini to extract lat/lng/radius from an alert message."""
    prompt = build_gemini_prompt(alert_text)
    try:
        response = _gemini_client.models.generate_content(
            model=GEMINI_MODEL, contents=prompt
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API call failed: {str(e)}")
    return parse_gemini_response(response.text)


# ---------------------------------------------------------------------------
# DB reads
# ---------------------------------------------------------------------------

def get_active_alerts(db: Session) -> list:
    """Return all non-expired disaster alerts."""
    rows = db.execute(
        text("""
            SELECT
                id, message,
                ST_X(coordinates) AS lat,
                ST_Y(coordinates) AS lng,
                radius_m, weight_penalty,
                received_at, expires_at
            FROM DisasterAlerts
            WHERE expires_at > NOW()
            ORDER BY received_at DESC
        """)
    ).fetchall()

    return [
        {
            "id": row.id,
            "message": row.message,
            "lat": float(row.lat),
            "lng": float(row.lng),
            "radius_m": int(row.radius_m),
            "weight_penalty": int(row.weight_penalty),
            "received_at": str(row.received_at),
            "expires_at": str(row.expires_at),
        }
        for row in rows
    ]


def get_alerts_near_point(
    lat: float, lng: float, search_radius_m: float, db: Session
) -> list:
    """
    Return active alerts whose risk zone overlaps the given point.
    Condition: ST_Distance_Sphere(center, point) < (alert.radius_m + search_radius_m)
    """
    rows = db.execute(
        text("""
            SELECT
                id, message,
                ST_X(coordinates) AS lat,
                ST_Y(coordinates) AS lng,
                radius_m, weight_penalty,
                received_at, expires_at,
                ST_Distance_Sphere(
                    coordinates,
                    ST_GeomFromText(:point, 4326)
                ) AS distance_m
            FROM DisasterAlerts
            WHERE expires_at > NOW()
              AND ST_Distance_Sphere(
                    coordinates,
                    ST_GeomFromText(:point, 4326)
                  ) < (radius_m + :search_radius)
            ORDER BY distance_m ASC
        """),
        {"point": f"POINT({lat} {lng})", "search_radius": search_radius_m},
    ).fetchall()

    return [
        {
            "id": row.id,
            "message": row.message,
            "lat": float(row.lat),
            "lng": float(row.lng),
            "radius_m": int(row.radius_m),
            "weight_penalty": int(row.weight_penalty),
            "distance_m": round(float(row.distance_m), 1),
            "received_at": str(row.received_at),
            "expires_at": str(row.expires_at),
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# DB write: fetch-and-save pipeline
# ---------------------------------------------------------------------------

async def fetch_and_save_alerts(seoul_api_key: str, db: Session) -> dict:
    """
    1. Fetch latest alerts from Seoul Open API
    2. Analyze each with Gemini
    3. Insert new ones into DB (skip duplicates)

    Returns a summary dict: {saved, skipped, total}
    """
    url = f"http://openapi.seoul.go.kr:8088/{seoul_api_key}/json/ListEmergencyDisasterMsg/1/5/"
    async with httpx.AsyncClient(timeout=10.0) as client_httpx:
        response = await client_httpx.get(url)
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Seoul API call failed")
        data = response.json()

    if "ListEmergencyDisasterMsg" not in data:
        return {"saved": 0, "skipped": 0, "total": 0, "note": "No recent alerts"}

    rows = data["ListEmergencyDisasterMsg"]["row"]
    saved_count = 0
    skipped_count = 0

    for row in rows:
        msg = row.get("MSG", "").strip()
        if not msg:
            continue

        # Skip duplicates
        existing = db.execute(
            text("SELECT id FROM DisasterAlerts WHERE message = :msg LIMIT 1"),
            {"msg": msg},
        ).fetchone()
        if existing:
            skipped_count += 1
            continue

        # Gemini analysis
        try:
            parsed = analyze_alert(msg)
        except Exception:
            skipped_count += 1
            continue

        lat = float(parsed["lat"])
        lng = float(parsed["lng"])
        radius_m = int(parsed["radius"])
        weight_penalty = calculate_weight_penalty(radius_m)
        received_at = datetime.now()
        expires_at = received_at + timedelta(hours=2)

        try:
            db.execute(
                text("""
                    INSERT INTO DisasterAlerts
                        (message, coordinates, radius_m, weight_penalty,
                         received_at, expires_at, created_at, updated_at)
                    VALUES
                        (:message, ST_GeomFromText(:point, 4326), :radius_m, :weight_penalty,
                         :received_at, :expires_at, NOW(), NOW())
                """),
                {
                    "message": msg,
                    "point": f"POINT({lat} {lng})",
                    "radius_m": radius_m,
                    "weight_penalty": weight_penalty,
                    "received_at": received_at,
                    "expires_at": expires_at,
                },
            )
            db.commit()
            saved_count += 1
        except Exception:
            db.rollback()
            skipped_count += 1

    return {"saved": saved_count, "skipped": skipped_count, "total": len(rows)}
