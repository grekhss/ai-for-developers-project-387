import { createHttpMeetingTypesApi } from './http.ts';
import type { MeetingType, MeetingTypeDraft } from './types.ts';

/**
 * Контракт доступа к типам встреч. Как и `MeetingsApi`, порт держит UI от
 * деталей транспорта: смена in-memory на HTTP (или обратно) не трогает хуки
 * и компоненты.
 *
 * `list` без параметров — не случайность: гостю нужны только активные типы,
 * админу — все, и это решает сервер по роли из сессии (S3, Q2/Q7). Клиент не
 * фильтрует и не знает ролей — он лишь отдаёт то, что пришло.
 */
export interface MeetingTypesApi {
  /** Типы, положенные текущей сессии: админу — все, гостю — только активные. */
  list(): Promise<MeetingType[]>;
  /** Создаёт тип и возвращает его уже с присвоенным id; новый тип активен. */
  create(draft: MeetingTypeDraft): Promise<MeetingType>;
  /**
   * Деактивирует тип и возвращает его новое состояние. Неизвестный id —
   * исключение: сервер отвечает 400, и так же обязан вести себя любой
   * адаптер (в контракте нет 404).
   */
  deactivate(id: string): Promise<MeetingType>;
}

/**
 * Реализация, которой пользуется приложение: HTTP-клиент на /api/meeting-types
 * (в dev его проксирует Vite, в проде отдаёт express-сервер). Тесты подставляют
 * свою реализацию через параметр хука, поэтому менять её здесь больше не нужно.
 */
export const meetingTypesApi: MeetingTypesApi = createHttpMeetingTypesApi();
