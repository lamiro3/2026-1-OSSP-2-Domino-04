<<<<<<< HEAD
from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session      # 추가됨!
from sqlalchemy import text             # 추가됨!
from dotenv import load_dotenv

from app.routers import disaster, route, population
from app.database import get_db         # 추가됨!

load_dotenv()

app = FastAPI()
=======
"""
main.py

FastAPI 앱 진입점.
lifespan에서 scheduler 시작 + event_detector 콜백 등록.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.routers import disaster, route, population, cache
from app.services.scheduler import scheduler
from app.database import get_db

logging.basicConfig(level=logging.DEBUG)

# ── event_detector 콜백 ───────────────────────────

async def _on_new_disaster_events(events) -> None:
    """
    event_detector가 새 재난/사고를 감지했을 때 호출되는 콜백.
    DB 세션을 열고 process_and_save() 호출.
    """
    from app.routers.disaster import process_and_save

    db = next(get_db())
    try:
        for event in events:
            await process_and_save(
                event_id=event.event_id,
                dst_se_nm=event.dst_se_nm,
                dst_msg=event.dst_msg,
                danger_level=event.danger_level.value,
                db=db,
            )
    finally:
        db.close()


# ── lifespan ─────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 서버 시작
    scheduler.detector.register_callback(_on_new_disaster_events)
    await scheduler.start()
    yield
    # 서버 종료
    await scheduler.stop()


# ── FastAPI 앱 ────────────────────────────────────

app = FastAPI(
    title="DOMINO API",
    description="서울 실시간 안전 관광 경로 추천 서비스",
    version="1.0.0",
    lifespan=lifespan,
)
>>>>>>> cc7618cee76bc2259ea2796180f1e1c55eae24f8

app.include_router(disaster.router, prefix="/disaster")
app.include_router(population.router, prefix="/population")
app.include_router(route.router, prefix="/route")
<<<<<<< HEAD

@app.get("/")
def health_check():
    return {"status": "ok"} 
=======
app.include_router(cache.router, prefix="/cache")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "api_calls": scheduler.api_call_count,
        "seen_events": scheduler.detector.seen_count,
    }


# ── DB 연결 테스트 (개발용) ───────────────────────
>>>>>>> cc7618cee76bc2259ea2796180f1e1c55eae24f8

@app.get("/db-test")
def test_db_connection(db: Session = Depends(get_db)):
    try:
<<<<<<< HEAD
        # DB에 간단한 숫자 1을 반환하라는 쿼리를 날려봅니다.
        result = db.execute(text("SELECT 1")).scalar()
        return {"status": "success", "message": f"DB 연결 완벽합니다! 반환값: {result} 🎉"}
    except Exception as e:
        return {"status": "error", "message": f"DB 연결 실패 ㅠㅠ: {str(e)}"}
=======
        result = db.execute(text("SELECT 1")).scalar()
        return {"status": "success", "message": f"DB connected. Result: {result}"}
    except Exception as e:
        return {"status": "error", "message": f"DB connection failed: {str(e)}"}
>>>>>>> cc7618cee76bc2259ea2796180f1e1c55eae24f8
