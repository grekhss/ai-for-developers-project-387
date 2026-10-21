import { addDays, isBookable } from './date.ts';

/**
 * Гостевое окно (Q5): гость видит сегодня … сегодня+13 включительно — 14
 * календарных дней; только будни, а сегодняшние слоты не раньше текущего
 * времени. Админский список окном не ограничен (Q6) — ограничение живёт здесь,
 * в домене фронта, а не на сервере: по C1 это политика UI, а не 400.
 *
 * Чистые функции: «сейчас» приходит строкой `moment` ('YYYY-MM-DD HH:mm'), и
 * часы здесь не читаются (T3) — вызывающий передаёт `now()` из `lib/date.ts`.
 * Выходные и прошедшие дни не переизобретаются: правило собирается из
 * `isBookable` (ARCHITECTURE, «домен не дублируется»).
 */

/** Ширина гостевого окна в календарных днях (Q5). */
export const WINDOW_DAYS = 14;

/**
 * Последний день окна включительно. Сравнение дат везде лексикографическое:
 * формат 'YYYY-MM-DD' упорядочен хронологически (тот же приём, что в
 * inMemory-фейках и SQLite BETWEEN).
 */
export function windowEnd(moment: string): string {
  return addDays(moment, WINDOW_DAYS - 1);
}

/** День попадает в гостевое окно: доступен по isBookable и не дальше конца окна. */
export function isBookableDay(day: string, moment: string): boolean {
  return isBookable(day, moment) && day <= windowEnd(moment);
}

/**
 * Слот доступен: день в окне, а сегодняшнее время — строго позже текущего.
 * Слот, начинающийся ровно сейчас, записать нельзя — он уже идёт. 'HH:mm'
 * лексикографически упорядочены, поэтому сравнение — сравнение строк.
 */
export function isBookableSlot(day: string, time: string, moment: string): boolean {
  if (!isBookableDay(day, moment)) return false;
  if (day === moment.slice(0, 10)) return time > moment.slice(11);
  return true;
}
