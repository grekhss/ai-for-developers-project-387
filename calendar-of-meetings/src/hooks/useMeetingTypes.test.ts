import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMeetingTypes } from './useMeetingTypes.ts';
import { createInMemoryMeetingTypesApi } from '../lib/meeting-types/inMemory.ts';
import type { MeetingTypesApi } from '../lib/meeting-types/api.ts';
import type { MeetingType } from '../lib/meeting-types/types.ts';

const seed: MeetingType[] = [
  { id: '1', name: 'Консультация', description: '30 минут', active: true },
  { id: '2', name: 'Собеседование', description: '', active: false },
];

function fakeApi(types: MeetingType[] = []): MeetingTypesApi {
  return createInMemoryMeetingTypesApi(types);
}

function failingApi(): MeetingTypesApi {
  return {
    list: () => Promise.reject(new Error('нет связи')),
    create: () => Promise.reject(new Error('нет связи')),
    deactivate: () => Promise.reject(new Error('нет связи')),
  };
}

describe('useMeetingTypes', () => {
  it('загружает типы и снимает флаг загрузки', async () => {
    const api = fakeApi(seed);

    const { result } = renderHook(() => useMeetingTypes(api));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.meetingTypes).toEqual(seed);
    expect(result.current.error).toBeNull();
  });

  it('сообщает об ошибке загрузки и не бросает её наружу', async () => {
    const { result } = renderHook(() => useMeetingTypes(failingApi()));

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.loading).toBe(false);
    expect(result.current.meetingTypes).toEqual([]);
  });

  it('создаёт тип и перечитывает список', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useMeetingTypes(api));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const created = await result.current.createMeetingType({ name: 'Разбор', description: '' });

    await waitFor(() => expect(result.current.meetingTypes).toHaveLength(1));

    expect(created).toMatchObject({ name: 'Разбор', active: true });
    expect(result.current.meetingTypes[0]).toMatchObject({ name: 'Разбор', active: true });
    expect(result.current.error).toBeNull();
  });

  it('кладёт ошибку создания в error, возвращает null и не перечитывает список', async () => {
    // Сервер на 400/403 ничего не изменил — локальный список не устарел, и
    // в отличие от useMeetings (там refresh из-за 409) перечитывать нечего.
    const list = vi.fn<() => Promise<MeetingType[]>>(() => Promise.resolve([]));
    const api: MeetingTypesApi = {
      list,
      create: () => Promise.reject(new Error('невалидное тело')),
      deactivate: () => Promise.reject(new Error('не вызывается')),
    };

    const { result } = renderHook(() => useMeetingTypes(api));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBeforeCreate = list.mock.calls.length;

    await expect(
      result.current.createMeetingType({ name: 'Разбор', description: '' })
    ).resolves.toBeNull();

    // Счётчик — сразу: если б перечитывание случилось, list был бы вызван до
    // возврата. error — через waitFor: React отложил setState до ближайшей
    // отрисовки, и result.current его ещё не видит.
    expect(list.mock.calls.length).toBe(callsBeforeCreate);
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });

  it('деактивирует тип и перечитывает список', async () => {
    const api = fakeApi(seed);
    const { result } = renderHook(() => useMeetingTypes(api));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const deactivated = await result.current.deactivateMeetingType('1');

    await waitFor(() =>
      expect(result.current.meetingTypes.find((type) => type.id === '1')?.active).toBe(false),
    );

    expect(deactivated).toMatchObject({ id: '1', name: 'Консультация', active: false });
    // Второй тип деактивация не затронула.
    expect(result.current.meetingTypes.find((type) => type.id === '2')?.active).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('кладёт ошибку деактивации в error, а не бросает из обработчика', async () => {
    // Загрузка успешна — error стартует с null, и ненулевое значение после
    // неудачной деактивации доказывает именно её ошибку, а не ошибку чтения.
    const api: MeetingTypesApi = {
      list: () => Promise.resolve([]),
      create: () => Promise.reject(new Error('не вызывается')),
      deactivate: () => Promise.reject(new Error('нет связи')),
    };

    const { result } = renderHook(() => useMeetingTypes(api));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.deactivateMeetingType('1')).resolves.toBeNull();

    expect(result.current.meetingTypes).toEqual([]);
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});
