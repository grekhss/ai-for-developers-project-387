import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Импорт — именованный, и это не стилистика: у ajv 8.20 нет `exports`-карты и
// `type: module`, файлы CommonJS, а `.d.ts` написан как ES-модуль. В `nodenext`
// дефолтный импорт отдаёт тип модульного namespace — `new Ajv2020(...)` тогда
// не компилируется (TS2351), хотя в рантайме Node и подставляет класс. Имя
// `Ajv2020` есть и в `.d.ts`, и в `module.exports`, так что только оно совпадает
// в типах и в рантайме. Путь обязан быть полным, с `.js`, — иначе TS2307.
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { CreateMeetingBody, CreateMeetingTypeBody, ListMeetingsQuery, LoginInput } from './types.js';

/**
 * Форматная валидация по схемам контракта (K4, ADR-0005).
 *
 * Схемы приходят из contract/schema/ — той же компиляции contract/main.tsp, что
 * генерирует спеку (npm run contract), поэтому правило формата живёт в одном
 * месте и не дублируется здесь руками. Эмиттер отдаёт draft 2020-12 — отсюда
 * ajv/dist/2020.
 *
 * Граница прежняя: сервер валидирует формат, не домен — прошедшие даты, выходные
 * и сетка слотов остаются фронтовой политикой (ARCHITECTURE §3/§9), а импорт из
 * src/ закрыт rootDir: server. Рукописное в routes.ts — то, что JSON Schema не
 * выразит: обёртка `req.body === undefined`, условие «для гостя обязателен
 * bookerName», и integrity-проверки S5 (существующий активный тип, booker из
 * сессии): их входные данные — роль и база, а не тело.
 *
 * ajv работает предикатом: coerceTypes/useDefaults/removeAdditional выключены,
 * так что валидатор данные не трогает и ничего не додумывает.
 */

/**
 * Путь — от файла validate.js, а не от cwd: и в dev (server/), и в проде
 * (dist-server/) верхний каталог — корень пакета, где лежит contract/schema.
 */
const SCHEMA_PATH = join(
  import.meta.dirname,
  '..',
  'contract',
  'schema',
  'calendar-of-meetings.json',
);

const { $defs: defs } = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as {
  $defs: Record<string, object>;
};

const ajv = new Ajv2020({ strict: true });

/**
 * Схема модели из бандла. Отсутствие — ошибка компоновки, а не «пустой проход»:
 * лучше упасть при загрузке модуля, чем молча пропустить невалидное тело.
 */
function schemaOf(model: string): object {
  const schema = defs[model];
  if (schema === undefined) {
    throw new Error(`в contract/schema нет схемы модели ${model}`);
  }
  return schema;
}

const validDraft = ajv.compile<CreateMeetingBody>(schemaOf('MeetingDraft'));
const validRange = ajv.compile<ListMeetingsQuery>(schemaOf('DateRange'));
const validLogin = ajv.compile<LoginInput>(schemaOf('LoginInput'));
const validMeetingTypeDraft = ajv.compile<CreateMeetingTypeBody>(schemaOf('MeetingTypeDraft'));

/**
 * false на undefined/не-объекте: в Express 5 req.body не инициализируется в {},
 * если парсер не сработал (например, POST без Content-Type: application/json).
 *
 * Проверка стоит ДО ajv и по требованию K4, но как единственный гарант она не
 * нужна: ajv на схемах `type: object` возвращает false для undefined/null/
 * массива/строки/числа и не бросает (проверено). Она тут, чтобы это не зависело
 * от внутренностей ajv и от того, что схема останется object-типом.
 */
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Тело POST /api/meetings: дата 'YYYY-MM-DD', время 'HH:mm'; meeting_type_id —
 * строка, если передан (его существование и активность — уже integrity в routes.ts).
 */
export function isValidDraft(body: unknown): body is CreateMeetingBody {
  return isObject(body) && validDraft(body);
}

/**
 * Query GET /api/meetings: from и to обязательны и в формате даты. DateRange в
 * контракте — та же пара from/to, объявленная там же, где и query-параметры, и
 * с теми же @pattern; лишние query-параметры, как и раньше, игнорируются
 * (эмиттер не запечатывает объекты — seal-object-schemas выключен).
 */
export function isValidRange(query: unknown): query is ListMeetingsQuery {
  return isObject(query) && validRange(query);
}

/** Вход: пароль непуст (минимум один непробельный символ), bookerName — строка, если передан. */
export function isValidLogin(body: unknown): body is LoginInput {
  return isObject(body) && validLogin(body);
}

/**
 * Тело POST /api/meeting-types (S3): name — непустая строка с минимум одним
 * непробельным символом (`'   '` не проходит — @pattern в main.tsp, тот же
 * приём, что у пароля в K4), description — строка, обязана присутствовать.
 */
export function isValidMeetingTypeDraft(body: unknown): body is CreateMeetingTypeBody {
  return isObject(body) && validMeetingTypeDraft(body);
}
