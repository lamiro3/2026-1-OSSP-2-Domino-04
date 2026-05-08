// ═══════════════════════════════════════════════════════════
// RouteScreen - 근처 장소 탐색 + 경로 탐색 화면
// ═══════════════════════════════════════════════════════════

import { useState, useRef, useEffect, type FC } from "react";
import type { Tab, PlaceData, Place, UserLocation, RoutePoint, RouteState, RouteResult, Category } from "../types/type";
import type { KakaoLatLng, KakaoLatLngBounds, KakaoMapInstance, KakaoCircle, KakaoGeocoder, KakaoMarker, KakaoOverlay, KakaoPolyline } from "../types/type_kakao";
import { COLOR_BG, COLOR_BORDER, COLOR_INACTIVE, COLOR_PRIMARY, COLOR_SURFACE, COLOR_TEXT_MAIN, COLOR_TEXT_SUB } from "../colors";
import { toPlace } from "../utils/Utils";

import PlaceCard from "./PlaceCard";
import RouteMap from "./RouteMap";
import RoutePanel from "./RoutePanel"; 
import NearbyMap from "./NearByMap";

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

// VITE 기준: import.meta.env.VITE_KAKAO_REST_API_KEY
const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY;

// [API] 카카오모빌리티 자동차 길찾기 엔드포인트
const KAKAO_DIRECTIONS_URL = import.meta.env.VITE_KAKAO_DIRECTIONS_URL;

// [CONFIG] 반경 옵션
const RADIUS_OPTION_LIST = [
  { label: "가까운 곳", meter: 250 },
  { label: "기본",      meter: 500 },
  { label: "넓은 곳",   meter: 1000 },
] as const;

// [CONFIG] 기본 위치 (서울 시청) — 위치 권한 거부 시 폴백
const DEFAULT_LAT = 37.5665;
const DEFAULT_LNG = 126.9780;

const CATEGORY_ICON: Record<Category, string> = {
  카페: "☕", 갤러리: "🖼", 공원: "🌿", 명소: "📸", 문화: "🎨", 거리: "🛍",
};

// ═══════════════════════════════════════════════════════════
// KAKAO MAP 전역 타입 선언
// [NOTE] @types/kakao.maps.d.ts 패키지 미설치 시 최소 선언
// ═══════════════════════════════════════════════════════════
declare global {
  interface Window {
    kakao: {
      maps: {
        load:          (cb: () => void) => void;
        Map:           new (el: HTMLElement, opts: object) => KakaoMapInstance;
        LatLng:        new (lat: number, lng: number) => KakaoLatLng;
        LatLngBounds:  new () => KakaoLatLngBounds;
        CustomOverlay: new (opts: object) => KakaoOverlay;
        Circle:        new (opts: object) => KakaoCircle;
        Marker:        new (opts: object) => KakaoMarker;
        MarkerImage:   new (src: string, size: object) => object;
        Polyline:      new (opts: object) => KakaoPolyline;
        Size:          new (w: number, h: number) => object;
        services: {
          Geocoder: new () => KakaoGeocoder;
          Status: { OK: string };
        };
        event: {
          addListener: (target: object, type: string, handler: () => void) => void;
        };
      };
    };
  }
}

// ═══════════════════════════════════════════════════════════
// MOCK DATA
// [API] 실제 구현 시 카카오 장소 검색 API 호출로 교체
// ═══════════════════════════════════════════════════════════

const PLACE_LIST: PlaceData[] = [
  { id:  1, name: "성수연방",          category: "카페",   rating: 4.7, reviews: 2341, district: "성동구", latOffset:  0.002, lngOffset: -0.003 },
  { id:  2, name: "대림창고",          category: "갤러리", rating: 4.5, reviews: 1823, district: "성동구", latOffset: -0.001, lngOffset:  0.002 },
  { id:  3, name: "서울숲",            category: "공원",   rating: 4.8, reviews: 5102, district: "성동구", latOffset:  0.004, lngOffset:  0.001 },
  { id:  4, name: "카페 어니언",       category: "카페",   rating: 4.6, reviews: 3214, district: "성동구", latOffset: -0.002, lngOffset:  0.003 },
  { id:  5, name: "하이브 사옥",       category: "명소",   rating: 4.9, reviews: 8821, district: "용산구", latOffset:  0.006, lngOffset: -0.004 },
  { id:  6, name: "경리단길",          category: "거리",   rating: 4.3, reviews: 2109, district: "용산구", latOffset: -0.005, lngOffset:  0.005 },
  { id:  7, name: "SM 엔터테인먼트",   category: "명소",   rating: 4.7, reviews: 6432, district: "강남구", latOffset:  0.008, lngOffset:  0.006 },
  { id:  8, name: "별마당도서관",      category: "문화",   rating: 4.6, reviews: 4521, district: "강남구", latOffset: -0.007, lngOffset: -0.002 },
  { id:  9, name: "광화문 광장",       category: "명소",   rating: 4.7, reviews: 6230, district: "종로구", latOffset:  0.003, lngOffset: -0.006 },
  { id: 10, name: "홍대 걷고싶은거리", category: "거리",   rating: 4.5, reviews: 8320, district: "마포구", latOffset: -0.004, lngOffset:  0.007 },
  { id: 11, name: "연남동 카페거리",   category: "카페",   rating: 4.5, reviews: 3412, district: "마포구", latOffset:  0.001, lngOffset: -0.005 },
  { id: 12, name: "남산타워",          category: "명소",   rating: 4.6, reviews: 9103, district: "용산구", latOffset:  0.005, lngOffset:  0.004 },
];

