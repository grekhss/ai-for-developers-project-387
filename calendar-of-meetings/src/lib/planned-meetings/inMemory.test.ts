import { describe, it, expect } from 'vitest';
import { addDays, today } from '../date.ts';
import { createInMemoryPlannedMeetingsApi } from './inMemory.ts';
import type { PlannedMeeting } from './types.ts';

/** Запись на offsetDays от сегодня — иначе фейк отсечёт её как прошлую. */
function meeting(offsetDays: number, time: string, type: string | null = null, booker: string | null = null): PlannedMeeting {
  return { date: addDays(today(), offsetDays), time, type, booker };
}

describe('createInMemoryPlannedMeetingsApi', () => {
  it('отдаёт записи как есть — с названием типа и автором, включая null (C5)', async () => {
    const api = createInMemoryPlannedMeetingsApi([
      meeting(1, '09:00', 'Консультация', 'Иван'),
      meeting(2, '10:00'),
    ]);

    expect(await api.list()).toEqual([
      { date: addDays(today(), 1), time: '09:00', type: 'Консультация', booker: 'Иван' },
      // Легаси-строка: обе колонки null, UI нарисует «—» (F6).
      { date: addDays(today(), 2), time: '10:00', type: null, booker: null },
    ]);
  });

  it('отбрасывает прошедшее, границу «сегодня» включает (Q6)', async () => {
    const api = createInMemoryPlannedMeetingsApi([meeting(-1, '09:00'), meeting(0, '10:00')]);

    // Как сервер: вчерашняя не возвращается, сегодняшняя — да.
    expect(await api.list()).toEqual([
      { date: addDays(today(), 0), time: '10:00', type: null, booker: null },
    ]);
  });

  it('сортирует по (date, time), как ORDER BY сервера', async () => {
    const api = createInMemoryPlannedMeetingsApi([
      meeting(2, '09:00'),
      meeting(1, '11:00'),
      meeting(1, '09:00'),
    ]);

    expect((await api.list()).map(({ date, time }) => [date, time])).toEqual([
      [addDays(today(), 1), '09:00'],
      [addDays(today(), 1), '11:00'],
      [addDays(today(), 2), '09:00'],
    ]);
  });

  it('не видит пополнения массива-сида после создания', async () => {
    const seed: PlannedMeeting[] = [];
    const api = createInMemoryPlannedMeetingsApi(seed);

    // Копия массива на конструкторе: иначе поздняя правка сида меняла бы фейк.
    seed.push(meeting(1, '09:00'));

    expect(await api.list()).toEqual([]);
  });
});
