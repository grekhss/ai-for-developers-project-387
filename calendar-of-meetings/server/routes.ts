import express from 'express';
import { today } from './date.js';
import { DuplicateMeetingError } from './repository.js';
import type { AppOptions, AppRepositories } from './app.js';
import { devSession, devSessionGate, requireRole, requireSession, SESSION_COOKIE, sessionCookieOptions, type Session } from './session.js';
import type { CreateMeetingBody, CreateMeetingTypeBody, ListMeetingsQuery, LoginInput } from './types.js';
import { isValidDraft, isValidLogin, isValidMeetingTypeDraft, isValidRange } from './validate.js';

type AuthOptions = Pick<AppOptions, 'adminPassword' | 'guestPassword' | 'secureCookie' | 'authDisabled'>;

/**
 * Тело и query обработчиков берутся из operations контракта, а не из выражения:
 * смена shape'а в contract/main.tsp роняет `tsc` здесь, а не вылезает в 400.
 * Типы — обещание для компилятора, фактическую проверку делают isValid*-предикаты
 * ниже: в Express 5 req.body может и не быть (парсер не сработал), поэтому без
 * них строка с типом врала бы о рантайме.
 *
 * Параметры путей есть только у деактивации типа (`:id`); остальные ручки
 * статичны. ResBody остаётся unknown: ответы различаются по статус-коду
 * (200/201/204 против 400/401/403/409), и свести их в одну типизированную сумму
 * дороже, чем она стоит.
 */
type NoParams = Record<string, string>;

/**
 * Верхняя граница имени записавшегося (C10): без неё в базу лег бы сколь угодно
 * длинный `booker` из сессии. Проверка живёт здесь, а не в JSON Schema — значение
 * приходит из подписанной cookie, а не из тела (Q4), и схема его не видит.
 * Граница включительна: 100 символов проходит, 101 — нет (см. парный тест).
 */
const MAX_BOOKER_LENGTH = 100;

