import type { FormEvent } from 'react';
import {
  Alert,
  Button,
  Card,
  Container,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type { LoginInput } from '../lib/session/types.ts';

interface LoginScreenProps {
  /** Ошибка входа или восстановления сессии; `null` — не показывать. */
  error: string | null;
  /** Значения формы: состояние держит App, компонент только рендерит (D4). */
  password: string;
  bookerName: string;
  /** Включён ли переключатель «Я гость» — по нему видно поле имени. */
  guest: boolean;
  onPasswordChange: (value: string) => void;
  onBookerNameChange: (value: string) => void;
  onGuestChange: (value: boolean) => void;
  /** Отправка собранного входа: имя уходит только для гостя (сервер его требует). */
  onSubmit: (input: LoginInput) => void;
}

/**
 * Экран входа (Q12a, форма по D4): одна форма на странице, пароль виден
 * всегда, поле имени раскрывает переключатель «Я гость». Ошибка — над
 * формой, не тостом. Роль клиент не спрашивает: её определяет сервер
 * по паролю (Q9), здесь показывается только результат.
 */
export default function LoginScreen({
  error,
  password,
  bookerName,
  guest,
  onPasswordChange,
  onBookerNameChange,
  onGuestChange,
  onSubmit,
}: LoginScreenProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(guest ? { password, bookerName } : { password });
  }

  return (
    <Container size="xs" py="xl">
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Title order={2} mb="xs">Календарь встреч</Title>
        <Text size="sm" c="dimmed" mb="md">Войдите, чтобы продолжить.</Text>

        {error !== null && (
          <Alert color="red" mb="md">{error}</Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Stack>
            <PasswordInput
              label="Пароль"
              value={password}
              onChange={(event) => onPasswordChange(event.currentTarget.value)}
              required
            />
            <Switch
              label="Я гость"
              checked={guest}
              onChange={(event) => onGuestChange(event.currentTarget.checked)}
            />
            {guest && (
              <TextInput
                label="Ваше имя"
                value={bookerName}
                onChange={(event) => onBookerNameChange(event.currentTarget.value)}
                required
              />
            )}
            <Button type="submit">Войти</Button>
          </Stack>
        </form>
      </Card>
    </Container>
  );
}
