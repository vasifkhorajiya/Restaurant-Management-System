const palettes = {
  brand: { bg: 'var(--brand-soft)', fg: 'var(--brand-dark)' },
  rating: { bg: 'var(--rating-soft)', fg: 'var(--rating)' },
  info: { bg: 'var(--info-soft)', fg: 'var(--info)' },
  warning: { bg: 'var(--warning-soft)', fg: '#92660a' },
};

export default function StatCard({ icon: Icon, label, value, color = 'brand' }) {
  const p = palettes[color] || palettes.brand;
  return (
    <div className="stat-card">
      <div className="icon-wrap" style={{ background: p.bg, color: p.fg }}>
        <Icon size={19} />
      </div>
      <div>
        <div className="label">{label}</div>
        <div className="value">{value}</div>
      </div>
    </div>
  );
}
