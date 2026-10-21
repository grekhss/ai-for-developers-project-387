// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createRoutes } from './routes.js';
import { createRepository } from './repository.js';
import { createMeetingTypesRepository } from './meeting-types-repository.js';
import { createDatabase } from './db.js';

// Охранитель артефактов контракта (K1, ADR-0004; статус-коды — K2, D5; сверка
// роутов со спекой — K4): спека и обе TS-копии закоммичены, содержат все
// операции API, их реальные статус-коды и не пусты, а смонтированные сервером
// роуты не выходят за пределы спеки. Дрейф относительно contract/main.tsp ловит
// contract:check (входит в npm run check); этот тест — дешёвая страховка на
// случай удалённых артефактов, лжи о кодах и забытой в роутах ручки.

const read = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const spec = read('../contract/openapi.yaml');
const frontGen = read('../src/lib/contract.gen.ts');
const serverGen = read('./contract.gen.ts');

/** Express-путь в форму OpenAPI: '/api/meeting-types/:id' → '/api/meeting-types/{id}'. */
const toOpenApiPath = (path: string): string => path.replace(/:([^/]+)/g, '{$1}');

/**
 * Все ручки API — их набор живёт в contract/main.tsp. listPlannedMeetings (S4)
 * описана там заранее и смонтирована в S4: контракт шёл впереди сервера, чтобы
 * SDK (K3) собрал её до реализации.
 */
const OPERATIONS = [
  'login',
  'logout',
  'getCurrentSession',
  'listMeetings',
  'createMeeting',
  'listMeetingTypes',
  'createMeetingType',
  'deactivateMeetingType',
  'listPlannedMeetings',
] as const;

/** Все пути спеки, включая планируемые. */
const PATHS = [
  '/api/login:',
  '/api/logout:',
  '/api/me:',
  '/api/meetings:',
  '/api/meeting-types:',
  '/api/meeting-types/{id}/deactivate:',
  '/api/admin/meetings:',
] as const;

/**
 * Обязательные статус-коды операции: ровно то, что возвращает сервер, включая
 * отказ в доступе (401 без сессии, 403 если роль не admin) и целостность
 * (400 формата, 409 занятый слот). Источник истины — contract/main.tsp.
 */
const REQUIRED_CODES: Record<(typeof OPERATIONS)[number], readonly string[]> = {
  login: ['200', '400', '401'],
  logout: ['204', '401'],
  getCurrentSession: ['200', '401'],
  listMeetings: ['200', '400', '401'],
  createMeeting: ['201', '400', '401', '409'],
  listMeetingTypes: ['200', '401'],
  createMeetingType: ['201', '400', '401', '403'],
  deactivateMeetingType: ['200', '400', '401', '403'],
  listPlannedMeetings: ['200', '401', '403'],
};

/**
 * Текст одной операции спеки: от её operationId до следующей операции или до
 * начала секции components. Свойства операции лежат после operationId, поэтому
 * responses каждой операции попадают ровно в её блок. `\n` обязателен: без него
 * `createMeeting` находится как префикс `createMeetingType`.
 */
const operationBlock = (operation: string): string => {
  const start = spec.indexOf(`operationId: ${operation}\n`);
  if (start === -1) {
    throw new Error(`в contract/openapi.yaml нет операции ${operation}`);
  }

  const rest = spec.slice(start);
  const ends = ['\n      operationId:', '\ncomponents:']
    .map((marker) => rest.indexOf(marker))
    .filter((index) => index !== -1);

  return rest.slice(0, ends.length === 0 ? rest.length : Math.min(...ends));
};

/** Разобранный openapi.yaml: спека — источник истины о путях и методах. */
type OpenApiDocument = {
  paths: Record<string, Record<string, { operationId?: string }>>;
};

/**
 * Роуты, реально смонтированные createRoutes, — пары «путь + метод», плюс те,
 * что смонтированы ДО сеанс-гейта и потому работают без сессии.
 *
 * Интроспекция router.stack, а не список вручную: забытую в списке строку ничто
 * бы не заметило, а stack — то, что сервер действительно отдаёт. Методы 'all' и
 * '_all' отбрасываем (Express сам разворачивает router.all в них, а в спеке это
 * «все методы», а не отдельный). Пути разворачиваются в форму OpenAPI:
 * '/api/meeting-types/:id' → '/api/meeting-types/{id}'.
 */
type MountedRoute = { path: string; method: string };

