import { useState } from 'react';
import { Alert, Badge, Button, Container, Group, Text, Title } from '@mantine/core';
import LoginScreen from './components/LoginScreen.tsx';
import AdminView from './AdminView.tsx';
import GuestView from './GuestView.tsx';
import { useSession } from './hooks/useSession.ts';
import { sessionApi as defaultSessionApi, type SessionApi } from './lib/session/api.ts';
import { meetingsApi, type MeetingsApi } from './lib/meetings/api.ts';
import { meetingTypesApi, type MeetingTypesApi } from './lib/meeting-types/api.ts';
import { plannedMeetingsApi, type PlannedMeetingsApi } from './lib/planned-meetings/api.ts';
import type { LoginInput } from './lib/session/types.ts';

interface AppProps {
  /** Подменяется в тестах, чтобы не делить записи между сценариями. */
  api?: MeetingsApi;
  /** Типы встреч — нужны обоим видам: гостю список, админу таблица (F6/F7). */
  typesApi?: MeetingTypesApi;
  /** Админский список запланированных встреч (F6/S4) — тот же шов. */
  plannedApi?: PlannedMeetingsApi;
  /** И сессия тоже через проп: тесты входа подставляют свой фейк (T6). */
  sessionApi?: SessionApi;
}

/**
 * Страница целиком за паролем (Q12a): пока `GET /api/me` не ответил —
 * восстановление, без сессии — экран входа, дальше — вид по роли, которую
 * решил сервер (Q9). Шапка с бейджем роли и «Выйти» — по D4 (вариант A).
 */
export default function App({
  api = meetingsApi,
  typesApi = meetingTypesApi,
  plannedApi = plannedMeetingsApi,
  sessionApi = defaultSessionApi,
}: AppProps) {
  const { session, loading, error, login, logout } = useSession(sessionApi);
  // Форма входа — UI-состояние страницы (как selectedDate раньше в App):
  // значения живут, пока форма показана, и очищаются после успешного входа,
  // чтобы пароль не дожидался пользователя на выходе.
  const [password, setPassword] = useState('');
  const [bookerName, setBookerName] = useState('');
  const [guest, setGuest] = useState(false);

  async function handleLogin(input: LoginInput) {
    const signedIn = await login(input);
    if (signedIn !== null) {
      setPassword('');
      setBookerName('');
      setGuest(false);
    }
  }

  if (loading) {
    return (
      <Container size="sm" py="xl">
        <Text c="dimmed">Восстановление сессии…</Text>
      </Container>
    );
  }

  if (session === null) {
    return (
      <LoginScreen
        error={error}
        password={password}
        bookerName={bookerName}
        guest={guest}
        onPasswordChange={setPassword}
        onBookerNameChange={setBookerName}
        onGuestChange={setGuest}
        onSubmit={handleLogin}
      />
    );
  }

  const isAdmin = session.role === 'admin';

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Календарь встреч</Title>
        <Group gap="xs">
          {/* Бейдж лишь показывает ответ сервера: роль выбрал пароль (Q9). */}
          <Badge color={isAdmin ? 'blue' : 'gray'}>{isAdmin ? 'Админ' : 'Гость'}</Badge>
          <Button variant="light" size="sm" onClick={() => { void logout(); }}>
            Выйти
          </Button>
        </Group>
      </Group>

      {error !== null && (
        <Alert color="red" mb="md">{error}</Alert>
      )}

      {isAdmin ? (
        // Админ не записывается на встречи (Q12c) — панель только наблюдает и
        // ведёт типы (F6, D4). `api` ей не нужен: гостевые ручки она не зовёт.
        <AdminView typesApi={typesApi} plannedApi={plannedApi} />
      ) : (
        <GuestView api={api} typesApi={typesApi} />
      )}
    </Container>
  );
}
