import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import GuestView from './GuestView.tsx';
import { NO_MEETING_TYPES_HINT, NO_MEETING_TYPES_TITLE } from './guestViewCopy.ts';
import { createInMemoryMeetingsApi } from './lib/meetings/inMemory.ts';
import type { MeetingsApi } from './lib/meetings/api.ts';
import type { Meeting } from './lib/meetings/types.ts';
import { createInMemoryMeetingTypesApi } from './lib/meeting-types/inMemory.ts';
import type { MeetingTypesApi } from './lib/meeting-types/api.ts';
import type { MeetingType } from './lib/meeting-types/types.ts';
import { APP_LOCALE, addDays, formatDateRu, now, today } from './lib/date.ts';
import { isBookableDay } from './lib/window.ts';
import { generateTimeSlots } from './lib/slots.ts';

const DATES_SETTINGS = { locale: APP_LOCALE };
const SLOTS = generateTimeSlots();

const TYPES: MeetingType[] = [
  { id: '1', name: 'Консультация', description: '30 минут', active: true },
  { id: '2', name: 'Собеседование', description: '60 минут', active: true },
];

/** Своё хранилище типов на каждый тест — тот же шов, что у записей (T1). */
function typesApi(types: MeetingType[] = TYPES): MeetingTypesApi {
  return createInMemoryMeetingTypesApi(types);
}

// Своё хранилище на каждый тест (значения по умолчанию): записи и типы не
// должны утекать между сценариями.
async function renderGuestView(
  api: MeetingsApi = createInMemoryMeetingsApi(),
  meetingTypes: MeetingTypesApi = typesApi(),
) {
  const view = render(
    <MantineProvider defaultColorScheme="dark">
      <DatesProvider settings={DATES_SETTINGS}>
        <GuestView api={api} typesApi={meetingTypes} />
      </DatesProvider>
    </MantineProvider>
  );

  // Первая отрисовка — «Загрузка типов встреч…»: ждём конца загрузки, иначе
  // проверки ниже ловят экран загрузки вместо степпера.
  await waitFor(() => {
    expect(screen.queryByText('Загрузка типов встреч…')).not.toBeInTheDocument();
  });

  return { ...view, api, meetingTypes };
}

/** Дни текущего месяца, в которые реально можно записаться. */
function bookableDays(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(
    'tbody button:not([disabled]):not([data-outside])',
  ));
}

/** Открывает первый доступный день и возвращает его aria-label. */
async function openFirstBookableDay(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
): Promise<string> {
  let days = bookableDays(container);

  if (days.length === 0) {
    const next = container.querySelector<HTMLButtonElement>('[data-direction="next"]');
    expect(next).not.toBeNull();
    await user.click(next as HTMLButtonElement);
    days = bookableDays(container);
  }

  expect(days.length).toBeGreaterThan(0);
  const [day] = days;
  const label = day.getAttribute('aria-label');
  expect(label).not.toBeNull();

  await user.click(day);

  return label as string;
}

/**
 * Первый bookable-день ровно тем же правилом, что календарь (isBookableDay):
 * тесты сеют занятые слоты в конкретные даты, а не парсят aria-label.
 */
function firstBookableDate(): string {
  const moment = now();

  for (let offset = 0; offset < 14; offset++) {
    const day = addDays(today(), offset);
    if (isBookableDay(day, moment)) return day;
  }

  throw new Error('в гостевом окне нет ни одного буднего дня');
}

/** Проходит шаг «Тип»: выбирает первый тип и жмёт «Далее». */
async function pickTypeAndNext(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: /Консультация/ }));
  await user.click(screen.getByRole('button', { name: 'Далее' }));
}

/** Доходит до шага «Готово» с выбранным слотом. */
async function pickSlot(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const label = await openFirstBookableDay(user, container);
  await user.click(await screen.findByRole('button', { name: '11:00' }));
  await user.click(screen.getByRole('button', { name: 'Далее' }));
  return label;
}

/** `create` всегда падает — для проверки неудачной записи. */
function failingApi(): MeetingsApi {
  return {
    list: () => Promise.resolve([]),
    create: () => Promise.reject(new Error('слот занят')),
  };
}

/** `list` никогда не отвечает — для проверки состояния загрузки. */
function hangingApi(): MeetingsApi {
  return {
    list: () => new Promise<Meeting[]>(() => {}),
    create: () => Promise.reject(new Error('не должен вызываться')),
  };
}

