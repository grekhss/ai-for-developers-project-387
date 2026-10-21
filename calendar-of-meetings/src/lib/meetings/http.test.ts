import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpMeetingsApi } from './http.ts';

/**
 * jsdom не даёт своего Request — глобальным остаётся node'овский (undici), а он
 * требует абсолютный URL, тогда как браузер резолвит относительный от location.
 * Без шима каждый запрос с пустым baseUrl падал бы в `new Request('/api/…')`,
 * не дойдя до fetch. Шим добавляет только ту основу, которую в браузере даёт
 * location: поведение тестируемого кода он не меняет.
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

describe('createHttpMeetingsApi', () => {
  beforeEach(() => {
    vi.stubGlobal('Request', BrowserRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('list ходит GET /api/meetings с query из DateRange и парсит ответ', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(200, [{ id: '1', date: '2026-01-01', time: '09:00' }]);
    });

    const meetings = await createHttpMeetingsApi().list({ from: '2026-01-01', to: '2026-12-31' });

    // baseUrl по умолчанию пуст, поэтому путь уходит относительным (шнурует шим)
    expect(captured?.url).toBe(`${TEST_ORIGIN}/api/meetings?from=2026-01-01&to=2026-12-31`);
    expect(meetings).toEqual([{ id: '1', date: '2026-01-01', time: '09:00' }]);
  });

  it('baseUrl подставляется перед путём', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(200, []);
    });

    await createHttpMeetingsApi('http://api.test').list({ from: '2026-01-01', to: '2026-01-02' });

    expect(captured?.url).toBe('http://api.test/api/meetings?from=2026-01-01&to=2026-01-02');
  });

  it('create уходит POST с Content-Type: application/json и JSON-телом', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(201, { id: '2', date: '2026-01-02', time: '10:00' });
    });

    const meeting = await createHttpMeetingsApi().create({ date: '2026-01-02', time: '10:00' });

    // Регрессия: без заголовка каждый POST вернул бы 400 от express.json().
    expect(captured?.method).toBe('POST');
    expect(captured?.headers.get('Content-Type')).toBe('application/json');
    expect(await captured?.text()).toBe(JSON.stringify({ date: '2026-01-02', time: '10:00' }));
    expect(meeting).toEqual({ id: '2', date: '2026-01-02', time: '10:00' });
  });

  it('create несёт meeting_type_id в теле — тип долетает до сервера (S5)', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(201, { id: '3', date: '2026-01-02', time: '10:00' });
    });

    await createHttpMeetingsApi().create({
      date: '2026-01-02',
      time: '10:00',
      meeting_type_id: '7',
    });

    expect(await captured?.text()).toBe(
      JSON.stringify({ date: '2026-01-02', time: '10:00', meeting_type_id: '7' })
    );
  });

  it('клиент шлёт credentials: include на list и create — без них cookie-сессия не уйдёт (D3)', async () => {
    const captured: Request[] = [];
    stubFetch(async (input) => {
      const request = input as Request;
      captured.push(request);
      // Форма ответа зависит от метода: список — массив, создание — Meeting.
      return request.method === 'POST'
        ? jsonResponse(201, { id: '1', date: '2026-01-02', time: '10:00' })
        : jsonResponse(200, []);
    });

    const api = createHttpMeetingsApi();
    await api.list({ from: '2026-01-01', to: '2026-01-02' });
    await api.create({ date: '2026-01-02', time: '10:00', meeting_type_id: '7' });

    expect(captured.map((request) => request.credentials)).toEqual(['include', 'include']);
  });

  it('create бросает при 400 и 409 (дубль слота) с прежним русским текстом', async () => {
    const api = createHttpMeetingsApi();

    for (const status of [400, 409]) {
      stubFetch(async () => jsonResponse(status, { error: 'нет свободного слота' }));

      // Сообщение, а не просто «бросает»: иначе тест проходит и на постороннем
      // исключении — так и было поймано, пока URL не чинился.
      await expect(api.create({ date: '2026-01-02', time: '10:00' })).rejects.toThrow(
        `POST /api/meetings вернул ${status}`,
      );
    }
  });

  it('list бросает когда fetch сам упал (ошибка сети)', async () => {
    stubFetch(async () => {
      throw new TypeError('network error');
    });

    const api = createHttpMeetingsApi();
    await expect(api.list({ from: '2026-01-01', to: '2026-01-02' })).rejects.toThrow('network error');
  });
});