/** Роуты API. Фабрика: принимает репозитории, чтобы тесты подавали ':memory:'. */
export function createRoutes(repos: AppRepositories, auth: AuthOptions): express.Router {
  const router = express.Router();
  const cookie = { ...sessionCookieOptions(), secure: auth.secureCookie };

  router.post<NoParams, unknown, LoginInput>('/api/login', (req, res) => {
    // Дев-обход (AUTH_DISABLED): пароль не проверяем — роль уже известна из
    // URL (cookie dev_role, server/session.ts). Вход нужен лишь затем, чтобы
    // экран входа после «Выйти» не оказался тупиком.
    if (auth.authDisabled) {
      const session = devSession(req);
      res.cookie(SESSION_COOKIE, JSON.stringify(session), cookie);
      res.json(session);
      return;
    }

    if (!isValidLogin(req.body)) {
      res.status(400).json({ error: 'password обязателен, bookerName — непустая строка' });
      return;
    }

    // Роль определяется только здесь, по совпадению пароля, — с клиента её не берём.
    // Пароли разные (проверено в createApp), так что порядок сравнения не влияет.
    let session: Session;
    if (req.body.password === auth.adminPassword) {
      session = { role: 'admin', bookerName: null };
    } else if (req.body.password === auth.guestPassword) {
      const bookerName = req.body.bookerName?.trim();
      if (!bookerName) {
        res.status(400).json({ error: 'для гостя обязателен bookerName' });
        return;
      }
      session = { role: 'guest', bookerName };
    } else {
      res.status(401).json({ error: 'неверный пароль' });
      return;
    }

    res.cookie(SESSION_COOKIE, JSON.stringify(session), cookie);
    res.json(session);
  });

  // Дальше все /api — только с сессией: гейт ставится до роутов meetings и
  // meeting-types. В дев-обходе вместо requireSession — devSessionGate (роль из
  // URL, 401 не бывает). Админ-ручки ниже всё равно берут requireRole.
  router.use('/api', auth.authDisabled ? devSessionGate : requireSession);

  // Восстановление роли после перезагрузки: cookie httpOnly, клиент прочитать
  // её не может (C9). Сессия уже распарсена requireSession'ом.
  router.get('/api/me', (req, res) => {
    res.json(req.session);
  });

  // clearCookie с теми же опциями, что и выдача, — иначе path/secure не совпадут
  // и cookie не удалится (Q13). Подпись для очистки не нужна: удаляется cookie
  // по имени, а не по значению, поэтому signed убираем — иначе уйдёт подписанный
  // мусор вместо пустой cookie.
  router.post('/api/logout', (_req, res) => {
    const { signed: _signed, ...clearOptions } = cookie;
    res.clearCookie(SESSION_COOKIE, clearOptions);
    res.status(204).end();
  });

  router.get<NoParams, unknown, never, ListMeetingsQuery>('/api/meetings', (req, res) => {
    // req.query типизирован как ListMeetingsQuery по контракту, но рантайм это
    // всё ещё строки из URL: повторённый параметр приходит массивом, поэтому
    // предикат обязателен — он и роняет формат, и сужает для repo.list.
    if (!isValidRange(req.query)) {
      // Без этой проверки better-sqlite3 упал бы с 500 «too few parameter values».
      res.status(400).json({ error: 'from и to обязательны, формат YYYY-MM-DD' });
      return;
    }
    res.json(repos.meetings.list(req.query.from, req.query.to));
  });

  router.post<NoParams, unknown, CreateMeetingBody>('/api/meetings', (req, res) => {
    if (!isValidDraft(req.body)) {
      res.status(400).json({
        error: 'date и time обязательны, формат time HH:mm; meeting_type_id — строка, если передан',
      });
      return;
    }

    // Целостность, а не домен (C1): названный тип обязан существовать и быть
    // активным — иначе запись ссылается на чужую или законченную сущность (Q7).
    // Окно/выходные/прошлое здесь не проверяются — это политика UI (тест T11).
    const meetingTypeId = req.body.meeting_type_id;
    if (
      meetingTypeId !== undefined &&
      !repos.meetingTypes.listActive().some((type) => type.id === meetingTypeId)
    ) {
      res.status(400).json({ error: 'тип встречи не найден или неактивен' });
      return;
    }

    // booker — только из подписанной сессии, никогда из тела (Q4/C10): поле
    // booker в req.body игнорируется. У админа bookerName null — он не
    // записывается (Q12c), а в контракте для этой ручки нет 403, поэтому 400.
    const booker = req.session?.bookerName;
    if (!booker) {
      res.status(400).json({ error: 'имя записавшегося обязательно' });
      return;
    }
    if (booker.length > MAX_BOOKER_LENGTH) {
      res.status(400).json({ error: `имя записавшегося длиннее ${MAX_BOOKER_LENGTH} символов` });
      return;
    }

    try {
      res.status(201).json(repos.meetings.create(req.body, booker));
    } catch (error) {
      if (error instanceof DuplicateMeetingError) {
        res.status(409).json({ error: 'слот уже занят' });
        return;
      }
      // Прочие ошибки отдаёт стандартный обработчик Express — 500.
      throw error;
    }
  });

  // ===== Типы встреч (S3): ручки стоят ПОСЛЕ requireSession — иначе гейт их
  // не накрывает, и contract.test.ts упадёт на «сеанс-гейт на всех ручках».

  // Список без 403 по контракту (listMeetingTypes: 200 | 401): обе роли видят
  // список, различается только содержимое — админу все, гостю только активные
  // (Q2/Q7). Фильтр — по роли из подписанной cookie, которую клиент не подделал.
  router.get('/api/meeting-types', (req, res) => {
    const types =
      req.session?.role === 'admin'
        ? repos.meetingTypes.listAll()
        : repos.meetingTypes.listActive();
    res.json(types);
  });

  router.post<NoParams, unknown, CreateMeetingTypeBody>(
    '/api/meeting-types',
    requireRole('admin'),
    (req, res) => {
      if (!isValidMeetingTypeDraft(req.body)) {
        res.status(400).json({ error: 'name обязателен (непустая строка), description — строка' });
        return;
      }
      // Храним обрезанное имя — как bookerName при логине. @pattern("\\S") в
      // контракте гарантирует, что после обрезки не останется пустой строки.
      res.status(201).json(
        repos.meetingTypes.create({
          name: req.body.name.trim(),
          description: req.body.description,
        }),
      );
    },
  );

  router.post<{ id: string }>(
    '/api/meeting-types/:id/deactivate',
    requireRole('admin'),
    (req, res) => {
      const deactivated = repos.meetingTypes.deactivate(req.params.id);
      if (!deactivated) {
        // В контракте нет 404 — только 400, поэтому неизвестный id — 400.
        res.status(400).json({ error: 'тип встречи не найден' });
        return;
      }
      // Повторная деактивация идемпотентна: 200 с текущим состоянием (Q7).
      res.json(deactivated);
    },
  );

  // ===== Админский список запланированных встреч (S4): только admin (403
  // остальным). Границу «сегодня и позже» даёт today(), не окно Q5 (C5/Q6);
  // сортировка и LEFT JOIN — в репозитории.
  router.get('/api/admin/meetings', requireRole('admin'), (_req, res) => {
    res.json(repos.meetings.listPlanned(today()));
  });

  return router;
}