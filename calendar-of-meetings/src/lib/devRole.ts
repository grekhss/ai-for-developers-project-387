/**
 * Роль страницы для дев-обхода авторизации (AUTH_DISABLED=1) по URL: `/admin`
 * — владелец, всё остальное — гость. Сервер читает её из неподписанной cookie
 * `dev_role`, которую ставит main.tsx; при выключенном обходе cookie просто
 * игнорируется (server/session.ts).
 */
export function devRoleForPath(pathname: string): 'admin' | 'guest' {
  return pathname === '/admin' || pathname.startsWith('/admin/') ? 'admin' : 'guest';
}
