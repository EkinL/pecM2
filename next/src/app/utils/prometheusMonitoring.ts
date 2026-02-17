type LabelMap = Record<string, string>;

type ParsedPrometheusSample = {
  name: string;
  labels: LabelMap;
  value: number;
};

export type AdminMetricsSummaryInput = {
  scrapeRequestsTotal?: number | null;
  apiRequestsTotal?: number | null;
  apiErrorsTotal?: number | null;
  businessMessagesTotal?: number | null;
};

export type HistogramBucket = {
  le: number;
  count: number;
};

export type MetricsSnapshot = {
  capturedAt: number;
  scrapeRequestsTotal: number | null;
  apiRequestsTotal: number | null;
  apiErrorsTotal: number | null;
  businessMessagesTotal: number | null;
  uptimeSeconds: number | null;
  residentMemoryBytes: number | null;
  cpuUserSecondsTotal: number | null;
  cpuSystemSecondsTotal: number | null;
  apiLatencyBuckets: HistogramBucket[];
};

export type MonitoringSeriesPoint = {
  timestamp: number;
  requestsPerMin: number | null;
  errorRatePercent: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  cpuPercent: number | null;
  ramMb: number | null;
  uptimeSeconds: number | null;
};

export type TrendDirection = 'up' | 'down' | 'flat';

export type TrendDelta = {
  direction: TrendDirection;
  percentage: number | null;
  current: number | null;
  previous: number | null;
};

export type MonitoringInsightTone = 'positive' | 'neutral' | 'warning';

export type MonitoringInsight = {
  id: string;
  title: string;
  description: string;
  tone: MonitoringInsightTone;
};

const PROMETHEUS_LINE_REGEX =
  /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)$/;

const LABEL_REGEX = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g;

const MAX_HISTORY_POINTS = 24 * 60;
const MONITORING_WINDOW_MS = 24 * 60 * 60 * 1000;
const ONE_MB = 1024 * 1024;

const toNullableNumber = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const pickNumber = (preferred?: number | null, fallback?: number | null) =>
  toNullableNumber(preferred) ?? toNullableNumber(fallback);

const parseLabels = (rawLabels?: string): LabelMap => {
  if (!rawLabels) {
    return {};
  }

  const labels: LabelMap = {};
  const matcher = new RegExp(LABEL_REGEX.source, 'g');
  let match = matcher.exec(rawLabels);
  while (match) {
    const key = match[1];
    const rawValue = match[2] ?? '';
    labels[key] = rawValue
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n');
    match = matcher.exec(rawLabels);
  }
  return labels;
};

const parsePrometheusSamples = (rawMetrics: string): ParsedPrometheusSample[] => {
  const samples: ParsedPrometheusSample[] = [];

  rawMetrics.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const match = trimmed.match(PROMETHEUS_LINE_REGEX);
    if (!match) {
      return;
    }

    const value = Number(match[3]);
    if (!Number.isFinite(value)) {
      return;
    }

    samples.push({
      name: match[1],
      labels: parseLabels(match[2]),
      value,
    });
  });

  return samples;
};

const sumMetricSamples = (samples: ParsedPrometheusSample[], metricName: string) => {
  let hasValue = false;
  let total = 0;

  samples.forEach((sample) => {
    if (sample.name !== metricName) {
      return;
    }
    hasValue = true;
    total += sample.value;
  });

  return hasValue ? total : null;
};

const readMetricFirstValue = (samples: ParsedPrometheusSample[], metricName: string) => {
  const sample = samples.find((entry) => entry.name === metricName);
  return sample ? sample.value : null;
};

const sortBuckets = (left: HistogramBucket, right: HistogramBucket) => {
  const leftInf = left.le === Number.POSITIVE_INFINITY;
  const rightInf = right.le === Number.POSITIVE_INFINITY;
  if (leftInf && rightInf) {
    return 0;
  }
  if (leftInf) {
    return 1;
  }
  if (rightInf) {
    return -1;
  }
  return left.le - right.le;
};

