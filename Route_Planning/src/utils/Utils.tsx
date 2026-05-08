import type { Place, PlaceData } from "../types/type";

/* 두 지점 간의 거리 계산 (Haversine 공식) */
export const calcDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/* PlaceData를 Place로 변환 (사용자 위치 기반) */
export const toPlace = (placeData: PlaceData, userLat: number, userLng: number): Place => ({
  id: placeData.id, name: placeData.name, category: placeData.category,
  rating: placeData.rating, reviews: placeData.reviews, district: placeData.district,
  lat: userLat + placeData.latOffset, lng: userLng + placeData.lngOffset,
  distance: calcDistance(userLat, userLng, userLat + placeData.latOffset, userLng + placeData.lngOffset),
});

/* 초 → "N시간 M분" 또는 "M분" 포맷 */
export const formatDuration = (sec: number): string => {
  const min = Math.ceil(sec / 60);
  return min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`;
};

/* 미터 → "N.Nkm" 또는 "Nm" 포맷 */
export const formatDistance = (meter: number): string =>
  meter >= 1000 ? `${(meter / 1000).toFixed(1)}km` : `${meter}m`;