// ═══════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════

const useUserLocation = (): UserLocation => {
  const [lat,        setLat]        = useState<number>(DEFAULT_LAT);
  const [lng,        setLng]        = useState<number>(DEFAULT_LNG);
  const [isLocating, setIsLocating] = useState<boolean>(true);
  const [locLabel,   setLocLabel]   = useState<string>("📍 위치 불러오는 중...");

  useEffect(() => {
    if (!navigator.geolocation) {
      setIsLocating(false);
      setLocLabel("📍 위치 미지원 (기본 위치 사용)");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setIsLocating(false);
        setLocLabel("📍 현위치 기준");
      },
      () => {
        setIsLocating(false);
        setLocLabel("📍 위치 권한 거부됨 (기본 위치 사용)");
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
  }, []);

  return { lat, lng, isLocating, locLabel };
};

// ═══════════════════════════════════════════════════════════
// [NOTE] 실제 구현 시 카카오 장소 검색 API 호출로 교체
// ═══════════════════════════════════════════════════════════

/**
 * [API] 카카오모빌리티 자동차 길찾기 호출
 * 엔드포인트: GET https://apis-navi.kakaomobility.com/v1/directions
 * 파라미터:
 *   origin      — "lng,lat" 형식 출발지 좌표
 *   destination — "lng,lat" 형식 도착지 좌표
 *   priority    — RECOMMEND(추천) | TIME(최단시간) | DISTANCE(최단거리)
 *
 * 응답 구조:
 *   routes[0].summary.distance  — 총 거리(m)
 *   routes[0].summary.duration  — 총 소요시간(초)
 *   routes[0].summary.fare      — { taxi, toll } 요금(원)
 *   routes[0].sections[].roads  — 도로별 좌표(vertexes)·혼잡도(traffic_state)
 *   roads[].vertexes            — [lng, lat, lng, lat, ...] 쌍 배열
 */

// ═══════════════════════════════════════════════════════════
// RouteScreen
// ═══════════════════════════════════════════════════════════

const RouteScreen: FC = () => {
  const [activeTab,         setActiveTab]         = useState<Tab>("nearby");
  const [selectedRadiusIdx, setSelectedRadiusIdx] = useState<number>(1);
  const [selectedPlace,     setSelectedPlace]     = useState<Place | null>(null);
  const [routeState,        setRouteState]        = useState<RouteState>({
    origin: null, destination: null, result: null, isLoading: false, errorMsg: "",
  });

  // [NOTE] 지도 인스턴스를 상위에서 관리 — 탭 전환 시 지도 재생성 방지
  const kakaoMapRef = useRef<KakaoMapInstance | null>(null);
  const mapElRef    = useRef<HTMLDivElement>(null);
  const [isMapReady, setIsMapReady] = useState<boolean>(false);

  const { lat: userLat, lng: userLng, isLocating, locLabel } = useUserLocation();

  // [INIT] 카카오맵 인스턴스 생성 — 마운트 1회
  // [FIX] autoload=false 설정 필요: ?appkey=...&libraries=services&autoload=false
  useEffect(() => {
    if (!window.kakao?.maps || !mapElRef.current) return;
    window.kakao.maps.load(() => {
      const map = new window.kakao.maps.Map(mapElRef.current!, {
        center: new window.kakao.maps.LatLng(DEFAULT_LAT, DEFAULT_LNG),
        level:  4,
      });
      kakaoMapRef.current = map;
      setIsMapReady(true);
    });
  }, []);

  const radiusConfig = RADIUS_OPTION_LIST[selectedRadiusIdx];

  const activePlaceList: Place[] = PLACE_LIST
    .map(p => toPlace(p, userLat, userLng))
    .filter(p => p.distance <= radiusConfig.meter)
    .sort((a, b) => a.distance - b.distance);

  const handleSelectPlace    = (place: Place | null): void =>
    setSelectedPlace(prev => prev?.id === place?.id ? null : place);
  const handleSelectRadius   = (idx: number): void => { setSelectedRadiusIdx(idx); setSelectedPlace(null); };
  const handleSetOrigin      = (point: RoutePoint | null): void => setRouteState(prev => ({ ...prev, origin: point }));
  const handleSetDest        = (point: RoutePoint | null): void => setRouteState(prev => ({ ...prev, destination: point }));
  const handleSetRouteResult = (result: RouteResult | null): void => setRouteState(prev => ({ ...prev, result }));
  const handleSetLoading     = (isLoading: boolean): void => setRouteState(prev => ({ ...prev, isLoading }));
  const handleSetError       = (errorMsg: string): void => setRouteState(prev => ({ ...prev, errorMsg }));

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column", background: COLOR_BG, fontFamily: "'Noto Sans KR', sans-serif", overflow: "hidden" }}>

      {/* 헤더 + 탭 */}
      <div style={{ padding: "14px 20px 0", background: COLOR_SURFACE, borderBottom: `1px solid ${COLOR_BORDER}`, flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: COLOR_TEXT_SUB, letterSpacing: 2, fontWeight: 600, marginBottom: 4 }}>{activeTab === "nearby" ? "NEARBY EXPLORE" : "ROUTE PLANNING"}</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: COLOR_TEXT_MAIN, marginBottom: 12 }}>{activeTab === "nearby" ? "근처 인기 장소 탐색" : "경로 탐색"}</div>
        <div style={{ display: "flex" }}>
          {(["nearby", "route"] as Tab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: "10px 0", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, color: activeTab === tab ? COLOR_PRIMARY : COLOR_TEXT_SUB, borderBottom: `2.5px solid ${activeTab === tab ? COLOR_PRIMARY : "transparent"}`, fontFamily: "'Noto Sans KR', sans-serif", transition: "all 0.18s" }}>
              {tab === "nearby" ? "🗺 주변 탐색" : "🧭 경로 탐색"}
            </button>
          ))}
        </div>
      </div>

      {/* 지도 영역 — 탭 전환해도 항상 마운트 유지 */}
      <div style={{ height: 300, flexShrink: 0, position: "relative" }}>
        <div ref={mapElRef} style={{ width: "100%", height: "100%" }} />
        {activeTab === "nearby" && (
          <NearbyMap
            userLat={userLat} userLng={userLng} isLocating={isLocating} locLabel={locLabel}
            radiusMeter={radiusConfig.meter} selectedPlace={selectedPlace} onSelectPlace={handleSelectPlace}
            selectedRadiusIdx={selectedRadiusIdx} onSelectRadius={handleSelectRadius}
            kakaoMapRef={kakaoMapRef} isMapReady={isMapReady}
          />
        )}
        {activeTab === "route" && (
          <RouteMap routeState={routeState} kakaoMapRef={kakaoMapRef} isMapReady={isMapReady} />
        )}
      </div>

      {/* 하단 패널 */}
      <div style={{ flex: 1, overflowY: "auto", background: COLOR_BG }}>
        {activeTab === "nearby" && (
          <div style={{ padding: "12px 16px 24px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLOR_TEXT_SUB, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span>주변 장소 <span style={{ color: COLOR_PRIMARY }}>{activePlaceList.length}</span></span>
              <span style={{ fontWeight: 400, fontSize: 11 }}>{radiusConfig.label} 이내 · 거리순</span>
            </div>
            {activePlaceList.length === 0
              ? <div style={{ textAlign: "center", color: COLOR_INACTIVE, fontSize: 13, padding: 32 }}>반경 내 장소가 없어요</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activePlaceList.map(place => (
                    <PlaceCard key={place.id} place={place} isSelected={selectedPlace?.id === place.id} onSelect={handleSelectPlace} />
                  ))}
                </div>
            }
          </div>
        )}
        {activeTab === "route" && (
          <RoutePanel
            routeState={routeState}
            onSetOrigin={handleSetOrigin} onSetDest={handleSetDest}
            onSetResult={handleSetRouteResult} onSetLoading={handleSetLoading} onSetError={handleSetError}
            userLat={userLat} userLng={userLng}
          />
        )}
      </div>
    </div>
  );
};

export default RouteScreen;