import { useCallback, useEffect, useRef, useState } from 'react';
import { meetingsApi, type MeetingsApi } from '../lib/meetings/api.ts';
import type { Meeting, MeetingDraft } from '../lib/meetings/types.ts';
import { now, today } from '../lib/date.ts';
import { windowEnd } from '../lib/window.ts';

const LOAD_ERROR = 'Не удалось получить список записей.';
const CREATE_ERROR = 'Не удалось создать запись. Выберите другое время.';

interface MeetingsState {
  meetings: Meeting[];
  /** Пока первый ответ не пришёл. */
  loading: boolean;
  /** Пока идёт ручное перечитывание списка. */
  refreshing: boolean;
  /**
   * Хотя бы один список успешно получен. По этому флагу страница считает
   * счётчики: ошибка создания записи не должна прятать уже достоверные данные.
   */
  loaded: boolean;
  /** Текст ошибки для показа пользователю; `null`, если всё в порядке. */
  error: string | null;
}

export interface UseMeetingsResult extends MeetingsState {
  /** Перечитывает записи. */
  refresh: () => Promise<void>;
  /**
   * Создаёт запись и возвращает её. Draft может нести `meeting_type_id` (S5) —
   * хук пересылает его в api без изменений, а в ответе его нет: сервер хранит
   * тип в БД и отвечает ровно `{ id, date, time }`. Ошибки не бросает: кладёт
   * текст в `error` и возвращает `null` — так вызывающий отличает успех от неудачи.
   */
  createMeeting: (draft: MeetingDraft) => Promise<Meeting | null>;
}

/**
 * Загрузка и создание записей. Реализация передаётся параметром, чтобы тесты
 * подставляли заглушку без модулей-моков.
 */
export function useMeetings(api: MeetingsApi = meetingsApi): UseMeetingsResult {
  const [state, setState] = useState<MeetingsState>({
    meetings: [],
    loading: true,
    refreshing: false,
    loaded: false,
    error: null,
  });

  // Номер последнего запроса: более старый ответ не должен перезаписать свежий.
  const latestRequest = useRef(0);

  // Запрос сам по себе состояние не трогает — только возвращает данные.
  // Диапазон — гостевое окно (Q5: сегодня … сегодня+13), а не прежние 90
  // дней: дальше записаться всё равно нельзя (isBookableDay в календаре), так
  // что лишние данные не грузим. Админский список окном не ограничен (Q6) —
  // придёт отдельной поверхностью (S4/F5), этот хук ему не подставляется.
  const request = useCallback(
    (): Promise<Meeting[]> =>
      api.list({
        from: today(),
        to: windowEnd(now()),
      }),
    [api],
  );

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setState((previous) => ({ ...previous, refreshing: true }));

    try {
      const meetings = await request();
      if (requestId !== latestRequest.current) return;

      setState((previous) => ({
        ...previous,
        meetings,
        loading: false,
        refreshing: false,
        loaded: true,
        error: null,
      }));
    } catch {
      if (requestId !== latestRequest.current) return;

      setState((previous) => ({
        ...previous,
        // Ошибка перечитывания делает и старый список недостоверным: страница
        // прячет счётчики и сетку, пока «Обновить» не завершится успехом.
        meetings: [],
        loading: false,
        refreshing: false,
        loaded: false,
        error: LOAD_ERROR,
      }));
    }
  }, [request]);

  const createMeeting = useCallback(async (draft: MeetingDraft) => {
    try {
      const meeting = await api.create(draft);
      await refresh();
      return meeting;
    } catch {
      // При конфликте (409) сервер не создал запись, а локальный список устарел:
      // чужой занятый слот остался бы визуально свободным. Сначала перечитываем,
      // потом ставим текст ошибки — refresh при успехе сбрасывает error в null,
      // и наоборот порядок стёр бы CREATE_ERROR. Флаг `loaded` при этом остаётся
      // true, поэтому счётчики календаря не пропадают из-за ошибки создания.
      await refresh();
      setState((previous) => ({ ...previous, error: CREATE_ERROR }));
      return null;
    }
  }, [api, refresh]);

  // Первичная загрузка объявлена прямо здесь, а не вызовом refresh: правило
  // react/set-state-in-effect не пропускает вызов функции, трогающей состояние,
  // из тела эффекта — даже если setState происходит после await. Флаг cancelled
  // защищает от записи в состояние размонтированного компонента, в StrictMode
  // эффект вызывается дважды.
  useEffect(() => {
    let cancelled = false;
    const requestId = ++latestRequest.current;

    const load = async () => {
      try {
        const meetings = await request();
        if (cancelled || requestId !== latestRequest.current) return;

        setState({ meetings, loading: false, refreshing: false, loaded: true, error: null });
      } catch {
        if (cancelled || requestId !== latestRequest.current) return;

        setState({
          meetings: [],
          loading: false,
          refreshing: false,
          loaded: false,
          error: LOAD_ERROR,
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [request]);

  return { ...state, refresh, createMeeting };
}