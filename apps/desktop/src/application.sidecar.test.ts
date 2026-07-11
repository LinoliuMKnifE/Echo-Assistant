import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidecarApplicationAdapter } from './application';
import type { TauriApplicationAdapter } from './application';

const session = { baseUrl: 'http://127.0.0.1:43117', token: 'test-token' };

function okResponse(result: unknown) {
  return { ok: true, json: async () => ({ ok: true, result }) } as Response;
}
function errResponse(error: string) {
  return { ok: true, json: async () => ({ ok: false, error }) } as Response;
}

function mockHost(): TauriApplicationAdapter {
  return {
    load: vi.fn(),
    issuePairing: vi.fn(),
    revokePairing: vi.fn(),
    saveSettings: vi.fn(),
  } as unknown as TauriApplicationAdapter;
}

describe('SidecarApplicationAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends chat requests with method/params and bearer auth, unwraps the result', async () => {
    const adapter = new SidecarApplicationAdapter(session, mockHost());
    fetchMock.mockResolvedValueOnce(
      okResponse({ conversationId: 'c1', reply: 'hi', provenance: [] }),
    );
    const result = await adapter.chat('hello', 'proj');

    expect(result).toEqual({ conversationId: 'c1', reply: 'hi', provenance: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:43117/app/v1/rpc');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({
      method: 'chat',
      params: { message: 'hello', project: 'proj' },
    });
  });

  it('sends remember requests and unwraps the memory result', async () => {
    const adapter = new SidecarApplicationAdapter(session, mockHost());
    fetchMock.mockResolvedValueOnce(okResponse({ id: 'm1', content: 'likes tea' }));
    const result = await adapter.remember('likes tea');
    expect(result).toEqual({ id: 'm1', content: 'likes tea' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      method: 'remember',
      params: { content: 'likes tea' },
    });
  });

  it('sends load requests with no params, unwraps the snapshot, and overlays settings from the Tauri host', async () => {
    const host = mockHost();
    (host.load as ReturnType<typeof vi.fn>).mockResolvedValue({
      settings: { assistantName: 'Host', memoryMode: 'ask', monthlyBudget: 10, offline: true },
    });
    const adapter = new SidecarApplicationAdapter(session, host);
    fetchMock.mockResolvedValueOnce(
      okResponse({
        memories: [],
        settings: {
          assistantName: 'Echo',
          memoryMode: 'low-risk',
          monthlyBudget: 25,
          offline: false,
        },
      }),
    );
    const result = await adapter.load();
    expect(result).toEqual({
      memories: [],
      settings: { assistantName: 'Host', memoryMode: 'ask', monthlyBudget: 10, offline: true },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ method: 'load', params: {} });
    expect(host.load).toHaveBeenCalled();
  });

  it('keeps the sidecar default settings when the Tauri host load fails', async () => {
    const host = mockHost();
    (host.load as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no Tauri command'));
    const adapter = new SidecarApplicationAdapter(session, host);
    fetchMock.mockResolvedValueOnce(
      okResponse({
        memories: [],
        settings: {
          assistantName: 'Echo',
          memoryMode: 'low-risk',
          monthlyBudget: 25,
          offline: false,
        },
      }),
    );
    const result = await adapter.load();
    expect(result).toEqual({
      memories: [],
      settings: {
        assistantName: 'Echo',
        memoryMode: 'low-risk',
        monthlyBudget: 25,
        offline: false,
      },
    });
  });

  it('sends createBackup requests and unwraps the result', async () => {
    const adapter = new SidecarApplicationAdapter(session, mockHost());
    fetchMock.mockResolvedValueOnce(okResponse({ path: '/backups/a.enc', bytes: 42 }));
    const result = await adapter.createBackup('a-long-enough-password');
    expect(result).toEqual({ path: '/backups/a.enc', bytes: 42 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      method: 'createBackup',
      params: { password: 'a-long-enough-password' },
    });
  });

  it('routes issuePairing/revokePairing/saveSettings to the Tauri host, never the sidecar fetch', async () => {
    const host = mockHost();
    (host.issuePairing as ReturnType<typeof vi.fn>).mockResolvedValue('pair-code-123');
    const adapter = new SidecarApplicationAdapter(session, host);

    const result = await adapter.issuePairing();
    expect(result).toBe('pair-code-123');
    expect(host.issuePairing).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    await adapter.revokePairing();
    expect(host.revokePairing).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    const settings = {
      assistantName: 'Echo',
      memoryMode: 'ask' as const,
      monthlyBudget: 10,
      offline: false,
    };
    await adapter.saveSettings(settings);
    expect(host.saveSettings).toHaveBeenCalledWith(settings);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still routes chat and remember through the sidecar fetch RPC when a host is wired in', async () => {
    const host = mockHost();
    const adapter = new SidecarApplicationAdapter(session, host);
    fetchMock.mockResolvedValueOnce(
      okResponse({ conversationId: 'c1', reply: 'hi', provenance: [] }),
    );
    await adapter.chat('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(okResponse({ id: 'm1', content: 'likes tea' }));
    await adapter.remember('likes tea');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.issuePairing).not.toHaveBeenCalled();
  });

  it('throws the server error message when the sidecar reports ok:false', async () => {
    const adapter = new SidecarApplicationAdapter(session, mockHost());
    fetchMock.mockResolvedValueOnce(errResponse('memory not found'));
    await expect(adapter.forget('missing')).rejects.toMatchObject({ message: 'memory not found' });
  });

  it('throws on a non-2xx HTTP response without leaking further detail', async () => {
    const adapter = new SidecarApplicationAdapter(session, mockHost());
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) } as Response);
    await expect(adapter.remember('x')).rejects.toMatchObject({
      message: expect.stringContaining('401'),
    });
  });

  it('never includes the token in a sidecar request body', async () => {
    const adapter = new SidecarApplicationAdapter(session, mockHost());
    fetchMock.mockResolvedValueOnce(okResponse({ id: 'm1', content: 'x' }));
    await adapter.remember('x');
    expect(fetchMock.mock.calls[0][1].body).not.toContain('test-token');
  });
});

