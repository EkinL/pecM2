'use client';

import { memo, useMemo } from 'react';

type SparklineProps = {
  values: Array<number | null | undefined>;
  stroke?: string;
  fill?: string;
  className?: string;
  ariaLabel?: string;
};

const WIDTH = 100;
const HEIGHT = 32;
const BASELINE = 30;
const PADDING_TOP = 4;

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const Sparkline = memo(function Sparkline({
  values,
  stroke = '#38bdf8',
  fill = 'rgba(56, 189, 248, 0.20)',
  className,
  ariaLabel = 'Sparkline',
}: SparklineProps) {
  const { linePath, areaPath } = useMemo(() => {
    const indexedValues = values
      .map((value, index) => ({ index, value }))
      .filter((item): item is { index: number; value: number } => isFiniteNumber(item.value));

    if (indexedValues.length === 0) {
      return {
        linePath: `M 0 ${BASELINE - 6} L ${WIDTH} ${BASELINE - 6}`,
        areaPath: '',
      };
    }

    const allValues = indexedValues.map((item) => item.value);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = Math.max(1, max - min);
    const denominator = Math.max(1, values.length - 1);

    const points = indexedValues.map((item) => {
      const x = (item.index / denominator) * WIDTH;
      const normalized = (item.value - min) / range;
      const y = BASELINE - normalized * (BASELINE - PADDING_TOP);
      return {
        x,
        y,
      };
    });

    const linePathBuilt = points
      .map(
        (point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
      )
      .join(' ');

    if (points.length < 2) {
      return {
        linePath: linePathBuilt,
        areaPath: '',
      };
    }

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const areaPathBuilt = [
      `M ${firstPoint.x.toFixed(2)} ${BASELINE}`,
      `L ${firstPoint.x.toFixed(2)} ${firstPoint.y.toFixed(2)}`,
      ...points.slice(1).map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
      `L ${lastPoint.x.toFixed(2)} ${BASELINE}`,
      'Z',
    ].join(' ');

    return {
      linePath: linePathBuilt,
      areaPath: areaPathBuilt,
    };
  }, [values]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      {areaPath ? <path d={areaPath} fill={fill} stroke="none" /> : null}
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
});
