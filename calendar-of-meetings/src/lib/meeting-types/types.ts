import type { components } from '../contract.gen.ts';

/**
 * Типы контракта — alias'ы из сгенерированного файла (K1, ADR-0004), как в
 * `../meetings/types.ts`: openapi-typescript отдаёт модели как
 * components['schemas'][...]. Источник истины — contract/main.tsp; руками не
 * правится, правка идёт там с последующим `npm run contract`.
 */

/** Тип встречи: id строкой, active — признак живого типа (деактивация — конец цикла, Q7). */
export type MeetingType = components['schemas']['MeetingType'];
/** Данные нового типа встречи — всё, кроме идентификатора и признака активности. */
export type MeetingTypeDraft = components['schemas']['MeetingTypeDraft'];
