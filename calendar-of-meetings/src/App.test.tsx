import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import App from './App.tsx';
import { createInMemoryMeetingsApi } from './lib/meetings/inMemory.ts';
import type { MeetingsApi } from './lib/meetings/api.ts';
import { createInMemoryMeetingTypesApi } from './lib/meeting-types/inMemory.ts';
import type { MeetingTypesApi } from './lib/meeting-types/api.ts';
import { createInMemorySessionApi } from './lib/session/inMemory.ts';
import type { SessionApi } from './lib/session/api.ts';
import type { Session } from './lib/session/types.ts';
import { createInMemoryPlannedMeetingsApi } from './lib/planned-meetings/inMemory.ts';
import type { PlannedMeetingsApi } from './lib/planned-meetings/api.ts';
import { APP_LOCALE } from './lib/date.ts';

const DATES_SETTINGS = { locale: APP_LOCALE };

/** Активный тип по умолчанию — гостевой вид рендерит его радио-список (F7). */
function defaultTypesApi(): MeetingTypesApi {
  return createInMemoryMeetingTypesApi([
    { id: '1', name: 'Консультация', description: '30 минут', active: true },
  ]);
}

/** Уже вошедший гость — сессия по умолчанию для «гостевых» тестов (T6). */
function guestSession(): SessionApi {
  return createInMemorySessionApi({ role: 'guest', bookerName: 'Тест' });
}

/** Пустой админский список: админская ветка грузит его сразу после входа (F6). */
function defaultPlannedApi(): PlannedMeetingsApi {
  return createInMemoryPlannedMeetingsApi();
}

/** Никогда не отвечает — для проверки состояния «восстановление сессии». */
function pending<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

// Своё хранилище на каждый тест (значения по умолчанию): записи, типы и сессии
// не должны утекать между сценариями.
async function renderApp(
  api: MeetingsApi = createInMemoryMeetingsApi(),
  sessionApi: SessionApi = guestSession(),
  typesApi: MeetingTypesApi = defaultTypesApi(),
  plannedApi: PlannedMeetingsApi = defaultPlannedApi(),
) {
  const view = render(
    <MantineProvider defaultColorScheme="dark">
      <DatesProvider settings={DATES_SETTINGS}>
        <App api={api} typesApi={typesApi} plannedApi={plannedApi} sessionApi={sessionApi} />
      </DatesProvider>
    </MantineProvider>
  );

  // Первая отрисовка — «Восстановление сессии…» (роль ещё неизвестна, C9):
  // ждём ответа GET /api/me, иначе проверки ниже ловят экран загрузки.
  await waitFor(() => {
    expect(screen.queryByText('Восстановление сессии…')).not.toBeInTheDocument();
  });

  return { ...view, api, sessionApi, typesApi };
}

