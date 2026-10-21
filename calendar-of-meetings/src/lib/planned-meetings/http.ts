import { listPlannedMeetings } from '../api-gen';
import { createClient } from '../api-gen/client';
import type { PlannedMeetingsApi } from './api.ts';

/**
 * HTTP-реализация контракта поверх сгенерированного SDK (K3, D5/ADR-0005) —
 * зеркало `../meeting-types/http.ts` для ручки S4.
 *
 * Пустой baseUrl означает «текущий origin»: так работают dev (Vite-прокси) и
 * прод (express-сервер) без ветвлений. `credentials: 'include'` обязателен —
 * без него браузер не подложит session-cookie, сервер вернёт 401 (D3).
 *
 * Функции SDK по умолчанию не бросают, а возвращают `{ data, error }`, поэтому
 * здесь из ошибки собирается исключение с русским текстом запроса, а исходное
 * сетевое исключение пробрасывается как есть — хук usePlannedMeetings переводит
 * throw в `error: string | null` и никогда не роняет рендер.
 */
export function createHttpPlannedMeetingsApi(baseUrl = ''): PlannedMeetingsApi {
  const client = createClient({ baseUrl, credentials: 'include' });

  return {
    async list() {
      // Без параметров: нижнюю границу и сортировку держит сервер (S4/Q6).
      const result = await listPlannedMeetings({ client });
      if (result.error !== undefined) throw failure(result, 'GET /api/admin/meetings');
      return result.data;
    },
  };
}

/**
 * Ошибка SDK → исключение. Успешный ответ сюда не попадает: вызывающий сужает
 * union по `error !== undefined`. Дубль meeting-types/http.ts — намеренно:
 * модули `lib/*` не должны зависеть друг от друга, чтобы зеркальная структура
 * оставалась самодостаточной.
 */
function failure(result: { error: unknown; response?: Response }, request: string): Error {
  // fetch сам упал (сеть, abort): клиент положил исходное исключение в `error`,
  // и его текст должен дойти до вызывающего без подмены нашим сообщением.
  if (result.error instanceof Error) return result.error;
  // Ответ не-2xx: SDK разобрал JSON-тело ошибки, а текст для пользователя —
  // уже русский, в `error` самого хука.
  return new Error(`${request} вернул ${result.response?.status}`);
}
