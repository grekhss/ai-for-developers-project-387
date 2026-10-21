import dayjs from 'dayjs';
import 'dayjs/locale/ru';

/**
 * Локаль приложения. Этим же значением настраивается DatesProvider в main.tsx,
 * чтобы календарь и тексты всегда были на одном языке.
 */
export const APP_LOCALE = 'ru';

/** Сегодняшняя дата в формате DateStringValue ('YYYY-MM-DD'). */
export function today(): string {
  return dayjs().format('YYYY-MM-DD');
}

/**
 * Текущие дата и время ('YYYY-MM-DD HH:mm') — «часы», которые правила домена
 * принимают параметром и сами никогда не читают (T3): границы окна и слоты
 * тогда тестируются фиксированной строкой и не дрейфуют при смене суток.
 */
export function now(): string {
  return dayjs().format('YYYY-MM-DD HH:mm');
}

/** Дата, отстоящая на days дней; строковая арифметика — через dayjs. */
export function addDays(date: string, days: number): string {
  return dayjs(date).add(days, 'day').format('YYYY-MM-DD');
}

/** Выходной: суббота или воскресенье. */
export function isWeekend(date: string): boolean {
  const day = dayjs(date).day();
  return day === 0 || day === 6;
}

/**
 * Дата раньше переданного «сейчас» (`moment` — строка now(), чтобы имя не
 * затеняло сами часы). Сравнение по дням, а не по точному времени, иначе
 * сегодняшний день считался бы прошедшим в течение суток. «Сейчас» — параметр
 * (T3): правило часы не читает, вызывающий передаёт now().
 */
export function isPast(date: string, moment: string): boolean {
  return dayjs(date).isBefore(dayjs(moment), 'day');
}

/**
 * День, в который можно записаться: не прошедший и не выходной. Правило
 * держится здесь, а не в компоненте: к выходным добавятся праздники и дни без
 * свободных слотов, а гостевое окно собирается поверх (lib/window.ts).
 */
export function isBookable(date: string, moment: string): boolean {
  return !isPast(date, moment) && !isWeekend(date);
}

/** Дата по-русски: «3 октября 2026». */
export function formatDateRu(date: string): string {
  return dayjs(date).locale(APP_LOCALE).format('D MMMM YYYY');
}
