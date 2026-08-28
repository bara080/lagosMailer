'use client';

// Zero-dependency SVG charts (no chart library).

export function Donut({ data, size = 150, thickness = 18, centerTop, centerBottom }: {
  data: { label: string; value: number; color: string }[];
  size?: number; thickness?: number; centerTop?: string; centerBottom?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const seg = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color}
              strokeWidth={thickness} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} strokeLinecap="butt" />
          );
          offset += len;
          return seg;
        })}
      </svg>
      {(centerTop || centerBottom) && (
        <div className="center"><b>{centerTop}</b><small>{centerBottom}</small></div>
      )}
    </div>
  );
}

export function LineChart({ series, height = 220 }: {
  series: { name: string; color: string; points: number[] }[];
  height?: number;
}) {
  const w = 640, pad = 28;
  const labels = series[0]?.points.length ?? 0;
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, labels - 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
        <line key={i} x1={pad} x2={w - pad} y1={pad + f * (height - pad * 2)} y2={pad + f * (height - pad * 2)}
          stroke="var(--border)" strokeWidth={1} />
      ))}
      {series.map((s, si) => {
        const d = s.points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
        const area = `${d} L ${x(s.points.length - 1)} ${height - pad} L ${x(0)} ${height - pad} Z`;
        return (
          <g key={si}>
            <path d={area} fill={s.color} opacity={0.08} />
            <path d={d} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" />
            {s.points.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={s.color} />)}
          </g>
        );
      })}
    </svg>
  );
}
