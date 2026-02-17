import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const METRICS_SOURCE_URL =
  process.env.ADMIN_METRICS_SOURCE_URL ?? 'http://host.docker.internal:3000/api/metrics';
const FALLBACK_METRICS_SOURCE_URLS = [
  'http://host.docker.internal:3000/api/metrics',
  'http://localhost:3000/api/metrics',
  'http://127.0.0.1:3000/api/metrics',
];

const getProbeTargets = (request: Request) => {
  let sameOriginMetricsUrl: string | null = null;
  try {
    const requestUrl = new URL(request.url);
    sameOriginMetricsUrl = `${requestUrl.origin}/api/metrics`;
  } catch {
    sameOriginMetricsUrl = null;
  }

  const sources = [sameOriginMetricsUrl, METRICS_SOURCE_URL, ...FALLBACK_METRICS_SOURCE_URLS];
  const normalizedSources = sources.filter((value): value is string => Boolean(value));
  return [...new Set(normalizedSources)];
};

const fetchMetricsSource = async (source: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(source, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'text/plain',
      },
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const readMetricValue = (metricsText: string, metricName: string) => {
  const line = metricsText
    .split('\n')
    .find((entry) => entry.startsWith(`${metricName} `) || entry.startsWith(`${metricName}{`));
  if (!line) {
    return null;
  }

  const chunks = line.trim().split(/\s+/);
  const rawValue = chunks[chunks.length - 1];
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
};

export async function GET(request: Request) {
  const startedAt = Date.now();
  const probeTargets = getProbeTargets(request);
  let includeRawMetrics = false;
  try {
    const requestUrl = new URL(request.url);
    const rawFlag = requestUrl.searchParams.get('includeRaw');
    includeRawMetrics = rawFlag === '1' || rawFlag === 'true';
  } catch {
    includeRawMetrics = false;
  }
  const failures: Array<{ source: string; status?: number; error: string }> = [];

  for (const source of probeTargets) {
    try {
      const response = await fetchMetricsSource(source);
      if (!response.ok) {
        const details = await response.text().catch(() => response.statusText);
        failures.push({
          source,
          status: response.status,
          error: details || 'Metrics endpoint unavailable',
        });
        continue;
      }

      const metricsText = await response.text();
      const summary = {
        scrapeRequestsTotal: readMetricValue(metricsText, 'metrics_endpoint_requests_total'),
        apiRequestsTotal: readMetricValue(metricsText, 'app_api_requests_total'),
        apiErrorsTotal: readMetricValue(metricsText, 'app_api_errors_total'),
        businessMessagesTotal: readMetricValue(metricsText, 'app_business_messages_total'),
      };

      console.info('Admin metrics probe success', {
        source,
        durationMs: Date.now() - startedAt,
        bytes: metricsText.length,
        summary,
      });

      return NextResponse.json({
        ok: true,
        source,
        durationMs: Date.now() - startedAt,
        summary,
        ...(includeRawMetrics ? { rawMetrics: metricsText } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      failures.push({
        source,
        error: message,
      });
    }
  }

  console.error('Admin metrics probe failed on all targets', {
    durationMs: Date.now() - startedAt,
    failures,
  });

  return NextResponse.json(
    {
      ok: false,
      source: METRICS_SOURCE_URL,
      targets: probeTargets,
      failures,
      error: 'Metrics endpoint unavailable',
    },
    { status: 502 },
  );
}
