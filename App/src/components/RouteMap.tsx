// ═══════════════════════════════════════════════════════════
// RouteMap — 경로 탐색 결과를 지도에 렌더링
// ═══════════════════════════════════════════════════════════

import { type FC, useEffect, useRef } from "react";
import type { RouteState } from "../types/type";
import type { KakaoLatLng, KakaoMapInstance, KakaoOverlay, KakaoPolyline } from "../types/type_kakao";
import { COLOR_DEST, COLOR_ORIGIN, COLOR_TEXT_MAIN, TRAFFIC_COLOR_MAP } from "../colors";


interface RouteMapProps {
  routeState:  RouteState;
  kakaoMapRef: React.MutableRefObject<KakaoMapInstance | null>;
  isMapReady:  boolean;
}

const RouteMap: FC<RouteMapProps> = ({ routeState, kakaoMapRef, isMapReady }) => {
  const pinOverlayListRef  = useRef<KakaoOverlay[]>([]);
  const polylineListRef    = useRef<KakaoPolyline[]>([]);

  useEffect(() => {
    if (!isMapReady || !kakaoMapRef.current) return;

    // 기존 레이어 정리
    pinOverlayListRef.current.forEach(o => o.setMap(null));
    polylineListRef.current.forEach(p => p.setMap(null));
    pinOverlayListRef.current = [];
    polylineListRef.current   = [];

    const { origin, destination, result } = routeState;

    // [UTIL] 핀 오버레이 생성 헬퍼
    const makePinOverlay = (lat: number, lng: number, color: string, label: string): KakaoOverlay => {
      const el = document.createElement("div");
      el.style.cssText = "display:flex;flex-direction:column;align-items:center;";
      el.innerHTML = `
        <div style="background:#fff;border-radius:8px;padding:3px 8px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.12);font-size:11px;font-weight:700;color:${COLOR_TEXT_MAIN};border:1.5px solid ${color};font-family:'Noto Sans KR',sans-serif;">${label}</div>
        <div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);font-size:12px;line-height:1">${label === "출발" ? "🟢" : "🔴"}</span>
        </div>`;
      const overlay = new window.kakao.maps.CustomOverlay({
        map: kakaoMapRef.current!, position: new window.kakao.maps.LatLng(lat, lng),
        content: el, yAnchor: 1.1, zIndex: 15,
      });
      return overlay;
    };

    if (origin)      pinOverlayListRef.current.push(makePinOverlay(origin.lat, origin.lng, COLOR_ORIGIN, "출발"));
    if (destination) pinOverlayListRef.current.push(makePinOverlay(destination.lat, destination.lng, COLOR_DEST, "도착"));

    // [RENDER] API 응답 roads의 vertexes로 교통 혼잡도별 폴리라인 그리기
    // vertexes 포맷: [lng0, lat0, lng1, lat1, ...] — 2개씩 쌍으로 파싱
    if (result) {
      result.roads.forEach(road => {
        const { vertexes, traffic_state } = road;
        const path: KakaoLatLng[] = [];
        for (let i = 0; i < vertexes.length - 1; i += 2) {
          path.push(new window.kakao.maps.LatLng(vertexes[i + 1], vertexes[i]));
        }
        if (path.length < 2) return;

        const polyline = new window.kakao.maps.Polyline({
          map:           kakaoMapRef.current!,
          path,
          strokeWeight:  6,
          strokeColor:   TRAFFIC_COLOR_MAP[traffic_state] ?? TRAFFIC_COLOR_MAP[0],
          strokeOpacity: 0.9,
          strokeStyle:   "solid",
        });
        polylineListRef.current.push(polyline);
      });

      // [NOTE] API 응답의 전체 좌표로 지도 범위 자동 맞춤 (padding 60px)
      const bounds = new window.kakao.maps.LatLngBounds();
      result.roads.forEach(road => {
        for (let i = 0; i < road.vertexes.length - 1; i += 2) {
          bounds.extend(new window.kakao.maps.LatLng(road.vertexes[i + 1], road.vertexes[i]));
        }
      });
      kakaoMapRef.current!.setBounds(bounds, 60, 60, 60, 60);

    } else if (origin && destination) {
      // [NOTE] 결과 없을 때 두 점만으로 범위 맞춤
      const bounds = new window.kakao.maps.LatLngBounds();
      bounds.extend(new window.kakao.maps.LatLng(origin.lat, origin.lng));
      bounds.extend(new window.kakao.maps.LatLng(destination.lat, destination.lng));
      kakaoMapRef.current!.setBounds(bounds, 60, 60, 60, 60);
    } else if (origin) {
      kakaoMapRef.current!.setCenter(new window.kakao.maps.LatLng(origin.lat, origin.lng));
    } else if (destination) {
      kakaoMapRef.current!.setCenter(new window.kakao.maps.LatLng(destination.lat, destination.lng));
    }
  }, [isMapReady, routeState, kakaoMapRef]);

  return null;
};

export default RouteMap;