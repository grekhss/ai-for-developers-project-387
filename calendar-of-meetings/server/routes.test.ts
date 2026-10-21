// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type Database from 'better-sqlite3';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { createMeetingTypesRepository } from './meeting-types-repository.js';
import { createRepository } from './repository.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import { requireRole, requireSession, SESSION_COOKIE, sessionCookieOptions } from './session.js';

// Known credentials для интеграционных тестов: createApp принимает их явно,
// окружение не трогаем (D1: тесты инжектируют через AppOptions).
const AUTH = {
  adminPassword: 'admin-secret',
  guestPassword: 'guest-secret',
  sessionSecret: 'sign-me',
} as const;

function repos() {
  const db = createDatabase(':memory:');
  return {
    db,
    meetings: createRepository(db),
    meetingTypes: createMeetingTypesRepository(db),
  };
}

// Интеграция собирается как в проде: createApp(createRepository(':memory:')).
// Через index.ts не ходим — он биндит порт и открывает файловую БД.
// Все /api за requireSession, поэтому сразу логинимся админом и отдаём cookie.
async function createTestApp(): Promise<{
  baseUrl: string;
  adminCookie: string;
  /** Той же БД владеет приложение: S5 читает колонки meetings напрямую. */
  db: Database.Database;
}> {
  const repositorySet = repos();
  const app = createApp(repositorySet, { ...AUTH });
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const login = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: AUTH.adminPassword }),
  });
  if (login.status !== 200) throw new Error('setup: админ-логин не прошёл');
  const [setCookie] = login.headers.getSetCookie();
  const adminCookie = setCookie.split(';')[0];

  return { baseUrl, adminCookie, db: repositorySet.db };
}

const servers: Server[] = [];

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

