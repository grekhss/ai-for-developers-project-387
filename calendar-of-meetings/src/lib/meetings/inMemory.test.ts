import { describe, it, expect } from 'vitest';
import { createInMemoryMeetingsApi } from './inMemory.ts';
import type { Meeting } from './types.ts';

const seed: Meeting[] = [
  { id: '1', date: '2026-10-06', time: '10:00' },
  { id: '2', date: '2026-10-05', time: '09:00' },
  { id: '3', date: '2026-11-01', time: '12:00' },
];

describe('createInMemoryMeetingsApi', () => {
  it('отдаёт записи полуинтервала с включёнными границами', async () => {
    const api = createInMemoryMeetingsApi(seed);

    const meetings = await api.list({ from: '2026-10-05', to: '2026-10-06' });

    expect(meetings.map((meeting) => meeting.date)).toEqual(['2026-10-05', '2026-10-06']);
  });

  it('упорядочивает записи по дате и времени', async () => {
    const api = createInMemoryMeetingsApi([
      { id: '1', date: '2026-10-06', time: '09:00' },
      { id: '2', date: '2026-10-06', time: '10:00' },
      { id: '3', date: '2026-10-05', time: '18:00' },
    ]);

    const meetings = await api.list({ from: '2026-10-01', to: '2026-10-31' });

    expect(meetings.map((meeting) => `${meeting.date} ${meeting.time}`)).toEqual([
      '2026-10-05 18:00',
      '2026-10-06 09:00',
      '2026-10-06 10:00',
    ]);
  });

  it('не отдаёт записи за пределами полуинтервала', async () => {
    const api = createInMemoryMeetingsApi(seed);

    expect(await api.list({ from: '2026-12-01', to: '2026-12-31' })).toEqual([]);
  });

  it('присваивает создаваемым записям идентификатор и сохраняет их', async () => {
    const api = createInMemoryMeetingsApi();

    const created = await api.create({ date: '2026-10-07', time: '15:30' });

    expect(created.id).toBeTruthy();
    expect(await api.list({ from: '2026-10-01', to: '2026-10-31' })).toEqual([created]);
  });

  it('отдаёт созданную запись в объёме сервера: meeting_type_id в ответ не попадает (S5)', async () => {
    const api = createInMemoryMeetingsApi();

    const created = await api.create({
      date: '2026-10-07',
      time: '15:30',
      meeting_type_id: '7',
    });

    // Сервер тип хранит в БД, но и в create, и в list отдаёт ровно
    // { id, date, time } — фейк зеркалит ответ поле в поле, без спреда draft.
    expect(created).toEqual({ id: '1', date: '2026-10-07', time: '15:30' });
    expect(await api.list({ from: '2026-10-01', to: '2026-10-31' })).toEqual([
      { id: '1', date: '2026-10-07', time: '15:30' },
    ]);
  });

  it('не выдаёт создаваемой записи идентификатор, занятый сидом', async () => {
    const api = createInMemoryMeetingsApi([
      { id: '2', date: '2026-10-06', time: '10:00' },
      { id: '3', date: '2026-10-05', time: '09:00' },
    ]);

    const created = await api.create({ date: '2026-10-07', time: '15:30' });

    expect(created.id).toBe('4');
  });

  it('не делит хранилище между вызовами фабрики', async () => {
    const first = createInMemoryMeetingsApi(seed);
    const second = createInMemoryMeetingsApi(seed);
    const range = { from: '2026-10-01', to: '2026-10-31' };

    await first.create({ date: '2026-10-07', time: '15:30' });

    expect(await first.list(range)).toHaveLength(3);
    expect(await second.list(range)).toHaveLength(2);
  });

  it('не меняет переданные при создании записи', async () => {
    const source: Meeting[] = [];
    const api = createInMemoryMeetingsApi(source);

    await api.create({ date: '2026-10-07', time: '15:30' });

    expect(source).toEqual([]);
  });
});