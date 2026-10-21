import type Database from 'better-sqlite3';
import type { MeetingType, MeetingTypeDraft } from './types.js';

/**
 * Репозиторий типов встреч (S3, Q2/Q7). Удаления нет вообще: деактивация —
 * единственный конец жизненного цикла, поэтому «список» существует в двух
 * видах, а не в одном с флагом: маршруту нужен явный выбор роли (админу — все,
 * гостю — только активные), и булев параметр здесь легко перепутать местами.
 */
export interface MeetingTypesRepository {
  /** Только активные типы — их видит гость (Q7). */
  listActive(): MeetingType[];
  /** Все типы, включая деактивированные — их видит админ. */
  listAll(): MeetingType[];
  /** Вставляет тип и возвращает его с присвоенным id; новый тип активен. */
  create(draft: MeetingTypeDraft): MeetingType;
  /**
   * Деактивирует тип и возвращает его новое состояние; неизвестный id —
   * undefined (роут конвертирует в 400 — в контракте нет 404). Повторный
   * вызов для уже неактивного типа идемпотентен: UPDATE ничего не меняет,
   * строка возвращается как есть.
   */
  deactivate(id: string): MeetingType | undefined;
}

/** Строка таблицы meeting_types: active — INTEGER 0/1, наружу — boolean. */
type MeetingTypeRow = {
  id: number;
  name: string;
  description: string;
  active: number;
};

function toMeetingType(row: MeetingTypeRow): MeetingType {
  // id INTEGER PRIMARY KEY AUTOINCREMENT: наружу строка — как в контракте.
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    active: row.active === 1,
  };
}

export function createMeetingTypesRepository(db: Database.Database): MeetingTypesRepository {
  const selectAll = db.prepare('SELECT id, name, description, active FROM meeting_types ORDER BY id');
  const selectActive = db.prepare(
    'SELECT id, name, description, active FROM meeting_types WHERE active = 1 ORDER BY id',
  );
  const insertStmt = db.prepare('INSERT INTO meeting_types (name, description) VALUES (?, ?)');
  const deactivateStmt = db.prepare('UPDATE meeting_types SET active = 0 WHERE id = ?');
  const selectById = db.prepare('SELECT id, name, description, active FROM meeting_types WHERE id = ?');

  return {
    listActive() {
      return (selectActive.all() as MeetingTypeRow[]).map(toMeetingType);
    },

    listAll() {
      return (selectAll.all() as MeetingTypeRow[]).map(toMeetingType);
    },

    create(draft) {
      const result = insertStmt.run(draft.name, draft.description);
      // Новый тип всегда активен: active DEFAULT 1 в схеме (S1).
      return {
        id: String(Number(result.lastInsertRowid)),
        name: draft.name,
        description: draft.description,
        active: true,
      };
    },

    deactivate(id) {
      // UPDATE по несуществующему id трогает ноль строк — следующий SELECT
      // и вернёт undefined; отдельная проверка changes избыточна.
      deactivateStmt.run(id);
      const row = selectById.get(id) as MeetingTypeRow | undefined;
      return row === undefined ? undefined : toMeetingType(row);
    },
  };
}