function postMeeting(
  baseUrl: string,
  cookie: string,
  body: unknown,
  headers?: Record<string, string>,
) {
  return fetch(`${baseUrl}/api/meetings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
    body: JSON.stringify(body),
  });
}

/** GET-запрос meetings уже с админ-сессией. */
function getMeetings(baseUrl: string, adminCookie: string, query = '?from=2026-01-01&to=2026-12-31') {
  return fetch(`${baseUrl}/api/meetings${query}`, { headers: { Cookie: adminCookie } });
}

/**
 * Гостевая cookie. Записи создаёт только гость — в его сессии есть имя,
 * у админа bookerName null и POST /api/meetings отвечает 400 (Q12c, S5).
 */
async function loginAsGuest(baseUrl: string, bookerName = 'Иван'): Promise<string> {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: AUTH.guestPassword, bookerName }),
  });
  if (response.status !== 200) throw new Error('setup: гостевой логин не прошёл');
  const [setCookie] = response.headers.getSetCookie();
  return setCookie.split(';')[0];
}

/**
 * 'YYYY-MM-DD' в локальной зоне, сдвинутый на offsetDays. Рекомпозиция «сегодня»
 * независимо от server/date.ts (T3): тест сдвигает границу сам, а не читает
 * готовое значение проверяемого кода.
 */
function localDate(offsetDays: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** POST /api/meeting-types: cookie опциональна — так проверяется 401 без сессии. */
function postType(
  baseUrl: string,
  cookie: string | undefined,
  body: unknown,
  path = '/api/meeting-types',
) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    body: JSON.stringify(body),
  });
}

describe('createApp: валидация auth-конфига', () => {
  const valid = { adminPassword: 'admin-secret', guestPassword: 'guest-secret', sessionSecret: 'sign-me' };

  it('падает, когда пароли совпадают — роль не определить', () => {
    expect(() => createApp(repos(), { ...valid, guestPassword: valid.adminPassword })).toThrow(/не должны совпадать/);
  });

  it('падает на пустом или «пробельном» пароле/секрете', () => {
    for (const key of ['adminPassword', 'guestPassword', 'sessionSecret'] as const) {
      for (const value of ['', '   ']) {
        expect(() => createApp(repos(), { ...valid, [key]: value })).toThrow(/обязательны/);
      }
      expect(() => createApp(repos(), { ...valid, [key]: undefined })).toThrow(/обязательны/);
    }
  });
});

describe('routes /api/auth', () => {
  function login(baseUrl: string, body: unknown) {
    return fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('POST /api/login верным админ-паролем выдаёт сессию admin', async () => {
    const { baseUrl } = await createTestApp();
    const response = await login(baseUrl, { password: AUTH.adminPassword });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: 'admin', bookerName: null });

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    // Подпись: cookie-parser несёт значение вида s:<payload>.<signature>.
    expect(setCookie).toMatch(/session=s%3A/);
  });

  it('POST /api/login гостевым паролем требует bookerName и обрезает пробелы', async () => {
    const { baseUrl } = await createTestApp();
    const response = await login(baseUrl, { password: AUTH.guestPassword, bookerName: '  Иван  ' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: 'guest', bookerName: 'Иван' });
  });

  it('POST /api/login гостем без или с пустым bookerName отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    for (const body of [
      { password: AUTH.guestPassword },
      { password: AUTH.guestPassword, bookerName: '' },
      { password: AUTH.guestPassword, bookerName: '   ' },
    ]) {
      expect((await login(baseUrl, body)).status, `тело ${JSON.stringify(body)}`).toBe(400);
    }
  });

  it('POST /api/login отклоняет тело, не проходящее формат пароля', async () => {
    const { baseUrl } = await createTestApp();
    // Отдельно от «неверного пароля» (401): это отказ ФОРМАТА, а не аутентикации.
    // '   ' ловит регресс на @pattern("\\S") — раньше сервер резал trim() вручную,
    // и правило могло уехать из схемы, оставшись только в routes.ts.
    for (const body of [
      { password: '   ' },
      { password: 123 },
      { password: AUTH.adminPassword, bookerName: 42 },
    ]) {
      const response = await login(baseUrl, body as never);
      expect(response.status, `тело ${JSON.stringify(body)}`).toBe(400);
      expect(await response.json()).toEqual({
        error: 'password обязателен, bookerName — непустая строка',
      });
    }
  });

  it('POST /api/login неверным паролем отвечает 401 без cookie', async () => {
    const { baseUrl } = await createTestApp();
    const response = await login(baseUrl, { password: 'nope', bookerName: 'Иван' });
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('GET /api/me отдаёт роль по сессии и 401 без неё', async () => {
    const { baseUrl, adminCookie } = await createTestApp();

    const me = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: adminCookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ role: 'admin', bookerName: null });

    expect((await fetch(`${baseUrl}/api/me`)).status).toBe(401);
  });

  it('POST /api/logout очищает cookie теми же опциями, а следующий запрос — 401 (T8/Q13)', async () => {
    const { baseUrl, adminCookie } = await createTestApp();

    const logout = await fetch(`${baseUrl}/api/logout`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    expect(logout.status).toBe(204);

    const cleared = logout.headers.get('set-cookie') ?? '';
    // Симметрия опций (Q13): clearCookie обязан нести те же Path/HttpOnly/
    // SameSite, что и выдача (в тестах cookie без Secure), — иначе браузер не
    // найдёт cookie по ключу и не удалит её.
    for (const attribute of ['Path=/', 'HttpOnly', 'SameSite=Lax']) {
      expect(cleared, `очистка должна нести ${attribute}`).toContain(attribute);
    }
    // Пустое значение и Expires в прошлом и БЕЗ Max-Age: иначе браузер продлил
    // бы жизнь уже очищенной cookie (Express в clearCookie сам снимает maxAge).
    expect(cleared).toContain('session=;');
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(cleared).not.toContain('Max-Age');

    // Подписанную cookie сервер отозвать не может (Q13), поэтому «после выхода»
    // — это браузер, выбросивший очищенную cookie: следующий запрос уходит с
    // пустым `session=`. Он обязан отвергаться так же, как отсутствие cookie.
    for (const cookie of [undefined, 'session=']) {
      const response = await fetch(
        `${baseUrl}/api/me`,
        cookie === undefined ? undefined : { headers: { Cookie: cookie } },
      );
      expect(response.status, `cookie: ${cookie}`).toBe(401);
    }
  });
});

describe('routes: дев-обход авторизации (AUTH_DISABLED)', () => {
  // createApp с authDisabled: пароли и SESSION_SECRET не заданы вовсе — их
  // отсутствие в этом режиме допустимо (assertValidAuth пропускается). Роль
  // приходит из URL: cookie dev_role=admin заводит в админские ручки, иначе гость.
  async function createDevApp(): Promise<{ baseUrl: string }> {
    const app = createApp(repos(), {
      adminPassword: '',
      guestPassword: '',
      sessionSecret: '',
      authDisabled: true,
    });
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    return { baseUrl: `http://127.0.0.1:${port}` };
  }

  it('без cookie и без пароля отдаёт гостевую сессию и разрешает запись (вход не нужен)', async () => {
    const { baseUrl } = await createDevApp();

    // Ни логина, ни cookie — тем не менее 200, а не 401: гейт подставляет сессию.
    const me = await fetch(`${baseUrl}/api/me`);
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ role: 'guest', bookerName: 'Гость' });

    // Гость записывается без входа — booker берётся из подставленной сессии.
    const response = await fetch(`${baseUrl}/api/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-03-02', time: '09:00' }),
    });
    expect(response.status).toBe(201);
  });

  it('cookie dev_role=admin открывает админские ручки, гостевая — нет (403)', async () => {
    const { baseUrl } = await createDevApp();
    const admin = 'dev_role=admin';

    expect((await fetch(`${baseUrl}/api/admin/meetings`, { headers: { Cookie: admin } })).status).toBe(200);

    const created = await postType(baseUrl, admin, { name: 'Консультация', description: '' });
    expect(created.status).toBe(201);
    await postType(baseUrl, admin, {}, '/api/meeting-types/1/deactivate');
    // Роль действительно admin, а не «гость с доступом»: виден и неактивный тип,
    // гостю его не показывают (listAll против listActive).
    const all = await fetch(`${baseUrl}/api/meeting-types`, { headers: { Cookie: admin } });
    expect(await all.json()).toEqual([
      { id: '1', name: 'Консультация', description: '', active: false },
    ]);

    expect(
      (await fetch(`${baseUrl}/api/admin/meetings`, { headers: { Cookie: 'dev_role=guest' } })).status,
    ).toBe(403);
  });

  it('POST /api/login в обходе не сверяет пароль и берёт роль из URL', async () => {
    const { baseUrl } = await createDevApp();
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'dev_role=admin' },
      body: JSON.stringify({ password: 'что угодно' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: 'admin', bookerName: null });
  });
});

describe('requireRole: ролевой гейт (изолированный probe; на роутах — S3/S4)', () => {
  // Probe-приложение: один роут за requireSession + requireRole('admin') — так
  // middleware проверяется отдельно от логики конкретных роутов; интеграционные
  // проверки гейта на реальных ручках живут в describe о /api/meeting-types (S3).
  async function createProbe(): Promise<{ baseUrl: string }> {
    const app = express();
    app.use(express.json());
    app.use(cookieParser(AUTH.sessionSecret));
    const router = express.Router();
    router.post('/api/login', (req, res) => {
      const password = (req.body as { password?: string }).password;
      const session =
        password === AUTH.adminPassword
          ? { role: 'admin', bookerName: null }
          : { role: 'guest', bookerName: 'Иван' };
      res.cookie(SESSION_COOKIE, JSON.stringify(session), sessionCookieOptions());
      res.json(session);
    });
    router.get('/api/admin-only', requireSession, requireRole('admin'), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(router);

    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    return { baseUrl: `http://127.0.0.1:${port}` };
  }

  async function probeLogin(baseUrl: string, password: string): Promise<string> {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const [setCookie] = response.headers.getSetCookie();
    return setCookie.split(';')[0];
  }

  it('пропускает админа, отклоняет гостя (403) и без сессии (401)', async () => {
    const { baseUrl } = await createProbe();

    const admin = await probeLogin(baseUrl, AUTH.adminPassword);
    expect((await fetch(`${baseUrl}/api/admin-only`, { headers: { Cookie: admin } })).status).toBe(200);

    const guest = await probeLogin(baseUrl, AUTH.guestPassword);
    expect((await fetch(`${baseUrl}/api/admin-only`, { headers: { Cookie: guest } })).status).toBe(403);

    expect((await fetch(`${baseUrl}/api/admin-only`)).status).toBe(401);
  });
});

