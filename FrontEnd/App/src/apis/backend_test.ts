import axios from "axios";

// ── 백엔드 서버 주소를 여기에 입력하세요 ──
const BACKEND_URL = "https://idfriend.kr/"; // TODO: 실제 주소로 변경

const TA_API_KEY = import.meta.env.VITE_TRIPADVISOR_API_KEY as string;

// ── 테스트용 기본 좌표 (서울 시청) ──
const TEST_LAT = 37.5665;
const TEST_LNG = 126.9780;
const TEST_PLACE_NAME = "경복궁";

// ── API 클라이언트 ──
const client = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10_000,
});

// ── 결과 출력 헬퍼 ──
function printResult(label: string, data: unknown) {
  console.log(`\n✅ [${label}] 성공`);
  console.log(JSON.stringify(data, null, 2));
}

function printError(label: string, error: unknown) {
  if (axios.isAxiosError(error)) {
    console.error(`\n❌ [${label}] 실패 — ${error.message}`);
    console.error("  status :", error.response?.status);
    console.error("  data   :", error.response?.data);
  } else {
    console.error(`\n❌ [${label}] 실패 —`, error);
  }
}

// ── 1. TripAdvisor Location Search ──────────────────────────
async function testLocationSearch(): Promise<string | null> {
  const label = "TripAdvisor Location Search";
  try {
    const res = await client.get("/api/tripadvisor/search", {
      params: {
        searchQuery: TEST_PLACE_NAME,
        latLong: `${TEST_LAT},${TEST_LNG}`,
        language: "ko",
        key: TA_API_KEY,
      },
    });
    printResult(label, res.data);
    const locationId: string | undefined = res.data?.data?.[0]?.location_id;
    if (locationId) console.log(`  → location_id: ${locationId}`);
    return locationId ?? null;
  } catch (e) {
    printError(label, e);
    return null;
  }
}

// ── 2. TripAdvisor Location Details ─────────────────────────
async function testLocationDetails(locationId: string) {
  const label = "TripAdvisor Location Details";
  try {
    const res = await client.get(`/api/tripadvisor/details/${locationId}`, {
      params: { language: "ko", key: TA_API_KEY },
    });
    printResult(label, res.data);
    console.log(`  → rating    : ${res.data?.rating}`);
    console.log(`  → num_reviews: ${res.data?.num_reviews}`);
  } catch (e) {
    printError(label, e);
  }
}

// ── 전체 실행 ────────────────────────────────────────────────
export async function runBackendTests() {
  console.log("=".repeat(50));
  console.log(`백엔드 테스트 시작: ${BACKEND_URL}`);
  console.log("=".repeat(50));

  const locationId = await testLocationSearch();

  if (locationId) {
    await testLocationDetails(locationId);
  } else {
    console.warn("\n⚠️  location_id를 가져오지 못해 Details 테스트를 건너뜁니다.");
  }

  console.log("\n" + "=".repeat(50));
  console.log("테스트 완료");
  console.log("=".repeat(50));
}