describe('гостевой вид', () => {
  it('показывает степпер «Тип → Время → Готово» с радио-списком типов', async () => {
    await renderGuestView();

    expect(screen.getByText('Тип')).toBeInTheDocument();
    expect(screen.getByText('Время')).toBeInTheDocument();
    expect(screen.getByText('Готово')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Консультация/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Собеседование/ })).toBeInTheDocument();
    // Шаг «Время» ещё не показан: слотов на странице нет.
    expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument();
  });

  it('нет активных типов — причина и кто её устранит вместо степпера', async () => {
    await renderGuestView(createInMemoryMeetingsApi(), typesApi([]));

    expect(screen.getByText('Активных типов встреч пока нет')).toBeInTheDocument();
    expect(screen.getByText(/откроется, как только администратор/)).toBeInTheDocument();
    expect(screen.queryByText('Запись сейчас недоступна')).not.toBeInTheDocument();
    expect(screen.queryByText('Тип')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('ошибка загрузки типов — только красный Alert, без текста об отсутствии типов', async () => {
    const failing: MeetingTypesApi = { ...typesApi(), list: () => Promise.reject(new Error('нет связи')) };

    await renderGuestView(createInMemoryMeetingsApi(), failing);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось получить список типов встреч.'
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText(NO_MEETING_TYPES_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByText(NO_MEETING_TYPES_HINT)).not.toBeInTheDocument();
    expect(screen.queryByText('Тип')).not.toBeInTheDocument();
  });

  it('«Далее» недоступен без типа; после выбора открывается шаг «Время»', async () => {
    const user = userEvent.setup();
    await renderGuestView();

    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /Консультация/ }));
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByText('Выберите дату, чтобы посмотреть свободные слоты.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument();
  });

  it('календарь в русской локали, выходные выключены', async () => {
    const user = userEvent.setup();
    const { container } = await renderGuestView();
    await pickTypeAndNext(user);

    const labels = Array.from(container.querySelectorAll('tbody button'))
      .map((day) => day.getAttribute('aria-label') ?? '');
    expect(labels.some((label) => /^\d{1,2} [а-яё]+ \d{4}$/.test(label))).toBe(true);

    const weekdays = Array.from(container.querySelectorAll('.mantine-DatePicker-weekday'))
      .map((cell) => cell.textContent ?? '');
    expect(weekdays).toHaveLength(7);
    expect(weekdays.every((day) => /^[а-яё]{2}$/.test(day))).toBe(true);

    const cells = Array.from(container.querySelectorAll<HTMLButtonElement>('tbody button'));
    expect(cells.length).toBeGreaterThan(0);

    for (const cell of cells) {
      if (cell.hasAttribute('data-weekend')) {
        expect(cell).toBeDisabled();
      }
    }
  });

  it('выбранный день показывает сетку слотов; занятый слот выключен', async () => {
    const user = userEvent.setup();
    const api = createInMemoryMeetingsApi([{ id: '1', date: firstBookableDate(), time: '11:00' }]);
    const { container } = await renderGuestView(api);
    await pickTypeAndNext(user);

    await openFirstBookableDay(user, container);

    expect(screen.getByRole('button', { name: '09:00' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '11:00' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '17:30' })).toBeEnabled();
  });

  it('занятый слот другого дня не выключает слоты выбранного', async () => {
    const user = userEvent.setup();
    const date = firstBookableDate();
    const api = createInMemoryMeetingsApi([{ id: '1', date: addDays(date, 1), time: '11:00' }]);
    const { container } = await renderGuestView(api);
    await pickTypeAndNext(user);

    await openFirstBookableDay(user, container);

    expect(screen.getByRole('button', { name: '11:00' })).toBeEnabled();
  });

  it('в дне не осталось свободных слотов — явный текст вместо сетки', async () => {
    const user = userEvent.setup();
    const date = firstBookableDate();
    const booked: Meeting[] = SLOTS.map((time, index) => ({ id: String(index + 1), date, time }));
    const { container } = await renderGuestView(createInMemoryMeetingsApi(booked));
    await pickTypeAndNext(user);

    await openFirstBookableDay(user, container);

    expect(screen.getByText('На этот день свободных слотов нет')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument();
  });

  it('«Далее» в подтверждение доступно только со слотом; сводка тип/дата/время', async () => {
    const user = userEvent.setup();
    const date = firstBookableDate();
    const { container } = await renderGuestView();
    await pickTypeAndNext(user);
    await openFirstBookableDay(user, container);

    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '11:00' }));
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByText('Тип: Консультация')).toBeInTheDocument();
    expect(screen.getByText(`Дата: ${formatDateRu(date)}`)).toBeInTheDocument();
    expect(screen.getByText('Время: 11:00')).toBeInTheDocument();
  });

  it('запись уходит с выбранным типом и показывает синий Alert', async () => {
    const user = userEvent.setup();
    const date = firstBookableDate();
    const api = createInMemoryMeetingsApi();
    const create = vi.spyOn(api, 'create');
    const { container } = await renderGuestView(api);
    await pickTypeAndNext(user);
    await pickSlot(user, container);

    await user.click(screen.getByRole('button', { name: 'Записаться' }));

    expect(create).toHaveBeenCalledWith({ date, time: '11:00', meeting_type_id: '1' });
    const alert = (await screen.findByText(/^Запись:/)).closest('.mantine-Alert-root');
    expect(alert).not.toBeNull();
    expect(alert as HTMLElement).toHaveTextContent(`Запись: Консультация, ${formatDateRu(date)}, 11:00`);
    expect((alert as HTMLElement).style.getPropertyValue('--alert-color')).toContain('blue');
  });

  it('ошибка создания — красный Alert вместо синего', async () => {
    const user = userEvent.setup();
    const { container } = await renderGuestView(failingApi());
    await pickTypeAndNext(user);
    await pickSlot(user, container);

    await user.click(screen.getByRole('button', { name: 'Записаться' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось создать запись. Выберите другое время.');
    expect(alert.style.getPropertyValue('--alert-color')).toContain('red');
    expect(screen.queryByText(/^Запись:/)).not.toBeInTheDocument();
  });

  it('занятый слот в следующий раз не выбирается', async () => {
    const user = userEvent.setup();
    const { container } = await renderGuestView();
    await pickTypeAndNext(user);
    await pickSlot(user, container);

    await user.click(screen.getByRole('button', { name: 'Записаться' }));
    await screen.findByText(/^Запись:/);

    // Назад на шаг «Время» — кликом по пройденному шагу.
    await user.click(screen.getByText('Время'));

    expect(await screen.findByRole('button', { name: '11:00' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '13:00' })).toBeEnabled();
  });

  it('после записи выбор слота гасит строку успеха', async () => {
    const user = userEvent.setup();
    const { container } = await renderGuestView();
    await pickTypeAndNext(user);
    await pickSlot(user, container);

    await user.click(screen.getByRole('button', { name: 'Записаться' }));
    await screen.findByText(/^Запись:/);

    await user.click(screen.getByText('Время'));
    await user.click(await screen.findByRole('button', { name: '13:00' }));

    expect(screen.queryByText(/^Запись:/)).not.toBeInTheDocument();
  });

  it('после записи смена типа гасит строку успеха', async () => {
    const user = userEvent.setup();
    const { container } = await renderGuestView();
    await pickTypeAndNext(user);
    await pickSlot(user, container);

    await user.click(screen.getByRole('button', { name: 'Записаться' }));
    await screen.findByText(/^Запись:/);

    await user.click(screen.getByText('Тип'));
    await user.click(screen.getByRole('radio', { name: /Собеседование/ }));

    expect(screen.queryByText(/^Запись:/)).not.toBeInTheDocument();
  });

  it('после записи выбор другого дня гасит строку успеха и сбрасывает слот', async () => {
    const user = userEvent.setup();
    const { container } = await renderGuestView();
    await pickTypeAndNext(user);
    await pickSlot(user, container);

    await user.click(screen.getByRole('button', { name: 'Записаться' }));
    await screen.findByText(/^Запись:/);
    await user.click(screen.getByText('Время'));

    // Другой доступный день: следующий в этом месяце либо первый в следующем.
    let other = bookableDays(container)
      .find((day) => day.getAttribute('data-selected') === null);

    if (other === undefined) {
      const next = container.querySelector<HTMLButtonElement>('[data-direction="next"]');
      expect(next).not.toBeNull();
      await user.click(next as HTMLButtonElement);
      other = bookableDays(container)[0];
    }

    expect(other).toBeDefined();
    await user.click(other as HTMLButtonElement);

    expect(screen.queryByText(/^Запись:/)).not.toBeInTheDocument();
    // Слот относился к прежнему дню — «Далее» снова ждёт выбор времени.
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();
  });

  it('возврат на шаг «Тип» сохраняет выбор типа', async () => {
    const user = userEvent.setup();
    const { container } = await renderGuestView();
    await pickTypeAndNext(user);
    await openFirstBookableDay(user, container);

    await user.click(screen.getByText('Тип'));

    expect(screen.getByRole('radio', { name: /Консультация/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled();
  });

  it('пока записи грузятся — «Загрузка записей…» вместо сетки', async () => {
    const user = userEvent.setup();
    const { container } = await renderGuestView(hangingApi());
    await pickTypeAndNext(user);

    await openFirstBookableDay(user, container);

    expect(screen.getByText('Загрузка записей…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument();
  });

  it('пока типы грузятся — «Загрузка типов встреч…» вместо степпера', async () => {
    const hanging: MeetingTypesApi = {
      ...typesApi(),
      list: () => new Promise<MeetingType[]>(() => {}),
    };

    render(
      <MantineProvider defaultColorScheme="dark">
        <DatesProvider settings={DATES_SETTINGS}>
          <GuestView api={createInMemoryMeetingsApi()} typesApi={hanging} />
        </DatesProvider>
      </MantineProvider>
    );

    expect(screen.getByText('Загрузка типов встреч…')).toBeInTheDocument();
    expect(screen.queryByText('Тип')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});