describe('routes /api/meeting-types (за requireSession, S3)', () => {
  function getTypes(baseUrl: string, cookie?: string) {
    return fetch(`${baseUrl}/api/meeting-types`, {
      headers: cookie === undefined ? undefined : { Cookie: cookie },
    });
  }

  it('все три ручки без сессии отвечают 401', async () => {
    const { baseUrl } = await createTestApp();

    expect((await getTypes(baseUrl)).status).toBe(401);
    expect((await postType(baseUrl, undefined, { name: 'X', description: '' })).status).toBe(401);
    // requireSession стоит до requireRole: без сессии — 401, а не 403.
    expect((await postType(baseUrl, undefined, {}, '/api/meeting-types/1/deactivate')).status).toBe(401);
  });

  it('список без типов — пустой массив, а не объект-обёртка', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const response = await getTypes(baseUrl, adminCookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('админ видит все типы, гость — только активные', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });
    await postType(baseUrl, adminCookie, { name: 'Собеседование', description: '' });
    await postType(baseUrl, adminCookie, {}, '/api/meeting-types/1/deactivate');

    const adminResponse = await getTypes(baseUrl, adminCookie);
    expect(await adminResponse.json()).toEqual([
      { id: '1', name: 'Консультация', description: '', active: false },
      { id: '2', name: 'Собеседование', description: '', active: true },
    ]);

    // Гость: деактивированный тип не попадает в список (Q7).
    const guest = await getTypes(baseUrl, await loginAsGuest(baseUrl));
    expect(await guest.json()).toEqual([
      { id: '2', name: 'Собеседование', description: '', active: true },
    ]);
  });

  it('POST админом создаёт активный тип и обрезает имя', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const response = await postType(baseUrl, adminCookie, {
      name: '  Консультация  ',
      description: '30 минут',
    });

    expect(response.status).toBe(201);
    // Имя обрезано — как bookerName при логине; новый тип всегда активен.
    expect(await response.json()).toEqual({
      id: '1',
      name: 'Консультация',
      description: '30 минут',
      active: true,
    });
  });

  it('POST гостем отвечает 403', async () => {
    const { baseUrl } = await createTestApp();
    const response = await postType(baseUrl, await loginAsGuest(baseUrl), {
      name: 'Консультация',
      description: '',
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'недостаточно прав' });
  });

  it('POST невалидного тела отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const invalidBodies = [
      {},
      { name: 'Консультация' }, // нет description — он обязателен в контракте
      { description: '' }, // нет name
      { name: '', description: '' }, // пустое имя (@minLength)
      { name: '   ', description: '' }, // одно пробельное имя — @pattern("\\S") в main.tsp
      { name: 42, description: '' },
      { name: 'Консультация', description: null },
      // Случай не-объекта (голая JSON-строка и т.п.) не включён: strict-режим
      // express.json отклоняет его ещё на парсинге (400 от body-parser, HTML) —
      // этот путь уже покрыт в meetings-тесте.
    ];

    for (const body of invalidBodies) {
      const response = await postType(baseUrl, adminCookie, body);
      expect(response.status, `тело ${JSON.stringify(body)}`).toBe(400);
      expect(await response.json(), `тело ${JSON.stringify(body)}`).toEqual({
        error: 'name обязателен (непустая строка), description — строка',
      });
    }
  });

  it('деактивация админом: 200 с active: false, повтор идемпотентен', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });

    const first = await postType(baseUrl, adminCookie, {}, '/api/meeting-types/1/deactivate');
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      id: '1',
      name: 'Консультация',
      description: '',
      active: false,
    });

    // В контракте нет ни 404, ни 409: повторная деактивация — 200, состояние прежнее (Q7).
    const second = await postType(baseUrl, adminCookie, {}, '/api/meeting-types/1/deactivate');
    expect(second.status).toBe(200);
    const repeated = (await second.json()) as { active: boolean };
    expect(repeated.active).toBe(false);
  });

  it('деактивация гостем отвечает 403', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });

    const response = await postType(
      baseUrl,
      await loginAsGuest(baseUrl),
      {},
      '/api/meeting-types/1/deactivate',
    );
    expect(response.status).toBe(403);
  });

  it('деактивация неизвестного или нечислового id отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });

    for (const id of ['999', 'abc']) {
      const response = await postType(baseUrl, adminCookie, {}, `/api/meeting-types/${id}/deactivate`);
      expect(response.status, `id ${id}`).toBe(400);
      expect(await response.json(), `id ${id}`).toEqual({ error: 'тип встречи не найден' });
    }
    // Существующий тип при этом не тронут.
    const types = await getTypes(baseUrl, adminCookie);
    expect(((await types.json()) as Array<{ active: boolean }>)[0]?.active).toBe(true);
  });
});

