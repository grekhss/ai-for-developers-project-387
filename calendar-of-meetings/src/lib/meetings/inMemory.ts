import type { MeetingsApi } from './api.ts';
import type { Meeting } from './types.ts';

/**
 * Записи в памяти — заглушка вместо бэкенда. Фабрика, а не синглтон, чтобы
 * каждый вызов получал своё хранилище: так тесты не делят состояние.
 */
export function createInMemoryMeetingsApi(seed: Meeting[] = []): MeetingsApi {
  const meetings: Meeting[] = [...seed];
  // Максимум id сида, а не его длина: при сиде ['2', '3'] длина дала бы
  // следующий id '3' — уже занятый.
  let lastId = meetings.reduce((max, meeting) => Math.max(max, Number(meeting.id) || 0), 0);

  return {
    async list({ from, to }) {
      // Даты сравниваются как строки: формат 'YYYY-MM-DD' упорядочен
      // лексикографически так же, как хронологически. С Date так не выйдет.
      return meetings
        .filter((meeting) => meeting.date >= from && meeting.date <= to)
        .sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time));
    },

    async create(draft) {
      lastId += 1;

      // Ответ собирается поле в поле, как у сервера (S5): тот хранит
      // meeting_type_id в БД, но не отдаёт его ни в create, ни в list —
      // спред draft протащил бы тип в Meeting и разошёлся с контрактом.
      const meeting: Meeting = {
        id: String(lastId),
        date: draft.date,
        time: draft.time,
      };
      meetings.push(meeting);

      return meeting;
    },
  };
}