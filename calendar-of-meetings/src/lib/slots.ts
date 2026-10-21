/** Начало рабочего дня, минуты от полуночи. */
const WORK_DAY_START_MINUTES = 9 * 60;

/** Конец рабочего дня — момент, к которому встреча должна закончиться. */
const WORK_DAY_END_MINUTES = 18 * 60;

/** Длительность слота встречи. */
const SLOT_STEP_MINUTES = 30;

/** Минуты от полуночи в формат времени Mantine — 'HH:mm'. */
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/**
 * Слоты встреч рабочего дня. Последний слот начинается в 17:30, чтобы встреча
 * всегда заканчивалась к 18:00.
 */
export function generateTimeSlots(
  startMinutes: number = WORK_DAY_START_MINUTES,
  endMinutes: number = WORK_DAY_END_MINUTES,
  stepMinutes: number = SLOT_STEP_MINUTES,
): string[] {
  const slots: string[] = [];

  for (let start = startMinutes; start + stepMinutes <= endMinutes; start += stepMinutes) {
    slots.push(formatTime(start));
  }

  return slots;
}
