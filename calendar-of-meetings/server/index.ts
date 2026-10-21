import { createApp } from './app.js';
import { createDatabase, defaultDbPath } from './db.js';
import { createMeetingTypesRepository } from './meeting-types-repository.js';
import { createRepository } from './repository.js';

// Точка входа dev- и prod-процесса: только wiring. Тесты импортируют app.ts,
// а не index.ts — этот файл биндит порт и открывает файловую БД.
// Это единственное место, читающее process.env (D1): значения уходят в
// createApp, который их валидирует и падает с подсказкой про .env.example.
const PORT = Number(process.env.PORT ?? 4000);
const DB_PATH = process.env.MEETINGS_DB_PATH ?? defaultDbPath();

// Один db — два репозитория: они делят схему (S1), а не друг друга.
const db = createDatabase(DB_PATH);
const app = createApp(
  {
    meetings: createRepository(db),
    meetingTypes: createMeetingTypesRepository(db),
  },
  {
    adminPassword: process.env.ADMIN_PASSWORD ?? '',
    guestPassword: process.env.GUEST_PASSWORD ?? '',
    sessionSecret: process.env.SESSION_SECRET ?? '',
    // Secure в проде, без него в dev — http://localhost не даёт Secure-cookie (D3).
    secureCookie: process.env.NODE_ENV === 'production',
    // Дев-обход авторизации: вход без пароля, роль — из URL (server/session.ts).
    // Только для локальной проверки; в проде оставлять выключенным.
    authDisabled: process.env.AUTH_DISABLED === '1',
  },
);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
