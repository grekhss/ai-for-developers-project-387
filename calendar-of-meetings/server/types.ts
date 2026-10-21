import type { components, operations } from './contract.gen.js';

/**
 * Типы контракта сервера — alias'ы из сгенерированного файла (K1, ADR-0004;
 * операции — K4). openapi-typescript отдаёт модели как components['schemas'][...],
 * а тела и параметры запросов — как operations[<operationId>], поэтому здесь
 * alias'ы, а не re-export имён. Источник истины — contract/main.tsp; руками не
 * правится, правка идёт там с последующим `npm run contract`. Session берёт тип
 * оттуда же — в server/session.ts.
 */

/** Запись на встречу. Дата и время — строки 'YYYY-MM-DD' и 'HH:mm'. */
export type Meeting = components['schemas']['Meeting'];
/** Данные новой записи — всё, кроме идентификатора. */
export type MeetingDraft = components['schemas']['MeetingDraft'];

/** Тип встречи (S3): id строкой, active — boolean из INTEGER-колонки. */
export type MeetingType = components['schemas']['MeetingType'];
/** Данные нового типа встречи (S3): name непуст (непробельных минимум один), description. */
export type MeetingTypeDraft = components['schemas']['MeetingTypeDraft'];

/**
 * Строка админского списка (S4/Q6): LEFT JOIN встреч с типами, поэтому у
 * легаси-записи без типа `type` null, а у старой записи без автора — `booker`
 * (C5). Отдаётся как есть: список уже разложен по колонкам репозиторием.
 */
export type PlannedMeeting = components['schemas']['PlannedMeeting'];

/**
 * Ниже — типы, взятые от ОПЕРАЦИЙ, а не от моделей: сервер сверяется с тем
 * именно, что контракт пообещал принять на конкретной ручке. Смена тела или
 * query в contract/main.tsp поэтому роняет `tsc`, а не вылезает в рантайме.
 */

/** Тело POST /api/meetings. */
export type CreateMeetingBody = operations['createMeeting']['requestBody']['content']['application/json'];
/** Query GET /api/meetings: from и to обязательны, обе границы включительно. */
export type ListMeetingsQuery = operations['listMeetings']['parameters']['query'];
/** Тело POST /api/login: пароль обязателен, bookerName — опционально. */
export type LoginInput = operations['login']['requestBody']['content']['application/json'];
/** Тело POST /api/meeting-types (S3): name непуст, description обязателен. */
export type CreateMeetingTypeBody =
  operations['createMeetingType']['requestBody']['content']['application/json'];
