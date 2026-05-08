// ═══════════════════════════════════════════════════════════
// RoutePanel — 출발지/도착지 입력 + 경로 결과 카드
// ═══════════════════════════════════════════════════════════

import { type FC, useState, useCallback } from "react";
import type { RouteState, RoutePoint, RouteResult, DirectionsResponse } from "../types/type";
import { COLOR_BORDER, 
        COLOR_DANGER, 
        COLOR_INACTIVE, 
        COLOR_PRIMARY, 
        COLOR_PRIMARY_LIGHT, 
        COLOR_SURFACE, 
        COLOR_TEXT_MAIN, 
        COLOR_TEXT_SUB, 
        COLOR_ORIGIN, 
        COLOR_DEST,
        TRAFFIC_COLOR_MAP } from "../colors";
import { formatDistance, formatDuration } from "../utils/Utils";

interface RoutePanelProps {
  routeState:  RouteState;
  onSetOrigin: (point: RoutePoint | null) => void;
  onSetDest:   (point: RoutePoint | null) => void;
  onSetResult: (result: RouteResult | null) => void;
  onSetLoading:(isLoading: boolean) => void;
  onSetError:  (msg: string) => void;
  userLat:     number;
  userLng:     number;
}

/** [API] 카카오 Geocoder — 주소 문자열 → 좌표 변환 */
const geocodeAddress = (query: string): Promise<RoutePoint> =>
  new Promise((resolve, reject) => {
    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(query, (result, status) => {
      if (status === window.kakao.maps.services.Status.OK && result[0]) {
        resolve({
          label: result[0].address_name,
          lat:   parseFloat(result[0].y),
          lng:   parseFloat(result[0].x),
        });
      } else {
        reject(new Error(`"${query}" 주소를 찾을 수 없어요`));
      }
    });
});

