import { useCallback, useEffect, useState } from 'react';
import { plannedMeetingsApi, type PlannedMeetingsApi } from '../lib/planned-meetings/api.ts';
import type { PlannedMeeting } from '../lib/planned-meetings/types.ts';

const LOAD_ERROR = 'Не удалось получить список запланированных встреч.';

interface PlannedMeetingsState {
  meetings: PlannedMeeting[];
  /** Пока первый ответ не пришёл. */
  loading: boolean;
  /** Текст ошибки для показа пользователю; `null`, если всё в порядке. */
  error: string | null;
}

export interface UsePlannedMeetingsResult extends PlannedMeetingsState {
  /** Перечитывает список. */
  refresh: () => Promise<void>;
}

/**
 * Загрузка админского списка запланированных встреч (S4/F6). Реализация
 * передаётся параметром с `plannedMeetingsApi` по умолчанию — так тесты
 * подставляют заглушку без модулей-моков (T1, ARCHITECTURE §5).
 *
 * Хук никогда не бросает: неудача — это `error: string | null` плюс пустой
 * список, иначе рендер упал бы вместе с сетью (403 у не-админа — тоже сюда).
 * Создания и деактивации здесь нет: список админа — только чтение (Q12c).
 */
export function usePlannedMeetings(
  api: PlannedMeetingsApi = plannedMeetingsApi,
): UsePlannedMeetingsResult {
  const [state, setState] = useState<PlannedMeetingsState>({
    meetings: [],
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState({ meetings: await api.list(), loading: false, error: null });
    } catch {
      setState((previous) => ({ ...previous, loading: false, error: LOAD_ERROR }));
    }
  }, [api]);

  // Первичная загрузка объявлена прямо здесь, а не вызовом refresh: правило
  // react/set-state-in-effect не пропускает вызов функции, трогающей состояние,
  // из тела эффекта — даже если setState происходит после await (тот же приём,
  // что в useMeetingTypes.ts). Флаг cancelled бережёт размонтированный
  // компонент: в StrictMode эффект вызывается дважды.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const meetings = await api.list();
        if (!cancelled) setState({ meetings, loading: false, error: null });
      } catch {
        if (!cancelled) setState({ meetings: [], loading: false, error: LOAD_ERROR });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [api]);

  return { ...state, refresh };
}