const aggregateHistogramBuckets = (samples: ParsedPrometheusSample[], metricName: string) => {
  const bucketName = `${metricName}_bucket`;
  const bucketsMap = new Map<number, number>();

  samples.forEach((sample) => {
    if (sample.name !== bucketName) {
      return;
    }

    const rawLe = sample.labels.le;
    if (!rawLe) {
      return;
    }
    const le = rawLe === '+Inf' ? Number.POSITIVE_INFINITY : Number(rawLe);
    if (!Number.isFinite(le) && le !== Number.POSITIVE_INFINITY) {
      return;
    }

    bucketsMap.set(le, (bucketsMap.get(le) ?? 0) + sample.value);
  });

  const buckets = [...bucketsMap.entries()]
    .map(([le, count]) => ({ le, count }))
    .sort(sortBuckets);

  let runningCount = 0;
  return buckets.map((bucket) => {
    runningCount = Math.max(runningCount, bucket.count);
    return {
      le: bucket.le,
      count: runningCount,
    };
  });
};

const sumNullable = (left: number | null, right: number | null) => {
  if (left === null && right === null) {
    return null;
  }
  return (left ?? 0) + (right ?? 0);
};

const counterDelta = (current: number | null, previous: number | null) => {
  if (current === null || previous === null) {
    return null;
  }
  const delta = current - previous;
  return delta >= 0 ? delta : null;
};

const buildHistogramDelta = (current: HistogramBucket[], previous?: HistogramBucket[]) => {
  if (!previous || previous.length === 0) {
    return current;
  }

  const previousMap = new Map(previous.map((bucket) => [bucket.le, bucket.count]));
  const rawDelta = current.map((bucket) => ({
    le: bucket.le,
    count: bucket.count - (previousMap.get(bucket.le) ?? 0),
  }));

  if (rawDelta.some((bucket) => bucket.count < 0)) {
    return current;
  }

  let runningCount = 0;
  return rawDelta.map((bucket) => {
    runningCount = Math.max(runningCount, bucket.count);
    return {
      le: bucket.le,
      count: runningCount,
    };
  });
};

const toSeriesRatePerMin = (delta: number | null, elapsedSeconds: number) => {
  if (delta === null || elapsedSeconds <= 0) {
    return null;
  }
  return (delta * 60) / elapsedSeconds;
};

const toSeriesCpuPercent = (deltaCpuSeconds: number | null, elapsedSeconds: number) => {
  if (deltaCpuSeconds === null || elapsedSeconds <= 0) {
    return null;
  }
  return (deltaCpuSeconds / elapsedSeconds) * 100;
};

const toSeriesErrorRate = (requestsDelta: number | null, errorsDelta: number | null) => {
  if (requestsDelta === null || errorsDelta === null) {
    return null;
  }
  if (requestsDelta <= 0) {
    return 0;
  }
  return (errorsDelta / requestsDelta) * 100;
};

const average = (values: number[]) => {
  if (values.length === 0) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
};

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatPercent = (value: number) => `${Math.abs(value).toFixed(1).replace('.', ',')}%`;

const asFiniteArray = (values: Array<number | null>) =>
  values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

const detectPeaks = (
  points: Array<{ timestamp: number; value: number }>,
  minThreshold: number,
  maxPeaks = 3,
) => {
  const detected: Array<{ timestamp: number; value: number }> = [];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1].value;
    const current = points[index].value;
    const next = points[index + 1].value;
    if (current >= minThreshold && current >= previous && current >= next) {
      detected.push(points[index]);
    }
  }

  if (detected.length === 0 && points.length > 0) {
    const maxPoint = [...points].sort((left, right) => right.value - left.value)[0];
    if (maxPoint && maxPoint.value >= minThreshold) {
      detected.push(maxPoint);
    }
  }

  return detected
    .sort((left, right) => right.value - left.value)
    .slice(0, maxPeaks)
    .sort((left, right) => left.timestamp - right.timestamp);
};

