import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

/**
 * Целевая версия схемы. Хранится в PRAGMA user_version: при следующей
 * миграции константа поднимается, и старые БД догоняют её ровно один раз.
 */
const SCHEMA_VERSION = 1;

/** Есть ли таблица с таким именем (легаси `bookings` ищем именно так). */
function hasTable(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row !== undefined;
}

/** Есть ли колонка в таблице: ALTER TABLE ADD COLUMN применяем только один раз. */
function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return columns.some((entry) => entry.name === column);
}

/**
 * Идемпотентная миграция: старую БД доводит до целевой схемы, свежую создаёт,
 * повторный запуск — no-op (user_version уже на SCHEMA_VERSION).
 *
 * Три пути: (1) чистая БД — CREATE TABLE сразу с новыми колонками;
 * (2) старая `bookings` — переименование в `meetings` (строки и
 * UNIQUE(date, time) переживают ALTER RENAME), затем ADD COLUMN;
 * (3) уже целевая БД — ранний выход по user_version.
 */
function migrate(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version >= SCHEMA_VERSION) {
    return;
  }

  // Легаси bookings → meetings до создания meetings: иначе CREATE TABLE
  // встретит существующую таблицу и обе схемы останутся рядом.
  if (hasTable(db, 'bookings') && !hasTable(db, 'meetings')) {
    db.exec('ALTER TABLE bookings RENAME TO meetings');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      UNIQUE(date, time)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meeting_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Добавление колонок в DDL CREATE TABLE существующую таблицу не меняет —
  // только ALTER TABLE ADD COLUMN доходит до старых БД.
  if (!hasColumn(db, 'meetings', 'meeting_type_id')) {
    db.exec('ALTER TABLE meetings ADD COLUMN meeting_type_id INTEGER REFERENCES meeting_types(id)');
  }
  if (!hasColumn(db, 'meetings', 'booker')) {
    db.exec('ALTER TABLE meetings ADD COLUMN booker TEXT');
  }

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

/** Путь к файлу БД по умолчанию: data/meetings.sqlite в корне пакета. */
export function defaultDbPath(): string {
  // import.meta.dirname — каталог исполняемого файла: server/ в dev,
  // dist-server/ в проде. В обоих случаях «на каталог выше» — корень пакета,
  // поэтому путь не зависит от cwd и не попадает в артефакты сборки.
  return join(import.meta.dirname, '..', 'data', 'meetings.sqlite');
}

/**
 * Открывает (или создаёт) БД и гарантирует схему. Уникальность слота — на
 * уровне базы: UNIQUE(date, time), так дубль отклоняется самим хранилищем.
 * ':memory:' используется в тестах — для него mkdir не нужен.
 */
export function createDatabase(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    // better-sqlite3 каталог не создаёт: без mkdir первый запуск на чистом
    // клоне упал бы с ENOENT.
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);

  migrate(db);

  return db;
}