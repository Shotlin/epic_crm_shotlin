import { useId, type ReactNode } from 'react';

export type ChartDatum = { label: string; value: number; color?: string };

const chartColors = ['#2563eb', '#16866b', '#f97316', '#7c3aed', '#0891b2', '#c53f52'];
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

function ChartEmptyState({ title = 'No governed data yet', detail = 'Record or import approved retail data to see this visual.' }: { title?: string; detail?: string }): ReactNode {
  return <div className="epic-chart__empty" role="status"><strong>{title}</strong><span>{detail}</span></div>;
}

function Legend({ data, total }: { data: readonly ChartDatum[]; total?: number }): ReactNode {
  return <ul className="epic-chart__legend" aria-label="Chart values">
    {data.map((item, index) => <li className="epic-chart__legend-item" key={`${item.label}-${index}`}>
      <span><i className="epic-chart__dot" style={{ background: item.color ?? chartColors[index % chartColors.length] }} aria-hidden="true" />{item.label}</span>
      <strong>{number.format(item.value)}{total && total > 0 ? ` · ${Math.round((item.value / total) * 100)}%` : ''}</strong>
    </li>)}
  </ul>;
}

export function TrendLineChart({ title, data, formatValue = (value) => number.format(value) }: { title: string; data: readonly ChartDatum[]; formatValue?: (value: number) => string }): ReactNode {
  const titleId = useId();
  if (!data.length) return <figure className="epic-chart"><figcaption id={titleId}>{title}</figcaption><ChartEmptyState /></figure>;
  const max = Math.max(...data.map(({ value }) => value), 1);
  const min = Math.min(...data.map(({ value }) => value), 0);
  const range = Math.max(max - min, 1);
  const points = data.map((item, index) => {
    const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 94 + 3;
    const y = 150 - ((item.value - min) / range) * 128;
    return { ...item, x, y };
  });
  const line = points.map(({ x, y }) => `${x},${y}`).join(' ');
  const area = `3,150 ${line} 97,150`;
  return <figure className="epic-chart" role="img" aria-label={`${title}: ${data.map((item) => `${item.label} ${formatValue(item.value)}`).join(', ')}`}>
    <figcaption id={titleId}>{title}</figcaption>
    <svg className="epic-chart__canvas" viewBox="0 0 100 170" preserveAspectRatio="none" aria-hidden="true">
      <line x1="3" y1="150" x2="97" y2="150" stroke="currentColor" opacity=".14" />
      <line x1="3" y1="86" x2="97" y2="86" stroke="currentColor" opacity=".10" />
      <line x1="3" y1="22" x2="97" y2="22" stroke="currentColor" opacity=".10" />
      <polygon className="epic-chart__area" points={area} />
      <polyline className="epic-chart__line" points={line} vectorEffect="non-scaling-stroke" />
      {points.map((point) => <circle key={point.label} cx={point.x} cy={point.y} r="2.2" fill="var(--ui-surface)" stroke="var(--ui-primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
    </svg>
    <ul className="epic-chart__legend" aria-label="Trend values">
      {data.map((item) => <li className="epic-chart__legend-item" key={item.label}><span>{item.label}</span><strong>{formatValue(item.value)}</strong></li>)}
    </ul>
  </figure>;
}

export function BarChart({ title, data, formatValue = (value) => number.format(value) }: { title: string; data: readonly ChartDatum[]; formatValue?: (value: number) => string }): ReactNode {
  const titleId = useId();
  if (!data.length) return <figure className="epic-chart"><figcaption id={titleId}>{title}</figcaption><ChartEmptyState /></figure>;
  const max = Math.max(...data.map(({ value }) => value), 1);
  return <figure className="epic-chart" role="img" aria-label={`${title}: ${data.map((item) => `${item.label} ${formatValue(item.value)}`).join(', ')}`}>
    <figcaption id={titleId}>{title}</figcaption>
    <svg className="epic-chart__canvas" viewBox={`0 0 ${Math.max(240, data.length * 62)} 170`} role="presentation">
      <line x1="10" y1="150" x2={Math.max(230, data.length * 62 - 10)} y2="150" stroke="currentColor" opacity=".14" />
      {data.map((item, index) => {
        const width = 28;
        const x = 18 + index * 62;
        const height = Math.max(4, (item.value / max) * 124);
        return <g key={item.label}><rect className="epic-chart__bar" x={x} y={150 - height} width={width} height={height} rx="5" fill={item.color ?? chartColors[index % chartColors.length]}><title>{item.label}: {formatValue(item.value)}</title></rect><text className="epic-chart__axis" x={x + width / 2} y="166" textAnchor="middle">{item.label.slice(0, 8)}</text></g>;
      })}
    </svg>
    <Legend data={data} />
  </figure>;
}

export function DonutChart({ title, data, formatValue = (value) => number.format(value) }: { title: string; data: readonly ChartDatum[]; formatValue?: (value: number) => string }): ReactNode {
  const titleId = useId();
  if (!data.length) return <figure className="epic-chart"><figcaption id={titleId}>{title}</figcaption><ChartEmptyState /></figure>;
  const total = data.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return <figure className="epic-chart" role="img" aria-label={`${title}: ${data.map((item) => `${item.label} ${formatValue(item.value)}`).join(', ')}`}>
    <figcaption id={titleId}>{title}</figcaption>
    <svg className="epic-chart__canvas" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--ui-surface-muted)" strokeWidth="12" />
      {data.map((item, index) => {
        const share = total > 0 ? Math.max(0, item.value) / total : 0;
        const dash = share * circumference;
        const currentOffset = offset;
        offset += dash;
        return <circle key={item.label} cx="50" cy="50" r={radius} fill="none" stroke={item.color ?? chartColors[index % chartColors.length]} strokeWidth="12" strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-currentOffset} transform="rotate(-90 50 50)" />;
      })}
      <text x="50" y="48" textAnchor="middle" fill="var(--ui-ink)" fontSize="10" fontWeight="700">{formatValue(total)}</text>
      <text x="50" y="59" textAnchor="middle" fill="var(--ui-muted)" fontSize="5">total</text>
    </svg>
    <Legend data={data} total={total} />
  </figure>;
}
