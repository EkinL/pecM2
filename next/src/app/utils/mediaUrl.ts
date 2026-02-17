const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const isLoopbackHost = (host: string) => LOOPBACK_HOSTS.has(host.trim().toLowerCase());

export const normalizeMediaUrl = (value?: string | null) => {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);

    if (isLoopbackHost(url.hostname)) {
      if (!url.pathname.startsWith('/')) {
        return '';
      }
      return `${url.pathname}${url.search}${url.hash}`;
    }

    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      url.protocol === 'http:' &&
      url.hostname === window.location.hostname
    ) {
      url.protocol = 'https:';
      return url.toString();
    }

    return url.toString();
  } catch {
    return trimmed;
  }
};
