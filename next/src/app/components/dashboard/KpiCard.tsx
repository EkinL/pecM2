'use client';

import { memo } from 'react';
import { Sparkline } from './Sparkline';

type TrendDirection = 'up' | 'down' | 'flat';
type TrendTone = 'positive' | 'warning' | 'neutral';

type KpiCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  trendDirection?: TrendDirection;
  trendLabel?: string;
  trendTone?: TrendTone;
  tooltip?: string;
  sparklineValues?: Array<number | null | undefined>;
  sparklineStroke?: string;
  sparklineFill?: string;
};

const trendGlyphByDirection: Record<TrendDirection, string> = {
  up: '▲',
  down: '▼',
  flat: '■',
};

const trendClassByTone: Record<TrendTone, string> = {
  positive: 'text-emerald-300',
  warning: 'text-rose-300',
  neutral: 'text-slate-300',
};

export const KpiCard = memo(function KpiCard({
  title,
  value,
  subtitle,
  trendDirection = 'flat',
  trendLabel = 'Variation indisponible',
  trendTone = 'neutral',
  tooltip,
  sparklineValues = [],
  sparklineStroke = '#38bdf8',
  sparklineFill = 'rgba(56, 189, 248, 0.18)',
}: KpiCardProps) {
  const trendClass = trendClassByTone[trendTone] ?? trendClassByTone.neutral;
  const trendGlyph = trendGlyphByDirection[trendDirection] ?? trendGlyphByDirection.flat;

  return (
    <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/75 to-slate-950/80 p-4 shadow-lg shadow-black/30">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
          {title}
        </h3>
        {tooltip ? (
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-700/80 text-[11px] text-slate-300"
            title={tooltip}
            aria-label={tooltip}
          >
            ?
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-2xl font-semibold text-slate-50 md:text-[1.75rem]">{value}</p>
      <p className="mt-1 min-h-5 text-xs text-slate-400">{subtitle ?? '\u00a0'}</p>

      <p className={`mt-2 text-xs font-medium ${trendClass}`}>
        <span className="mr-1" aria-hidden="true">
          {trendGlyph}
        </span>
        {trendLabel}
      </p>

      <Sparkline
        values={sparklineValues}
        stroke={sparklineStroke}
        fill={sparklineFill}
        ariaLabel={`Evolution ${title}`}
        className="mt-3 h-10 w-full"
      />
    </article>
  );
});
