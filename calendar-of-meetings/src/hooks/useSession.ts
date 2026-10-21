import { useCallback, useEffect, useState } from 'react';
import { sessionApi, type SessionApi } from '../lib/session/api.ts';
import type { LoginInput, Session } from '../lib/session/types.ts';

/**
 * Тексты ошибок — на русском и про результат действия, а не про технику:
 * вызывающий показывает их пользователю (тот же приём, что в useMeetings).
 */
const RESTORE_ERROR = 'Не удалось восстановить сессию. Обновите страницу.';
const LOGIN_ERROR = 'Не удалось войти. Проверьте пароль и попробуйте ещё раз.';
const LOGOUT_ERROR = 'Не удалось выйти. Попробуйте ещё раз.';

interface SessionState {
  /** Текущая сессия; `null` — не вошёл (после 401 от GET /api/me или выхода). */
  session: Session | null;
  /** Пока GET /api/me не ответил: роль на перезагрузке ещё неизвестна (C9). */
  loading: boolean;
  /** Текст ошибки для показа пользователю; `null`, если всё в порядке. */
  error: string | null;
}

export interface UseSessionResult extends SessionState {
  /** Входит и запоминает сессию; при неудаче — `null` и текст в `error`. */
  login: (input: LoginInput) => Promise<Session | null>;
  /** Выходит; `true` — успех, `false` — текст ошибки в `error`. */
  logout: () => Promise<boolean>;
}

/**
 * Вход и выход (логин/логаут, роль, имя гостя; Q9/Q12a).
 *
 * Сессия восстанавливается из `GET /api/me`: cookie httpOnly, и клиент её
 * никогда не читает — на перезагрузке о входе можно узнать только у сервера
 * (C9). Хук никогда не бросает: и `login`, и `logout` отвечают результатом,
 * а сбой кладут в `error: string | null` — тот же контракт, что в useMeetings.
 *
 * Тесты подставляют свою реализацию через параметр `api` — модули-моки не
 * нужны и не текут между тестами (ARCHITECTURE §5).
 */
export function useSession(api: SessionApi = sessionApi): UseSessionResult {
  const [state, setState] = useState<SessionState>({
    session: null,
    loading: true,
    error: null,
  });

  // Загрузка сразу в эффекте: useState здесь не живёт (правило репозитория),
  // а флаг cancelled гасит гонку размонтирования с ответом сервера.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // me() не бросает на 401 — там возвращается null (сессии нет), так что
        // catch ловит только настоящие сбои: сеть, 500.
        const session = await api.me();
        if (!cancelled) setState({ session, loading: false, error: null });
      } catch {
        if (!cancelled) setState({ session: null, loading: false, error: RESTORE_ERROR });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [api]);

  const login = useCallback(
    async (input: LoginInput) => {
      try {
        const session = await api.login(input);
        setState({ session, loading: false, error: null });
        return session;
      } catch {
        // Состояние не трогаем: сессия, если была, остаётся — вход мог упасть
        // посреди чужой попытки, терять чужой успех нельзя.
        setState((previous) => ({ ...previous, error: LOGIN_ERROR }));
        return null;
      }
    },
    [api],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
      setState({ session: null, loading: false, error: null });
      return true;
    } catch {
      // Сервер без сессии отвечает 401 — отображаем как ошибку, а не как
      // молчаливый выход: раз сервер отказал, сессия могла остаться.
      setState((previous) => ({ ...previous, error: LOGOUT_ERROR }));
      return false;
    }
  }, [api]);

  return { ...state, login, logout };
}
