import math
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db

router = APIRouter(tags=["Route"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
EARTH_RADIUS_M = 6_371_000  # metres

# Vertex sampling: only check every Nth vertex to reduce CPU on long routes.
# Tune this value based on acceptable accuracy vs. performance trade-off.
VERTEX_SAMPLE_STEP = 3  # check vertices at index 0, 3, 6, 9, ...


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the great-circle distance in metres between two WGS-84 points."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _load_active_disasters(db: Session) -> list:
    """
    Single DB query: fetch all currently active disaster alerts.
    Returns a list of dicts with lat, lng, radius_m, weight_penalty.
    """
    rows = db.execute(
        text("""
            SELECT
                ST_X(coordinates) AS lat,
                ST_Y(coordinates) AS lng,
                radius_m,
                weight_penalty
            FROM DisasterAlerts
            WHERE expires_at > NOW()
        """)
    ).fetchall()
    return [
        {
            "lat": float(row.lat),
            "lng": float(row.lng),
            "radius_m": int(row.radius_m),
            "weight_penalty": int(row.weight_penalty),
        }
        for row in rows
    ]


def _check_vertex_against_disasters(
    v_lat: float, v_lng: float, disasters: list
) -> list:
    """
    Returns a list of disaster dicts that this vertex falls within.
    Uses a fixed 50 m search buffer around each disaster radius.
    """
    hits = []
    for d in disasters:
        dist = _haversine_distance(v_lat, v_lng, d["lat"], d["lng"])
        if dist < (d["radius_m"] + 50):  # 50 m buffer
            hits.append(d)
    return hits


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------

class RouteCalculateRequest(BaseModel):
    routeData: dict  # Full Kakao Directions API response


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/calculate")
def calculate_route(
    request: RouteCalculateRequest,
    db: Session = Depends(get_db),
):
    """
    Accepts a Kakao Directions response and overlays active disaster zones.

    Kakao vertexes format: flat array [lng1, lat1, lng2, lat2, ...]
    (longitude comes first in each pair)

    Returns:
      - is_safe: bool
      - total_penalty: int (sum of max penalty per affected section)
      - affected_sections: list of section indices with a disaster hit
      - disaster_warnings: list of {section, road, penalty, disaster_center}
    """
    try:
        disasters = _load_active_disasters(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB query failed: {str(e)}")

    # No active disasters — fast path
    if not disasters:
        return {
            "is_safe": True,
            "total_penalty": 0,
            "affected_sections": [],
            "disaster_warnings": [],
        }

    routes = request.routeData.get("routes", [])
    if not routes:
        raise HTTPException(status_code=400, detail="routeData contains no routes")

    total_penalty = 0
    affected_sections: list = []
    disaster_warnings: list = []

    sections = routes[0].get("sections", [])
    for section_idx, section in enumerate(sections):
        section_max_penalty = 0

        for road_idx, road in enumerate(section.get("roads", [])):
            vertexes = road.get("vertexes", [])
            # vertexes is a flat array: [lng0, lat0, lng1, lat1, ...]
            # Iterate in steps of 2; apply sampling to skip redundant checks.
            i = 0
            vertex_num = 0
            while i + 1 < len(vertexes):
                # Sampling: skip vertices that are not on the sample step
                if vertex_num % VERTEX_SAMPLE_STEP == 0:
                    v_lng = vertexes[i]
                    v_lat = vertexes[i + 1]

                    hits = _check_vertex_against_disasters(v_lat, v_lng, disasters)
                    for hit in hits:
                        penalty = hit["weight_penalty"]
                        section_max_penalty = max(section_max_penalty, penalty)
                        disaster_warnings.append({
                            "section": section_idx,
                            "road": road_idx,
                            "penalty": penalty,
                            "disaster_center": {
                                "lat": hit["lat"],
                                "lng": hit["lng"],
                            },
                        })
                i += 2
                vertex_num += 1

        if section_max_penalty > 0:
            affected_sections.append(section_idx)
            total_penalty += section_max_penalty

    return {
        "is_safe": len(affected_sections) == 0,
        "total_penalty": total_penalty,
        "affected_sections": affected_sections,
        "disaster_warnings": disaster_warnings,
    }
