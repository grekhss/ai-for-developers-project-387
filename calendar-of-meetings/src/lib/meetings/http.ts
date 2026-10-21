import { createMeeting, listMeetings } from '../api-gen';
import { createClient } from '../api-gen/client';
import type { MeetingsApi } from './api.ts';
import type { DateRange, MeetingDraft } from './types.ts';

/**
 * HTTP-реализация контракта поверх сгенерированного SDK (K3, D5/ADR-0005).
 *
 * Порт `MeetingsApi` и сигнатуры не меняются: UI по-прежнему видит только их.
 * Пустой baseUrl означает «текущий origin» — так работают dev (Vite-прокси) и
 * прод (express-сервер) без ветвлений.
 *
 * `credentials: 'include'` обязателен: сессия живёт в httpOnly-cookie `session`,
 * и без него браузер не станет подкладывать её к запросам на /api/meetings,
 * сервер вернёт 401, а вход «не запомнится» после перезагрузки (D3).
 *
 * Функции SDK по умолчанию не бросают, а возвращают `{ data, error }` — так
 * здесь из ошибки собирается прежнее исключение с русским текстом, а исходное
 * сетевое исключение пробрасывается как есть.
 */
export function createHttpMeetingsApi(baseUrl = ''): MeetingsApi {
  const client = createClient({ baseUrl, credentials: 'include' });

  return {
    async list({ from, to }: DateRange) {
      const result = await listMeetings({ client, query: { from, to } });
      if (result.error !== undefined) throw failure(result, 'GET /api/meetings');
      return result.data;
    },

    async create(draft: MeetingDraft) {
      // Content-Type: application/json SDK ставит сам для POST с телом —
      // без него express.json() не распарсит тело и каждый POST вернул бы 400.
      const result = await createMeeting({ client, body: draft });
      if (result.error !== undefined) throw failure(result, 'POST /api/meetings');
      return result.data;
    },
  };
}

/**
 * Ошибка SDK → исключение. Успешный ответ сюда не попадает: вызывающий сужает
 * union по `error !== undefined`.
 */
function failure(result: { error: unknown; response?: Response }, request: string): Error {
  // fetch сам упал (сеть, abort): клиент положил исходное исключение в `error`,
  // и его текст должен дойти до вызывающего без подмены нашим сообщением.
  if (result.error instanceof Error) return result.error;
  // Ответ не-2xx: SDK разобрал JSON-тело ошибки, а текст для пользователя — наш.
  // useMeetings.createMeeting переводит throw в error/null; текст CREATE_ERROR
  // уже подходит и для 409 (дубль слота).
  return new Error(`${request} вернул ${result.response?.status}`);
}
