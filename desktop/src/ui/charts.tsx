// Small, dependency-free charts for the admin console: a line with a crosshair, columns, a donut
// and horizontal bars. Thin marks, a quiet grid, text in text colours, a tooltip on hover.
// Categorical colours follow a fixed, colour-blind-checked order (stepped for the dark surface).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dateLocale, t } from '../lib/i18n';

export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const GRID = 'rgba(255,255,255,0.07)';
const AXIS = 'var(--fg3)';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** 0, then three more round steps above the data. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

const short = (n: number) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : Math.abs(n) >= 1e4 ? Math.round(n / 1e3) + 'k' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n * 100) / 100));
const dayLabel = (d: string) => {
  const t = new Date(d + 'T12:00:00');
  return isNaN(t.getTime()) ? d : t.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
};

type Point = { x: string; y: number };

function Tip({ x, y, w, children }: { x: number; y: number; w: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(x, 70), w - 70);
  return (
    <div className="chart-tip" style={{ left, top: y }}>
      {children}
    </div>
  );
}

/** One measure over time. */
export function LineChart({ data, height = 220, color = SERIES[0], format = short, name }: { data: Point[]; height?: number; color?: string; format?: (n: number) => string; name: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const iw = Math.max(10, w - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const max = Math.max(0, ...data.map((d) => d.y));
  const tk = ticks(max);
  const top = tk[tk.length - 1] || 1;
  const X = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const Y = (v: number) => pad.t + ih - (v / top) * ih;
  const path = data.map((d, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(d.y).toFixed(1)).join(' ');
  const area = data.length ? path + ` L${X(data.length - 1).toFixed(1)},${Y(0)} L${X(0).toFixed(1)},${Y(0)} Z` : '';
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 70))));
  const onMove = (e: React.MouseEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (data.length - 1));
    setHover(i >= 0 && i < data.length ? i : null);
  };
  return (
    <div ref={ref} className="chart" role="img" aria-label={name}>
      {w ? (
        <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {tk.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke={GRID} />
              <text x={pad.l - 8} y={Y(t) + 4} textAnchor="end" fill={AXIS} fontSize="11">{format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => (i % every === 0 || i === data.length - 1 ? (
            <text key={d.x} x={X(i)} y={height - 8} textAnchor="middle" fill={AXIS} fontSize="11">{dayLabel(d.x)}</text>
          ) : null))}
          <path d={area} fill={color} opacity={0.12} />
          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover != null && data[hover] ? (
            <g>
              <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--fg3)" strokeDasharray="3 3" />
              <circle cx={X(hover)} cy={Y(data[hover].y)} r={4.5} fill={color} stroke="var(--bg)" strokeWidth={2} />
            </g>
          ) : null}
        </svg>
      ) : null}
      {hover != null && data[hover] ? (
        <Tip x={X(hover)} y={Y(data[hover].y) - 12} w={w}>
          <span>{dayLabel(data[hover].x)}</span>
          <b>{format(data[hover].y)}</b> <em>{name}</em>
        </Tip>
      ) : null}
    </div>
  );
}

