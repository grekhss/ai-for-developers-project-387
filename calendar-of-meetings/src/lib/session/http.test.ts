import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpSessionApi } from './http.ts';

/**
 * jsdom не даёт своего Request — глобальным остаётся node'овский (undici), а он
 * требует абсолютный URL, тогда как браузер резолвит относительный от location.
 * Без шима каждый запрос с пустым baseUrl падал бы в `new Request('/api/…')`,
 * не дойдя до fetch (та же ловушка и тот же шим — в meetings/http.test.ts).
 */
const TEST_ORIGIN = 'http://localhost';
const RealRequest = globalThis.Request;

class BrowserRequest extends RealRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(
      typeof input === 'string' && input.startsWith('/') ? `${TEST_ORIGIN}${input}` : input,
      init,
    );
  }
}

function stubFetch(handler: (input: RequestInfo | URL) => Promise<Response>) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Ответ сервера с JSON-телом: ровно то, что умеет читать клиент SDK. */
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createHttpSessionApi', () => {
  beforeEach(() => {
    vi.stubGlobal('Request', BrowserRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('login уходит POST /api/login с JSON-телом и парсит сессию', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(200, { role: 'guest', bookerName: 'Аня' });
    });

    const session = await createHttpSessionApi().login({ password: 'g', bookerName: 'Аня' });

    expect(captured?.method).toBe('POST');
    expect(captured?.url).toBe(`${TEST_ORIGIN}/api/login`);
    expect(captured?.headers.get('Content-Type')).toBe('application/json');
    expect(await captured?.text()).toBe(JSON.stringify({ password: 'g', bookerName: 'Аня' }));
    expect(session).toEqual({ role: 'guest', bookerName: 'Аня' });
  });

  it('login 401 (неверный пароль) бросает с прежним русским текстом', async () => {
    stubFetch(async () => jsonResponse(401, { error: 'неверный пароль' }));

    // Сообщение, а не просто «бросает»: иначе тест проходит и на постороннем
    // исключении (ловушка, оплаченная в meetings/http.test.ts).
    await expect(createHttpSessionApi().login({ password: 'x' })).rejects.toThrow(
      'POST /api/login вернул 401',
    );
  });

  it('login 400 (гость без bookerName) бросает', async () => {
    stubFetch(async () => jsonResponse(400, { error: 'bookerName обязателен' }));

    await expect(createHttpSessionApi().login({ password: 'x' })).rejects.toThrow(
      'POST /api/login вернул 400',
    );
  });

  it('logout уходит POST /api/logout', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return new Response(null, { status: 200 });
    });

    await createHttpSessionApi().logout();

    expect(captured?.method).toBe('POST');
    expect(captured?.url).toBe(`${TEST_ORIGIN}/api/logout`);
  });

  it('logout 401 (без активной сессии) бросает', async () => {
    stubFetch(async () => jsonResponse(401, { error: 'нет сессии' }));

    await expect(createHttpSessionApi().logout()).rejects.toThrow(
      'POST /api/logout вернул 401',
    );
  });

  it('me уходит GET /api/me и парсит сессию', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(200, { role: 'admin', bookerName: null });
    });

    const session = await createHttpSessionApi().me();

    expect(captured?.method).toBe('GET');
    expect(captured?.url).toBe(`${TEST_ORIGIN}/api/me`);
    expect(session).toEqual({ role: 'admin', bookerName: null });
  });

  it('me при 401 отдаёт null — сессии нет, это не сбой (C9)', async () => {
    stubFetch(async () => jsonResponse(401, { error: 'нет сессии' }));

    expect(await createHttpSessionApi().me()).toBeNull();
  });

  it('me при прочей ошибке бросает — 500 не спрятать под «нет сессии»', async () => {
    stubFetch(async () => jsonResponse(500, { error: 'внутренняя ошибка' }));

    await expect(createHttpSessionApi().me()).rejects.toThrow('GET /api/me вернул 500');
  });

  it('клиент шлёт credentials: include на login, logout и me — без них cookie-сессия не уйдёт (D3)', async () => {
    const captured: Request[] = [];
    stubFetch(async (input) => {
      captured.push(input as Request);
      return jsonResponse(200, { role: 'admin', bookerName: null });
    });

    const api = createHttpSessionApi();
    await api.login({ password: 'p' });
    await api.logout();
    await api.me();

    // Клиент один на все три вызова, поэтому без credentials ни вход (не
    // получит cookie), ни выход (не отдаст её), ни восстановление сессии
    // (cookie не уйдёт) не сработают (D3).
    expect(captured.map((request) => request.credentials)).toEqual([
      'include',
      'include',
      'include',
    ]);
  });

  it('me бросает, когда fetch сам упал (ошибка сети)', async () => {
    stubFetch(async () => {
      throw new TypeError('network error');
    });

    await expect(createHttpSessionApi().me()).rejects.toThrow('network error');
  });
});
