// [THEME] 컬러
export const COLOR_PRIMARY       = "#1A6BFF";
export const COLOR_PRIMARY_LIGHT = "#E8F0FF";
export const COLOR_SURFACE       = "#FFFFFF";
export const COLOR_BG            = "#F0F4FA";
export const COLOR_TEXT_MAIN     = "#111827";
export const COLOR_TEXT_SUB      = "#6B7280";
export const COLOR_BORDER        = "#E5E9F0";
export const COLOR_INACTIVE      = "#C0C8D8";
export const COLOR_ORIGIN        = "#00C471";
export const COLOR_DEST          = "#FF4B4B";
export const COLOR_DANGER        = "#FF4B4B";

// [CONFIG] 교통 혼잡도 → 폴리라인 색상 매핑
// traffic_state: 0=원활, 1=서행, 2=정체, 3=매우정체
export const TRAFFIC_COLOR_MAP: Record<number, string> = {
  0: "#4CAF50",
  1: "#FFC107",
  2: "#FF7043",
  3: "#D32F2F",
};