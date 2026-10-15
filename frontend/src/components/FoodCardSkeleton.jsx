export default function FoodCardSkeleton({ count = 8 }) {
  return (
    <div className="row g-3">
      {Array.from({ length: count }).map((_, i) => (
        <div className="col-6 col-md-3" key={i}>
          <div className="skeleton-card">
            <div className="skeleton skeleton-img" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}
