import { useState, useRef, useEffect, FC, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

// [API] 카카오 REST API 키 — .env 파일에서 주입 권장
// VITE 기준: import.meta.env.VITE_KAKAO_REST_API_KEY
const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY;

// [API] 카카오모빌리티 자동차 길찾기 엔드포인트
const KAKAO_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";

// [THEME] 브랜드 컬러
const COLOR_PRIMARY       = "#1A6BFF";
const COLOR_PRIMARY_LIGHT = "#E8F0FF";
const COLOR_SURFACE       = "#FFFFFF";
const COLOR_BG            = "#F0F4FA";
const COLOR_TEXT_MAIN     = "#111827";
const COLOR_TEXT_SUB      = "#6B7280";
const COLOR_BORDER        = "#E5E9F0";
const COLOR_INACTIVE      = "#C0C8D8";
const COLOR_ORIGIN        = "#00C471";
const COLOR_DEST          = "#FF4B4B";
const COLOR_DANGER        = "#FF4B4B";

// [CONFIG] 반경 옵션
const RADIUS_OPTION_LIST = [
  { label: "가까운 곳", meter: 250 },
  { label: "기본",      meter: 500 },
  { label: "넓은 곳",   meter: 1000 },
] as const;

// [CONFIG] 기본 위치 (서울 시청) — 위치 권한 거부 시 폴백
const DEFAULT_LAT = 37.5665;
const DEFAULT_LNG = 126.9780;

// [CONFIG] 교통 혼잡도 → 폴리라인 색상 매핑
// traffic_state: 0=원활, 1=서행, 2=정체, 3=매우정체
const TRAFFIC_COLOR_MAP: Record<number, string> = {
  0: "#4CAF50",
  1: "#FFC107",
  2: "#FF7043",
  3: "#D32F2F",
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

type Tab      = "nearby" | "route";
type Category = "카페" | "갤러리" | "공원" | "명소" | "문화" | "거리";

type PlaceData = {
  id:        number;
  name:      string;
  category:  Category;
  rating:    number;
  reviews:   number;
  district:  string;
  latOffset: number;
  lngOffset: number;
};

type Place = Omit<PlaceData, "latOffset" | "lngOffset"> & {
  lat:      number;
  lng:      number;
  distance: number;
};

type UserLocation = {
  lat:        number;
  lng:        number;
  isLocating: boolean;
  locLabel:   string;
};

type RoutePoint = {
  label: string;
  lat:   number;
  lng:   number;
};

// [API] 카카오모빌리티 Directions API 응답 타입
type DirectionsRoad = {
  name:          string;
  distance:      number;
  duration:      number;
  traffic_speed: number;
  traffic_state: number;
  vertexes:      number[]; // [lng, lat, lng, lat, ...] 쌍으로 구성
};

type DirectionsSection = {
  distance: number;
  duration: number;
  roads:    DirectionsRoad[];
};

type DirectionsSummary = {
  distance: number; // 총 거리 (m)
  duration: number; // 총 소요 시간 (초)
  fare: {
    taxi: number; // 택시 요금 (원)
    toll: number; // 통행 요금 (원)
  };
};

type DirectionsRoute = {
  result_code: number;
  result_msg:  string;
  summary:     DirectionsSummary;
  sections:    DirectionsSection[];
};

type DirectionsResponse = {
  routes: DirectionsRoute[];
};

type RouteResult = {
  distanceMeter: number;    // 총 거리 (m)
  durationSec:   number;    // 총 소요시간 (초)
  taxiFare:      number;    // 택시 요금 (원)
  tollFare:      number;    // 통행 요금 (원)
  roads:         DirectionsRoad[]; // 교통 상태 포함 도로 목록
};

type RouteState = {
  origin:      RoutePoint | null;
  destination: RoutePoint | null;
  result:      RouteResult | null;
  isLoading:   boolean;
  errorMsg:    string;
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

type KakaoLatLng = { getLat: () => number; getLng: () => number };
type KakaoLatLngBounds = { extend: (latlng: KakaoLatLng) => void };
type KakaoMapInstance = {
  setCenter: (latlng: KakaoLatLng) => void;
  setBounds: (bounds: KakaoLatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number) => void;
};
type KakaoOverlay  = { setMap: (map: KakaoMapInstance | null) => void };
type KakaoCircle   = { setMap: (map: KakaoMapInstance | null) => void };
type KakaoMarker   = { setMap: (map: KakaoMapInstance | null) => void };
type KakaoPolyline = { setMap: (map: KakaoMapInstance | null) => void };
type KakaoGeocoder = {
  addressSearch: (
    query:    string,
    callback: (result: Array<{ y: string; x: string; address_name: string }>, status: string) => void,
  ) => void;
};

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

const CATEGORY_ICON: Record<Category, string> = {
  카페: "☕", 갤러리: "🖼", 공원: "🌿", 명소: "📸", 문화: "🎨", 거리: "🛍",
};

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════

const calcDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const toPlace = (placeData: PlaceData, userLat: number, userLng: number): Place => ({
  id: placeData.id, name: placeData.name, category: placeData.category,
  rating: placeData.rating, reviews: placeData.reviews, district: placeData.district,
  lat: userLat + placeData.latOffset, lng: userLng + placeData.lngOffset,
  distance: calcDistance(userLat, userLng, userLat + placeData.latOffset, userLng + placeData.lngOffset),
});

/** 초 → "N시간 M분" 또는 "M분" 포맷 */
const formatDuration = (sec: number): string => {
  const min = Math.ceil(sec / 60);
  return min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`;
};

/** 미터 → "N.Nkm" 또는 "Nm" 포맷 */
const formatDistance = (meter: number): string =>
  meter >= 1000 ? `${(meter / 1000).toFixed(1)}km` : `${meter}m`;

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
// API
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

  const res = await fetch(`${KAKAO_DIRECTIONS_URL}?${params}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
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

// ═══════════════════════════════════════════════════════════
// NearbyMap
// ═══════════════════════════════════════════════════════════

interface NearbyMapProps {
  userLat:           number;
  userLng:           number;
  isLocating:        boolean;
  locLabel:          string;
  radiusMeter:       number;
  selectedPlace:     Place | null;
  onSelectPlace:     (place: Place | null) => void;
  selectedRadiusIdx: number;
  onSelectRadius:    (idx: number) => void;
  kakaoMapRef:       React.MutableRefObject<KakaoMapInstance | null>;
  isMapReady:        boolean;
}

const NearbyMap: FC<NearbyMapProps> = ({
  userLat, userLng, isLocating, locLabel,
  radiusMeter, selectedPlace, onSelectPlace,
  selectedRadiusIdx, onSelectRadius,
  kakaoMapRef, isMapReady,
}) => {
  const circleRef      = useRef<KakaoCircle | null>(null);
  const overlayListRef = useRef<KakaoOverlay[]>([]);
  const markerListRef  = useRef<KakaoMarker[]>([]);
  const userOverlayRef = useRef<KakaoOverlay | null>(null);

  // [SYNC] GPS 확정 후 현위치 마커 + 지도 중심 이동
  useEffect(() => {
    if (!isMapReady || isLocating || !kakaoMapRef.current) return;
    userOverlayRef.current?.setMap(null);
    const el = document.createElement("div");
    el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${COLOR_PRIMARY};border:3px solid #fff;box-shadow:0 0 0 6px rgba(26,107,255,0.18);`;
    userOverlayRef.current = new window.kakao.maps.CustomOverlay({
      map: kakaoMapRef.current, position: new window.kakao.maps.LatLng(userLat, userLng),
      content: el, yAnchor: 0.5, zIndex: 20,
    });
    kakaoMapRef.current.setCenter(new window.kakao.maps.LatLng(userLat, userLng));
  }, [isMapReady, isLocating, userLat, userLng, kakaoMapRef]);

  // [SYNC] 반경 원 업데이트
  useEffect(() => {
    if (!isMapReady || !kakaoMapRef.current) return;
    circleRef.current?.setMap(null);
    circleRef.current = new window.kakao.maps.Circle({
      map: kakaoMapRef.current,
      center: new window.kakao.maps.LatLng(userLat, userLng),
      radius: radiusMeter, strokeWeight: 2, strokeColor: COLOR_PRIMARY,
      strokeOpacity: 0.7, strokeStyle: "dashed", fillColor: COLOR_PRIMARY, fillOpacity: 0.05,
    });
  }, [isMapReady, radiusMeter, userLat, userLng, kakaoMapRef]);

  // [SYNC] 장소 마커 업데이트
  useEffect(() => {
    if (!isMapReady || !kakaoMapRef.current) return;
    overlayListRef.current.forEach(o => o.setMap(null));
    markerListRef.current.forEach(m => m.setMap(null));
    overlayListRef.current = [];
    markerListRef.current  = [];

    PLACE_LIST.map(p => toPlace(p, userLat, userLng)).forEach(place => {
      const isActive   = place.distance <= radiusMeter;
      const isSelected = selectedPlace?.id === place.id;
      const icon       = CATEGORY_ICON[place.category] ?? "📍";
      const pinColor   = isActive ? COLOR_PRIMARY : COLOR_INACTIVE;
      const size       = isSelected ? 42 : 34;
      const pos        = new window.kakao.maps.LatLng(place.lat, place.lng);

      const el = document.createElement("div");
      el.style.cssText = `display:flex;flex-direction:column;align-items:center;cursor:${isActive ? "pointer" : "default"};opacity:${isActive ? 1 : 0.35};filter:${isActive ? "none" : "grayscale(100%)"};transition:all 0.3s;`;
      el.innerHTML = `
        ${isSelected && isActive ? `<div style="background:#fff;border-radius:10px;padding:5px 10px;margin-bottom:5px;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,0.14);font-size:12px;font-weight:700;color:${COLOR_TEXT_MAIN};border:2px solid ${COLOR_PRIMARY};position:relative;font-family:'Noto Sans KR',sans-serif;">${place.name} ⭐${place.rating}<div style="position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${COLOR_PRIMARY};"></div></div>` : ""}
        <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${pinColor};border:2.5px solid #fff;box-shadow:${isSelected ? "0 4px 14px rgba(26,107,255,0.45)" : "0 2px 8px rgba(0,0,0,0.18)"};display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:${isSelected ? 18 : 14}px;line-height:1">${icon}</span></div>
        <div style="margin-top:3px;font-size:10px;font-weight:${isSelected ? 800 : 600};color:${isActive ? COLOR_TEXT_MAIN : COLOR_INACTIVE};white-space:nowrap;text-shadow:0 1px 3px rgba(255,255,255,0.9);font-family:'Noto Sans KR',sans-serif;">${place.name}</div>`;

      const overlay = new window.kakao.maps.CustomOverlay({ map: kakaoMapRef.current!, position: pos, content: el, yAnchor: 1.15 });
      overlayListRef.current.push(overlay);

      if (isActive) {
        const invisImg    = new window.kakao.maps.MarkerImage("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", new window.kakao.maps.Size(44, 54));
        const invisMarker = new window.kakao.maps.Marker({ position: pos, image: invisImg });
        invisMarker.setMap(kakaoMapRef.current!);
        markerListRef.current.push(invisMarker);
        window.kakao.maps.event.addListener(invisMarker, "click", () => {
          onSelectPlace(selectedPlace?.id === place.id ? null : place);
        });
      }
    });
  }, [isMapReady, radiusMeter, selectedPlace, userLat, userLng, onSelectPlace, kakaoMapRef]);

  return (
    <>
      <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 600, color: COLOR_TEXT_SUB, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", whiteSpace: "nowrap", zIndex: 10, fontFamily: "'Noto Sans KR', sans-serif" }}>
        {locLabel}
      </div>
      <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, background: "rgba(255,255,255,0.96)", borderRadius: 24, padding: "4px 6px", boxShadow: "0 2px 12px rgba(0,0,0,0.1)", zIndex: 10 }}>
        {RADIUS_OPTION_LIST.map((opt, i) => (
          <button key={opt.label} onClick={() => onSelectRadius(i)} style={{ padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer", background: selectedRadiusIdx === i ? COLOR_PRIMARY : "transparent", color: selectedRadiusIdx === i ? "#fff" : COLOR_TEXT_SUB, fontSize: 12, fontWeight: 600, fontFamily: "'Noto Sans KR', sans-serif", transition: "all 0.2s" }}>
            {opt.label}
          </button>
        ))}
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// RouteMap — 경로 탐색 결과를 지도에 렌더링
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// RoutePanel — 출발지/도착지 입력 + 경로 결과 카드
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// PlaceCard
// ═══════════════════════════════════════════════════════════

interface PlaceCardProps {
  place:      Place;
  isSelected: boolean;
  onSelect:   (place: Place) => void;
}

const PlaceCard: FC<PlaceCardProps> = ({ place, isSelected, onSelect }) => (
  <div onClick={() => onSelect(place)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 14, background: isSelected ? COLOR_PRIMARY_LIGHT : COLOR_SURFACE, border: `1.5px solid ${isSelected ? COLOR_PRIMARY : COLOR_BORDER}`, boxShadow: isSelected ? "0 2px 12px rgba(26,107,255,0.12)" : "0 1px 4px rgba(0,0,0,0.05)", cursor: "pointer", transition: "all 0.2s" }}>
    <div style={{ width: 40, height: 40, borderRadius: 10, background: isSelected ? `${COLOR_PRIMARY}18` : COLOR_BG, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
      {CATEGORY_ICON[place.category] ?? "📍"}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: COLOR_TEXT_MAIN, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{place.name}</div>
      <div style={{ display: "flex", gap: 8, fontSize: 11, color: COLOR_TEXT_SUB }}>
        <span>⭐ {place.rating}</span><span>·</span>
        <span>리뷰 {place.reviews.toLocaleString()}</span><span>·</span>
        <span style={{ color: COLOR_PRIMARY, fontWeight: 600 }}>{place.distance}m</span>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════
// NearbyScreen
// ═══════════════════════════════════════════════════════════

const NearbyScreen: FC = () => {
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

// ═══════════════════════════════════════════════════════════
// App
// ═══════════════════════════════════════════════════════════

export default function App(): JSX.Element {
  return <NearbyScreen />;
}