function inspectRoutes(): { routes: MountedRoute[]; unguardedRoutes: MountedRoute[] } {
  const db = createDatabase(':memory:');
  try {
    const router = createRoutes(
      {
        meetings: createRepository(db),
        meetingTypes: createMeetingTypesRepository(db),
      },
      {
        adminPassword: 'admin-secret',
        guestPassword: 'guest-secret',
        secureCookie: false,
      },
    );

    const routes: MountedRoute[] = [];
    const unguardedRoutes: MountedRoute[] = [];
    let guarded = false;

    for (const layer of router.stack as Array<{
      name: string;
      route?: { path: string; methods: Record<string, boolean> };
    }>) {
      // Порядок слоёв решает: router.use('/api', requireSession) защищает только
      // то, что смонтировано ПОСЛЕ него, — раньше лежит открытый /api/login.
      if (layer.route === undefined) {
        guarded = true;
        continue;
      }

      const path = toOpenApiPath(layer.route.path);
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (!enabled || method === 'all' || method === '_all') continue;
        const route = { path, method };
        routes.push(route);
        if (!guarded) unguardedRoutes.push(route);
      }
    }

    return { routes, unguardedRoutes };
  } finally {
    db.close();
  }
}

/** Пары «путь + метод», задокументированные в спеке. */
function specRoutes(document: OpenApiDocument): MountedRoute[] {
  return Object.entries(document.paths).flatMap(([path, methods]) =>
    Object.keys(methods).map((method) => ({ path, method })),
  );
}

describe('артефакты контракта API', () => {
  it('openapi.yaml содержит все путь-операции API', () => {
    for (const path of PATHS) {
      expect(spec).toContain(`  ${path}`);
    }
    for (const operation of OPERATIONS) {
      // operationBlock бросает, если операции нет: простой toContain тут ловит
      // префикс (`createMeeting` нашёлся бы как часть `createMeetingType`).
      expect(operationBlock(operation).length).toBeGreaterThan(0);
    }
  });

  it('каждая операция документирует свой реальный набор статус-кодов', () => {
    for (const [operation, codes] of Object.entries(REQUIRED_CODES)) {
      const block = operationBlock(operation);
      for (const code of codes) {
        expect(block, `операция ${operation} должна иметь '${code}'`).toContain(`'${code}':`);
      }
    }
  });

  it('обе TS-копии сгенерированы и непусты', () => {
    for (const gen of [frontGen, serverGen]) {
      expect(gen).toContain('auto-generated by openapi-typescript');
      expect(gen.length).toBeGreaterThan(1000);
      expect(gen).toContain('Meeting');
      expect(gen).toContain('MeetingType');
      expect(gen).toContain('PlannedMeeting');
    }
  });

  it('фронтовая и серверная копии идентичны — генерация одна на обе', () => {
    expect(frontGen).toBe(serverGen);
  });

  it('каждый смонтированный роут описан в спеке, методы совпадают', () => {
    const document = parse(spec) as OpenApiDocument;
    const documented = specRoutes(document);
    const { routes } = inspectRoutes();

    // Спека может идти впереди сервера (S4), поэтому проверяем только
    // подмножество: роут есть — он обязан быть в спеке. Обратное неверно.
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(
        documented,
        `роут ${route.method.toUpperCase()} ${route.path} смонтирован, но в спеке его нет`,
      ).toContainEqual(route);
    }
  });

  it('спека не задокументирует ни одного неожиданного метода на путях сервера', () => {
    const document = parse(spec) as OpenApiDocument;
    const { routes } = inspectRoutes();
    const mountedPaths = new Set(routes.map((route) => route.path));

    for (const { path, method } of specRoutes(document)) {
      if (!mountedPaths.has(path)) continue;
      // Для смонтированного пути в спеке допустимы только методы, которые сервер
      // реально отдаёт: лишний метод в спеке — это ложь о реализованном роуте.
      expect(
        routes,
        `спека документирует ${method.toUpperCase()} ${path}, но сервер его не монтирует`,
      ).toContainEqual({ path, method });
    }
  });

  it('сеанс-гейт навешен на все ручки, кроме входа', () => {
    const { unguardedRoutes } = inspectRoutes();
    // Порядок в router.stack решает: что смонтировано до use-слоя с
    // requireSession, работает без сессии. Вход — единственный такой роут.
    // Убери гейт — и без сессии окажется всё API, тест рухнет на этом диффе.
    expect(unguardedRoutes).toEqual([{ path: '/api/login', method: 'post' }]);
  });

  it('ручки удаления нет: деактивация — единственный конец жизненного цикла (Q7/T5)', () => {
    const { routes } = inspectRoutes();
    // В контракте DELETE не описан, а роуты ⊆ спеки (тест выше). Отдельная
    // проверка нужна как явный контракт жизненного цикла: если кто-то смонтирует
    // DELETE (в заботе о ретеншене), падать должно здесь, а не только на диффе
    // со спекой — «деактивация вместо удаления» и есть решения Q7.
    expect(routes.filter((route) => route.method === 'delete')).toEqual([]);
  });
});