describe('календарь встреч', () => {
  it('показывает заголовок и гостевой степпер', async () => {
    await renderApp();

    expect(screen.getByRole('heading', { name: 'Календарь встреч' })).toBeInTheDocument();
    // findBy: типы грузятся асинхронно, шаги появляются после первого ответа.
    expect(await screen.findByText('Тип')).toBeInTheDocument();
    expect(screen.getByText('Время')).toBeInTheDocument();
    expect(screen.getByText('Готово')).toBeInTheDocument();
  });

  it('не вошедшему показывает экран входа вместо календаря (Q12a)', async () => {
    await renderApp(createInMemoryMeetingsApi(), createInMemorySessionApi(null));

    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Пароль/)).toBeInTheDocument();
    // Заголовок страницы есть и на логине (D4) — гость отличается степпером.
    expect(screen.queryByText('Тип')).not.toBeInTheDocument();
    expect(screen.queryByText('Гость')).not.toBeInTheDocument();
  });

  it('вход гостем: имя подставляется в запрос и открывается гостевой вид', async () => {
    const user = userEvent.setup();
    const sessionApi = createInMemorySessionApi(null);
    const login = vi.spyOn(sessionApi, 'login');
    await renderApp(createInMemoryMeetingsApi(), sessionApi);

    // Имя гостя прячется за переключателем (D4) — без него гостевой вид
    // не собрать: сервер для гостя требует bookerName.
    expect(screen.queryByLabelText(/^Ваше имя/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Я гость'));
    await user.type(screen.getByLabelText(/^Ваше имя/), 'Иван');
    await user.type(screen.getByLabelText(/^Пароль/), 'guest');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(login).toHaveBeenCalledWith({ password: 'guest', bookerName: 'Иван' });
    expect(await screen.findByText('Гость')).toBeInTheDocument();
    expect(await screen.findByText('Тип')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Пароль/)).not.toBeInTheDocument();
  });

  it('вход админом: бейдж роли и админ-панель вместо календаря', async () => {
    const user = userEvent.setup();
    const sessionApi = createInMemorySessionApi(null);
    const login = vi.spyOn(sessionApi, 'login');
    await renderApp(createInMemoryMeetingsApi(), sessionApi);

    await user.type(screen.getByLabelText(/^Пароль/), 'admin');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    // Переключатель «Я гость» выключен — имя в запрос не попадает.
    expect(login).toHaveBeenCalledWith({ password: 'admin' });
    expect(await screen.findByText('Админ')).toBeInTheDocument();
    // Админ-панель вместо заглушки (F6): обе вкладки D4.
    expect(screen.getByRole('tab', { name: 'Типы встреч' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Запланированные встречи' })).toBeInTheDocument();
    // Админ не записывается на встречи (Q12c) — гостевого степпера он не видит.
    // Проверяем по шагу «Готово»: колонка «Тип» теперь есть и в админ-таблице.
    expect(screen.queryByText('Готово')).not.toBeInTheDocument();
  });

  it('неверный пароль: ошибка над формой, форма остаётся', async () => {
    const user = userEvent.setup();
    await renderApp(createInMemoryMeetingsApi(), createInMemorySessionApi(null));

    await user.type(screen.getByLabelText(/^Пароль/), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось войти. Проверьте пароль и попробуйте ещё раз.'
    );
    expect(screen.getByLabelText(/^Пароль/)).toBeInTheDocument();
    expect(screen.queryByText('Тип')).not.toBeInTheDocument();
  });

  it('после выхода снова экран входа, а пароль очищен', async () => {
    const user = userEvent.setup();
    await renderApp(createInMemoryMeetingsApi(), createInMemorySessionApi(null));

    await user.click(screen.getByLabelText('Я гость'));
    await user.type(screen.getByLabelText(/^Ваше имя/), 'Иван');
    await user.type(screen.getByLabelText(/^Пароль/), 'guest');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByText('Гость');

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Пароль/)).toHaveValue('');
    expect(screen.queryByLabelText(/^Ваше имя/)).not.toBeInTheDocument();
    expect(screen.queryByText('Гость')).not.toBeInTheDocument();
    expect(screen.queryByText('Тип')).not.toBeInTheDocument();
  });

  it('ошибка выхода показывается над видом, сессия не теряется', async () => {
    const user = userEvent.setup();
    const sessionApi: SessionApi = {
      ...guestSession(),
      logout: () => Promise.reject(new Error('нет связи')),
    };
    await renderApp(createInMemoryMeetingsApi(), sessionApi);

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выйти. Попробуйте ещё раз.'
    );
    expect(screen.getByText('Гость')).toBeInTheDocument();
    expect(await screen.findByText('Тип')).toBeInTheDocument();
  });

  it('пока GET /api/me не ответил — восстановление, ни формы, ни календаря', async () => {
    const sessionApi: SessionApi = {
      login: () => pending<Session>(),
      logout: () => pending<void>(),
      me: () => pending<Session | null>(),
    };

    render(
      <MantineProvider defaultColorScheme="dark">
        <DatesProvider settings={DATES_SETTINGS}>
          <App sessionApi={sessionApi} />
        </DatesProvider>
      </MantineProvider>
    );

    expect(screen.getByText('Восстановление сессии…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
    expect(screen.queryByText('Тип')).not.toBeInTheDocument();
  });
});
