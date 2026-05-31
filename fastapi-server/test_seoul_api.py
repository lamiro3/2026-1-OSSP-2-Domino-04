"""
서울시 citydata API 응답 확인용 테스트 스크립트.

실행:
    python test_seoul_api.py                  # 기본 지역 (명동 관광특구)
    python test_seoul_api.py 경복궁
    python test_seoul_api.py "홍대 관광특구"
"""

import sys
import json
import urllib.request
import os
from pathlib import Path

# .env에서 SEOUL_API_KEY 로드
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

API_KEY = os.getenv("SEOUL_API_KEY", "")
if not API_KEY:
    print("[ERROR] SEOUL_API_KEY가 .env에 없습니다.")
    sys.exit(1)

AREA = sys.argv[1] if len(sys.argv) > 1 else "명동 관광특구"


def fetch(area: str) -> dict:
    url = f"http://openapi.seoul.go.kr:8088/{API_KEY}/json/citydata/1/1/{urllib.parse.quote(area)}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read())


import urllib.parse

print(f"\n=== 서울시 citydata API 테스트 — 지역: {AREA} ===\n")

try:
    data = fetch(AREA)
except Exception as e:
    print(f"[ERROR] API 호출 실패: {e}")
    sys.exit(1)

citydata = data.get("CITYDATA", {})

# ── LIVE_DST_MESSAGE ──────────────────────────
print("[ LIVE_DST_MESSAGE ] 실시간 긴급재난문자")
print("-" * 60)
messages = citydata.get("LIVE_DST_MESSAGE", [])
if not messages:
    print("  (현재 재난문자 없음)")
else:
    for i, msg in enumerate(messages, 1):
        print(f"  [{i}]")
        print(f"    DST_SE_NM  (재해구분명) : {msg.get('DST_SE_NM', '-')}")
        print(f"    EMRG_STEP_NM (긴급단계명): {msg.get('EMRG_STEP_NM', '-')}")
        print(f"    MSG_CN     (메시지내용) : {msg.get('MSG_CN', '-')}")
        print(f"    CRT_DT     (생성일시)  : {msg.get('CRT_DT', '-')}")
        print()

# ── 원본 전체 출력 (선택) ────────────────────
print("\n[ 원본 JSON — LIVE_DST_MESSAGE 전체 ]")
print(json.dumps(messages, ensure_ascii=False, indent=2))