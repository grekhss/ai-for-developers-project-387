import { createHttpMeetingsApi } from './http.ts';
import type { Meeting, MeetingDraft, DateRange } from './types.ts';

/**
 * Контракт доступа к записям. UI работает только с ним, поэтому замена
 * in-memory реализации на HTTP не затрагивает компоненты и хуки.
 */
export interface MeetingsApi {
  /** Записи за полуинтервал дат, обе границы включительно, в порядке возрастания. */
  list(range: DateRange): Promise<Meeting[]>;
  /** Создаёт запись и возвращает её уже с присвоенным id. */
  create(draft: MeetingDraft): Promise<Meeting>;
}

/**
 * Реализация, которой пользуется приложение: HTTP-клиент на /api/meetings
 * (в dev его проксирует Vite, в проде отдаёт express-сервер). Тесты подставляют
 * свою реализацию через проп api, поэтому менять её здесь больше не нужно.
 */
export const meetingsApi: MeetingsApi = createHttpMeetingsApi();