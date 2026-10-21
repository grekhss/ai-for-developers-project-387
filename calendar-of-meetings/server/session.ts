// Request импортируется под псевдонимом: ниже объявлен `interface Request` в
// module-аугментации, и oxlint (no-shadow) считает одноимённый импорт тенью.
import type { Request as ExpressRequest, RequestHandler } from 'express';
import type { components } from './contract.gen.js';

/**
 * Сессия — то, что подписано в httpOnly-cookie и определяет доступ (Q9).
 * Тип приходит из контракта (contract/main.tsp, K1); здесь только alias.
 */
export type Session = components['schemas']['Session'];

// Модульная аугментация: только типы, в рантайме ничего не появляется
// (erasableSyntaxOnly допускает declare module).
declare module 'express-serve-static-core' {
  interface Request {
    session?: Session;
  }
}

export const SESSION_COOKIE = 'session';
/** Время жизни сессии — 14 дней, как горизонт бронирования (pre-answer S2). */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Опции cookie: подпись, httpOnly, SameSite=Lax — по D3; secure задаёт createApp. */
export function sessionCookieOptions(): {
  signed: true;
  httpOnly: true;
  sameSite: 'lax';
  maxAge: number;
  path: string;
} {
  return { signed: true, httpOnly: true, sameSite: 'lax', maxAge: SESSION_MAX_AGE_MS, path: '/' };
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Record<string, unknown>;
  return (
    (session.role === 'admin' || session.role === 'guest') &&
    (session.bookerName === null || typeof session.bookerName === 'string')
  );
}

/**
 * Читает сессию из подписанной cookie. Подделанная cookie отклоняется самой
 * подписью: cookie-parser при несовпадении сигнатуры отдаёт `false`, а не
 * строку, — поэтому фальшивый `role: admin` не проходит.
 */
function readSession(req: Parameters<RequestHandler>[0]): Session | undefined {
  const raw = req.signedCookies?.[SESSION_COOKIE];
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Гейт всех /api: без валидной сессии — 401 (requireSession из S2). */
export const requireSession: RequestHandler = (req, res, next) => {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ error: 'требуется вход' });
    return;
  }
  req.session = session;
  next();
};

/** Ролевой гейт: ставится после requireSession; роли нет или чужая — 403. */
export function requireRole(role: Session['role']): RequestHandler {
  return (req, res, next) => {
    if (req.session?.role !== role) {
      res.status(403).json({ error: 'недостаточно прав' });
      return;
    }
    next();
  };
}

// ===== Дев-обход авторизации (AUTH_DISABLED=1) =====
//
// Для локальной проверки без пароля: роль берётся не из подписанной сессии
// (Q9), а из обычной неподписанной cookie `dev_role`, которую клиент ставит по
// URL страницы (`/admin` — владелец, остальное — гость). Это ослабление, а не
// удаление авторизации: включается только конфигом, и в проде его быть не
// должно. Обычный режим (requireSession) не меняется.

/** Cookie роли для дев-обхода: ставится клиентом по URL, сервером не подписывается. */
export const DEV_ROLE_COOKIE = 'dev_role';
/** Имя записавшегося в дев-обходе: гостю его всё равно негде ввести (нет логина). */
export const DEV_BOOKER_NAME = 'Гость';
/**
 * Секрет подписи для дев-обхода: в нём пароли и SESSION_SECRET не нужны, но
 * cookie-парсер и `res.cookie({ signed: true })` требуют непустого секрета —
 * иначе подпись бросает TypeError.
 */
export const DEV_SESSION_SECRET = 'dev-insecure-session-secret';

/** Сессия дев-обхода: роль из cookie `dev_role`, имя — фиксированное. */
export function devSession(req: ExpressRequest): Session {
  const role: unknown = req.cookies?.[DEV_ROLE_COOKIE];
  return role === 'admin'
    ? { role: 'admin', bookerName: null }
    : { role: 'guest', bookerName: DEV_BOOKER_NAME };
}

/**
 * Гейт дев-обхода вместо requireSession: подставляет сессию всегда, поэтому
 * 401 в этом режиме не бывает — экран входа не нужен.
 */
export const devSessionGate: RequestHandler = (req, _res, next) => {
  req.session = devSession(req);
  next();
};
