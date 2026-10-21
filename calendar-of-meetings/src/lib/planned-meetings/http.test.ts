import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpPlannedMeetingsApi } from './http.ts';

/**
 * jsdom не даёт своего Request — глобальным остаётся node'овский (undici), а он
 * требует абсолютный URL, тогда как браузер резолвит относительный от location.
 * Без шима каждый запрос с пустым baseUrl падал бы в `new Request('/api/…')`,
 * не дойдя до fetch (тот же шим и та же ловушка — в meeting-types/http.test.ts).
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

describe('createHttpPlannedMeetingsApi', () => {
  beforeEach(() => {
    vi.stubGlobal('Request', BrowserRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('list ходит GET /api/admin/meetings без параметров и парсит join-DTO', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(200, [
        { date: '2026-10-20', time: '09:00', type: 'Консультация', booker: 'Иван' },
        { date: '2026-10-21', time: '10:00', type: null, booker: null },
      ]);
    });

    const meetings = await createHttpPlannedMeetingsApi().list();

    expect(captured?.method).toBe('GET');
    // Границу «сегодня» клиент не передаёт: решает сервер (S4/Q6).
    expect(captured?.url).toBe(`${TEST_ORIGIN}/api/admin/meetings`);
    // null'ы легаси доезжают как есть, а не схлопываются в пустую строку.
    expect(meetings).toEqual([
      { date: '2026-10-20', time: '09:00', type: 'Консультация', booker: 'Иван' },
      { date: '2026-10-21', time: '10:00', type: null, booker: null },
    ]);
  });

  it('baseUrl подставляется перед путём', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(200, []);
    });

    await createHttpPlannedMeetingsApi('http://api.test').list();

    expect(captured?.url).toBe('http://api.test/api/admin/meetings');
  });

  it('клиент шлёт credentials: include — без них cookie-сессия не уйдёт (D3)', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(200, []);
    });

    await createHttpPlannedMeetingsApi().list();

    expect(captured?.credentials).toBe('include');
  });

  it('list бросает при 403 (не админ) с прежним русским текстом', async () => {
    stubFetch(async () => jsonResponse(403, { error: 'недостаточно прав' }));

    // Сообщение, а не просто «бросает»: иначе тест проходит и на постороннем
    // исключении (ловушка, оплаченная в meetings/http.test.ts).
    await expect(createHttpPlannedMeetingsApi().list()).rejects.toThrow(
      'GET /api/admin/meetings вернул 403',
    );
  });

  it('list бросает когда fetch сам упал (ошибка сети)', async () => {
    stubFetch(async () => {
      throw new TypeError('network error');
    });

    await expect(createHttpPlannedMeetingsApi().list()).rejects.toThrow('network error');
  });
});
