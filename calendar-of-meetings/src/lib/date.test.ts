import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { APP_LOCALE, today, now, addDays, isWeekend, isPast, isBookable, formatDateRu } from './date.ts';

/**
 * «Сейчас» для правил — фиксированная строка, а не часы процесса (T3):
 * четверг, 1 октября 2026, 10:00. Тесты isPast/isBookable от этого
 * детерминированы и не дрейфуют при смене суток. Четверг выбран так, чтобы
 * выходные 3–4 октября были не прошедшими: иначе тест «запрещает выходные»
 * проходил бы и без проверки выходных — это поймала мутация (упущение F1).
 */
const NOW = '2026-10-01 10:00';

describe('today / now', () => {
  it('today возвращает дату в формате YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today()).toBe(dayjs().format('YYYY-MM-DD'));
  });

  it('now возвращает дату со временем в формате YYYY-MM-DD HH:mm', () => {
    expect(now()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(now().slice(0, 10)).toBe(today());
  });
});

describe('addDays', () => {
  it('прибавляет дни к дате', () => {
    expect(addDays('2026-10-05', 13)).toBe('2026-10-18');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('isWeekend', () => {
  it('считает субботу и воскресенье выходными', () => {
    expect(isWeekend('2026-10-03')).toBe(true);
    expect(isWeekend('2026-10-04')).toBe(true);
  });

  it('не считает будни выходными', () => {
    expect(isWeekend('2026-10-05')).toBe(false);
    expect(isWeekend('2026-10-09')).toBe(false);
  });
});

describe('isPast', () => {
  it('считает прошедшие даты прошедшими', () => {
    expect(isPast('2020-01-01', NOW)).toBe(true);
  });

  it('не считает прошедшим сегодняшний день, даже когда время уже прошло', () => {
    // сравнение по дням: иначе понедельник «уезжает в прошлое» в течение суток
    expect(isPast('2026-10-05', '2026-10-05 23:59')).toBe(false);
  });

  it('не считает прошедшими будущие дни', () => {
    expect(isPast('2026-10-06', NOW)).toBe(false);
  });
});

describe('isBookable', () => {
  it('разрешает будний сегодняшний день', () => {
    expect(isBookable('2026-10-05', NOW)).toBe(true);
  });

  it('запрещает выходные', () => {
    expect(isBookable('2026-10-03', NOW)).toBe(false);
    expect(isBookable('2026-10-04', NOW)).toBe(false);
  });

  it('запрещает прошедшие дни', () => {
    expect(isBookable('2020-01-01', NOW)).toBe(false);
  });
});

describe('formatDateRu', () => {
  it('печатает дату по-русски', () => {
    expect(formatDateRu('2026-10-03')).toBe('3 октября 2026');
  });

  it('использует локаль приложения', () => {
    expect(APP_LOCALE).toBe('ru');
  });
});