const fetchCarRoute = async (
  origin:      RoutePoint,
  destination: RoutePoint,
): Promise<RouteResult> => {
  const params = new URLSearchParams({
    origin:      `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
    priority:    "RECOMMEND",
    car_fuel:    "GASOLINE",
    car_hipass:  "false",
    alternatives:"false",
    road_details:"false",
  });

  const res = await fetch(`${import.meta.env.VITE_KAKAO_DIRECTIONS_URL}?${params}`, {
    headers: { Authorization: `KakaoAK ${import.meta.env.VITE_KAKAO_REST_API_KEY}` },
  });

  if (!res.ok) throw new Error(`API 오류: ${res.status}`);

  const data: DirectionsResponse = await res.json();
  const route = data.routes?.[0];

  if (!route || route.result_code !== 0) {
    throw new Error(route?.result_msg ?? "경로를 찾을 수 없어요");
  }

  // [NOTE] 모든 section의 roads를 하나로 flatten
  const roads = route.sections.flatMap(s => s.roads);

  return {
    distanceMeter: route.summary.distance,
    durationSec:   route.summary.duration,
    taxiFare:      route.summary.fare.taxi,
    tollFare:      route.summary.fare.toll,
    roads,
  };
};

const RoutePanel: FC<RoutePanelProps> = ({
  routeState, onSetOrigin, onSetDest, onSetResult, onSetLoading, onSetError,
  userLat, userLng,
}) => {
  const [originInput, setOriginInput] = useState<string>("");
  const [destInput,   setDestInput]   = useState<string>("");

  // [HANDLER] 경로 탐색 실행
  // 1. Geocoder로 주소 → 좌표 변환
  // 2. fetchCarRoute로 카카오모빌리티 Directions API 호출
  const handleSearch = useCallback(async () => {
    if (!originInput.trim() || !destInput.trim()) {
      onSetError("출발지와 도착지를 모두 입력해주세요");
      return;
    }
    onSetLoading(true);
    onSetError("");
    onSetResult(null);
    try {
      const [origin, dest] = await Promise.all([
        geocodeAddress(originInput),
        geocodeAddress(destInput),
      ]);
      onSetOrigin(origin);
      onSetDest(dest);
      const result = await fetchCarRoute(origin, dest);
      onSetResult(result);
    } catch (e) {
      onSetError((e as Error).message);
    } finally {
      onSetLoading(false);
    }
  }, [originInput, destInput, onSetOrigin, onSetDest, onSetResult, onSetLoading, onSetError]);

  // [HANDLER] 현재 위치를 출발지로 설정
  const handleUseCurrentLoc = useCallback(() => {
    onSetOrigin({ label: "현재 위치", lat: userLat, lng: userLng });
    setOriginInput("현재 위치");
  }, [userLat, userLng, onSetOrigin]);

  // [HANDLER] 출발/도착 스왑
  const handleSwap = useCallback(() => {
    const prevOrigin = routeState.origin;
    const prevDest   = routeState.destination;
    onSetOrigin(prevDest);
    onSetDest(prevOrigin);
    setOriginInput(prevDest?.label ?? "");
    setDestInput(prevOrigin?.label ?? "");
    onSetResult(null);
  }, [routeState.origin, routeState.destination, onSetOrigin, onSetDest, onSetResult]);

  const { result, isLoading, errorMsg } = routeState;

  return (
    <div style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* 출발지/도착지 입력 박스 */}
      <div style={{ background: COLOR_SURFACE, borderRadius: 14, border: `1px solid ${COLOR_BORDER}`, overflow: "hidden" }}>

        {/* 출발지 */}
        <div style={{ display: "flex", alignItems: "center", padding: "11px 14px", gap: 10, borderBottom: `1px solid ${COLOR_BORDER}` }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLOR_ORIGIN, flexShrink: 0 }} />
          <input
            value={originInput}
            onChange={e => setOriginInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="출발지 주소 입력"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: COLOR_TEXT_MAIN, background: "transparent", fontFamily: "'Noto Sans KR', sans-serif" }}
          />
          <button onClick={handleUseCurrentLoc} title="현재 위치로 설정" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>📍</button>
        </div>

        {/* 스왑 버튼 */}
        <div style={{ position: "relative", height: 0, zIndex: 5 }}>
          <button onClick={handleSwap} style={{ position: "absolute", right: 14, top: -14, width: 28, height: 28, borderRadius: "50%", border: `1px solid ${COLOR_BORDER}`, background: COLOR_SURFACE, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>↕</button>
        </div>

        {/* 도착지 */}
        <div style={{ display: "flex", alignItems: "center", padding: "11px 14px", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: COLOR_DEST, flexShrink: 0 }} />
          <input
            value={destInput}
            onChange={e => setDestInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="도착지 주소 입력"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: COLOR_TEXT_MAIN, background: "transparent", fontFamily: "'Noto Sans KR', sans-serif" }}
          />
        </div>
      </div>

      {/* 오류 메시지 */}
      {errorMsg && (
        <div style={{ fontSize: 12, color: COLOR_DANGER, fontWeight: 600, paddingLeft: 4 }}>{errorMsg}</div>
      )}

      {/* 경로 탐색 버튼 */}
      <button
        onClick={handleSearch}
        disabled={isLoading}
        style={{ padding: "12px 0", borderRadius: 12, border: "none", background: isLoading ? COLOR_INACTIVE : COLOR_PRIMARY, color: "#fff", fontSize: 14, fontWeight: 700, cursor: isLoading ? "default" : "pointer", fontFamily: "'Noto Sans KR', sans-serif", transition: "all 0.18s" }}
      >
        {isLoading ? "경로 탐색 중..." : "🔍 경로 탐색"}
      </button>

      {/* 경로 결과 카드 */}
      {result && (
        <div style={{ background: COLOR_SURFACE, borderRadius: 14, border: `1.5px solid ${COLOR_PRIMARY}`, overflow: "hidden" }}>

          {/* 요약 헤더 */}
          <div style={{ background: COLOR_PRIMARY_LIGHT, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: COLOR_PRIMARY }}>{formatDuration(result.durationSec)}</div>
              <div style={{ fontSize: 12, color: COLOR_TEXT_SUB, marginTop: 2 }}>총 {formatDistance(result.distanceMeter)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {result.taxiFare > 0 && (
                <div style={{ fontSize: 13, fontWeight: 700, color: COLOR_TEXT_MAIN }}>🚕 {result.taxiFare.toLocaleString()}원</div>
              )}
              {result.tollFare > 0 && (
                <div style={{ fontSize: 11, color: COLOR_TEXT_SUB, marginTop: 2 }}>통행료 {result.tollFare.toLocaleString()}원</div>
              )}
            </div>
          </div>

          {/* 경유 정보 */}
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLOR_ORIGIN, flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: COLOR_TEXT_MAIN, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{routeState.origin?.label}</div>
            </div>
            <div style={{ width: 2, height: 14, background: COLOR_BORDER, marginLeft: 3 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: COLOR_DEST, flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: COLOR_TEXT_MAIN, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{routeState.destination?.label}</div>
            </div>
          </div>

          {/* 교통 혼잡도 범례 */}
          <div style={{ padding: "8px 16px 14px", display: "flex", gap: 12, flexWrap: "wrap" }}>
            {([0, 1, 2, 3] as const).map(state => {
              const labels = ["원활", "서행", "정체", "매우정체"];
              return (
                <div key={state} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 20, height: 4, borderRadius: 2, background: TRAFFIC_COLOR_MAP[state] }} />
                  <span style={{ fontSize: 10, color: COLOR_TEXT_SUB }}>{labels[state]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutePanel;