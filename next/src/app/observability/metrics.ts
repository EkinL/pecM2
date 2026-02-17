type Labels = Record<string, string>;

type CounterDefinition = {
  help: string;
  labelNames: readonly string[];
};

type HistogramDefinition = {
  help: string;
  labelNames: readonly string[];
  buckets: readonly number[];
};

type CounterSeries = {
  labels: Labels;
  value: number;
};

type HistogramSeries = {
  labels: Labels;
  count: number;
  sum: number;
  bucketCounts: number[];
};

type MetricsStore = {
  counters: Map<string, Map<string, CounterSeries>>;
  histograms: Map<string, Map<string, HistogramSeries>>;
};

const METRICS_STORE_KEY = '__pec_metrics_store__';

const DEFAULT_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10,
] as const;

const counterDefinitions = {
  app_api_requests_total: {
    help: 'Total number of API requests handled.',
    labelNames: ['route', 'method', 'status'],
  },
  app_api_errors_total: {
    help: 'Total number of API errors by status class.',
    labelNames: ['route', 'method', 'status_class'],
  },
  app_firestore_operations_total: {
    help: 'Total number of Firestore operations.',
    labelNames: ['operation', 'collection', 'status'],
  },
  app_external_api_requests_total: {
    help: 'Total number of outgoing external API requests.',
    labelNames: ['provider', 'endpoint', 'status'],
  },
  app_external_api_errors_total: {
    help: 'Total number of outgoing external API errors.',
    labelNames: ['provider', 'endpoint', 'status_class'],
  },
  app_business_messages_total: {
    help: 'Total number of business messages persisted.',
    labelNames: ['kind', 'author_role', 'source'],
  },
  app_business_tokens_spent_total: {
    help: 'Total amount of business tokens spent.',
    labelNames: ['kind', 'source'],
  },
  app_business_tokens_granted_total: {
    help: 'Total amount of business tokens granted by admins.',
    labelNames: ['source'],
  },
} as const satisfies Record<string, CounterDefinition>;

const histogramDefinitions = {
  app_api_request_duration_seconds: {
    help: 'API request duration in seconds.',
    labelNames: ['route', 'method'],
    buckets: DEFAULT_DURATION_BUCKETS,
  },
  app_firestore_operation_duration_seconds: {
    help: 'Firestore operation duration in seconds.',
    labelNames: ['operation', 'collection'],
    buckets: DEFAULT_DURATION_BUCKETS,
  },
  app_external_api_request_duration_seconds: {
    help: 'Outgoing external API request duration in seconds.',
    labelNames: ['provider', 'endpoint'],
    buckets: DEFAULT_DURATION_BUCKETS,
  },
} as const satisfies Record<string, HistogramDefinition>;

type CounterName = keyof typeof counterDefinitions;
type HistogramName = keyof typeof histogramDefinitions;

const nowMs = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const durationSeconds = (startedAtMs: number) => Math.max(0, (nowMs() - startedAtMs) / 1000);

const isServerRuntime = () => typeof window === 'undefined';

const getStore = (): MetricsStore => {
  const root = globalThis as Record<string, unknown>;
  const existing = root[METRICS_STORE_KEY];
  if (existing) {
    return existing as MetricsStore;
  }

  const created: MetricsStore = {
    counters: new Map(),
    histograms: new Map(),
  };
  root[METRICS_STORE_KEY] = created;
  return created;
};

const normalizeLabelValue = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return normalized || 'unknown';
};

const normalizeLabels = (labelNames: readonly string[], labels?: Record<string, unknown>): Labels => {
  const normalized: Labels = {};
  labelNames.forEach((labelName) => {
    normalized[labelName] = normalizeLabelValue(labels?.[labelName]);
  });
  return normalized;
};

const labelsKey = (labels: Labels) =>
  Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join('|');

const getCounterSeries = (name: CounterName, labels: Labels) => {
  const store = getStore();
  let seriesByMetric = store.counters.get(name);
  if (!seriesByMetric) {
    seriesByMetric = new Map();
    store.counters.set(name, seriesByMetric);
  }

  const key = labelsKey(labels);
  let series = seriesByMetric.get(key);
  if (!series) {
    series = {
      labels,
      value: 0,
    };
    seriesByMetric.set(key, series);
  }
  return series;
};

