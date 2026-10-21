// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createDatabase } from './db.js';
import { createRepository, DuplicateMeetingError } from './repository.js';

describe('createDatabase: миграция схемы', () => {
  it('свежая БД создаёт meeting_types и новые колонки meetings', () => {
    const db = createDatabase(':memory:');

    const meetingColumns = (db.pragma('table_info(meetings)') as Array<{ name: string }>).map(
      (column) => column.name,
    );
    expect(meetingColumns).toEqual(['id', 'date', 'time', 'meeting_type_id', 'booker']);

    const typeColumns = (db.pragma('table_info(meeting_types)') as Array<{ name: string }>).map(
      (column) => column.name,
    );
    expect(typeColumns).toEqual(['id', 'name', 'description', 'active']);
  });

  it('легаси-таблица bookings переименовывается в meetings, строки сохраняются', () => {
    const dbPath = join(tmpdir(), `wayfinder-s1-${randomUUID()}.sqlite`);
    try {
      // Старая БД времён bookings: без meeting_type_id и booker.
      const legacy = new Database(dbPath);
      legacy.exec(`CREATE TABLE bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        UNIQUE(date, time)
      )`);
      legacy.prepare('INSERT INTO bookings (date, time) VALUES (?, ?)').run('2026-01-05', '10:00');
      legacy.close();

      const db = createDatabase(dbPath);
      const rows = db.prepare('SELECT date, time, meeting_type_id, booker FROM meetings').all();
      expect(rows).toEqual([
        { date: '2026-01-05', time: '10:00', meeting_type_id: null, booker: null },
      ]);
      // Старой таблицы больше нет.
      const legacyTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bookings'")
        .get();
      expect(legacyTable).toBeUndefined();
    } finally {
      rmSync(dbPath, { force: true });
    }
  });

  it('старая meetings без новых колонок дозаполняется, старые строки остаются нетронутыми', () => {
    const dbPath = join(tmpdir(), `wayfinder-s1-${randomUUID()}.sqlite`);
    try {
      const legacy = new Database(dbPath);
      legacy.exec(`CREATE TABLE meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        UNIQUE(date, time)
      )`);
      legacy.prepare('INSERT INTO meetings (date, time) VALUES (?, ?)').run('2026-02-01', '09:00');
      legacy.close();

      const db = createDatabase(dbPath);
      // Старая строка на месте, новые колонки появились и пусты у неё.
      expect(db.prepare('SELECT date, time, meeting_type_id, booker FROM meetings').all()).toEqual([
        { date: '2026-02-01', time: '09:00', meeting_type_id: null, booker: null },
      ]);
      // UNIQUE(date, time) пережил миграцию.
      expect(() =>
        db
          .prepare('INSERT INTO meetings (date, time, meeting_type_id, booker) VALUES (?, ?, ?, ?)')
          .run('2026-02-01', '09:00', 1, 'Иван'),
      ).toThrow(/UNIQUE/i);
    } finally {
      rmSync(dbPath, { force: true });
    }
  });

  it('повторный запуск — no-op: user_version на ожидаемом значении, схема не меняется', () => {
    const dbPath = join(tmpdir(), `wayfinder-s1-${randomUUID()}.sqlite`);
    try {
      const first = createDatabase(dbPath);
      expect(first.pragma('user_version', { simple: true })).toBe(1);
      first.close();

      // Второй открытие той же БД: миграция видит целевую версию и не трогает схему.
      const second = createDatabase(dbPath);
      const columns = (second.pragma('table_info(meetings)') as Array<{ name: string }>).map(
        (column) => column.name,
      );
      expect(columns).toEqual(['id', 'date', 'time', 'meeting_type_id', 'booker']);
      expect(second.pragma('user_version', { simple: true })).toBe(1);
      second.close();
    } finally {
      rmSync(dbPath, { force: true });
    }
  });
});

