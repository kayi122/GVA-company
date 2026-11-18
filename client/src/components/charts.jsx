import { useMemo, useRef, useState } from 'react';
import { cx } from './ui.jsx';

/* Validated two-series palette (dataviz validator, light + dark). Leads = olive, Visits = blue. */
export const SERIES = {
  leads: { label: 'New leads', light: '#7a9a1e', dark: '#86a022' },
  visits: { label: 'Visits', light: '#2563eb', dark: '#3b82f6' },
};

const fmtDay = (iso, weekly) => {
  const d = new Date(iso + 'T00:00:00');
  return weekly ? `Wk of ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function niceMax(v) {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

/** Grouped bar chart: leads and visits per day/week, one shared count axis, hover tooltip. */
export function TrendChart({ data, weekly }) {
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  const H = 200, PADL = 0, PADB = 2, PADT = 8;
  const n = data.length;
  const max = useMemo(() => niceMax(Math.max(1, ...data.map((d) => Math.max(d.leads, d.visits)))), [data]);
  const W = Math.max(320, n * 28);
  const slot = (W - PADL) / n;
  const bar = Math.max(2, Math.min(14, (slot - 6) / 2));
  const y = (v) => PADT + (H - PADT - PADB) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(n / 8);

  return (
    <div className="relative" ref={box}>
      <div className="mb-3 flex gap-4 text-xs text-slate-600 dark:text-slate-300">
        {Object.entries(SERIES).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cx('h-2.5 w-2.5 rounded-sm', k === 'leads' ? 'bg-[#7a9a1e] dark:bg-[#86a022]' : 'bg-[#2563eb] dark:bg-[#3b82f6]')} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex">
      {/* y-axis labels: own column, same pixel scale as the plot (height is not stretched) */}
      <div className="relative w-7 shrink-0 text-[10px] text-slate-400" style={{ height: H }}>
        {ticks.map((t) => <span key={t} className="absolute right-2 -translate-y-1/2" style={{ top: y(t) }}>{t}</span>)}
      </div>
      <div className="relative min-w-0 flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: H }} preserveAspectRatio="none" role="img" aria-label="New leads and visits over time">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PADL} x2={W} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-white/10" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = PADL + i * slot + (slot - bar * 2 - 2) / 2;
          return (
            <g key={d.date}>
              {hover === i && <rect x={PADL + i * slot} y={PADT} width={slot} height={H - PADT - PADB} className="fill-slate-100 dark:fill-white/5" />}
              {d.leads > 0 && <rect x={x0} y={y(d.leads)} width={bar} height={y(0) - y(d.leads)} rx="2" className="fill-[#7a9a1e] dark:fill-[#86a022]" />}
              {d.visits > 0 && <rect x={x0 + bar + 2} y={y(d.visits)} width={bar} height={y(0) - y(d.visits)} rx="2" className="fill-[#2563eb] dark:fill-[#3b82f6]" />}
              <rect x={PADL + i * slot} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
        <line x1={PADL} x2={W} y1={y(0)} y2={y(0)} className="stroke-slate-300 dark:stroke-white/20" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative mt-1.5 h-4 text-[10px] text-slate-400">
        {data.map((d, i) => i % labelEvery === 0 && (
          <span key={d.date} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 0.5) / n) * 100}%` }}>{fmtDay(d.date, weekly)}</span>
        ))}
      </div>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg bg-navy-900 px-3 py-2 text-xs text-white shadow-xl"
          style={{ left: `clamp(0px, calc(${((hover + 0.5) / n) * 100}% - 60px), calc(100% - 130px))` }}
        >
          <div className="font-semibold">{fmtDay(data[hover].date, weekly)}</div>
          <div className="mt-1 flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#86a022]" />New leads <b className="ml-auto pl-3">{data[hover].leads}</b></div>
          <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#3b82f6]" />Visits <b className="ml-auto pl-3">{data[hover].visits}</b></div>
          <div className="text-slate-400">of which hot: {data[hover].hot}</div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

/** Horizontal bars for a breakdown (single series → no legend). Labels and values are always visible. */
export function BarList({ rows, total, colorClass = 'bg-olive-600' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-2">{r.swatch && <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ background: r.swatch }} />}{r.label}</span>
            <span className="font-semibold">{r.value}{total ? <span className="ml-1 font-normal text-slate-400">({Math.round((r.value / total) * 100)}%)</span> : null}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-white/10">
            <div className={cx('h-2 rounded-full', colorClass)} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Progress ring for target attainment. Status colour comes with a text label, never colour alone. */
export function Ring({ value, target, label, elapsed, size = 112 }) {
  const pct = target ? value / target : 0;
  const r = 44, c = 2 * Math.PI * r;
  const onTrack = target ? value >= target * (elapsed ?? 1) : null;
  const tone = !target ? 'text-slate-300' : pct >= 1 ? 'text-emerald-600' : onTrack ? 'text-olive-600' : 'text-amber-500';
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-slate-100 dark:stroke-white/10" />
          {target > 0 && value > 0 && (
            <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round" className={cx('stroke-current transition-all duration-700', tone)}
              strokeDasharray={`${Math.min(1, pct) * c} ${c}`} />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold leading-none">{value}</span>
          <span className="mt-0.5 text-[11px] text-slate-500">{target ? `of ${target}` : 'no target'}</span>
        </div>
      </div>
      <div className="mt-2 text-sm font-semibold">{label}</div>
      {target > 0 && (
        <div className={cx('text-xs font-medium', pct >= 1 ? 'text-emerald-600' : onTrack ? 'text-olive-700 dark:text-lime-brand' : 'text-amber-600')}>
          {pct >= 1 ? 'Target reached' : onTrack ? 'On track' : `${Math.max(0, target - value)} to go`}
        </div>
      )}
    </div>
  );
}
