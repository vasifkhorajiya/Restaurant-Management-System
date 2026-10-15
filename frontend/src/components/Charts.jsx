// Lightweight SVG charts in the app's own colours — no chart library to install.
const PALETTE = ['#ff4b3e', '#ffc72c', '#1ba672', '#2f6fed', '#8b5cf6', '#f97316', '#14b8a6', '#64748b'];

const shortNum = (n) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/** Area/line chart. data: [{ label, value }] */
export function LineChart({ data, height = 190, color = '#ff4b3e', prefix = '' }) {
  const W = 560;
  const pad = { l: 38, r: 12, t: 12, b: 26 };
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerW = W - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const x = (i) => pad.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - (v / max) * innerH;
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.value)}`).join(' ');
  const area = `${line} L${x(data.length - 1)},${pad.t + innerH} L${x(0)},${pad.t + innerH} Z`;
  const ticks = [0, 0.5, 1];

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="chart-svg" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="var(--border)" />
          <text x={pad.l - 6} y={y(max * t) + 4} textAnchor="end" className="chart-text">{prefix}{shortNum(max * t)}</text>
        </g>
      ))}
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={d.label + i}>
          <circle cx={x(i)} cy={y(d.value)} r="3.5" fill="#fff" stroke={color} strokeWidth="2">
            <title>{`${d.label}: ${prefix}${d.value}`}</title>
          </circle>
          <text x={x(i)} y={height - 8} textAnchor="middle" className="chart-text">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}

/** Vertical bar chart. data: [{ label, value }] */
export function BarChart({ data, height = 180, color = '#ff4b3e', prefix = '' }) {
  const W = 560;
  const pad = { l: 38, r: 8, t: 12, b: 26 };
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerW = W - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const slot = innerW / data.length;
  const bw = Math.min(26, slot * 0.62);

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="chart-svg" role="img">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={pad.t + innerH - innerH * t} y2={pad.t + innerH - innerH * t} stroke="var(--border)" />
          <text x={pad.l - 6} y={pad.t + innerH - innerH * t + 4} textAnchor="end" className="chart-text">{prefix}{shortNum(max * t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        const cx = pad.l + slot * i + slot / 2;
        return (
          <g key={d.label + i}>
            <rect x={cx - bw / 2} y={pad.t + innerH - h} width={bw} height={Math.max(h, d.value > 0 ? 2 : 0)} rx="4" fill={color}>
              <title>{`${d.label}: ${prefix}${d.value}`}</title>
            </rect>
            {(data.length <= 12 || i % 3 === 0) && (
              <text x={cx} y={height - 8} textAnchor="middle" className="chart-text">{d.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Donut with legend. data: [{ name, value }] */
export function DonutChart({ data, size = 150, prefix = '' }) {
  const total = data.reduce((s, d) => s + Number(d.value), 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;

  if (total === 0) return <p className="text-muted small mb-0">No data in this period.</p>;

  return (
    <div className="d-flex align-items-center gap-3 flex-wrap">
      <svg width={size} height={size} viewBox="0 0 140 140" role="img">
        <g transform="rotate(-90 70 70)">
          {data.map((d, i) => {
            const len = (Number(d.value) / total) * c;
            const el = (
              <circle key={d.name} cx="70" cy="70" r={r} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="22"
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}>
                <title>{`${d.name}: ${prefix}${d.value}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="70" y="68" textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, fill: 'var(--ink)' }}>
          {prefix}{shortNum(total)}
        </text>
        <text x="70" y="84" textAnchor="middle" className="chart-text">total</text>
      </svg>
      <div className="chart-legend">
        {data.map((d, i) => (
          <div key={d.name}>
            <span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />
            {d.name} <strong>{prefix}{d.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal ranked bars. data: [{ name, value }] */
export function RankBars({ data, prefix = '', color = '#ff4b3e' }) {
  const max = Math.max(...data.map((d) => Number(d.value)), 1);
  if (data.length === 0) return <p className="text-muted small mb-0">No data in this period.</p>;
  return (
    <div className="rank-bars">
      {data.map((d) => (
        <div key={d.name} className="rank-row">
          <div className="d-flex justify-content-between" style={{ fontSize: 13 }}>
            <span className="text-truncate pe-2">{d.name}</span>
            <strong>{prefix}{Number(d.value).toLocaleString('en-IN')}</strong>
          </div>
          <div className="rank-track"><div className="rank-fill" style={{ width: `${(Number(d.value) / max) * 100}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  );
}
