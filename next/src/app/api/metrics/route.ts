import { collectCustomMetrics } from '../../observability/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Labels = Record<string, string>;

let metricsScrapeRequestsTotal = 0;
let metricsScrapeLastDurationSeconds = 0;

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function renderLabels(labels?: Labels): string {
  if (!labels || Object.keys(labels).length === 0) {
    return '';
  }

  const parts = Object.entries(labels).map(([key, value]) => `${key}="${escapeLabelValue(value)}"`);
  return `{${parts.join(',')}}`;
}

function renderSample(name: string, value: number, labels?: Labels): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${name}${renderLabels(labels)} ${safeValue}`;
}

export async function GET(): Promise<Response> {
  const startedAt = process.hrtime.bigint();
  metricsScrapeRequestsTotal += 1;

  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const uptimeSeconds = process.uptime();
  const processStartTimeSeconds = Date.now() / 1000 - uptimeSeconds;

  const lines: string[] = [
    '# HELP app_build_info Static info about this Next.js service.',
    '# TYPE app_build_info gauge',
    renderSample('app_build_info', 1, {
      service: 'pecwebetmobile-next',
      env: process.env.NODE_ENV ?? 'unknown',
    }),

    '# HELP process_start_time_seconds Start time of the current process since unix epoch in seconds.',
    '# TYPE process_start_time_seconds gauge',
    renderSample('process_start_time_seconds', processStartTimeSeconds),

    '# HELP process_uptime_seconds Uptime of the current process in seconds.',
    '# TYPE process_uptime_seconds gauge',
    renderSample('process_uptime_seconds', uptimeSeconds),

    '# HELP process_resident_memory_bytes Resident memory size in bytes.',
    '# TYPE process_resident_memory_bytes gauge',
    renderSample('process_resident_memory_bytes', memoryUsage.rss),

    '# HELP process_heap_total_bytes Total heap memory in bytes.',
    '# TYPE process_heap_total_bytes gauge',
    renderSample('process_heap_total_bytes', memoryUsage.heapTotal),

    '# HELP process_heap_used_bytes Used heap memory in bytes.',
    '# TYPE process_heap_used_bytes gauge',
    renderSample('process_heap_used_bytes', memoryUsage.heapUsed),

    '# HELP process_external_memory_bytes V8 external memory in bytes.',
    '# TYPE process_external_memory_bytes gauge',
    renderSample('process_external_memory_bytes', memoryUsage.external),

    '# HELP process_array_buffers_bytes Array buffer memory in bytes.',
    '# TYPE process_array_buffers_bytes gauge',
    renderSample('process_array_buffers_bytes', memoryUsage.arrayBuffers),

    '# HELP process_cpu_user_seconds_total Total user CPU time consumed by the process.',
    '# TYPE process_cpu_user_seconds_total counter',
    renderSample('process_cpu_user_seconds_total', cpuUsage.user / 1_000_000),

    '# HELP process_cpu_system_seconds_total Total system CPU time consumed by the process.',
    '# TYPE process_cpu_system_seconds_total counter',
    renderSample('process_cpu_system_seconds_total', cpuUsage.system / 1_000_000),

    '# HELP nodejs_version_info Node.js version running this service.',
    '# TYPE nodejs_version_info gauge',
    renderSample('nodejs_version_info', 1, { version: process.version }),
  ];

  metricsScrapeLastDurationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

  lines.push(
    '# HELP metrics_endpoint_requests_total Total number of scrapes on /api/metrics.',
    '# TYPE metrics_endpoint_requests_total counter',
    renderSample('metrics_endpoint_requests_total', metricsScrapeRequestsTotal),

    '# HELP metrics_endpoint_last_duration_seconds Last scrape duration in seconds.',
    '# TYPE metrics_endpoint_last_duration_seconds gauge',
    renderSample('metrics_endpoint_last_duration_seconds', metricsScrapeLastDurationSeconds),
  );

  const customMetrics = collectCustomMetrics();
  if (customMetrics) {
    lines.push(customMetrics);
  }

  return new Response(`${lines.join('\n')}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
