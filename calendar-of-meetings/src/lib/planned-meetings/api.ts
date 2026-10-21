import { createHttpPlannedMeetingsApi } from './http.ts';
import type { PlannedMeeting } from './types.ts';

/**
 * Контракт доступа к админскому списку запланированных встреч (S4/F6). Отдельный
 * модуль-зеркало, а не метод `MeetingsApi`: у ручки своя форма ответа (join-DTO
 * с типом и автором) и своя аудитория — только админ, остальным 403. Смешать её
 * с гостевой `/api/meetings` значило бы заставить каждого потребителя знать,
 * какая половина полей доступна его роли; модули, как и остальные три, друг от
 * друга не зависят.
 */
export interface PlannedMeetingsApi {
  /**
   * Встречи начиная с сегодняшнего дня, в порядке возрастания (date, time).
   * Границу «сегодня и позже» держит сервер (Q6): клиент не знает ни своей
   * даты на сервере, ни роли, поэтому параметров у вызова нет.
   */
  list(): Promise<PlannedMeeting[]>;
}

/**
 * Реализация, которой пользуется приложение: HTTP-клиент на /api/admin/meetings
 * (в dev его проксирует Vite, в проде отдаёт express-сервер). Тесты подставляют
 * свою реализацию пропом `plannedApi` в `AdminView`.
 */
export const plannedMeetingsApi: PlannedMeetingsApi = createHttpPlannedMeetingsApi();
