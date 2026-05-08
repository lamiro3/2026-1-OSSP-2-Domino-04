// ═══════════════════════════════════════════════════════════
// NearByMap — 근처 탐색 지도 컴포넌트 (카카오맵 API 활용)
// ═══════════════════════════════════════════════════════════

import { type FC, useEffect, useRef } from "react";
import type { Place, PlaceData, Category } from "../types/type";
import { COLOR_PRIMARY, COLOR_INACTIVE, COLOR_TEXT_MAIN, COLOR_TEXT_SUB } from "../colors";
import type { KakaoCircle, KakaoMapInstance, KakaoMarker, KakaoOverlay } from "../types/type_kakao";
import { toPlace } from "../utils/Utils";

// [CONFIG] 반경 옵션
const RADIUS_OPTION_LIST = [
  { label: "가까운 곳", meter: 250 },
  { label: "기본",      meter: 500 },
  { label: "넓은 곳",   meter: 1000 },
] as const;

const CATEGORY_ICON: Record<Category, string> = {
  카페: "☕", 갤러리: "🖼", 공원: "🌿", 명소: "📸", 문화: "🎨", 거리: "🛍",
};


// 테스트용 장소 데이터 (실제론 API로 받아와야 함)
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

export default NearbyMap;