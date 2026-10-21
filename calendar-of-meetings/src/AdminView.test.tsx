import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import AdminView from './AdminView.tsx';
import { createInMemoryMeetingTypesApi } from './lib/meeting-types/inMemory.ts';
import type { MeetingTypesApi } from './lib/meeting-types/api.ts';
import type { MeetingType } from './lib/meeting-types/types.ts';
import { createInMemoryPlannedMeetingsApi } from './lib/planned-meetings/inMemory.ts';
import type { PlannedMeetingsApi } from './lib/planned-meetings/api.ts';
import type { PlannedMeeting } from './lib/planned-meetings/types.ts';
import { addDays, formatDateRu, today } from './lib/date.ts';

/** Запись в будущем — иначе фейк отсечёт её как прошлую (как сервер, Q6). */
function meeting(offsetDays: number, time: string, type: string | null = null, booker: string | null = null): PlannedMeeting {
  return { date: addDays(today(), offsetDays), time, type, booker };
}

// Mantine v9 бросает без провайдера; даты внутри AdminView не рендерятся, поэтому
// DatesProvider не нужен (formatDateRu — чистая функция из lib/date.ts).
function renderAdminView(
  typesApi: MeetingTypesApi = createInMemoryMeetingTypesApi(),
  plannedApi: PlannedMeetingsApi = createInMemoryPlannedMeetingsApi(),
) {
  return render(
    <MantineProvider defaultColorScheme="dark">
      <AdminView typesApi={typesApi} plannedApi={plannedApi} />
    </MantineProvider>
  );
}

function typesApiWith(seed: MeetingType[]): MeetingTypesApi {
  return createInMemoryMeetingTypesApi(seed);
}

describe('AdminView', () => {
  it('показывает обе вкладки D4 и таблицу типов', async () => {
    renderAdminView(
      typesApiWith([
        { id: '1', name: 'Консультация', description: '30 минут', active: true },
        { id: '2', name: 'Разбор', description: '', active: false },
      ]),
    );

    expect(screen.getByRole('tab', { name: 'Типы встреч' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Запланированные встречи' })).toBeInTheDocument();

    // Таблица появляется после загрузки типов; до неё на панели — текст загрузки.
    expect(await screen.findByText('Консультация')).toBeInTheDocument();
    expect(screen.getByText('30 минут')).toBeInTheDocument();
    expect(screen.getByText('Разбор')).toBeInTheDocument();
    // Колонки D4: Название / Описание / Активен.
    expect(screen.getByRole('columnheader', { name: 'Название' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Активен' })).toBeInTheDocument();
  });

  it('деактивация: переключатель гаснет и становится недоступен (терминально, Q7)', async () => {
    const user = userEvent.setup();
    const typesApi = typesApiWith([{ id: '1', name: 'Консультация', description: '', active: true }]);
    renderAdminView(typesApi);

    const toggle = await screen.findByRole('switch', { name: 'Консультация' });
    expect(toggle).toBeEnabled();
    expect(toggle).toBeChecked();

    await user.click(toggle);

    // Состояние — серверное: после refresh active: false, и переключатель уже
    // не нажимается (реактивации нет).
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Консультация' })).toBeDisabled());
    expect(screen.getByRole('switch', { name: 'Консультация' })).not.toBeChecked();
    expect((await typesApi.list())[0].active).toBe(false);
  });

  it('уже деактивированный тип: переключатель выключен и недоступен', async () => {
    renderAdminView(typesApiWith([{ id: '2', name: 'Разбор', description: '', active: false }]));

    const toggle = await screen.findByRole('switch', { name: 'Разбор' });
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeDisabled();
  });

  it('создание типа: модалка, отправка, строка появляется и модалка закрывается', async () => {
    const user = userEvent.setup();
    renderAdminView(typesApiWith([]));

    await user.click(screen.getByRole('button', { name: 'Добавить тип' }));
    // Модалка монтируется в портал на следующем тике (Transition), поэтому ждём.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    // Mantine дописывает «*» в подпись required-поля — ищем по префиксу.
    await user.type(screen.getByLabelText(/^Название/), 'Консультация');
    await user.type(screen.getByLabelText(/^Описание/), '30 минут');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    expect(await screen.findByText('Консультация')).toBeInTheDocument();
    expect(screen.getByText('30 минут')).toBeInTheDocument();
    // Новый тип пришёл из refresh, а не из локальной вставки: строка — серверная.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('пустое или пробельное имя: кнопка «Создать» недоступна', async () => {
    const user = userEvent.setup();
    renderAdminView(typesApiWith([]));

    await user.click(screen.getByRole('button', { name: 'Добавить тип' }));
    await screen.findByRole('dialog');
    const submit = screen.getByRole('button', { name: 'Создать' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/^Название/), '   ');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/^Название/), 'К');
    expect(submit).toBeEnabled();
  });

  it('ошибка создания: модалка остаётся открытой, ошибка показана', async () => {
    const user = userEvent.setup();
    const typesApi: MeetingTypesApi = {
      list: () => Promise.resolve([]),
      create: () => Promise.reject(new Error('недостаточно прав')),
      deactivate: () => Promise.reject(new Error('не вызывается')),
    };
    renderAdminView(typesApi);

    await user.click(screen.getByRole('button', { name: 'Добавить тип' }));
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText(/^Название/), 'Консультация');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось создать тип встречи.');
    // Форма не закрыта: пользователь не теряет введённое вместе с причиной отказа.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('вкладка встреч: дата по-русски, время, тип и автор; легаси-строки — «—» (C5)', async () => {
    const user = userEvent.setup();
    const plannedApi = createInMemoryPlannedMeetingsApi([
      meeting(1, '09:00', 'Консультация', 'Иван'),
      meeting(2, '10:00'),
    ]);
    renderAdminView(typesApiWith([]), plannedApi);

    await user.click(screen.getByRole('tab', { name: 'Запланированные встречи' }));

    expect(await screen.findByText('Консультация')).toBeInTheDocument();
    expect(screen.getByText('Иван')).toBeInTheDocument();
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText(formatDateRu(addDays(today(), 1)))).toBeInTheDocument();
    // Легаси-строка без типа и автора — прочерк в обеих колонках, а не пустота.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('пустой список встреч: таблица с заголовками и текстом пустого состояния (D4)', async () => {
    const user = userEvent.setup();
    renderAdminView(typesApiWith([]), createInMemoryPlannedMeetingsApi());

    await user.click(screen.getByRole('tab', { name: 'Запланированные встречи' }));

    expect(await screen.findByText('Пока нет запланированных встреч')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Дата' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Booker' })).toBeInTheDocument();
  });

  it('ошибка загрузки списка встреч показывается над вкладками', async () => {
    const plannedApi: PlannedMeetingsApi = { list: () => Promise.reject(new Error('нет связи')) };
    renderAdminView(typesApiWith([]), plannedApi);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось получить список запланированных встреч.',
    );
  });
});