describe('routes /api/meetings (за requireSession)', () => {
  it('без сессии отвечает 401', async () => {
    const { baseUrl } = await createTestApp();
    const response = await fetch(`${baseUrl}/api/meetings?from=2026-01-01&to=2026-12-31`);
    expect(response.status).toBe(401);
  });

  it('с подделанной cookie отвечает 401', async () => {
    const { baseUrl } = await createTestApp();
    // Меняем подпись, оставляя правдоподобный payload: cookie-parser при
    // несовпадении сигнатуры отдаёт signedCookies=false, а не строку.
    const forged = `session=s%3A${Buffer.from(JSON.stringify({ role: 'admin', bookerName: null })).toString('base64url')}.deadbeef`;
    const response = await fetch(`${baseUrl}/api/meetings?from=2026-01-01&to=2026-12-31`, {
      headers: { Cookie: forged },
    });
    expect(response.status).toBe(401);
  });

  it('невалидная cookie без подписи, пустая и мусорная отвечают 401 (T2)', async () => {
    const { baseUrl } = await createTestApp();
    // Отдельно от подделки подписи (выше). Ключевой случай — cookie БЕЗ подписи:
    // обычный JSON с role: admin. Сервер обязан читать только signedCookies, а
    // не req.cookies, иначе незаверенная роль прошла бы (T2). Пустое значение —
    // то, что остаётся в браузере после logout; мусор — не-JSON.
    const unsigned = encodeURIComponent(JSON.stringify({ role: 'admin', bookerName: null }));
    for (const cookie of [`session=${unsigned}`, 'session=', 'session=garbage']) {
      const response = await fetch(`${baseUrl}/api/meetings?from=2026-01-01&to=2026-12-31`, {
        headers: { Cookie: cookie },
      });
      expect(response.status, `cookie: ${cookie}`).toBe(401);
    }
  });

  it('GET возвращает пустой список', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const response = await getMeetings(baseUrl, adminCookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('POST принимает JSON и отвечает 201 с id строкой', async () => {
    const { baseUrl } = await createTestApp();
    const guest = await loginAsGuest(baseUrl);
    // Без meeting_type_id запись остаётся «нетипизированной» — как легаси-строки
    // (C5): поле в контракте опционально, обязательным его делает гостевой флоу.
    const response = await postMeeting(baseUrl, guest, { date: '2026-03-02', time: '09:00' });
    expect(response.status).toBe(201);
    const meeting = (await response.json()) as Record<string, unknown>;
    // Ровно поля контрактной Meeting: booker и meeting_type_id не эхом возвращаются.
    expect(meeting).toEqual({ id: '1', date: '2026-03-02', time: '09:00' });
    expect(typeof meeting.id).toBe('string');
  });

  it('POST дубля слота отвечает 409', async () => {
    const { baseUrl } = await createTestApp();
    const guest = await loginAsGuest(baseUrl);
    const body = { date: '2026-03-02', time: '09:00' };

    expect((await postMeeting(baseUrl, guest, body)).status).toBe(201);
    // Второй POST того же слота отклоняется сервером, а не UI; UNIQUE(date, time)
    // в базе остаётся последним рубежом, когда предварительные проверки пройдены.
    expect((await postMeeting(baseUrl, guest, body)).status).toBe(409);
  });

  it('POST без Content-Type: application/json отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    const guest = await loginAsGuest(baseUrl);
    // express.json() не парсит text/plain: req.body в Express 5 остаётся
    // undefined. Без заголовка каждый POST вернул бы 400.
    const response = await postMeeting(
      baseUrl,
      guest,
      { date: '2026-03-02', time: '09:00' },
      { 'Content-Type': 'text/plain' },
    );
    expect(response.status).toBe(400);
  });

  it('POST невалидного тела отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    const guest = await loginAsGuest(baseUrl);
    const invalidBodies = [
      {},
      { date: '2026-03-02' },
      { date: '2026-03-02', time: '9:00' },
      { date: '02.03.2026', time: '09:00' },
      { date: '2026-03-02', time: '24:00' },
      { date: null, time: '09:00' },
      { date: 20260302, time: '09:00' },
      // meeting_type_id, если передан, — строка-идентификатор; null и число
      // отклоняет схема (отсутствие поля, наоборот, допустимо — см. выше).
      { date: '2026-03-02', time: '09:00', meeting_type_id: null },
      { date: '2026-03-02', time: '09:00', meeting_type_id: 42 },
      'not an object',
    ];

    for (const body of invalidBodies) {
      // `message` в expect — это контекст провала: без него Vitest не скажет,
      // какое из тел не получил 400, и в цикле из семи это квест на угадывание.
      expect((await postMeeting(baseUrl, guest, body)).status, `тело ${JSON.stringify(body)}`).toBe(400);
    }
  });

  it('POST берёт booker из сессии: поле booker в теле игнорируется (Q4/C10)', async () => {
    const { baseUrl, db } = await createTestApp();
    const guest = await loginAsGuest(baseUrl);

    const response = await postMeeting(baseUrl, guest, {
      date: '2026-03-02',
      time: '10:00',
      booker: 'Злоумышленник',
    });
    expect(response.status).toBe(201);
    // Ответ — только поля контрактной Meeting: тело booker не возвращается эхом.
    expect(await response.json()).toEqual({ id: '1', date: '2026-03-02', time: '10:00' });

    // Наблюдаемое — колонка: имя взято из подписанной cookie, а не из тела.
    const row = db.prepare('SELECT booker FROM meetings').get() as { booker: string };
    expect(row.booker).toBe('Иван');
  });

  it('POST админом без имени в сессии отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    // У админа bookerName null, а booker обязателен для записи (Q12c: админ
    // наблюдает, но не записывается) — в контракте нет 403, поэтому это 400.
    const response = await postMeeting(baseUrl, adminCookie, {
      date: '2026-03-02',
      time: '09:00',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'имя записавшегося обязательно' });
  });

  it('POST с именем из сессии длиннее 100 символов отвечает 400, ровно 100 — проходит', async () => {
    const { baseUrl } = await createTestApp();
    // Граница MAX_BOOKER_LENGTH в routes.ts: 100 включительно, 101 уже нет —
    // пара на границе ловит и сдвиг границы (100→101), и замену > на >=.
    const tooLong = await loginAsGuest(baseUrl, 'И'.repeat(101));
    const rejected = await postMeeting(baseUrl, tooLong, {
      date: '2026-03-02',
      time: '09:00',
    });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({
      error: 'имя записавшегося длиннее 100 символов',
    });

    const exactly100 = await loginAsGuest(baseUrl, 'И'.repeat(100));
    expect(
      (await postMeeting(baseUrl, exactly100, { date: '2026-03-03', time: '09:00' })).status,
    ).toBe(201);
  });

  it('POST с неизвестным или деактивированным meeting_type_id отвечает 400 (C1)', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const guest = await loginAsGuest(baseUrl);
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });
    await postType(baseUrl, adminCookie, { name: 'Собеседование', description: '' });
    await postType(baseUrl, adminCookie, {}, '/api/meeting-types/2/deactivate');

    for (const meetingTypeId of ['999', '2']) {
      const response = await postMeeting(baseUrl, guest, {
        date: '2026-03-02',
        time: '09:00',
        meeting_type_id: meetingTypeId,
      });
      expect(response.status, `meeting_type_id ${meetingTypeId}`).toBe(400);
      expect(await response.json(), `meeting_type_id ${meetingTypeId}`).toEqual({
        error: 'тип встречи не найден или неактивен',
      });
    }
  });

  it('POST с активным meeting_type_id создаёт запись и сохраняет тип', async () => {
    const { baseUrl, adminCookie, db } = await createTestApp();
    const guest = await loginAsGuest(baseUrl);
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });

    const response = await postMeeting(baseUrl, guest, {
      date: '2026-03-02',
      time: '09:00',
      meeting_type_id: '1',
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: '1', date: '2026-03-02', time: '09:00' });

    // Колонка INTEGER: строковый id контракта хранится числом.
    const row = db.prepare('SELECT meeting_type_id FROM meetings').get() as {
      meeting_type_id: number;
    };
    expect(row.meeting_type_id).toBe(1);
  });

  it('POST принимает выходные и даты вне гостевого окна — 201 (документация C1/T11)', async () => {
    // Намеренное поведение: окно/выходные/прошлое — политика UI, а не сервера
    // (C1). Тест фиксирует, что сервер НЕ начинает вдруг их проверять. Удалить
    // вместе с тестом, если C1 пересмотрят в сторону общего shared/-модуля.
    const { baseUrl, adminCookie } = await createTestApp();
    const guest = await loginAsGuest(baseUrl);
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });

    // Суббота — выходной (и прошедшая дата: тоже UI-политика)…
    const weekend = await postMeeting(baseUrl, guest, {
      date: '2026-03-07',
      time: '10:00',
      meeting_type_id: '1',
    });
    expect(weekend.status).toBe(201);

    // …а дата далеко за пределами окна сегодня…сегодня+13.
    const outOfWindow = await postMeeting(baseUrl, guest, {
      date: '2030-01-07',
      time: '10:00',
      meeting_type_id: '1',
    });
    expect(outOfWindow.status).toBe(201);
  });

  it('GET без from/to отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const response = await getMeetings(baseUrl, adminCookie, '');
    expect(response.status).toBe(400);
  });

  it('GET с повторённым параметром отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    // Express 5 склеивает повтор в массив, а схема ждёт строку. Это отдельный
    // сценарий от «пустого» query: без него регрессия на массивах не поймана.
    const response = await getMeetings(baseUrl, adminCookie, '?from=2026-01-01&from=2026-01-02&to=2026-12-31');
    expect(response.status).toBe(400);
  });

  it('GET с невалидным from/to отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const response = await getMeetings(baseUrl, adminCookie, '?from=01-01-2026&to=2026-12-31');
    expect(response.status).toBe(400);
  });

  it('GET фильтрует по диапазону и сортирует по (date, time)', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const guest = await loginAsGuest(baseUrl);
    await postMeeting(baseUrl, guest, { date: '2026-01-02', time: '10:00' });
    await postMeeting(baseUrl, guest, { date: '2026-01-01', time: '11:00' });
    await postMeeting(baseUrl, guest, { date: '2027-01-01', time: '09:00' });

    const response = await getMeetings(baseUrl, adminCookie);
    expect(await response.json()).toEqual([
      { id: '2', date: '2026-01-01', time: '11:00' },
      { id: '1', date: '2026-01-02', time: '10:00' },
    ]);
  });
});

