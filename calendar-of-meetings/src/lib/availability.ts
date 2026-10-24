import type { Meeting } from './meetings/types.ts';
import { addDays } from './date.ts';
import { generateTimeSlots } from './slots.ts';
import { isBookableDay, isBookableSlot, windowEnd } from './window.ts';

/**
 * Занятость и свободные слоты гостевого окна (Q5). Чистые функции без React и
 * Mantine: «сейчас» приходит строкой `moment`, часы читает только вызывающий
 * (T3). Сетка слотов и правила доступности не переизобретаются — берутся из
 * `lib/slots.ts` и `lib/window.ts`, чтобы календарь и `TimeSlots` считали одно
 * и то же.
 */

/** Занятые слоты по дням: `'YYYY-MM-DD' → ['HH:mm', …]`. */
export function takenTimesByDay(meetings: Meeting[]): Record<string, string[]> {
  const taken: Record<string, string[]> = {};

  for (const meeting of meetings) {
    (taken[meeting.date] ??= []).push(meeting.time);
  }

  return taken;
}

/**
 * Недоступные слоты дня: занятые другими записями и уже начавшиеся сегодня.
 * Это ровно то, что выключает `TimeSlots`, — чтобы сетка и счётчик в календаре
 * считали «свободное» по одному правилу.
 */
function unavailableFromSlots(
  day: string,
  takenTimes: string[],
  moment: string,
  slots: string[],
): string[] {
  return slots.filter(
    (time) => takenTimes.includes(time) || !isBookableSlot(day, time, moment),
  );
}

export function unavailableTimes(
  day: string,
  takenTimes: string[],
  moment: string,
): string[] {
  return unavailableFromSlots(day, takenTimes, moment, generateTimeSlots());
}

/**
 * Число свободных слотов в каждом bookable-дне окна. Выходные и дни вне окна в
 * карту не попадают — они и так выключены правилом дня; сегодняшние слоты,
 * которые уже начались, не считаются свободными. Дни с нулём остаются в карте:
 * по ним календарь выключает полностью занятые даты.
 */
export function freeSlotCounts(
  moment: string,
  taken: Record<string, string[]>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const lastDay = windowEnd(moment);
  const slots = generateTimeSlots();

  for (
    let day = moment.slice(0, 10);
    day <= lastDay;
    day = addDays(day, 1)
  ) {
    if (!isBookableDay(day, moment)) continue;

    // Тот же список недоступного, что получает TimeSlots: счётчик не может
    // разойтись с сеткой, даже если правило слотов изменится.
    counts[day] = slots.length - unavailableFromSlots(day, taken[day] ?? [], moment, slots).length;
  }

  return counts;
}
