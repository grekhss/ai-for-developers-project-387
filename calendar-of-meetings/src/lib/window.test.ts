import { describe, it, expect } from 'vitest';
import { WINDOW_DAYS, windowEnd, isBookableDay, isBookableSlot } from './window.ts';

/**
 * Часы зафиксированы строкой now ('YYYY-MM-DD HH:mm'): вторник, 6 октября
 * 2026, 09:30. Правило время не читает — оно приходит параметром (T3), поэтому
 * тест не дрейфует ни при смене суток, ни в другом часовом поясе.
 */
const NOW = '2026-10-06 09:30';

describe('WINDOW_DAYS', () => {
  it('окно шириной 14 календарных дней (Q5)', () => {
    expect(WINDOW_DAYS).toBe(14);
  });
});

describe('windowEnd', () => {
  it('последний день окна — now + 13 дней включительно', () => {
    expect(windowEnd(NOW)).toBe('2026-10-19'); // понедельник
  });
});

describe('isBookableDay', () => {
  it('принимает сегодняшний будний день', () => {
    expect(isBookableDay('2026-10-06', NOW)).toBe(true);
  });

  it('принимает последний день окна — день+13', () => {
    expect(isBookableDay('2026-10-19', NOW)).toBe(true);
  });

  it('отклоняет день+14 — за пределами окна', () => {
    expect(isBookableDay('2026-10-20', NOW)).toBe(false);
  });

  it('отклоняет выходной даже в пределах окна', () => {
    // суббота, 10 октября — внутри окна, но это выходной
    expect(isBookableDay('2026-10-10', NOW)).toBe(false);
  });

  it('отклоняет прошедший день', () => {
    expect(isBookableDay('2026-10-05', NOW)).toBe(false);
  });
});

describe('isBookableSlot', () => {
  it('отклоняет прошедшее время сегодня', () => {
    expect(isBookableSlot('2026-10-06', '09:00', NOW)).toBe(false);
  });

  it('отклоняет слот, начинающийся ровно сейчас — он уже идёт', () => {
    expect(isBookableSlot('2026-10-06', '09:30', NOW)).toBe(false);
  });

  it('принимает будущее время сегодня', () => {
    expect(isBookableSlot('2026-10-06', '10:00', NOW)).toBe(true);
  });

  it('в другой день время суток не проверяется', () => {
    // завтрашнее утро: «прошлое время» относится только к сегодня
    expect(isBookableSlot('2026-10-07', '09:00', NOW)).toBe(true);
  });

  it('день за пределами окна отклоняется и на уровне слота', () => {
    expect(isBookableSlot('2026-10-20', '10:00', NOW)).toBe(false);
  });

  it('выходной отклоняется и на уровне слота', () => {
    expect(isBookableSlot('2026-10-10', '10:00', NOW)).toBe(false);
  });
});