describe('createApplicationAdapter sidecar selection', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.doUnmock('@tauri-apps/api/core');
    vi.unstubAllGlobals();
  });

  it('returns null (Tauri fallback) when sidecar_session is rejected (Rust command missing)', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn().mockRejectedValue(new Error('command sidecar_session not found')),
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { trySidecarAdapter } = await import('./application');
    const result = await trySidecarAdapter();
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolving adapter delegates to the Tauri command when the sidecar is unavailable', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn().mockRejectedValue(new Error('command sidecar_session not found')),
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { createApplicationAdapter: create } = await import('./application');
    const adapter = create();
    const { invoke } = await import('@tauri-apps/api/core');
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockImplementation((command: string) => {
      if (command === 'sidecar_session') return Promise.reject(new Error('missing'));
      if (command === 'app_snapshot') return Promise.resolve({ memories: [] });
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    const snapshot = await adapter.load();
    expect(snapshot).toEqual({ memories: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the Tauri adapter when the health probe fails', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn().mockResolvedValue({ baseUrl: 'http://127.0.0.1:43117', token: 't' }),
    }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const { trySidecarAdapter } = await import('./application');
    const result = await trySidecarAdapter();
    expect(result).toBeNull();
  });

  it('falls back to the Tauri adapter when invoke rejects (command not present yet)', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn().mockRejectedValue(new Error('no such command')),
    }));
    const { trySidecarAdapter } = await import('./application');
    const result = await trySidecarAdapter();
    expect(result).toBeNull();
  });

  it('selects the SidecarApplicationAdapter on the happy path', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn().mockResolvedValue({ baseUrl: 'http://127.0.0.1:43117', token: 't' }),
    }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const { trySidecarAdapter, SidecarApplicationAdapter: SidecarCtor } =
      await import('./application');
    const result = await trySidecarAdapter();
    expect(result).toBeInstanceOf(SidecarCtor);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:43117/app/v1/health',
      expect.objectContaining({ headers: { Authorization: 'Bearer t' } }),
    );
  });
});
