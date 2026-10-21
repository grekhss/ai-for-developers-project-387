import { describe, it, expect } from 'vitest';
import { createInMemoryMeetingTypesApi } from './inMemory.ts';
import type { MeetingType } from './types.ts';

const seed: MeetingType[] = [
  { id: '1', name: 'Консультация', description: '30 минут', active: true },
  { id: '2', name: 'Собеседование', description: '', active: false },
  { id: '3', name: 'Разбор', description: '', active: true },
];

describe('createInMemoryMeetingTypesApi', () => {
  it('отдаёт сид как есть, в порядке добавления', async () => {
    const api = createInMemoryMeetingTypesApi(seed);

    const types = await api.list();

    // Фейк не играет роли: разделение «админу все / гостю активные» — работа
    // настоящего сервера (S3), здесь он хранит и отдаёт всё, что ему дали.
    expect(types.map((type) => type.id)).toEqual(['1', '2', '3']);
    expect(types[1]?.active).toBe(false);
  });

  it('create присваивает идентификатор, ставит active: true и сохраняет тип', async () => {
    const api = createInMemoryMeetingTypesApi();

    const created = await api.create({ name: 'Консультация', description: '30 минут' });

    expect(created).toEqual({
      id: '1',
      name: 'Консультация',
      description: '30 минут',
      active: true,
    });
    expect(await api.list()).toEqual([created]);
  });

  it('не выдаёт создаваемому типу идентификатор, занятый сидом', async () => {
    const api = createInMemoryMeetingTypesApi([
      { id: '2', name: 'Консультация', description: '', active: true },
      { id: '3', name: 'Разбор', description: '', active: true },
    ]);

    const created = await api.create({ name: 'Собеседование', description: '' });

    expect(created.id).toBe('4');
  });

  it('deactivate помечает тип неактивным, повтор идемпотентен', async () => {
    const api = createInMemoryMeetingTypesApi(seed);

    const deactivated = await api.deactivate('1');

    expect(deactivated).toEqual({ id: '1', name: 'Консультация', description: '30 минут', active: false });
    expect((await api.list()).find((type) => type.id === '1')?.active).toBe(false);
    // Повторный вызов — не ошибка и не смена состояния (Q7).
    expect(await api.deactivate('1')).toEqual(deactivated);
  });

  it('deactivate неизвестного id отклоняется, а не возвращает undefined', async () => {
    const api = createInMemoryMeetingTypesApi(seed);

    // Настоящий сервер на неизвестный id отвечает 400, и адаптер http.ts
    // превращает его в исключение — фейк обязан вести себя так же.
    await expect(api.deactivate('99')).rejects.toThrow('тип встречи не найден');
    expect(await api.list()).toHaveLength(3);
  });

  it('не делит хранилище между вызовами фабрики', async () => {
    const first = createInMemoryMeetingTypesApi(seed);
    const second = createInMemoryMeetingTypesApi(seed);

    await first.create({ name: 'Собеседование', description: '' });
    await first.deactivate('1');

    expect(await first.list()).toHaveLength(4);
    const secondList = await second.list();
    expect(secondList).toHaveLength(3);
    expect(secondList[0]?.active).toBe(true);
  });

  it('не меняет переданный при создании массив и его элементы', async () => {
    const source: MeetingType[] = [{ id: '1', name: 'Консультация', description: '', active: true }];
    const api = createInMemoryMeetingTypesApi(source);

    await api.create({ name: 'Собеседование', description: '' });
    await api.deactivate('1');

    expect(source).toEqual([{ id: '1', name: 'Консультация', description: '', active: true }]);
  });
});