const getHistogramSeries = (name: HistogramName, labels: Labels) => {
  const store = getStore();
  let seriesByMetric = store.histograms.get(name);
  if (!seriesByMetric) {
    seriesByMetric = new Map();
    store.histograms.set(name, seriesByMetric);
  }

  const key = labelsKey(labels);
  let series = seriesByMetric.get(key);
  if (!series) {
    series = {
      labels,
      count: 0,
      sum: 0,
      bucketCounts: new Array(histogramDefinitions[name].buckets.length).fill(0),
    };
    seriesByMetric.set(key, series);
  }
  return series;
};

const incrementCounter = (name: CounterName, labels?: Record<string, unknown>, value = 1) => {
  if (!isServerRuntime()) {
    return;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return;
  }
  const definition = counterDefinitions[name];
  const normalizedLabels = normalizeLabels(definition.labelNames, labels);
  const series = getCounterSeries(name, normalizedLabels);
  series.value += value;
};

const observeHistogram = (name: HistogramName, labels: Record<string, unknown>, value: number) => {
  if (!isServerRuntime()) {
    return;
  }
  if (!Number.isFinite(value) || value < 0) {
    return;
  }

  const definition = histogramDefinitions[name];
  const normalizedLabels = normalizeLabels(definition.labelNames, labels);
  const series = getHistogramSeries(name, normalizedLabels);

  series.count += 1;
  series.sum += value;
  definition.buckets.forEach((bucket, index) => {
    if (value <= bucket) {
      series.bucketCounts[index] += 1;
    }
  });
};

const statusClass = (status: number) => {
  if (status >= 500) {
    return '5xx';
  }
  if (status >= 400) {
    return '4xx';
  }
  if (status >= 300) {
    return '3xx';
  }
  if (status >= 200) {
    return '2xx';
  }
  return 'other';
};

const escapePrometheusLabel = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');

const renderPrometheusLabels = (labels: Labels) => {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) {
    return '';
  }
  return `{${entries.map(([name, value]) => `${name}="${escapePrometheusLabel(value)}"`).join(',')}}`;
};

const renderPrometheusSample = (name: string, labels: Labels, value: number) =>
  `${name}${renderPrometheusLabels(labels)} ${Number.isFinite(value) ? value : 0}`;

export const withApiMetrics = async (
  route: string,
  method: string,
  handler: () => Promise<Response>,
): Promise<Response> => {
  const startedAt = nowMs();
  let status = 500;

  try {
    const response = await handler();
    status = response.status;
    return response;
  } catch (error) {
    status = 500;
    throw error;
  } finally {
    incrementCounter('app_api_requests_total', { route, method, status: String(status) });
    observeHistogram('app_api_request_duration_seconds', { route, method }, durationSeconds(startedAt));
    if (status >= 400) {
      incrementCounter('app_api_errors_total', {
        route,
        method,
        status_class: statusClass(status),
      });
    }
  }
};

export const trackFirestoreCall = async <T>(
  operation: string,
  collection: string,
  run: () => Promise<T>,
): Promise<T> => {
  if (!isServerRuntime()) {
    return run();
  }

  const startedAt = nowMs();
  let status = 'ok';

  try {
    return await run();
  } catch (error) {
    status = 'error';
    throw error;
  } finally {
    incrementCounter('app_firestore_operations_total', { operation, collection, status });
    observeHistogram(
      'app_firestore_operation_duration_seconds',
      { operation, collection },
      durationSeconds(startedAt),
    );
  }
};

