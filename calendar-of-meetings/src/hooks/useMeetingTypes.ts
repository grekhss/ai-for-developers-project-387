import { useCallback, useEffect, useState } from 'react';
import { meetingTypesApi, type MeetingTypesApi } from '../lib/meeting-types/api.ts';
import type { MeetingType, MeetingTypeDraft } from '../lib/meeting-types/types.ts';

const LOAD_ERROR = 'Не удалось получить список типов встреч.';
const CREATE_ERROR = 'Не удалось создать тип встречи.';
const DEACTIVATE_ERROR = 'Не удалось деактивировать тип встречи.';

interface MeetingTypesState {
  meetingTypes: MeetingType[];
  /** Пока первый ответ не пришёл. */
  loading: boolean;
  /** Текст ошибки для показа пользователю; `null`, если всё в порядке. */
  error: string | null;
}

export interface UseMeetingTypesResult extends MeetingTypesState {
  /** Перечитывает типы. */
  refresh: () => Promise<void>;
  /**
   * Создаёт тип и возвращает его. Ошибки не бросает: кладёт текст в `error`
   * и возвращает `null` — так вызывающий отличает успех от неудачи.
   */
  createMeetingType: (draft: MeetingTypeDraft) => Promise<MeetingType | null>;
  /** Деактивирует тип; контракт ошибок тот же, что у createMeetingType. */
  deactivateMeetingType: (id: string) => Promise<MeetingType | null>;
}

/**
 * Загрузка, создание и деактивация типов встреч (F3). Реализация передаётся
 * параметром с `meetingTypesApi` по умолчанию — так тесты подставляют заглушку
 * без модулей-моков (T1, ARCHITECTURE §5: `vi.mock` течёт между тестами).
 *
 * Хук никогда не бросает: любая неудача — это `error: string | null` плюс
 * `null` вместо результата, иначе рендер упал бы вместе с сетью. Гость может
 * только читать — список он видит ровно такой, каким его отдал сервер
 * (активные типы, S3); create/deactivate вызывает админ, 403 сервера
 * превращается в текст ошибки, а не в исключение.
 */
export function useMeetingTypes(api: MeetingTypesApi = meetingTypesApi): UseMeetingTypesResult {
  const [state, setState] = useState<MeetingTypesState>({
    meetingTypes: [],
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState({ meetingTypes: await api.list(), loading: false, error: null });
    } catch {
      setState((previous) => ({ ...previous, loading: false, error: LOAD_ERROR }));
    }
  }, [api]);

  const createMeetingType = useCallback(
    async (draft: MeetingTypeDraft) => {
      try {
        const created = await api.create(draft);
        // Успех нужно перечитать: таблица админа показывает новый тип сразу.
        await refresh();
        return created;
      } catch {
        // Перечитывать нечего — сервер ничего не изменил (400/403), локальный
        // список не устарел. В useMeetings refresh здесь из-за 409 (чужой
        // слот мог занять место), у типов конфликтного статуса нет.
        setState((previous) => ({ ...previous, error: CREATE_ERROR }));
        return null;
      }
    },
    [api, refresh],
  );

  const deactivateMeetingType = useCallback(
    async (id: string) => {
      try {
        const deactivated = await api.deactivate(id);
        await refresh();
        return deactivated;
      } catch {
        setState((previous) => ({ ...previous, error: DEACTIVATE_ERROR }));
        return null;
      }
    },
    [api, refresh],
  );

  // Первичная загрузка объявлена прямо здесь, а не вызовом refresh: правило
  // react/set-state-in-effect не пропускает вызов функции, трогающей состояние,
  // из тела эффекта — даже если setState происходит после await (тот же
  // приём, что в useMeetings.ts). Флаг cancelled бережёт размонтированный
  // компонент, в StrictMode эффект вызывается дважды.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const meetingTypes = await api.list();
        if (!cancelled) setState({ meetingTypes, loading: false, error: null });
      } catch {
        if (!cancelled) setState({ meetingTypes: [], loading: false, error: LOAD_ERROR });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [api]);

  return { ...state, refresh, createMeetingType, deactivateMeetingType };
}
