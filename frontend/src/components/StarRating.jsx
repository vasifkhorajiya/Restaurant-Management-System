import { Star } from 'lucide-react';

// read-only stars (value may be fractional) or, with onChange, a clickable picker
export default function StarRating({ value = 0, onChange, size = 16 }) {
  return (
    <span className="d-inline-flex align-items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          style={{ cursor: onChange ? 'pointer' : 'default' }}
          fill={s <= Math.round(value) ? '#ffc72c' : 'none'}
          color={s <= Math.round(value) ? '#ffc72c' : '#cfd2d8'}
          onClick={onChange ? () => onChange(s) : undefined}
        />
      ))}
    </span>
  );
}