describe('routes /api/admin/meetings (S4, только админ)', () => {
  /** GET админского списка: cookie опциональна — так проверяется 401 без сессии. */
  function getPlanned(baseUrl: string, cookie?: string) {
    return fetch(`${baseUrl}/api/admin/meetings`, {
      headers: cookie === undefined ? undefined : { Cookie: cookie },
    });
  }

  it('без сессии 401, гостем 403, админом 200 с пустым списком (T2)', async () => {
    const { baseUrl, adminCookie } = await createTestApp();

    expect((await getPlanned(baseUrl)).status).toBe(401);
    // requireSession стоит до requireRole: гость доходит до ролевого гейта (403),
    // аноним обрывается раньше (401).
    expect((await getPlanned(baseUrl, await loginAsGuest(baseUrl))).status).toBe(403);

    const response = await getPlanned(baseUrl, adminCookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('подделанная cookie с role: admin не открывает админ-ручку — 401 (T2)', async () => {
    const { baseUrl } = await createTestApp();
    // Эскалация прав: злоумышленник заявляет role: admin. Две формы подделки —
    // (1) своя подпись поверх admin-payload'а не совпадает, cookie-parser отдаёт
    // false; (2) cookie вовсе без подписи. Обе обрываются на requireSession (401)
    // и не доходят до requireRole: без чтения только signedCookies незаверенная
    // роль прошла бы как admin. Ту же подделку на ГОСТЕВОЙ ручке ловит тест в
    // /api/meetings; здесь важно, что она не открывает именно админскую.
    const payload = JSON.stringify({ role: 'admin', bookerName: null });
    const unsigned = encodeURIComponent(payload);
    const mismatchedSignature = `session=s%3A${Buffer.from(payload).toString('base64url')}.deadbeef`;
    for (const forged of [mismatchedSignature, `session=${unsigned}`]) {
      expect((await getPlanned(baseUrl, forged)).status, `cookie: ${forged}`).toBe(401);
    }
  });

  it('отдаёт join-DTO: тип и автор у новой записи, «null» у легаси; прошлое отсечено (C5/Q6)', async () => {
    const { baseUrl, adminCookie, db } = await createTestApp();
    const guest = await loginAsGuest(baseUrl, 'Иван');
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '30 минут' });

    // Завтрашняя типизированная запись — через реальный POST: booker придёт из
    // сессии, тип сохранится. Это и есть сквозной позитив T9 (login → POST с
    // активным типом → 201 → строка в админском join-DTO): статус и тело ответа
    // проверяются здесь, чтобы весь путь S2→S5→S4 был одним тестом.
    const created = await postMeeting(baseUrl, guest, {
      date: localDate(1),
      time: '09:00',
      meeting_type_id: '1',
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ id: '1', date: localDate(1), time: '09:00' });
    // Легаси-строки — только прямой вставкой: без типа и автора (C5) и в прошлом.
    db.prepare('INSERT INTO meetings (date, time) VALUES (?, ?)').run(localDate(0), '10:00');
    db.prepare('INSERT INTO meetings (date, time) VALUES (?, ?)').run(localDate(-1), '11:00');

    // Сегодняшняя (type/booker null) и завтрашняя (join) — в порядке (date, time);
    // вчерашняя не попадает, хотя она в базе.
    expect(await (await getPlanned(baseUrl, adminCookie)).json()).toEqual([
      { date: localDate(0), time: '10:00', type: null, booker: null },
      { date: localDate(1), time: '09:00', type: 'Консультация', booker: 'Иван' },
    ]);
  });
});

describe('routes: жизненный цикл типа (T5/Q7)', () => {
  function listTypes(baseUrl: string, cookie: string) {
    return fetch(`${baseUrl}/api/meeting-types`, { headers: { Cookie: cookie } });
  }
  function listPlanned(baseUrl: string, cookie: string) {
    return fetch(`${baseUrl}/api/admin/meetings`, { headers: { Cookie: cookie } });
  }

  it('деактивация типа с уже записанной встречей разрешена: история помнит тип, новая запись — 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });
    const guest = await loginAsGuest(baseUrl, 'Иван');

    const booked = await postMeeting(baseUrl, guest, {
      date: localDate(1),
      time: '09:00',
      meeting_type_id: '1',
    });
    expect(booked.status).toBe(201);

    // Наличие встреч деактивацию НЕ блокирует: удаления в v1 нет, деактивация —
    // единственный конец жизненного цикла (Q7). Тип остаётся в админском списке
    // (listAll), просто с active: false.
    const deactivated = await postType(baseUrl, adminCookie, {}, '/api/meeting-types/1/deactivate');
    expect(deactivated.status).toBe(200);
    expect(((await deactivated.json()) as { active: boolean }).active).toBe(false);
    expect(await (await listTypes(baseUrl, adminCookie)).json()).toEqual([
      { id: '1', name: 'Консультация', description: '', active: false },
    ]);

    // История не обезличивается: у записанной встречи тип остаётся названием…
    expect(await (await listPlanned(baseUrl, adminCookie)).json()).toEqual([
      { date: localDate(1), time: '09:00', type: 'Консультация', booker: 'Иван' },
    ]);

    // …а новая запись на деактивированный тип не проходит (Q7), и гость тип
    // больше не видит (listActive).
    const rebook = await postMeeting(baseUrl, guest, {
      date: localDate(2),
      time: '09:00',
      meeting_type_id: '1',
    });
    expect(rebook.status).toBe(400);
    expect(await rebook.json()).toEqual({ error: 'тип встречи не найден или неактивен' });
    expect(await (await listTypes(baseUrl, await loginAsGuest(baseUrl))).json()).toEqual([]);
  });
});