export const createMetricsSnapshot = ({
  rawMetrics,
  summary,
  capturedAt = Date.now(),
}: {
  rawMetrics?: string;
  summary?: AdminMetricsSummaryInput;
  capturedAt?: number;
}): MetricsSnapshot | null => {
  if (typeof rawMetrics !== 'string' || !rawMetrics.trim()) {
    return null;
  }

  const samples = parsePrometheusSamples(rawMetrics);
  if (!samples.length) {
    return null;
  }

  const parsedScrapeRequestsTotal = sumMetricSamples(samples, 'metrics_endpoint_requests_total');
  const parsedApiRequestsTotal = sumMetricSamples(samples, 'app_api_requests_total');
  const parsedApiErrorsTotal = sumMetricSamples(samples, 'app_api_errors_total');
  const parsedBusinessMessagesTotal = sumMetricSamples(samples, 'app_business_messages_total');
  const parsedUptimeSeconds = readMetricFirstValue(samples, 'process_uptime_seconds');
  const parsedResidentMemoryBytes = readMetricFirstValue(samples, 'process_resident_memory_bytes');
  const parsedCpuUserSecondsTotal = readMetricFirstValue(samples, 'process_cpu_user_seconds_total');
  const parsedCpuSystemSecondsTotal = readMetricFirstValue(samples, 'process_cpu_system_seconds_total');

  return {
    capturedAt,
    scrapeRequestsTotal: pickNumber(summary?.scrapeRequestsTotal, parsedScrapeRequestsTotal),
    apiRequestsTotal: pickNumber(summary?.apiRequestsTotal, parsedApiRequestsTotal),
    apiErrorsTotal: pickNumber(summary?.apiErrorsTotal, parsedApiErrorsTotal),
    businessMessagesTotal: pickNumber(summary?.businessMessagesTotal, parsedBusinessMessagesTotal),
    uptimeSeconds: toNullableNumber(parsedUptimeSeconds),
    residentMemoryBytes: toNullableNumber(parsedResidentMemoryBytes),
    cpuUserSecondsTotal: toNullableNumber(parsedCpuUserSecondsTotal),
    cpuSystemSecondsTotal: toNullableNumber(parsedCpuSystemSecondsTotal),
    apiLatencyBuckets: aggregateHistogramBuckets(samples, 'app_api_request_duration_seconds'),
  };
};

export const appendMetricsSnapshot = (
  history: MetricsSnapshot[],
  snapshot: MetricsSnapshot,
  maxPoints = MAX_HISTORY_POINTS,
) => {
  const lastPoint = history[history.length - 1];
  if (lastPoint && lastPoint.capturedAt === snapshot.capturedAt) {
    return history;
  }

  if (
    lastPoint &&
    snapshot.capturedAt - lastPoint.capturedAt < 30_000 &&
    lastPoint.apiRequestsTotal === snapshot.apiRequestsTotal &&
    lastPoint.apiErrorsTotal === snapshot.apiErrorsTotal &&
    lastPoint.scrapeRequestsTotal === snapshot.scrapeRequestsTotal
  ) {
    return history;
  }

  const nextHistory =
    history.length === 0 || snapshot.capturedAt >= history[history.length - 1].capturedAt
      ? [...history, snapshot]
      : [...history, snapshot].sort((left, right) => left.capturedAt - right.capturedAt);

  if (nextHistory.length <= maxPoints) {
    return nextHistory;
  }
  return nextHistory.slice(nextHistory.length - maxPoints);
};

export const histogramQuantile = (buckets: HistogramBucket[], quantile: number) => {
  if (buckets.length === 0) {
    return null;
  }

  const clampedQuantile = Math.min(1, Math.max(0, quantile));
  const total = buckets[buckets.length - 1].count;
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }

  const target = clampedQuantile * total;
  let previousCount = 0;
  let previousLe = 0;

  for (const bucket of buckets) {
    if (bucket.count >= target) {
      if (bucket.le === Number.POSITIVE_INFINITY) {
        return Number.isFinite(previousLe) ? previousLe : null;
      }
      if (bucket.count <= previousCount) {
        return bucket.le;
      }

      const ratio = (target - previousCount) / (bucket.count - previousCount);
      const clampedRatio = Math.min(1, Math.max(0, ratio));
      return previousLe + (bucket.le - previousLe) * clampedRatio;
    }

    previousCount = bucket.count;
    if (Number.isFinite(bucket.le)) {
      previousLe = bucket.le;
    }
  }

  const lastFiniteBucket = [...buckets].reverse().find((bucket) => Number.isFinite(bucket.le));
  return lastFiniteBucket ? lastFiniteBucket.le : null;
};

