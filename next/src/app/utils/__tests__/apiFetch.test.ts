import { apiFetch } from '../apiFetch';

const installFetchMock = () => {
  const mock = jest.fn();
  Object.defineProperty(globalThis, 'fetch', {
    value: mock,
    writable: true,
    configurable: true,
  });
  return mock;
};

describe('apiFetch', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'fetch');
  });

  it('throws when endpoint is empty', async () => {
    await expect(apiFetch('   ')).rejects.toThrow('Endpoint API vide.');
  });

  it('adds a leading slash for relative endpoints', async () => {
    const response = { ok: true, status: 200 } as Response;
    const fetchMock = installFetchMock().mockResolvedValue(response);

    const result = await apiFetch('api/logs', { method: 'POST' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/logs', { method: 'POST' });
    expect(result).toBe(response);
  });

  it('keeps endpoints that already start with a slash', async () => {
    const response = { ok: false, status: 204 } as Response;
    const fetchMock = installFetchMock().mockResolvedValue(response);

    const result = await apiFetch('/api/ping');

    expect(fetchMock).toHaveBeenCalledWith('/api/ping', undefined);
    expect(result.status).toBe(204);
  });

  it('uses absolute URLs as-is', async () => {
    const response = { ok: true, status: 200 } as Response;
    const fetchMock = installFetchMock().mockResolvedValue(response);

    await apiFetch('https://api.example.com/health');

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/health', undefined);
  });

  it('returns non-ok responses without throwing on last attempt', async () => {
    const response = { ok: false, status: 500 } as Response;
    installFetchMock().mockResolvedValue(response);

    const result = await apiFetch('/api/fails');

    expect(result.status).toBe(500);
  });

  it('rethrows network errors from fetch', async () => {
    installFetchMock().mockRejectedValue(new Error('network down'));

    await expect(apiFetch('/api/unreachable')).rejects.toThrow('network down');
  });
});
