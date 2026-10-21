import { getCurrentSession, login as loginRequest, logout as logoutRequest } from '../api-gen';
import { createClient } from '../api-gen/client';
import type { SessionApi } from './api.ts';
import type { LoginInput } from './types.ts';

/**
 * HTTP-реализация контракта поверх сгенерированного SDK (K3, D5/ADR-0005) —
 * зеркало `../meetings/http.ts` для сессионных ручек S2.
 *
 * Пустой baseUrl означает «текущий origin»: так работают dev (Vite-прокси) и
 * прод (express-сервер) без ветвлений. `credentials: 'include'` обязателен —
 * без него браузер не подложит session-cookie, и ни вход, ни `me()` не
 * заработают (D3).
 *
 * Функции SDK по умолчанию не бросают, а возвращают `{ data, error }`, поэтому
 * здесь из ошибки собирается исключение с русским текстом запроса; хук
 * useSession переводит throw в `error: string | null`.
 */
export function createHttpSessionApi(baseUrl = ''): SessionApi {
  const client = createClient({ baseUrl, credentials: 'include' });

  return {
    async login(input: LoginInput) {
      // Role не передаётся: сервер определяет её только по паролю (Q9),
      // клиентскую роль в запросе сервер не слушает.
      const result = await loginRequest({ client, body: input });
      if (result.error !== undefined) throw failure(result, 'POST /api/login');
      return result.data;
    },

    async logout() {
      const result = await logoutRequest({ client });
      if (result.error !== undefined) throw failure(result, 'POST /api/logout');
    },

    async me() {
      const result = await getCurrentSession({ client });
      if (result.error !== undefined) {
        // 401 — штатный ответ «сессии нет» (cookie истекла или ещё не
        // выдавалась), он не должен выглядеть как сбой сети. Остальные
        // ошибки — исключение: спрятать 500 под «гость» значило бы молча
        // разлогинивать пользователя.
        if (result.response?.status === 401) return null;
        throw failure(result, 'GET /api/me');
      }
      return result.data;
    },
  };
}

/**
 * Ошибка SDK → исключение; дубль meetings/http.ts — намеренно: модули
 * `lib/meetings/`, `lib/meeting-types/` и `lib/session/` не зависят друг от
 * друга, чтобы зеркальная структура оставалась самодостаточной.
 */
function failure(result: { error: unknown; response?: Response }, request: string): Error {
  // fetch сам упал (сеть, abort): клиент положил исходное исключение в `error`,
  // и его текст должен дойти до вызывающего без подмены нашим сообщением.
  if (result.error instanceof Error) return result.error;
  // Ответ не-2xx: SDK разобрал JSON-тело ошибки, а текст для пользователя —
  // уже русский, в `error` самого хука.
  return new Error(`${request} вернул ${result.response?.status}`);
}
