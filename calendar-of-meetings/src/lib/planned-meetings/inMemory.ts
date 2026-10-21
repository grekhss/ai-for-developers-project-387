import { today } from '../date.ts';
import type { PlannedMeetingsApi } from './api.ts';
import type { PlannedMeeting } from './types.ts';

/**
 * Запланированные встречи в памяти — заглушка вместо бэкенда. Фабрика, а не
 * синглтон, чтобы каждый вызов получал своё хранилище: так тесты не делят
 * состояние (тот же приём, что у `createInMemoryMeetingsApi`).
 *
 * Фейк повторяет поведение сервера (S4): отсекает прошлое и сортирует
 * (date, time) — иначе `AdminView`-тест зеленел бы на данных, которых настоящая
 * ручка не отдаёт. Границу «сегодня» берёт из общего `lib/date.ts` `today()` —
 * то же правило, что и у сервера, но своим вызовом часов (T3: параметром его
 * сюда не передать, у `list()` нет аргументов).
 */
export function createInMemoryPlannedMeetingsApi(seed: PlannedMeeting[] = []): PlannedMeetingsApi {
  // Копия массива, как в `createInMemoryMeetingsApi`: пополнение сида после
  // создания фабрики не должно протекать в хранилище. Элементы не копируются —
  // менять их здесь нечем (список только читается), в отличие от типов встреч,
  // где `deactivate` правит `active` существующего объекта.
  const meetings: PlannedMeeting[] = [...seed];

  return {
    async list() {
      // filter первым: sort мутирует массив на месте, а внутренний порядок
      // трогать нельзя — filter уже отдаёт новый массив.
      return meetings
        .filter((meeting) => meeting.date >= today())
        .sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time));
    },
  };
}
