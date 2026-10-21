import type { components } from '../contract.gen.ts';

/**
 * Типы контракта — alias'ы из сгенерированного файла (K1, ADR-0004), как в
 * `../meetings/types.ts`: openapi-typescript отдаёт модели как
 * components['schemas'][...]. Источник истины — contract/main.tsp; руками не
 * правится, правка идёт там с последующим `npm run contract`.
 */

/**
 * Сессия — роль и имя записывающегося; у админа bookerName null. Это всё, что
 * клиент знает о входе: cookie httpOnly, и клиент её никогда не читает (Q1/Q9).
 */
export type Session = components['schemas']['Session'];
/**
 * Данные входа: пароль обязателен и по нему сервер определяет роль; имя гостя
 * обязательно для гостя и игнорируется для админа.
 */
export type LoginInput = components['schemas']['LoginInput'];
