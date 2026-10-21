// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDatabase } from './db.js';
import { createMeetingTypesRepository } from './meeting-types-repository.js';

describe('createMeetingTypesRepository', () => {
  function repo() {
    return createMeetingTypesRepository(createDatabase(':memory:'));
  }

  it('пустая БД отдаёт два пустых списка', () => {
    expect(repo().listAll()).toEqual([]);
    expect(repo().listActive()).toEqual([]);
  });

  it('create возвращает тип с id строкой и active: true', () => {
    const created = repo().create({ name: 'Консультация', description: '30 минут' });

    expect(created).toEqual({ id: '1', name: 'Консультация', description: '30 минут', active: true });
    expect(typeof created.id).toBe('string');
  });

  it('списки отдают типы в порядке создания (по id)', () => {
    const types = repo();
    types.create({ name: 'Первый', description: '' });
    types.create({ name: 'Второй', description: '' });

    expect(types.listAll().map((type) => type.name)).toEqual(['Первый', 'Второй']);
  });

  it('deactivate помечает тип неактивным: listActive его скрывает, listAll — нет', () => {
    const types = repo();
    types.create({ name: 'Консультация', description: '' });
    types.create({ name: 'Собеседование', description: '' });

    const deactivated = types.deactivate('1');
    expect(deactivated).toEqual({
      id: '1',
      name: 'Консультация',
      description: '',
      active: false,
    });

    expect(types.listActive().map((type) => type.name)).toEqual(['Собеседование']);
    expect(types.listAll().map((type) => type.name)).toEqual(['Консультация', 'Собеседование']);
  });

  it('deactivate неизвестного id возвращает undefined', () => {
    const types = repo();
    expect(types.deactivate('99')).toBeUndefined();
    // Нечисловой id тоже undefined, а не исключение: строка в чужих руках
    // вида 'abc' просто не находит строку (сравнение INTEGER-колонки с текстом).
    expect(types.deactivate('abc')).toBeUndefined();
    // Пустая таблица: UPDATE трогает ноль строк.
    expect(types.deactivate('1')).toBeUndefined();
  });

  it('повторная деактивация идемпотентна — тип возвращается неактивным', () => {
    const types = repo();
    types.create({ name: 'Консультация', description: '' });

    expect(types.deactivate('1')?.active).toBe(false);
    expect(types.deactivate('1')).toEqual({
      id: '1',
      name: 'Консультация',
      description: '',
      active: false,
    });
  });
});
