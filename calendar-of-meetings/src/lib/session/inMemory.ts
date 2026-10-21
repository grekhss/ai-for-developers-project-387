import type { SessionApi } from './api.ts';
import type { LoginInput, Session } from './types.ts';

/**
 * Сессия в памяти — заглушка вместо бэкенда. Фабрика, а не синглтон: тесты
 * не делят состояние (тот же приём, что у `createInMemoryMeetingsApi`).
 *
 * Фейк повторяет сервер (S2, `server/routes.ts`): роль определяется только по
 * совпадению пароля — по фикстурным `'admin'` / `'guest'`; имя гостя
 * обрезается и обязательно для гостя; неверный пароль — 401, повторный выход
 * без входа — 401. Саму проверку паролей он не эмулирует до бита — это работа
 * сервера, покрытая его тестами.
 *
 * `seed` — уже вошедшая сессия: так тесты подставляют готовую роль, не
 * проходя через login.
 */
export function createInMemorySessionApi(seed: Session | null = null): SessionApi {
  let session = seed;

  return {
    async login(input: LoginInput) {
      if (input.password === 'admin') {
        session = { role: 'admin', bookerName: null };
        return session;
      }

      if (input.password === 'guest') {
        const bookerName = input.bookerName?.trim();
        // Как на сервере: для гостя непустое имя обязательно (400).
        if (!bookerName) throw new Error('для гостя обязателен bookerName');
        session = { role: 'guest', bookerName };
        return session;
      }

      throw new Error('неверный пароль');
    },

    async logout() {
      if (session === null) {
        // Сервер без сессии отвечает 401 — фейк повторяет отказ, а не молча
        // «выходит»: хук обязан показать ошибку, а не потерять её.
        throw new Error('нет активной сессии');
      }
      session = null;
    },

    async me() {
      return session;
    },
  };
}
