const FALLBACK = 'https://placehold.co/400x300/e2a63b/1c2321?text=Spice+Route';

// via.placeholder.com has been flaky/unreachable for a while, which is why
// images kept failing to load. placehold.co is stable, and on top of that
// we swap to it automatically if a real photo URL ever 404s.
export default function FoodImage({ src, alt, className, style }) {
  return (
    <img
      src={src || FALLBACK}
      alt={alt}
      className={className}
      style={style}
      onError={(e) => {
        e.target.onerror = null;
        e.target.src = FALLBACK;
      }}
    />
  );
}