/** Columns: one value per category or day. */
export function ColumnChart({ data, height = 200, color = SERIES[0], format = short, name, labels = 'day' }: { data: Point[]; height?: number; color?: string; format?: (n: number) => string; name: string; labels?: 'day' | 'raw' }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 8, t: 12, b: 26 };
  const iw = Math.max(10, w - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const max = Math.max(0, ...data.map((d) => Math.abs(d.y)));
  const tk = ticks(max);
  const top = tk[tk.length - 1] || 1;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(28, slot - 2));
  const Y = (v: number) => pad.t + ih - (v / top) * ih;
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 56))));
  const lab = (x: string) => (labels === 'day' ? dayLabel(x) : x);
  return (
    <div ref={ref} className="chart" role="img" aria-label={name}>
      {w ? (
        <svg width={w} height={height} onMouseLeave={() => setHover(null)}>
          {tk.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke={GRID} />
              <text x={pad.l - 8} y={Y(t) + 4} textAnchor="end" fill={AXIS} fontSize="11">{format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + i * slot + (slot - bw) / 2;
            const v = Math.max(0, d.y);
            const h = Math.max(v > 0 ? 2 : 0, Y(0) - Y(v));
            const r = Math.min(4, bw / 2, h);
            return (
              <g key={d.x} onMouseEnter={() => setHover(i)}>
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" />
                {h > 0 ? (
                  <path
                    d={`M${x},${Y(0)} L${x},${Y(0) - h + r} Q${x},${Y(0) - h} ${x + r},${Y(0) - h} L${x + bw - r},${Y(0) - h} Q${x + bw},${Y(0) - h} ${x + bw},${Y(0) - h + r} L${x + bw},${Y(0)} Z`}
                    fill={color}
                    opacity={hover == null || hover === i ? 1 : 0.55}
                  />
                ) : null}
                {i % every === 0 ? <text x={x + bw / 2} y={height - 8} textAnchor="middle" fill={AXIS} fontSize="11">{lab(d.x)}</text> : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      {hover != null && data[hover] ? (
        <Tip x={pad.l + hover * slot + slot / 2} y={Y(Math.max(0, data[hover].y)) - 12} w={w}>
          <span>{lab(data[hover].x)}</span>
          <b>{format(data[hover].y)}</b> <em>{name}</em>
        </Tip>
      ) : null}
    </div>
  );
}

/** Parts of a whole, up to five slices; smaller ones fold into "Other". */
export function Donut({ slices, format = short, name, size = 168 }: { slices: { label: string; value: number }[]; format?: (n: number) => string; name: string; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const shown = sorted.length > 5 ? [...sorted.slice(0, 4), { label: t('d.frame.chartOther'), value: sorted.slice(4).reduce((a, b) => a + b.value, 0) }] : sorted;
  const total = shown.reduce((a, b) => a + b.value, 0);
  const r = size / 2 - 6;
  const inner = r * 0.62;
  let angle = -Math.PI / 2;
  const arcs = shown.map((s, i) => {
    const frac = total ? s.value / total : 0;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const gap = shown.length > 1 ? 0.012 : 0;
    const p = (a: number, rad: number) => [size / 2 + Math.cos(a) * rad, size / 2 + Math.sin(a) * rad].map((n) => n.toFixed(2)).join(',');
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = frac >= 0.9999
      ? `M${p(0, r)} A${r},${r} 0 1 1 ${p(Math.PI, r)} A${r},${r} 0 1 1 ${p(0, r)} M${p(0, inner)} A${inner},${inner} 0 1 0 ${p(Math.PI, inner)} A${inner},${inner} 0 1 0 ${p(0, inner)} Z`
      : `M${p(a0 + gap, r)} A${r},${r} 0 ${large} 1 ${p(a1 - gap, r)} L${p(a1 - gap, inner)} A${inner},${inner} 0 ${large} 0 ${p(a0 + gap, inner)} Z`;
    return { d, color: SERIES[i % SERIES.length], s, frac, i };
  });
  if (!total) return <p className="muted-text small">{t('d.frame.noData')}</p>;
  const focus = hover != null ? shown[hover] : null;
  return (
    <div className="donut" role="img" aria-label={name}>
      <svg width={size} height={size} onMouseLeave={() => setHover(null)}>
        {arcs.map((a) => (
          <path key={a.s.label} d={a.d} fill={a.color} fillRule="evenodd" opacity={hover == null || hover === a.i ? 1 : 0.45} onMouseEnter={() => setHover(a.i)} />
        ))}
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fill="var(--fg)" fontSize="20" fontWeight="700">{focus ? format(focus.value) : format(total)}</text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fill="var(--fg3)" fontSize="11">{focus ? focus.label : t('pay.total')}</text>
      </svg>
      <ul className="legend">
        {arcs.map((a) => (
          <li key={a.s.label} onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(null)} className={hover === a.i ? 'on' : ''}>
            <i style={{ background: a.color }} />
            <span>{a.s.label}</span>
            <b>{format(a.s.value)}</b>
            <em>{Math.round(a.frac * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked bars with the label and value written beside each. */
export function HBars({ items, format = short, color = SERIES[0], empty = t('d.frame.noData') }: { items: { label: React.ReactNode; value: number; key?: string; onClick?: () => void }[]; format?: (n: number) => string; color?: string; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="muted-text small">{empty}</p>;
  return (
    <ul className="hbars">
      {items.map((it, i) => (
        <li key={it.key ?? i} onClick={it.onClick} className={it.onClick ? 'click' : ''}>
          <span className="hb-label">{it.label}</span>
          <span className="hb-track">
            <span className="hb-fill" style={{ width: Math.max(1.5, (it.value / max) * 100) + '%', background: color }} />
          </span>
          <b>{format(it.value)}</b>
        </li>
      ))}
    </ul>
  );
}

/** A tiny trend line for a stat tile. */
export function Spark({ values, color = SERIES[0], width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const d = values.map((v, i) => (i ? 'L' : 'M') + ((i / (values.length - 1)) * (width - 2) + 1).toFixed(1) + ',' + (height - 2 - (v / max) * (height - 4)).toFixed(1)).join(' ');
  return (
    <svg width={width} height={height} className="spark" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A count that ticks up when it first appears. */
export function useCountUp(target: number, ms = 600) {
  const [v, setV] = useState(target);
  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined') return setV(target);
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
