import type { components } from '../contract.gen.ts';

/**
 * Типы контракта — alias'ы из сгенерированного файла (K1, ADR-0004), как в
 * `../meetings/types.ts` и `../meeting-types/types.ts`. Источник истины —
 * contract/main.tsp; руками не правится, правка идёт там с последующим
 * `npm run contract`.
 */

/**
 * Строка админского списка (S4/Q6): `type` и `booker` — null у легаси-записи
 * без типа и без автора (C5), поэтому тип честно говорит «или null», а UI
 * рисует «—». Дат и времени здесь нет id: список — срез, а не сущность.
 */
export type PlannedMeeting = components['schemas']['PlannedMeeting'];
