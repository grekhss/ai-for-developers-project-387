import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePlannedMeetings } from './usePlannedMeetings.ts';
import { createInMemoryPlannedMeetingsApi } from '../lib/planned-meetings/inMemory.ts';
import type { PlannedMeetingsApi } from '../lib/planned-meetings/api.ts';
import type { PlannedMeeting } from '../lib/planned-meetings/types.ts';

// Даты берём заведомо в будущем: фейк отсекает прошлое, и сид с 2026 годом
// исчез бы после наступления 2027 — тест обязан не зависеть от календаря.
const seed: PlannedMeeting[] = [
  { date: '2099-01-01', time: '09:00', type: 'Консультация', booker: 'Иван' },
  { date: '2099-01-02', time: '10:00', type: null, booker: null },
];

function failingApi(): PlannedMeetingsApi {
  return { list: () => Promise.reject(new Error('нет связи')) };
}

describe('usePlannedMeetings', () => {
  it('загружает список и снимает флаг загрузки', async () => {
    const api = createInMemoryPlannedMeetingsApi(seed);

    const { result } = renderHook(() => usePlannedMeetings(api));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.meetings).toEqual(seed);
    expect(result.current.error).toBeNull();
  });

  it('сообщает об ошибке загрузки и не бросает её наружу', async () => {
    const { result } = renderHook(() => usePlannedMeetings(failingApi()));

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.loading).toBe(false);
    expect(result.current.meetings).toEqual([]);
  });

  it('refresh перечитывает список тем же адаптером', async () => {
    const list = vi.fn<() => Promise<PlannedMeeting[]>>(() => Promise.resolve(seed));
    // Адаптер создаётся один раз: инлайн-объект в renderHook давал бы новый `api`
    // на каждый рендер, и эффект usePlannedMeetings (зависимость `[api]`)
    // перезапускался бы бесконечно.
    const api: PlannedMeetingsApi = { list };
    const { result } = renderHook(() => usePlannedMeetings(api));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(list).toHaveBeenCalledTimes(1);

    await result.current.refresh();

    // Второй вызов — и есть проверяемое: без него refresh был бы заглушкой.
    expect(list).toHaveBeenCalledTimes(2);
    expect(result.current.meetings).toEqual(seed);
  });
});
