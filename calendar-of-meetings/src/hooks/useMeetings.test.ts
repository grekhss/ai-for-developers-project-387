import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { useMeetings } from './useMeetings.ts';
import { createInMemoryMeetingsApi } from '../lib/meetings/inMemory.ts';
import type { MeetingsApi } from '../lib/meetings/api.ts';
import type { Meeting, MeetingDraft, DateRange } from '../lib/meetings/types.ts';
import { today } from '../lib/date.ts';

/** Дата внутри горизонта, который запрашивает хук. */
const futureDate = dayjs().add(7, 'day').format('YYYY-MM-DD');

function fakeApi(meetings: Meeting[] = []): MeetingsApi {
  return createInMemoryMeetingsApi(meetings);
}

function failingApi(): MeetingsApi {
  return {
    list: () => Promise.reject(new Error('нет связи')),
    create: () => Promise.reject(new Error('нет связи')),
  };
}

describe('useMeetings', () => {
  it('загружает записи и снимает флаг загрузки', async () => {
    const api = fakeApi([{ id: '1', date: futureDate, time: '10:00' }]);

    const { result } = renderHook(() => useMeetings(api));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.meetings).toEqual([{ id: '1', date: futureDate, time: '10:00' }]);
    expect(result.current.error).toBeNull();
  });

  it('сообщает об ошибке загрузки и не бросает её наружу', async () => {
    const { result } = renderHook(() => useMeetings(failingApi()));

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.loading).toBe(false);
    expect(result.current.meetings).toEqual([]);
  });

  it('добавляет запись и перечитывает список', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useMeetings(api));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const created = await result.current.createMeeting({ date: futureDate, time: '11:00' });

    await waitFor(() => expect(result.current.meetings).toHaveLength(1));

    expect(created).toMatchObject({ date: futureDate, time: '11:00' });
    expect(result.current.meetings[0]).toMatchObject({ date: futureDate, time: '11:00' });
    expect(result.current.error).toBeNull();
  });

  it('кладёт ошибку создания в error, а не бросает из обработчика', async () => {
    const { result } = renderHook(() => useMeetings(failingApi()));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(
      result.current.createMeeting({ date: futureDate, time: '11:00' })
    ).resolves.toBeNull();

    expect(result.current.error).not.toBeNull();
  });

  it('прокидывает meeting_type_id в api.create без искажений (S5)', async () => {
    const create = vi.fn<(draft: MeetingDraft) => Promise<Meeting>>((draft) =>
      Promise.resolve({ id: '1', date: draft.date, time: draft.time })
    );
    const api: MeetingsApi = { list: () => Promise.resolve([]), create };
    const { result } = renderHook(() => useMeetings(api));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const draft: MeetingDraft = { date: futureDate, time: '11:00', meeting_type_id: '7' };
    const created = await result.current.createMeeting(draft);

    // Хук — прозрачная труба: тип доходит до адаптера тем, чем его собрали.
    expect(create).toHaveBeenCalledWith(draft);
    // Ответ сервера тип не несёт (S5 хранит его в БД и не эхоит) —
    // хук своё поле не добавляет.
    expect(created).toEqual({ id: '1', date: futureDate, time: '11:00' });
    expect(result.current.error).toBeNull();
  });

  it('на время refresh взводит refreshing и снимает его после ответа', async () => {
    let resolveList: ((meetings: Meeting[]) => void) | undefined;
    const list = vi
      .fn<() => Promise<Meeting[]>>()
      .mockResolvedValueOnce([])
      .mockImplementationOnce(() => new Promise<Meeting[]>((resolve) => { resolveList = resolve; }));
    const api: MeetingsApi = { list, create: () => Promise.reject(new Error('не вызывается')) };
    const { result } = renderHook(() => useMeetings(api));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let refreshing: Promise<void> | undefined;
    act(() => {
      refreshing = result.current.refresh();
    });

    expect(result.current.refreshing).toBe(true);

    resolveList?.([]);
    await act(async () => { await refreshing; });

    expect(result.current.refreshing).toBe(false);
  });

  it('старый ответ загрузки не перезаписывает более новый refresh', async () => {
    let resolveLoad: ((meetings: Meeting[]) => void) | undefined;
    let resolveRefresh: ((meetings: Meeting[]) => void) | undefined;
    const list = vi
      .fn<() => Promise<Meeting[]>>()
      .mockImplementationOnce(
        () => new Promise<Meeting[]>((resolve) => { resolveLoad = resolve; })
      )
      .mockImplementationOnce(
        () => new Promise<Meeting[]>((resolve) => { resolveRefresh = resolve; })
      );
    const api: MeetingsApi = { list, create: () => Promise.reject(new Error('не вызывается')) };
    const { result } = renderHook(() => useMeetings(api));

    let refreshing: Promise<void> | undefined;
    act(() => {
      refreshing = result.current.refresh();
    });

    resolveRefresh?.([{ id: 'new', date: futureDate, time: '12:00' }]);
    await act(async () => { await refreshing; });

    resolveLoad?.([{ id: 'old', date: futureDate, time: '10:00' }]);
    await act(async () => { await Promise.resolve(); });

    expect(result.current.meetings).toEqual([{ id: 'new', date: futureDate, time: '12:00' }]);
  });

  it('ошибка создания не сбрасывает loaded: данные списка остаются достоверными', async () => {
    const api: MeetingsApi = {
      // Первая загрузка пустая, перечитывание после 409 отдаёт чужую запись.
      list: vi
        .fn<() => Promise<Meeting[]>>()
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ id: '1', date: futureDate, time: '10:00' }]),
      create: () => Promise.reject(new Error('дубль слота')),
    };
    const { result } = renderHook(() => useMeetings(api));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loaded).toBe(true);

    await result.current.createMeeting({ date: futureDate, time: '10:00' });

    await waitFor(() =>
      expect(result.current.meetings).toEqual([{ id: '1', date: futureDate, time: '10:00' }])
    );
    expect(result.current.loaded).toBe(true);
    expect(result.current.error).not.toBeNull();
  });

  it('после конфликта список перечитан и ошибка показана', async () => {
    // Запись «с сервера», которой нет в локальном состоянии хука: лица,
    // попадающие в список только после перечитывания.
    const serverMeeting: Meeting = { id: '1', date: futureDate, time: '10:00' };
    const list = vi.fn<() => Promise<Meeting[]>>(() => Promise.resolve([serverMeeting]));
    const api: MeetingsApi = {
      list,
      // Симулируем 409 сервера: create отклоняется, запись не добавляется.
      create: () => Promise.reject(new Error('дубль слота')),
    };

    const { result } = renderHook(() => useMeetings(api));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const requestCountBeforeCreate = list.mock.calls.length;

    await expect(
      result.current.createMeeting({ date: futureDate, time: '10:00' })
    ).resolves.toBeNull();

    // После конфликта список перечитан ещё раз...
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(requestCountBeforeCreate));
    // ...и чужая занятая запись попала в неё.
    expect(result.current.meetings).toEqual([serverMeeting]);
    // Текст CREATE_ERROR при этом показан, а не затёрт перечитыванием.
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });

  it('запрашивает записи в границах гостевого окна — с сегодняшнего дня до дня+13', async () => {
    const list = vi.fn<(range: DateRange) => Promise<Meeting[]>>(() => Promise.resolve([]));
    const api: MeetingsApi = { list, create: () => Promise.reject(new Error('не вызывается')) };

    renderHook(() => useMeetings(api));

    await waitFor(() => expect(list).toHaveBeenCalled());

    const range = list.mock.calls[0]?.[0];

    expect(range?.from).toBe(today());
    // Верхняя граница пересчитывается здесь независимо от lib/window.ts:
    // 90-дневный горизонт (HORIZON_DAYS) заменён на окно Q5 (14 дней).
    expect(range?.to).toBe(dayjs().add(13, 'day').format('YYYY-MM-DD'));
  });
});