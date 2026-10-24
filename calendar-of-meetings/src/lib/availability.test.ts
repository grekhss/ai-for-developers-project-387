import { describe, it, expect } from 'vitest';
import { freeSlotCounts, takenTimesByDay, unavailableTimes } from './availability.ts';
import { generateTimeSlots } from './slots.ts';
import type { Meeting } from './meetings/types.ts';

// Среда, 08:00 — до первого слота, поэтому свободны все 18.
// Окно Q5: 21.10 … 03.11.2026.
const MOMENT = '2026-10-21 08:00';

function meeting(id: string, date: string, time: string): Meeting {
  return { id, date, time };
}

describe('takenTimesByDay', () => {
  it('группирует занятые слоты по дням', () => {
    expect(
      takenTimesByDay([
        meeting('1', '2026-10-21', '09:00'),
        meeting('2', '2026-10-21', '10:00'),
        meeting('3', '2026-10-22', '11:00'),
      ]),
    ).toEqual({
      '2026-10-21': ['09:00', '10:00'],
      '2026-10-22': ['11:00'],
    });
  });

  it('без записей отдаёт пустую карту', () => {
    expect(takenTimesByDay([])).toEqual({});
  });
});

describe('unavailableTimes', () => {
  it('включает занятые слоты и уже начавшиеся сегодня', () => {
    const times = unavailableTimes('2026-10-21', ['12:30'], '2026-10-21 12:00');

    // Все слоты до 12:00 включительно уже начались, 12:30 занят.
    expect(times).toContain('09:00');
    expect(times).toContain('12:00');
    expect(times).toContain('12:30');
    expect(times).not.toContain('13:00');
  });

  it('на будущий день выключает только занятые слоты', () => {
    expect(unavailableTimes('2026-10-22', ['11:00'], MOMENT)).toEqual(['11:00']);
  });
});

describe('freeSlotCounts', () => {
  it('в будний день без записей свободны все 18 слотов', () => {
    const counts = freeSlotCounts(MOMENT, {});

    expect(generateTimeSlots()).toHaveLength(18);
    expect(counts['2026-10-21']).toBe(18);
  });

  it('один занятый слот уменьшает счётчик на единицу', () => {
    const counts = freeSlotCounts(MOMENT, { '2026-10-21': ['11:00'] });

    expect(counts['2026-10-21']).toBe(17);
  });

  it('сегодня в 12:00 оставляет только слоты позже текущего времени', () => {
    const counts = freeSlotCounts('2026-10-21 12:00', {});

    // 12:00 уже начался, свободны 12:30 … 17:30 — 11 слотов.
    expect(counts['2026-10-21']).toBe(11);
  });

  it('занятый слот учитывается вместе с отсечкой по времени', () => {
    const counts = freeSlotCounts('2026-10-21 12:00', { '2026-10-21': ['12:30'] });

    expect(counts['2026-10-21']).toBe(10);
  });

  it('выходные и дни вне окна в карту не попадают', () => {
    const counts = freeSlotCounts(MOMENT, {});

    // Суббота внутри окна, день после конца окна и прошедший день.
    expect(counts['2026-10-24']).toBeUndefined();
    expect(counts['2026-11-04']).toBeUndefined();
    expect(counts['2026-10-20']).toBeUndefined();

    // 21–23, 26–30 октября и 2–3 ноября — ровно 10 будних дней окна.
    expect(Object.keys(counts)).toHaveLength(10);
  });

  it('день, в котором заняты все слоты, остаётся в карте с нулём', () => {
    const counts = freeSlotCounts(MOMENT, {
      '2026-10-21': generateTimeSlots(),
    });

    expect(counts['2026-10-21']).toBe(0);
  });
});