export const buildMonitoringSeries = (
  history: MetricsSnapshot[],
  windowMs = MONITORING_WINDOW_MS,
) => {
  if (history.length === 0) {
    return [] as MonitoringSeriesPoint[];
  }

  const ordered = [...history].sort((left, right) => left.capturedAt - right.capturedAt);
  const latestTimestamp = ordered[ordered.length - 1].capturedAt;
  const windowed = ordered.filter((snapshot) => latestTimestamp - snapshot.capturedAt <= windowMs);

  return windowed.map((snapshot, index) => {
    const previous = index > 0 ? windowed[index - 1] : undefined;
    const elapsedSeconds = previous
      ? Math.max(0, (snapshot.capturedAt - previous.capturedAt) / 1000)
      : 0;

    const requestsDelta = previous
      ? counterDelta(snapshot.apiRequestsTotal, previous.apiRequestsTotal)
      : null;
    const errorsDelta = previous
      ? counterDelta(snapshot.apiErrorsTotal, previous.apiErrorsTotal)
      : null;

    const currentCpu = sumNullable(snapshot.cpuUserSecondsTotal, snapshot.cpuSystemSecondsTotal);
    const previousCpu = previous
      ? sumNullable(previous.cpuUserSecondsTotal, previous.cpuSystemSecondsTotal)
      : null;
    const cpuDelta = previous ? counterDelta(currentCpu, previousCpu) : null;

    const histogramDelta = buildHistogramDelta(
      snapshot.apiLatencyBuckets,
      previous?.apiLatencyBuckets,
    );
    const p50LatencySeconds = histogramQuantile(histogramDelta, 0.5);
    const p95LatencySeconds = histogramQuantile(histogramDelta, 0.95);

    return {
      timestamp: snapshot.capturedAt,
      requestsPerMin: toSeriesRatePerMin(requestsDelta, elapsedSeconds),
      errorRatePercent: toSeriesErrorRate(requestsDelta, errorsDelta),
      p50LatencyMs:
        typeof p50LatencySeconds === 'number' && Number.isFinite(p50LatencySeconds)
          ? p50LatencySeconds * 1000
          : null,
      p95LatencyMs:
        typeof p95LatencySeconds === 'number' && Number.isFinite(p95LatencySeconds)
          ? p95LatencySeconds * 1000
          : null,
      cpuPercent: toSeriesCpuPercent(cpuDelta, elapsedSeconds),
      ramMb:
        typeof snapshot.residentMemoryBytes === 'number' && Number.isFinite(snapshot.residentMemoryBytes)
          ? snapshot.residentMemoryBytes / ONE_MB
          : null,
      uptimeSeconds: snapshot.uptimeSeconds,
    };
  });
};

export const getObservedWindowMs = (series: MonitoringSeriesPoint[]) => {
  if (series.length < 2) {
    return 0;
  }
  return Math.max(0, series[series.length - 1].timestamp - series[0].timestamp);
};

export const formatObservedWindow = (windowMs: number) => {
  if (windowMs <= 0) {
    return 'collecte en cours';
  }

  const minutes = Math.round(windowMs / 60_000);
  if (minutes < 120) {
    return `${Math.max(1, minutes)} min`;
  }

  const hours = minutes / 60;
  if (hours < 48) {
    const precision = hours >= 10 ? 0 : 1;
    return `${hours.toFixed(precision).replace('.', ',')} h`;
  }

  const days = hours / 24;
  return `${days.toFixed(1).replace('.', ',')} j`;
};

export const computePeriodDelta = (values: Array<number | null>): TrendDelta => {
  const finiteValues = asFiniteArray(values);
  if (finiteValues.length === 0) {
    return {
      direction: 'flat',
      percentage: null,
      current: null,
      previous: null,
    };
  }

  if (finiteValues.length < 4) {
    return {
      direction: 'flat',
      percentage: null,
      current: finiteValues[finiteValues.length - 1],
      previous: null,
    };
  }

  const pivot = Math.floor(finiteValues.length / 2);
  const previousAvg = average(finiteValues.slice(0, pivot));
  const currentAvg = average(finiteValues.slice(pivot));

  if (previousAvg === null || currentAvg === null) {
    return {
      direction: 'flat',
      percentage: null,
      current: currentAvg,
      previous: previousAvg,
    };
  }

  const absoluteDiff = currentAvg - previousAvg;
  const epsilon = Math.max(Math.abs(previousAvg), 1) * 0.02;
  const direction: TrendDirection =
    Math.abs(absoluteDiff) <= epsilon ? 'flat' : absoluteDiff > 0 ? 'up' : 'down';

  const percentage =
    Math.abs(previousAvg) > 0.000001 ? (absoluteDiff / Math.abs(previousAvg)) * 100 : null;

  return {
    direction,
    percentage: Number.isFinite(percentage) ? percentage : null,
    current: currentAvg,
    previous: previousAvg,
  };
};

