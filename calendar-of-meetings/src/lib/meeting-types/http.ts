import { createMeetingType, deactivateMeetingType, listMeetingTypes } from '../api-gen';
import { createClient } from '../api-gen/client';
import type { MeetingTypesApi } from './api.ts';
import type { MeetingTypeDraft } from './types.ts';

/**
 * HTTP-реализация контракта поверх сгенерированного SDK (K3, D5/ADR-0005) —
 * зеркало `../meetings/http.ts` для ручек S3.
 *
 * Пустой baseUrl означает «текущий origin»: так работают dev (Vite-прокси) и
 * прод (express-сервер) без ветвлений. `credentials: 'include'` обязателен —
 * без него браузер не подложит session-cookie, сервер вернёт 401 (D3).
 *
 * Функции SDK по умолчанию не бросают, а возвращают `{ data, error }`, поэтому
 * здесь из ошибки собирается исключение с русским текстом запроса, а исходное
 * сетевое исключение пробрасывается как есть — хук useMeetingTypes переводит
 * throw в `error: string | null` и никогда не роняет рендер.
 */
export function createHttpMeetingTypesApi(baseUrl = ''): MeetingTypesApi {
  const client = createClient({ baseUrl, credentials: 'include' });

  return {
    async list() {
      // Без параметров: гость или админ — сервер решает по сессии (S3).
      const result = await listMeetingTypes({ client });
      if (result.error !== undefined) throw failure(result, 'GET /api/meeting-types');
      return result.data;
    },

    async create(draft: MeetingTypeDraft) {
      // Content-Type: application/json SDK ставит сам для POST с телом —
      // без него express.json() не распарсит тело и каждый POST вернул бы 400.
      const result = await createMeetingType({ client, body: draft });
      if (result.error !== undefined) throw failure(result, 'POST /api/meeting-types');
      return result.data;
    },

    async deactivate(id: string) {
      const result = await deactivateMeetingType({ client, path: { id } });
      if (result.error !== undefined) {
        // Путь собирается вручную для текста ошибки; сам URL SDK строит из
        // шаблона спеки '/api/meeting-types/{id}/deactivate'.
        throw failure(result, `POST /api/meeting-types/${id}/deactivate`);
      }
      return result.data;
    },
  };
}

/**
 * Ошибка SDK → исключение. Успешный ответ сюда не попадает: вызывающий сужает
 * union по `error !== undefined`. Дубль meetings/http.ts — намеренно: модули
 * `lib/meetings/` и `lib/meeting-types/` не должны зависеть друг от друга,
 * чтобы зеркальная структура (F3) оставалась самодостаточной.
 */
function failure(result: { error: unknown; response?: Response }, request: string): Error {
  // fetch сам упал (сеть, abort): клиент положил исходное исключение в `error`,
  // и его текст должен дойти до вызывающего без подмены нашим сообщением.
  if (result.error instanceof Error) return result.error;
  // Ответ не-2xx: SDK разобрал JSON-тело ошибки, а текст для пользователя —
  // уже русский, в `error` самого хука.
  return new Error(`${request} вернул ${result.response?.status}`);
}
