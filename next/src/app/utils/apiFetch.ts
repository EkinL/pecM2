const DEFAULT_PRIMARY_API_ORIGIN = 'https://pec-m2.vercel.app';
const DEFAULT_LOCAL_API_ORIGIN = 'https://pec-m2.vercel.app';
const isBrowser = typeof window !== 'undefined';

const normalizeOrigin = (value?: string): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
};

const resolveApiOrigins = () => {
  const envOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_API_BASE_URL);
  const appOrigin = normalizeOrigin(
    process.env.NEXT_PUBLIC_APP_URL ??
      process.env.PUBLIC_APP_URL ??
      process.env.NEXT_PUBLIC_SITE_URL,
  );
  const origins = [
    envOrigin,
    appOrigin,
    DEFAULT_PRIMARY_API_ORIGIN,
    DEFAULT_LOCAL_API_ORIGIN,
  ].filter((origin): origin is string => Boolean(origin));
  return [...new Set(origins)];
};

const buildCandidateUrls = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Endpoint API vide.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return [trimmed];
  }

  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  if (isBrowser) {
    return [normalizedPath];
  }

  return resolveApiOrigins().map((origin) => `${origin}${normalizedPath}`);
};

const shouldTryFallback = (statusCode: number) => statusCode === 404 || statusCode >= 500;

export const apiFetch = async (input: string, init?: RequestInit): Promise<Response> => {
  const endpoints = buildCandidateUrls(input);
  let lastError: unknown = null;

  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index];
    const isLastAttempt = index === endpoints.length - 1;

    try {
      const response = await fetch(endpoint, init);
      if (response.ok || isLastAttempt || !shouldTryFallback(response.status)) {
        return response;
      }
      lastError = new Error(`API ${endpoint} a repondu ${response.status}.`);
    } catch (error) {
      lastError = error;
      if (isLastAttempt) {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Impossible de contacter l'API.");
};
