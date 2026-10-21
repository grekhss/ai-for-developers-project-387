import { createHttpSessionApi } from './http.ts';
import type { LoginInput, Session } from './types.ts';

/**
 * Контракт доступа к сессии — тот же приём, что у `MeetingsApi`:
 * UI видит только порт, детали транспорта (HTTP, in-memory) за ним.
 */
export interface SessionApi {
  /**
   * Вход: роль определяет сервер по паролю (Q9), имя гостя — для гостя.
   * Неизвестный пароль или отсутствующее имя — исключение: сервер отвечает
   * 401 или 400.
   */
  login(input: LoginInput): Promise<Session>;
  /** Выход: сессионная cookie очищается. Без активной сессии — исключение (401). */
  logout(): Promise<void>;
  /**
   * Текущая сессия после перезагрузки (C9): cookie httpOnly, прочитать её
   * нельзя, роль восстанавливается только через `GET /api/me`.
   * `null` — сессии нет: это штатное состояние, а не ошибка.
   */
  me(): Promise<Session | null>;
}

/**
 * Реализация, которой пользуется приложение: HTTP-клиент на /api/login,
 * /api/logout и /api/me (в dev их проксирует Vite, в проде отдаёт
 * express-сервер). Тесты подставляют свою реализацию через параметр хука,
 * поэтому менять её здесь больше не нужно.
 */
export const sessionApi: SessionApi = createHttpSessionApi();
