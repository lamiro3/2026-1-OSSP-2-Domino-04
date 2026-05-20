export default function PlaceCard({ place, onClick, compact }: any) {
  return (
    <div
      onClick={() => onClick?.(place)}
      style={{
        background: "#fff",
        borderRadius: 14,
        padding: compact ? "10px 14px" : "14px 16px",
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
        cursor: "pointer",
        border: "1px solid #F1F5F9",
        transition: "all 0.2s",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: compact ? 40 : 48,
          height: compact ? 40 : 48,
          borderRadius: 12,
          flexShrink: 0,
          background: "#6366F1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: compact ? 18 : 22,
        }}
      >
        {place.category === "카페"
          ? "☕"
          : place.category === "공원"
          ? "🌿"
          : place.category === "명소"
          ? "⭐"
          : place.category === "갤러리"
          ? "🎨"
          : "📍"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontSize: compact ? 13 : 14,
              fontWeight: 700,
              color: "#1E293B",
              fontFamily: "'Noto Sans KR', sans-serif",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {place.name}
          </span>
          <span
            style={{
              fontSize: 10,
              padding: "1px 7px",
              borderRadius: 20,
              flexShrink: 0,
              background: "#6366F1",
              color: "#6366F1",
              fontWeight: 600,
            }}
          >
            {place.category}
          </span>
        </div>
        <div
          style={{ display: "flex", gap: 8, fontSize: 12, color: "#94A3B8" }}
        >
          <span>⭐ {place.rating}</span>
          <span>·</span>
          <span>리뷰 {place.reviews.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}