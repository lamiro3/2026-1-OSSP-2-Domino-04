"""
demo_full.py — DOMINO 전체 시스템 종합 검증 스크립트
=====================================================
발표 데모 및 로컬 테스트용. Docker 서버가 실행 중인 상태에서 사용.

실행 방법:
    python demo_full.py           # 전체 자동 실행
    python demo_full.py --step    # 단계별 (Enter로 진행)

검증 시나리오 10개:
  1. 서버 헬스체크
  2. Gemini 분석 — 화재 (명동)
  3. Gemini 분석 — 가스누출 (홍대)
  4. Gemini 분석 — 붕괴 (경복궁)
  5. 재난 DB 저장 (simulate 엔드포인트)
  6. 경로 판정 — 위험 경로 (재난 구역 통과)
  7. 경로 판정 — 안전 경로 (재난 구역 회피)
  8. 중복 등록 방지 검증
  9. 주변 재난 조회
 10. 캐시 메트릭 확인
"""

import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any

# ── 설정 ──────────────────────────────────────────────
BASE = "http://localhost:8000"
STEP_MODE = "--step" in sys.argv  # 단계별 실행 여부

# 발표 데모용 재난 시나리오 (명동 화재를 기준점으로 사용)
DEMO_DISASTER = {
    "alert_text": "[서울] 중구 명동 관광특구 인근 대형 건물 화재 발생. 긴급 대피 요망.",
    "dst_se_nm": "화재",
    "expires_hours": 2,
}

# 명동 중심 좌표 (Gemini가 추출할 예상 위치 근처)
MYEONGDONG = {"lat": 37.5636, "lng": 126.9826}

# ── 출력 헬퍼 ─────────────────────────────────────────

BOLD  = "\033[1m"
GREEN = "\033[92m"
RED   = "\033[91m"
YELLOW= "\033[93m"
CYAN  = "\033[96m"
RESET = "\033[0m"


def header(text: str):
    print(f"\n{BOLD}{CYAN}{'=' * 60}{RESET}")
    print(f"{BOLD}{CYAN}  {text}{RESET}")
    print(f"{BOLD}{CYAN}{'=' * 60}{RESET}")


def step(num: int, title: str):
    print(f"\n{BOLD}[{num:02d}] {title}{RESET}")
    if STEP_MODE:
        input("     Enter를 눌러 실행... ")


def ok(label: str, detail: str = ""):
    mark = f"{GREEN}[PASS]{RESET}"
    print(f"     {mark} {label}")
    if detail:
        print(f"           {YELLOW}→ {detail}{RESET}")


def fail(label: str, detail: str = ""):
    mark = f"{RED}[FAIL]{RESET}"
    print(f"     {mark} {label}")
    if detail:
        print(f"           {RED}  {detail}{RESET}")


def info(text: str):
    print(f"     {CYAN}ℹ {text}{RESET}")


# ── HTTP 헬퍼 ─────────────────────────────────────────

def call(method: str, path: str, body: dict | None = None) -> tuple[int, Any]:
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {"detail": str(e)}
    except Exception as e:
        return 0, {"detail": str(e)}


def make_route_payload(center_lat: float, center_lng: float, offset: float = 0.003) -> dict:
    """
    center 주변을 통과하는 경로 페이로드 생성.
    Kakao vertexes 형식: [lng0, lat0, lng1, lat1, ...]
    offset: 경도 방향으로 얼마나 이동하며 경로를 만드는지 (도 단위)
    """
    # center를 관통하는 3개 꼭짓점 생성
    pts = [
        (center_lng - offset, center_lat - 0.001),
        (center_lng,          center_lat),
        (center_lng + offset, center_lat + 0.001),
    ]
    vertexes = [v for p in pts for v in p]  # flat array
    return {
        "routeData": {
            "routes": [{
                "sections": [{
                    "roads": [{"vertexes": vertexes}]
                }]
            }]
        }
    }


# ── 메인 ──────────────────────────────────────────────

