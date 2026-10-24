import { addDays, now } from '../lib/date.ts';
import { isBookableDay } from '../lib/window.ts';

/**
 * Первый bookable-день после даты `moment` — тем же правилом, что календарь
 * (`isBookableDay`): будни в границах гостевого окна Q5. Тесты сеют занятые
 * слоты в конкретные даты, а не парсят aria-label. Сегодня не берём: к вечеру
 * у него не остаётся свободных слотов, и сценарии с конкретным временем стали бы
 * зависеть от часов.
 */
export function nextBookableDate(moment: string = now()): string {
  const start = moment.slice(0, 10);

  for (let offset = 1; offset < 14; offset++) {
    const day = addDays(start, offset);
    if (isBookableDay(day, moment)) return day;
  }

  throw new Error('в гостевом окне нет буднего дня после сегодняшнего');
}
