"""
benchmark_semaphore.py
----------------------
asyncio.Semaphore 동시성 값(N)에 따라 서울시 API 25개 핫스팟 폴링 성능을 비교한다.

실행 방법 (fastapi-server 디렉토리에서):
    python benchmark_semaphore.py

실행 결과 해석:
  - elapsed   : 25개 요청을 모두 처리하는 데 걸린 시간 (초)
  - success   : 정상 응답(HTTP 200) 횟수
  - fail      : 비정상 응답 또는 타임아웃 횟수
  - avg_ms    : 요청 1건 평균 응답 시간 (밀리초)

참고: 실제 서울시 API 키가 없으면 모든 요청이 401/403으로 실패하므로
      SEOUL_API_KEY 환경 변수를 미리 설정하거나 .env에 넣어두세요.
      fail=25이어도 elapsed/avg_ms 는 동시성 튜닝에 의미 있는 지표입니다.
"""

import asyncio
import os
import time
from dataclasses import dataclass, field

import httpx
from dotenv import load_dotenv

load_dotenv()

SEOUL_API_KEY: str = os.getenv("SEOUL_API_KEY", "DUMMY_KEY")
BASE_URL = "http://openapi.seoul.go.kr:8088/{key}/json/citydata/1/1/{area}"
TIMEOUT = 10.0  # 초

HOTSPOT_AREAS: list[str] = [
    "강남 MICE 관광특구", "동대문 관광특구", "명동 관광특구",
    "이태원 관광특구", "잠실 관광특구", "종로·청계 관광특구",
    "홍대 관광특구",
    "경복궁", "광화문·덕수궁", "보신각",
    "서울 암사동 유적", "창덕궁·종묘",
    "북촌한옥마을", "인사동", "익선동",
    "서울숲공원", "여의도한강공원", "뚝섬한강공원",
    "반포한강공원", "망원한강공원", "난지한강공원",
    "국립중앙박물관·용산가족공원", "서울대공원",
    "남산공원", "DDP(동대문디자인플라자)",
]

CONCURRENCY_VALUES = [5, 10, 15, 20, 25]


@dataclass
class BenchResult:
    concurrency: int
    elapsed_s: float
    success: int
    fail: int
    latencies_ms: list[float] = field(default_factory=list)

    @property
    def avg_ms(self) -> float:
        return round(sum(self.latencies_ms) / len(self.latencies_ms), 1) if self.latencies_ms else 0.0


async def _fetch_one(
    area: str,
    sem: asyncio.Semaphore,
    client: httpx.AsyncClient,
) -> tuple[bool, float]:
    """단일 핫스팟 요청. (성공여부, 소요ms) 반환."""
    url = BASE_URL.format(key=SEOUL_API_KEY, area=area)
    t0 = time.perf_counter()
    try:
        async with sem:
            resp = await client.get(url, timeout=TIMEOUT)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return resp.status_code == 200, elapsed_ms
    except Exception:
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return False, elapsed_ms


async def run_benchmark(concurrency: int) -> BenchResult:
    sem = asyncio.Semaphore(concurrency)
    result = BenchResult(concurrency=concurrency, elapsed_s=0, success=0, fail=0)

    async with httpx.AsyncClient() as client:
        t_start = time.perf_counter()
        tasks = [_fetch_one(area, sem, client) for area in HOTSPOT_AREAS]
        outcomes = await asyncio.gather(*tasks)
        result.elapsed_s = round(time.perf_counter() - t_start, 2)

    for ok, ms in outcomes:
        if ok:
            result.success += 1
        else:
            result.fail += 1
        result.latencies_ms.append(ms)

    return result


async def main() -> None:
    print("=" * 62)
    print(f"  DOMINO — asyncio.Semaphore 동시성 벤치마크")
    print(f"  대상 핫스팟: {len(HOTSPOT_AREAS)}개 | API 키: {SEOUL_API_KEY[:8]}...")
    print("=" * 62)
    print(f"{'concurrency':>12} | {'elapsed(s)':>10} | {'success':>7} | {'fail':>5} | {'avg_ms':>8}")
    print("-" * 62)

    results: list[BenchResult] = []
    for n in CONCURRENCY_VALUES:
        r = await run_benchmark(n)
        results.append(r)
        marker = "  ← 현재 설정" if n == 10 else ""
        print(f"{n:>12} | {r.elapsed_s:>10.2f} | {r.success:>7} | {r.fail:>5} | {r.avg_ms:>8.1f}{marker}")

    print("=" * 62)

    # 권장값 자동 판정 (실패 0이면 가장 빠른 것, 아니면 fail 가장 적으면서 빠른 것)
    no_fail = [r for r in results if r.fail == 0]
    if no_fail:
        best = min(no_fail, key=lambda r: r.elapsed_s)
        print(f"\n  ✓ 권장 동시성: {best.concurrency}  (fail=0 중 가장 빠름, elapsed={best.elapsed_s}s)")
    else:
        best = min(results, key=lambda r: (r.fail, r.elapsed_s))
        print(f"\n  ✓ 권장 동시성: {best.concurrency}  (fail 최소={best.fail}, elapsed={best.elapsed_s}s)")

    print()


if __name__ == "__main__":
    asyncio.run(main())