def main():
    header("DOMINO 전체 시스템 종합 검증")
    print(f"  서버: {BASE}")
    print(f"  모드: {'단계별 (Enter)' if STEP_MODE else '자동 연속'}")

    results = []
    saved_disaster = {}  # 5번에서 저장한 재난 정보를 이후 단계에서 사용

    # ──────────────────────────────────────────────────
    # 1. 서버 헬스체크
    # ──────────────────────────────────────────────────
    step(1, "서버 헬스체크 — GET /health")
    status, body = call("GET", "/health")
    passed = status == 200 and body.get("status") == "ok"
    if passed:
        ok("서버 정상 응답")
        info(f"총 API 호출: {body.get('api_calls', 0)}회 | 감지 이벤트: {body.get('seen_events', 0)}건")
    else:
        fail("서버 응답 없음 — Docker가 실행 중인지 확인하세요", str(body))
        print(f"\n{RED}서버에 연결할 수 없어 테스트를 중단합니다.{RESET}")
        sys.exit(1)
    results.append(passed)

    # ──────────────────────────────────────────────────
    # 2. Gemini 분석 — 화재 (명동)
    # ──────────────────────────────────────────────────
    step(2, "Gemini 분석 — 화재 / 명동")
    alert_fire = "[서울] 중구 명동 관광특구 인근 대형 건물 화재 발생. 긴급 대피 요망."
    status, body = call("POST", "/disaster/analyze", {"alert_text": alert_fire})
    a = body.get("analysis", {})
    passed = (
        status == 200
        and 37.40 <= a.get("lat", 0) <= 37.72
        and 126.76 <= a.get("lng", 0) <= 127.18
        and a.get("radius", 0) > 0
    )
    if passed:
        ok("위경도 추출 성공 + 서울 범위 검증 통과")
        info(f"lat={a['lat']:.4f}, lng={a['lng']:.4f}, radius={a['radius']}m")
    else:
        fail("Gemini 분석 실패 또는 서울 범위 벗어남", str(body))
    results.append(passed)

    # ──────────────────────────────────────────────────
    # 3. Gemini 분석 — 가스누출 (홍대)
    # ──────────────────────────────────────────────────
    step(3, "Gemini 분석 — 가스누출 / 홍대")
    alert_gas = "[서울] 마포구 홍대입구역 인근 가스 누출 사고 발생. 반경 500m 접근 금지."
    status, body = call("POST", "/disaster/analyze", {"alert_text": alert_gas})
    a = body.get("analysis", {})
    passed = (
        status == 200
        and 37.40 <= a.get("lat", 0) <= 37.72
        and 126.76 <= a.get("lng", 0) <= 127.18
    )
    if passed:
        ok("위경도 추출 성공 + 서울 범위 검증 통과")
        info(f"lat={a['lat']:.4f}, lng={a['lng']:.4f}, radius={a['radius']}m")
    else:
        fail("Gemini 분석 실패", str(body))
    results.append(passed)

    # ──────────────────────────────────────────────────
    # 4. Gemini 분석 — 붕괴 (경복궁)
    # ──────────────────────────────────────────────────
    step(4, "Gemini 분석 — 건물 붕괴 / 경복궁")
    alert_collapse = "[서울] 종로구 경복궁 인근 공사 현장 건물 일부 붕괴. 주변 도로 통제."
    status, body = call("POST", "/disaster/analyze", {"alert_text": alert_collapse})
    a = body.get("analysis", {})
    passed = (
        status == 200
        and 37.40 <= a.get("lat", 0) <= 37.72
        and 126.76 <= a.get("lng", 0) <= 127.18
    )
    if passed:
        ok("위경도 추출 성공 + 서울 범위 검증 통과")
        info(f"lat={a['lat']:.4f}, lng={a['lng']:.4f}, radius={a['radius']}m")
    else:
        fail("Gemini 분석 실패", str(body))
    results.append(passed)

    # ──────────────────────────────────────────────────
    # 5. 재난 DB 저장 (simulate)
    # ──────────────────────────────────────────────────
    step(5, "재난 DB 저장 — POST /disaster/simulate")
    status, body = call("POST", "/disaster/simulate", DEMO_DISASTER)
    passed = status == 200 and body.get("status") in ("saved", "skipped")
    if passed:
        saved_disaster = body.get("analysis", {})
        if body["status"] == "saved":
            ok("DB 저장 성공")
            info(f"lat={saved_disaster.get('lat'):.4f}, "
                 f"lng={saved_disaster.get('lng'):.4f}, radius={saved_disaster.get('radius_m')}m, "
                 f"penalty={saved_disaster.get('penalty')}")
        else:
            ok("이미 저장된 재난 — 중복 제거 동작 확인됨")
            info("재실행 시 나타나는 정상 동작입니다")
    else:
        fail("simulate 저장 실패", str(body))
    results.append(passed)

    # ──────────────────────────────────────────────────
    # 6. 경로 판정 — 위험 경로 (재난 구역 통과)
    # ──────────────────────────────────────────────────
    step(6, "경로 안전 판정 — 위험 경로 (재난 구역 통과)")

    # 5번에서 저장한 좌표를 사용, 없으면 명동 기본값
    center_lat = saved_disaster.get("lat") or MYEONGDONG["lat"]
    center_lng = saved_disaster.get("lng") or MYEONGDONG["lng"]
    danger_payload = make_route_payload(center_lat, center_lng, offset=0.001)

    info(f"경로 중심: lat={center_lat:.4f}, lng={center_lng:.4f} (재난 구역 관통)")
    status, body = call("POST", "/route/calculate", danger_payload)
    passed = status == 200 and body.get("is_safe") is False and body.get("total_penalty", 0) > 0
    if passed:
        ok("위험 경로 정확히 감지됨 — is_safe=False")
        info(f"total_penalty={body['total_penalty']} | 위험 구간={body['affected_sections']}")
    else:
        if status == 200 and body.get("is_safe") is True:
            fail("경로가 안전으로 판정됨 (재난이 아직 DB에 없거나 반경이 좁음)", str(body))
        else:
            fail("경로 계산 오류", str(body))
    results.append(passed)

    # ──────────────────────────────────────────────────
    # 7. 경로 판정 — 안전 경로 (재난 구역 완전 회피)
    # ──────────────────────────────────────────────────
    step(7, "경로 안전 판정 — 안전 경로 (강남, 재난 구역과 무관)")
    # 강남역 주변 — 명동 재난과 약 8km 이상 떨어짐
    safe_payload = make_route_payload(37.4979, 127.0276, offset=0.002)
    info("경로 중심: lat=37.4979, lng=127.0276 (강남역 — 재난 구역과 ~8km 이격)")
    status, body = call("POST", "/route/calculate", safe_payload)
    passed = status == 200 and body.get("is_safe") is True
    if passed:
        ok("안전 경로 정확히 판정됨 — is_safe=True")
        info(f"total_penalty=0 | 경고 없음")
    else:
        fail("안전 경로가 위험으로 오판됨", str(body))
    results.append(passed)

    # ──────────────────────────────────────────────────
    # 8. 중복 등록 방지 검증
    # ──────────────────────────────────────────────────
    step(8, "중복 등록 방지 — 같은 재난문자 재전송")
    # 동일 message → DB에 이미 존재 → skipped 반환 예상
    status, body = call("POST", "/disaster/simulate", DEMO_DISASTER)
    passed = status == 200 and body.get("status") == "skipped"

    if passed:
        ok("중복 감지 성공 — skipped 반환")
        info(f"existing_id={body.get('existing_id')} — 이미 처리된 이벤트")
    else:
        fail("예상치 못한 응답", str(body))
    results.append(passed)

    # ──────────────────────────────────────────────────
    # 9. 주변 재난 조회 (명동 기준 1km 내)
    # ──────────────────────────────────────────────────
    step(9, "주변 재난 조회 — GET /disaster/nearby (명동 1km)")
    lat_q = center_lat
    lng_q = center_lng
    status, body = call("GET", f"/disaster/nearby?lat={lat_q}&lng={lng_q}&search_radius=1000")
    passed = status == 200 and body.get("count", 0) >= 1
    if passed:
        ok(f"주변 재난 {body['count']}건 조회 성공")
        for d in body["data"][:2]:
            info(f"'{d['message'][:40]}...' | {d['distance_m']}m 거리")
    else:
        fail("주변 재난 조회 실패 또는 0건", str(body))
    results.append(passed)

    # ──────────────────────────────────────────────────
    # 10. 캐시 메트릭 확인
    # ──────────────────────────────────────────────────
    step(10, "캐시 메트릭 — GET /cache/metrics")
    status, body = call("GET", "/cache/metrics")
    passed = status == 200 and "cache" in body
    if passed:
        cache = body["cache"]
        weather = body.get("weather_optimization", {})
        ok("캐시 메트릭 정상 반환")
        info(f"전체 히트율: {cache.get('hit_rate_pct', 0):.1f}% | "
             f"히트: {cache.get('hit_count', 0)}회 | "
             f"미스: {cache.get('miss_count', 0)}회 | "
             f"평균 응답: {cache.get('avg_latency_ms', 0):.1f}ms")
        info(f"날씨 최적화 — SET생략: {weather.get('skip_count', 0)}회 / "
             f"실제SET: {weather.get('set_count', 0)}회 / "
             f"실측 히트율: {weather.get('effective_hit_rate_pct', 0):.1f}% / "
             f"이론: {weather.get('theory_hit_rate_pct', 91.7)}%")
    else:
        fail("캐시 메트릭 조회 실패", str(body))
    results.append(passed)

    # ──────────────────────────────────────────────────
    # 최종 결과
    # ──────────────────────────────────────────────────
    passed_count = sum(results)
    total = len(results)

    print(f"\n{BOLD}{'=' * 60}{RESET}")
    if passed_count == total:
        print(f"{GREEN}{BOLD}  ✅ 전체 통과  {passed_count}/{total}{RESET}")
    else:
        failed = [i + 1 for i, r in enumerate(results) if not r]
        print(f"{RED}{BOLD}  ❌ {passed_count}/{total} 통과  (실패: {failed}){RESET}")
    print(f"{BOLD}{'=' * 60}{RESET}\n")


if __name__ == "__main__":
    main()
