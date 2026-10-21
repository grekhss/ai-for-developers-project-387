import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpMeetingTypesApi } from './http.ts';

/**
 * jsdom не даёт своего Request — глобальным остаётся node'овский (undici), а он
 * требует абсолютный URL, тогда как браузер резолвит относительный от location.
 * Без шима каждый запрос с пустым baseUrl падал бы в `new Request('/api/…')`,
 * не дойдя до fetch (тот же шим и та же ловушка — в meetings/http.test.ts).
 * Шим добавляет только ту основу, которую в браузере даёт location.
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

describe('createHttpMeetingTypesApi', () => {
  beforeEach(() => {
    vi.stubGlobal('Request', BrowserRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('list ходит GET /api/meeting-types без параметров и парсит ответ', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(200, [{ id: '1', name: 'Консультация', description: '', active: true }]);
    });

    const types = await createHttpMeetingTypesApi().list();

    expect(captured?.method).toBe('GET');
    // Роли на клиенте нет: query не формируется вовсе, содержимое решает сервер.
    expect(captured?.url).toBe(`${TEST_ORIGIN}/api/meeting-types`);
    expect(types).toEqual([{ id: '1', name: 'Консультация', description: '', active: true }]);
  });

  it('baseUrl подставляется перед путём', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(200, []);
    });

    await createHttpMeetingTypesApi('http://api.test').list();

    expect(captured?.url).toBe('http://api.test/api/meeting-types');
  });

  it('create уходит POST с Content-Type: application/json и JSON-телом', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(201, { id: '2', name: 'Собеседование', description: '', active: true });
    });

    const created = await createHttpMeetingTypesApi().create({
      name: 'Собеседование',
      description: '',
    });

    // Регрессия: без заголовка каждый POST вернул бы 400 от express.json().
    expect(captured?.method).toBe('POST');
    expect(captured?.headers.get('Content-Type')).toBe('application/json');
    expect(await captured?.text()).toBe(JSON.stringify({ name: 'Собеседование', description: '' }));
    expect(created).toEqual({ id: '2', name: 'Собеседование', description: '', active: true });
  });

  it('deactivate уходит POST /api/meeting-types/{id}/deactivate и парсит ответ', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(200, { id: '7', name: 'Разбор', description: '', active: false });
    });

    const deactivated = await createHttpMeetingTypesApi().deactivate('7');

    expect(captured?.method).toBe('POST');
    expect(captured?.url).toBe(`${TEST_ORIGIN}/api/meeting-types/7/deactivate`);
    expect(deactivated).toEqual({ id: '7', name: 'Разбор', description: '', active: false });
  });

  it('клиент шлёт credentials: include — без них cookie-сессия не уйдёт (D3)', async () => {
    let captured: Request | undefined;
    stubFetch(async (input) => {
      captured = input as Request;
      return jsonResponse(200, []);
    });

    await createHttpMeetingTypesApi().list();

    expect(captured?.credentials).toBe('include');
  });

  it('create бросает при 400 и 403 (не админ) с прежним русским текстом', async () => {
    const api = createHttpMeetingTypesApi();

    for (const status of [400, 403]) {
      stubFetch(async () => jsonResponse(status, { error: 'недостаточно прав' }));

      // Сообщение, а не просто «бросает»: иначе тест проходит и на
      // постороннем исключении (ловушка, оплаченная в meetings/http.test.ts).
      await expect(api.create({ name: 'Разбор', description: '' })).rejects.toThrow(
        `POST /api/meeting-types вернул ${status}`,
      );
    }
  });

  it('deactivate бросает при 400 неизвестного id', async () => {
    stubFetch(async () => jsonResponse(400, { error: 'тип встречи не найден' }));

    await expect(createHttpMeetingTypesApi().deactivate('999')).rejects.toThrow(
      'POST /api/meeting-types/999/deactivate вернул 400',
    );
  });

  it('list бросает когда fetch сам упал (ошибка сети)', async () => {
    stubFetch(async () => {
      throw new TypeError('network error');
    });

    await expect(createHttpMeetingTypesApi().list()).rejects.toThrow('network error');
  });
});
