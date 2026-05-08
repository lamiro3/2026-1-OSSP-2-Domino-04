export type KakaoLatLng = { getLat: () => number; getLng: () => number };
export type KakaoLatLngBounds = { extend: (latlng: KakaoLatLng) => void };
export type KakaoMapInstance = {
  setCenter: (latlng: KakaoLatLng) => void;
  setBounds: (bounds: KakaoLatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number) => void;
};
export type KakaoOverlay  = { setMap: (map: KakaoMapInstance | null) => void };
export type KakaoCircle   = { setMap: (map: KakaoMapInstance | null) => void };
export type KakaoMarker   = { setMap: (map: KakaoMapInstance | null) => void };
export type KakaoPolyline = { setMap: (map: KakaoMapInstance | null) => void };
export type KakaoGeocoder = {
  addressSearch: (
    query:    string,
    callback: (result: Array<{ y: string; x: string; address_name: string }>, status: string) => void,
  ) => void;
};