describe('createRepository', () => {
  it('list отдаёт пустой список без записей', () => {
    const repo = createRepository(createDatabase(':memory:'));
    expect(repo.list('2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('list фильтрует по диапазону и сортирует по (date, time)', () => {
    const repo = createRepository(createDatabase(':memory:'));
    const late2027 = repo.create({ date: '2027-01-01', time: '09:00' }, 'Иван');
    repo.create({ date: '2026-01-02', time: '10:00' }, 'Иван');
    repo.create({ date: '2026-01-01', time: '11:00' }, 'Иван');
    repo.create({ date: '2026-01-02', time: '09:00' }, 'Иван');

    // Сортировка лексикографическая по дате, затем по времени; границы включены.
    expect(repo.list('2026-01-01', '2026-12-31')).toEqual([
      { id: '3', date: '2026-01-01', time: '11:00' },
      { id: '4', date: '2026-01-02', time: '09:00' },
      { id: '2', date: '2026-01-02', time: '10:00' },
    ]);
    // За пределами диапазона запись не попадает.
    expect(late2027).toEqual({ id: '1', date: '2027-01-01', time: '09:00' });
  });

  it('create возвращает запись с присвоенным id строкой', () => {
    const repo = createRepository(createDatabase(':memory:'));
    const meeting = repo.create({ date: '2026-01-05', time: '14:00' }, 'Иван');
    expect(meeting).toEqual({ id: '1', date: '2026-01-05', time: '14:00' });
    // id в ответе — строка, как в контракте src/lib/meetings/types.ts.
    expect(typeof meeting.id).toBe('string');
  });

  it('create сохраняет booker и meeting_type_id; без типа в колонке NULL (S5)', () => {
    const db = createDatabase(':memory:');
    // FK включён у better-sqlite3 по умолчанию — ссылка на meeting_types
    // проверяется и на уровне БД (последний рубеж под проверки роута).
    db.prepare('INSERT INTO meeting_types (name, description) VALUES (?, ?)').run(
      'Консультация',
      '',
    );
    const repo = createRepository(db);

    repo.create({ date: '2026-01-05', time: '14:00', meeting_type_id: '1' }, 'Иван');
    repo.create({ date: '2026-01-06', time: '11:00' }, 'Мария');

    // Колонка meeting_type_id INTEGER: строковый id контракта ляжет числом;
    // отсутствие поля — NULL, как у легаси-строк (C5).
    expect(
      db.prepare('SELECT date, time, meeting_type_id, booker FROM meetings ORDER BY date').all(),
    ).toEqual([
      { date: '2026-01-05', time: '14:00', meeting_type_id: 1, booker: 'Иван' },
      { date: '2026-01-06', time: '11:00', meeting_type_id: null, booker: 'Мария' },
    ]);
  });

  it('повторный create того же (date, time) бросает DuplicateMeetingError', () => {
    const repo = createRepository(createDatabase(':memory:'));
    repo.create({ date: '2026-01-05', time: '14:00' }, 'Иван');

    expect(() => repo.create({ date: '2026-01-05', time: '14:00' }, 'Иван')).toThrow(
      DuplicateMeetingError,
    );
  });

  it('после миграции дубль (date, time) по-прежнему бросает DuplicateMeetingError', () => {
    const repo = createRepository(createDatabase(':memory:'));
    repo.create({ date: '2026-01-05', time: '14:00' }, 'Иван');

    expect(() => repo.create({ date: '2026-01-05', time: '14:00' }, 'Иван')).toThrow(
      DuplicateMeetingError,
    );
  });

  it('не-UNIQUE ошибки БД не маскируются под дубль', () => {
    const db = createDatabase(':memory:');
    // Подменяем схему: CHECK-ограничение, нарушение которого даёт код
    // SQLITE_CONSTRAINT_CHECK, а не SQLITE_CONSTRAINT_UNIQUE.
    db.exec('DROP TABLE meetings');
    // Колонки — те же, что в целевой схеме: prepare в createRepository их видит,
    // а CHECK даёт код SQLITE_CONSTRAINT_CHECK, а не UNIQUE.
    db.exec(`CREATE TABLE meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      meeting_type_id INTEGER REFERENCES meeting_types(id),
      booker TEXT,
      UNIQUE(date, time),
      CHECK (date <> '')
    )`);
    const repo = createRepository(db);

    let thrown: unknown;
    try {
      repo.create({ date: '', time: '09:00' }, 'Иван');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(DuplicateMeetingError);
  });
});

describe('createRepository: listPlanned (S4/Q6)', () => {
  it('склеивает встречу с названием типа и именем записавшегося, сортирует (date, time)', () => {
    const db = createDatabase(':memory:');
    // FK включён: тип обязан существовать до ссылки на него (как в тесте выше).
    db.prepare('INSERT INTO meeting_types (name, description) VALUES (?, ?)').run('Консультация', '');
    const repo = createRepository(db);

    repo.create({ date: '2026-05-02', time: '11:00', meeting_type_id: '1' }, 'Иван');
    repo.create({ date: '2026-05-01', time: '10:00', meeting_type_id: '1' }, 'Мария');
    repo.create({ date: '2026-05-02', time: '09:00', meeting_type_id: '1' }, 'Пётр');

    expect(repo.listPlanned('2026-05-01')).toEqual([
      { date: '2026-05-01', time: '10:00', type: 'Консультация', booker: 'Мария' },
      { date: '2026-05-02', time: '09:00', type: 'Консультация', booker: 'Пётр' },
      { date: '2026-05-02', time: '11:00', type: 'Консультация', booker: 'Иван' },
    ]);
  });

  it('легаси-строка без типа и без автора даёт null в обеих колонках (C5)', () => {
    const db = createDatabase(':memory:');
    // Прямая вставка: create() всегда пишет booker из сессии, а такая строка
    // пришла из старой схемы, где обеих колонок ещё не было (S1, C2).
    db.prepare('INSERT INTO meetings (date, time) VALUES (?, ?)').run('2026-05-01', '10:00');
    const repo = createRepository(db);

    // LEFT JOIN, а не INNER: строка не пропадает, обе колонки — null; UI
    // нарисует «—» (F6).
    expect(repo.listPlanned('2026-05-01')).toEqual([
      { date: '2026-05-01', time: '10:00', type: null, booker: null },
    ]);
  });

  it('деактивированный тип у старой встречи сохраняет название (Q7)', () => {
    const db = createDatabase(':memory:');
    db.prepare('INSERT INTO meeting_types (name, description, active) VALUES (?, ?, 0)').run('Разбор', '');
    const repo = createRepository(db);
    repo.create({ date: '2026-05-01', time: '10:00', meeting_type_id: '1' }, 'Иван');

    // Деактивация — конец жизненного цикла типа, но не обезличивание истории:
    // имя остаётся в строке списка (фильтра по active здесь нет).
    expect(repo.listPlanned('2026-05-01')).toEqual([
      { date: '2026-05-01', time: '10:00', type: 'Разбор', booker: 'Иван' },
    ]);
  });

  it('отбрасывает прошлое, границу from включает, верхней границы нет (Q6/C5)', () => {
    const repo = createRepository(createDatabase(':memory:'));
    repo.create({ date: '2026-04-30', time: '10:00' }, 'Иван');
    repo.create({ date: '2026-05-01', time: '10:00' }, 'Иван');
    repo.create({ date: '2027-01-01', time: '10:00' }, 'Иван');

    // «admin unlimited» — окна в 14 дней нет, прошедшее отсекает только from.
    expect(repo.listPlanned('2026-05-01')).toEqual([
      { date: '2026-05-01', time: '10:00', type: null, booker: 'Иван' },
      { date: '2027-01-01', time: '10:00', type: null, booker: 'Иван' },
    ]);
  });
});