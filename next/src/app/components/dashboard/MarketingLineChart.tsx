'use client';

import { memo, useMemo, useState } from 'react';

export type MarketingChartDatum = Record<string, number | null> & {
  timestamp: number;
};

export type MarketingLineSeries = {
  key: string;
  label: string;
  color: string;
  fill?: string;
  formatter?: (value: number) => string;
  showArea?: boolean;
  strokeWidth?: number;
};

type MarketingLineChartProps = {
  title: string;
  subtitle?: string;
  points: MarketingChartDatum[];
  series: MarketingLineSeries[];
  yAxisFormatter?: (value: number) => string;
  emptyLabel?: string;
};

const CHART_WIDTH = 720;
const CHART_HEIGHT = 280;
const MARGIN = {
  top: 20,
  right: 16,
  bottom: 34,
  left: 48,
};

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const defaultNumberFormatter = (value: number) => {
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
};

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

export const MarketingLineChart = memo(function MarketingLineChart({
  title,
  subtitle,
  points,
  series,
  yAxisFormatter = defaultNumberFormatter,
  emptyLabel = 'Pas assez de donnees pour afficher ce graphique.',
}: MarketingLineChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const plotWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const chartData = useMemo(() => {
    const values: number[] = [];
    points.forEach((point) => {
      series.forEach((serie) => {
        const candidate = point[serie.key];
        if (isFiniteNumber(candidate)) {
          values.push(candidate);
        }
      });
    });

    if (values.length === 0) {
      return {
        hasData: false,
        yMin: 0,
        yMax: 1,
      };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const baselineMin = min >= 0 ? 0 : min;
    const paddedMax = max <= 0 ? 1 : max * 1.08;
    const yMin = baselineMin;
    const yMax = paddedMax === yMin ? yMin + 1 : paddedMax;

    return {
      hasData: true,
      yMin,
      yMax,
    };
  }, [points, series]);

  const xScale = (index: number) => {
    const denominator = Math.max(1, points.length - 1);
    return MARGIN.left + (index / denominator) * plotWidth;
  };

  const yScale = (value: number) => {
    const ratio = (value - chartData.yMin) / Math.max(1e-9, chartData.yMax - chartData.yMin);
    return MARGIN.top + (1 - ratio) * plotHeight;
  };

  const buildLinePath = (seriesKey: string) => {
    let started = false;
    const chunks: string[] = [];

    points.forEach((point, index) => {
      const value = point[seriesKey];
      if (!isFiniteNumber(value)) {
        started = false;
        return;
      }

      const x = xScale(index);
      const y = yScale(value);
      chunks.push(`${started ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`);
      started = true;
    });

    return chunks.join(' ');
  };

  const buildAreaPath = (seriesKey: string) => {
    const finitePoints = points
      .map((point, index) => ({
        index,
        value: point[seriesKey],
      }))
      .filter((entry): entry is { index: number; value: number } => isFiniteNumber(entry.value));

    if (finitePoints.length < 2) {
      return '';
    }

    const firstX = xScale(finitePoints[0].index);
    const lastX = xScale(finitePoints[finitePoints.length - 1].index);
    const baselineY = MARGIN.top + plotHeight;

    const areaSegments = [
      `M ${firstX.toFixed(2)} ${baselineY.toFixed(2)}`,
      `L ${firstX.toFixed(2)} ${yScale(finitePoints[0].value).toFixed(2)}`,
      ...finitePoints
        .slice(1)
        .map((entry) => `L ${xScale(entry.index).toFixed(2)} ${yScale(entry.value).toFixed(2)}`),
      `L ${lastX.toFixed(2)} ${baselineY.toFixed(2)}`,
      'Z',
    ];

    return areaSegments.join(' ');
  };

  const yTicks = useMemo(() => {
    if (!chartData.hasData) {
      return [] as Array<{ value: number; y: number }>;
    }

    const yRange = Math.max(1e-9, chartData.yMax - chartData.yMin);
    return Array.from({ length: 4 }, (_, tickIndex) => {
      const ratio = tickIndex / 3;
      const value = chartData.yMax - ratio * (chartData.yMax - chartData.yMin);
      return {
        value,
        y: MARGIN.top + (1 - (value - chartData.yMin) / yRange) * plotHeight,
      };
    });
  }, [chartData.hasData, chartData.yMax, chartData.yMin, plotHeight]);

  const xTickIndexes = useMemo(() => {
    if (points.length === 0) {
      return [] as number[];
    }
    const indexes = [0, Math.floor((points.length - 1) / 2), points.length - 1];
    return [...new Set(indexes)];
  }, [points.length]);

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (points.length === 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = clamp(event.clientX - rect.left, 0, rect.width);
    const ratio = rect.width > 0 ? relativeX / rect.width : 0;
    const index = Math.round(ratio * Math.max(0, points.length - 1));
    setHoveredIndex(clamp(index, 0, Math.max(0, points.length - 1)));
  };

  const hoveredPoint =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < points.length
      ? points[hoveredIndex]
      : null;

  return (
    <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/75 to-slate-950/80 p-4 shadow-lg shadow-black/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 md:text-base">{title}</h3>
          {subtitle ? <p className="text-xs text-slate-400 md:text-sm">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          {series.map((serie) => (
            <span key={serie.key} className="inline-flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: serie.color }}
                aria-hidden="true"
              />
              {serie.label}
            </span>
          ))}
        </div>
      </div>

      {chartData.hasData ? (
        <div className="relative mt-4">
          {hoveredPoint ? (
            <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-lg border border-slate-700/80 bg-slate-950/90 px-3 py-2 text-[11px] text-slate-200 shadow-lg">
              <p className="font-semibold text-slate-100">{formatTime(hoveredPoint.timestamp)}</p>
              {series.map((serie) => {
                const value = hoveredPoint[serie.key];
                const labelValue =
                  isFiniteNumber(value) && serie.formatter ? serie.formatter(value) : null;
                return (
                  <p key={serie.key} className="mt-0.5">
                    <span className="mr-1" style={{ color: serie.color }}>
                      {serie.label}:
                    </span>
                    {labelValue ?? (isFiniteNumber(value) ? defaultNumberFormatter(value) : '—')}
                  </p>
                );
              })}
            </div>
          ) : null}

          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-64 w-full touch-none"
            role="img"
            aria-label={title}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoveredIndex(null)}
          >
            <defs>
              {series.map((serie) => (
                <linearGradient
                  key={`gradient-${serie.key}`}
                  id={`marketing-gradient-${title.replace(/\s+/g, '-').toLowerCase()}-${serie.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={serie.fill ?? serie.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={serie.fill ?? serie.color} stopOpacity={0.03} />
                </linearGradient>
              ))}
            </defs>

            {yTicks.map((tick) => (
              <g key={`y-grid-${tick.y.toFixed(2)}`}>
                <line
                  x1={MARGIN.left}
                  y1={tick.y}
                  x2={MARGIN.left + plotWidth}
                  y2={tick.y}
                  stroke="rgba(148, 163, 184, 0.18)"
                  strokeDasharray="3 6"
                />
                <text
                  x={MARGIN.left - 8}
                  y={tick.y + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="rgb(148 163 184)"
                >
                  {yAxisFormatter(tick.value)}
                </text>
              </g>
            ))}

            {series.map((serie) => {
              const path = buildLinePath(serie.key);
              const area = serie.showArea ? buildAreaPath(serie.key) : '';
              const gradientId = `marketing-gradient-${title.replace(/\s+/g, '-').toLowerCase()}-${serie.key}`;
              return (
                <g key={serie.key}>
                  {area ? <path d={area} fill={`url(#${gradientId})`} stroke="none" /> : null}
                  <path
                    d={path}
                    fill="none"
                    stroke={serie.color}
                    strokeWidth={serie.strokeWidth ?? 2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}

            {hoveredPoint ? (
              <line
                x1={xScale(hoveredIndex ?? 0)}
                y1={MARGIN.top}
                x2={xScale(hoveredIndex ?? 0)}
                y2={MARGIN.top + plotHeight}
                stroke="rgba(148, 163, 184, 0.5)"
                strokeDasharray="4 4"
              />
            ) : null}

            {xTickIndexes.map((tickIndex) => {
              const point = points[tickIndex];
              if (!point) {
                return null;
              }
              return (
                <text
                  key={`x-tick-${tickIndex}`}
                  x={xScale(tickIndex)}
                  y={CHART_HEIGHT - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill="rgb(148 163 184)"
                >
                  {formatTime(point.timestamp)}
                </text>
              );
            })}
          </svg>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-sm text-slate-400">
          {emptyLabel}
        </p>
      )}
    </article>
  );
});
