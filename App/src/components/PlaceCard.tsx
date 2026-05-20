// ═══════════════════════════════════════════════════════════
// PlaceCard ~ 각 장소 별 상세 정보 (장소명, 카테고리, 평점, 리뷰 수, 거리 등) 카드 컴포넌트 
// ═══════════════════════════════════════════════════════════

import { type FC } from "react";
import type { Place, Category } from "../types/type";
import { COLOR_PRIMARY, COLOR_PRIMARY_LIGHT, COLOR_SURFACE, COLOR_BORDER, COLOR_BG, COLOR_TEXT_MAIN, COLOR_TEXT_SUB } from "../colors";

const CATEGORY_ICON: Record<Category, string> = {
  카페: "☕", 갤러리: "🖼", 공원: "🌿", 명소: "📸", 문화: "🎨", 거리: "🛍",
};

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

export default PlaceCard;