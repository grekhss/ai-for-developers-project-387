import type { MeetingTypesApi } from './api.ts';
import type { MeetingType, MeetingTypeDraft } from './types.ts';

/**
 * Типы в памяти — заглушка вместо бэкенда. Фабрика, а не синглтон, чтобы
 * каждый вызов получал своё хранилище: так тесты не делят состояние — тот же
 * приём, что у `createInMemoryMeetingsApi`.
 *
 * Сид копируется дважды — массив и его элементы: в отличие от записей,
 * deactivate здесь меняет `active` у существующего типа, и объект из сида
 * нельзя трогать иначе вызывающий увидит правку у себя.
 */
export function createInMemoryMeetingTypesApi(seed: MeetingType[] = []): MeetingTypesApi {
  const types: MeetingType[] = seed.map((type) => ({ ...type }));
  // Максимум id сида, а не его длина: при сиде ['2', '3'] длина дала бы
  // следующий id '3' — уже занятый (как в meetings/inMemory.ts).
  let lastId = types.reduce((max, type) => Math.max(max, Number(type.id) || 0), 0);

  return {
    async list() {
      // Копии и массива, и элементов — ровно то, что делает HTTP-адаптер,
      // каждый раз парсящий JSON заново. Без копий элементов вызывающий
      // читал бы «старый» объект, изменившийся в памяти фейка, и не мог бы
      // отличить «список перечитан» от «тот же объект поменялся» — так тест
      // хука ловит отсутствие refresh после деактивации. Порядок — порядок
      // добавления, как у серверного ORDER BY id.
      return types.map((type) => ({ ...type }));
    },

    async create(draft: MeetingTypeDraft) {
      lastId += 1;

      // Новый тип всегда активен — как DEFAULT 1 в схеме сервера (S1).
      const type: MeetingType = { id: String(lastId), active: true, ...draft };
      types.push(type);

      return type;
    },

    async deactivate(id) {
      const type = types.find((candidate) => candidate.id === id);
      if (type === undefined) {
        // Сервер отвечает 400 «тип встречи не найден» — см. MeetingTypesApi.deactivate.
        throw new Error('тип встречи не найден');
      }

      // Повторная деактивация идемпотентна: active уже false, ничего не меняется.
      type.active = false;
      return type;
    },
  };
}