export const trackExternalFetch = async (
  provider: string,
  endpoint: string,
  run: () => Promise<Response>,
) => {
  if (!isServerRuntime()) {
    return run();
  }

  const startedAt = nowMs();
  let status = 'network_error';

  try {
    const response = await run();
    status = String(response.status);
    return response;
  } catch (error) {
    incrementCounter('app_external_api_errors_total', {
      provider,
      endpoint,
      status_class: 'network_error',
    });
    throw error;
  } finally {
    incrementCounter('app_external_api_requests_total', { provider, endpoint, status });
    observeHistogram(
      'app_external_api_request_duration_seconds',
      { provider, endpoint },
      durationSeconds(startedAt),
    );

    const numericStatus = Number(status);
    if (Number.isFinite(numericStatus) && numericStatus >= 400) {
      incrementCounter('app_external_api_errors_total', {
        provider,
        endpoint,
        status_class: statusClass(numericStatus),
      });
    }
  }
};

export const recordBusinessMessage = ({
  kind,
  authorRole,
  source,
  tokenCost,
}: {
  kind?: string;
  authorRole?: string;
  source?: string;
  tokenCost?: number;
}) => {
  if (!isServerRuntime()) {
    return;
  }

  const normalizedKind = normalizeLabelValue(kind ?? 'unknown');
  const normalizedRole = normalizeLabelValue(authorRole ?? 'unknown');
  const normalizedSource = normalizeLabelValue(source ?? 'unknown');

  incrementCounter('app_business_messages_total', {
    kind: normalizedKind,
    author_role: normalizedRole,
    source: normalizedSource,
  });

  const numericTokenCost = Number(tokenCost ?? 0);
  if (Number.isFinite(numericTokenCost) && numericTokenCost > 0) {
    incrementCounter(
      'app_business_tokens_spent_total',
      {
        kind: normalizedKind,
        source: normalizedSource,
      },
      numericTokenCost,
    );
  }
};

export const recordBusinessTokensGranted = ({
  source,
  amount,
}: {
  source?: string;
  amount?: number;
}) => {
  if (!isServerRuntime()) {
    return;
  }

  const normalizedSource = normalizeLabelValue(source ?? 'unknown');
  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return;
  }

  incrementCounter(
    'app_business_tokens_granted_total',
    {
      source: normalizedSource,
    },
    numericAmount,
  );
};

export const collectCustomMetrics = () => {
  if (!isServerRuntime()) {
    return '';
  }

  const store = getStore();
  const lines: string[] = [];

  const counterEntries = Object.entries(counterDefinitions) as Array<[CounterName, CounterDefinition]>;
  counterEntries.forEach(([name, definition]) => {
    lines.push(`# HELP ${name} ${definition.help}`);
    lines.push(`# TYPE ${name} counter`);

    const seriesByMetric = store.counters.get(name);
    if (!seriesByMetric || seriesByMetric.size === 0) {
      return;
    }

    const sortedSeries = [...seriesByMetric.values()].sort((left, right) =>
      labelsKey(left.labels).localeCompare(labelsKey(right.labels)),
    );
    sortedSeries.forEach((series) => {
      lines.push(renderPrometheusSample(name, series.labels, series.value));
    });
  });

  const histogramEntries = Object.entries(histogramDefinitions) as Array<
    [HistogramName, HistogramDefinition]
  >;
  histogramEntries.forEach(([name, definition]) => {
    lines.push(`# HELP ${name} ${definition.help}`);
    lines.push(`# TYPE ${name} histogram`);

    const seriesByMetric = store.histograms.get(name);
    if (!seriesByMetric || seriesByMetric.size === 0) {
      return;
    }

    const sortedSeries = [...seriesByMetric.values()].sort((left, right) =>
      labelsKey(left.labels).localeCompare(labelsKey(right.labels)),
    );

    sortedSeries.forEach((series) => {
      definition.buckets.forEach((bucket, index) => {
        lines.push(
          renderPrometheusSample(
            `${name}_bucket`,
            {
              ...series.labels,
              le: String(bucket),
            },
            series.bucketCounts[index] ?? 0,
          ),
        );
      });

      lines.push(
        renderPrometheusSample(
          `${name}_bucket`,
          {
            ...series.labels,
            le: '+Inf',
          },
          series.count,
        ),
      );
      lines.push(renderPrometheusSample(`${name}_sum`, series.labels, series.sum));
      lines.push(renderPrometheusSample(`${name}_count`, series.labels, series.count));
    });
  });

  return lines.join('\n');
};