export const buildMonitoringInsights = (series: MonitoringSeriesPoint[]): MonitoringInsight[] => {
  if (series.length === 0) {
    return [
      {
        id: 'collecting',
        title: 'Collecte en cours',
        description: 'Aucun echantillon exploitable pour generer les insights.',
        tone: 'neutral',
      },
    ];
  }

  const insights: MonitoringInsight[] = [];
  const observedWindowLabel = formatObservedWindow(getObservedWindowMs(series));

  const trafficValues = series.map((point) => point.requestsPerMin);
  const trafficDelta = computePeriodDelta(trafficValues);

  if (trafficDelta.current === null) {
    insights.push({
      id: 'traffic',
      title: 'Trafic en consolidation',
      description: `Des echantillons supplementaires sont requis sur ${observedWindowLabel}.`,
      tone: 'neutral',
    });
  } else if (trafficDelta.direction === 'up' && trafficDelta.percentage !== null) {
    insights.push({
      id: 'traffic',
      title: 'Trafic en hausse',
      description: `Le trafic progresse de ${formatPercent(trafficDelta.percentage)} sur ${observedWindowLabel}.`,
      tone: 'positive',
    });
  } else if (trafficDelta.direction === 'down' && trafficDelta.percentage !== null) {
    insights.push({
      id: 'traffic',
      title: 'Trafic en baisse',
      description: `Le trafic recule de ${formatPercent(trafficDelta.percentage)} sur ${observedWindowLabel}.`,
      tone: 'warning',
    });
  } else {
    insights.push({
      id: 'traffic',
      title: 'Trafic stable',
      description: `Le volume reste stable sur ${observedWindowLabel}.`,
      tone: 'neutral',
    });
  }

  const trafficPoints = series
    .map((point) => ({
      timestamp: point.timestamp,
      value: point.requestsPerMin,
    }))
    .filter(
      (point): point is { timestamp: number; value: number } =>
        typeof point.value === 'number' && Number.isFinite(point.value),
    );
  const trafficAverage = average(trafficPoints.map((point) => point.value));
  const trafficThreshold = Math.max((trafficAverage ?? 0) * 1.35, 1);
  const peaks = detectPeaks(trafficPoints, trafficThreshold, 3);

  if (peaks.length > 0) {
    insights.push({
      id: 'peaks',
      title: 'Pics detectes',
      description: `Pics detectes a ${peaks.map((peak) => formatTime(peak.timestamp)).join(', ')}.`,
      tone: 'neutral',
    });
  } else {
    insights.push({
      id: 'peaks',
      title: 'Pics limites',
      description: 'Aucun pic significatif n est detecte sur la fenetre courante.',
      tone: 'positive',
    });
  }

  const latencyValues = series.map((point) => point.p95LatencyMs);
  const latencyDelta = computePeriodDelta(latencyValues);
  if (latencyDelta.current === null) {
    insights.push({
      id: 'latency',
      title: 'Latence en observation',
      description: 'Impossible d evaluer la latence P95 sans volume suffisant.',
      tone: 'neutral',
    });
  } else if (latencyDelta.direction === 'up' && latencyDelta.percentage !== null) {
    insights.push({
      id: 'latency',
      title: 'Latence en degradation',
      description: `La latence P95 monte de ${formatPercent(latencyDelta.percentage)} sur ${observedWindowLabel}.`,
      tone: 'warning',
    });
  } else if (latencyDelta.direction === 'down' && latencyDelta.percentage !== null) {
    insights.push({
      id: 'latency',
      title: 'Latence en amelioration',
      description: `La latence P95 baisse de ${formatPercent(latencyDelta.percentage)} sur ${observedWindowLabel}.`,
      tone: 'positive',
    });
  } else {
    insights.push({
      id: 'latency',
      title: 'Latence stable',
      description: 'La latence P95 reste stable sur la fenetre observee.',
      tone: 'neutral',
    });
  }

  const errorValues = asFiniteArray(series.map((point) => point.errorRatePercent));
  const errorAverage = average(errorValues);
  if (errorAverage !== null && errorAverage >= 1) {
    insights.push({
      id: 'errors',
      title: 'Erreur a surveiller',
      description: `Le taux d erreur moyen est de ${errorAverage.toFixed(2).replace('.', ',')}%.`,
      tone: 'warning',
    });
  } else if (errorAverage !== null) {
    insights.push({
      id: 'errors',
      title: 'Taux d erreur contenu',
      description: `Le taux d erreur moyen reste bas a ${errorAverage.toFixed(2).replace('.', ',')}%.`,
      tone: 'positive',
    });
  }

  return insights.slice(0, 4);
};
