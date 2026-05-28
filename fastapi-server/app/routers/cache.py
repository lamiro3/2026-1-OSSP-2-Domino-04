"""
routers/cache.py
-----------------
Redis 캐시 성능 지표를 노출하는 관리용 엔드포인트.

GET /cache/metrics
  - Redis hit_rate, hit/miss/set 횟수, 평균 응답 시간
  - 날씨 캐시 최적화 효과 (weather_skip_count)
  - 히트율 이론 수치 해설 포함 (발표 Q&A 대응)

인증 없이 누구나 접근 가능하므로 프로덕션에서는 IP 제한 권장.
"""

from fastapi import APIRouter

from app.services.cache import cache as redis_cache
from app.services.scheduler import scheduler

router = APIRouter(tags=["Cache"])


@router.get("/metrics")
def get_cache_metrics():
    """
    Redis 캐시 성능 지표 반환.

    weather_skip_count 해석:
      - 날씨는 5분마다 폴링하지만 TTL 3600s(1시간) 캐시가 유지됨
      - 이론 히트율 = (12회 폴링 - 1회 캐시 미스) / 12회 = 91.7 %
      - weather_skip_count 가 높을수록 Redis SET 연산이 절감된 것
    """
    raw_metrics = redis_cache.metrics()

    # 날씨 전용 카운터만 사용 (전체 set_count가 아님)
    weather_set  = scheduler.weather_set_count   # 캐시 미스 → 실제 SET
    weather_skip = scheduler.weather_skip_count  # 캐시 히트 → SET 생략
    weather_total = weather_set + weather_skip
    weather_hit_rate = (
        round(weather_skip / weather_total * 100, 1)
        if weather_total > 0 else 0.0
    )

    return {
        "status": "ok",
        "cache": raw_metrics,          # hit_rate_pct: 0~100 %
        "weather_optimization": {
            "set_count":  weather_set,   # 실제 Redis SET 발생 횟수 (캐시 미스)
            "skip_count": weather_skip,  # SET 생략 횟수 (캐시 히트)
            "total_polls": weather_total,
            "effective_hit_rate_pct": weather_hit_rate,
            "theory_hit_rate_pct": 91.7,
            "explanation": (
                "날씨는 5분 폴링 / 1시간 TTL → 이론 히트율 11/12 ≈ 91.7%. "
                "skip_count / total_polls 이 높을수록 Redis SET 연산이 절감된 것."
            ),
        },
        "scheduler": {
            "total_api_calls": scheduler.api_call_count,
            "seen_event_ids": scheduler.detector.seen_count,
        },
    }
