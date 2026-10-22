import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import dayjs from 'dayjs';
import MeetingCalendar from './MeetingCalendar.tsx';
import { APP_LOCALE, addDays, formatDateRu, now, today } from '../lib/date.ts';
import { isBookableDay } from '../lib/window.ts';
import { generateTimeSlots } from '../lib/slots.ts';

const SLOTS = generateTimeSlots();

function renderCalendar(
  props: {
    value?: string | null;
    takenTimesByDay?: Record<string, string[]>;
    moment?: string;
  } = {},
) {
  const onSelect = vi.fn();
  const moment = props.moment ?? now();
  const view = render(
    <MantineProvider defaultColorScheme="dark">
      <DatesProvider settings={{ locale: APP_LOCALE }}>
        <MeetingCalendar
          value={props.value ?? null}
          onSelect={onSelect}
          takenTimesByDay={props.takenTimesByDay}
          moment={moment}
        />
      </DatesProvider>
    </MantineProvider>,
  );

  return { ...view, onSelect, moment };
}

/** Первый bookable-день окна после сегодняшнего — тем же правилом, что календарь. */
function nextBookableDate(moment: string): string {
  for (let offset = 1; offset < 14; offset++) {
    const day = addDays(today(), offset);
    if (isBookableDay(day, moment)) return day;
  }

  throw new Error('в гостевом окне нет буднего дня после сегодняшнего');
}

/**
 * Перелистывает календарь к месяцу даты: дата может быть в следующем месяце,
 * если в текущем не осталось будних дней.
 */
async function showMonthOf(
  date: string,
  container: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
) {
  const target = dayjs(date).locale(APP_LOCALE).format('MMMM YYYY');
  const header = () =>
    container.querySelector<HTMLButtonElement>('.mantine-DatePicker-calendarHeaderLevel');

  for (let step = 0; step < 2 && header()?.textContent !== target; step++) {
    const next = container.querySelector<HTMLButtonElement>('[data-direction="next"]');
    expect(next).not.toBeNull();
    await user.click(next as HTMLButtonElement);
  }

  expect(header()?.textContent).toBe(target);
}

function dayByLabel(container: HTMLElement, label: string): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

/** Даты сетки текущего месяца: 6 недель от понедельника первой недели. */
function gridDates(): string[] {
  const first = dayjs(today()).startOf('month');
  const start = first.subtract((first.day() + 6) % 7, 'day');

  return Array.from({ length: 42 }, (_, index) =>
    start.add(index, 'day').format('YYYY-MM-DD'),
  );
}

describe('MeetingCalendar', () => {
  it('выключает день, в котором не осталось свободных слотов', async () => {
    const user = userEvent.setup();
    const date = nextBookableDate(now());
    const { container } = renderCalendar({
      takenTimesByDay: { [date]: SLOTS },
    });

    await showMonthOf(date, container, user);

    const cell = dayByLabel(container, `${formatDateRu(date)} — свободно 0`);
    expect(cell).not.toBeNull();
    expect(cell).toBeDisabled();
  });

  it('показывает число свободных слотов в ячейке, aria-label и title', async () => {
    const user = userEvent.setup();
    const date = nextBookableDate(now());
    const { container } = renderCalendar({
      takenTimesByDay: { [date]: ['11:00'] },
    });

    await showMonthOf(date, container, user);

    const cell = dayByLabel(container, `${formatDateRu(date)} — свободно 17`);
    expect(cell).not.toBeNull();
    expect(cell).toBeEnabled();
    expect(cell).toHaveAttribute('title', 'свободно 17');

    // Число дня и счётчик — обе строки внутри ячейки.
    const text = cell?.textContent ?? '';
    expect(text).toContain(String(Number(date.slice(8))));
    expect(text).toContain('17');
  });

  it('выбранный день сохраняет data-selected при известных счётчиках', async () => {
    const user = userEvent.setup();
    const date = nextBookableDate(now());
    const { container } = renderCalendar({
      value: date,
      takenTimesByDay: { [date]: ['11:00'] },
    });

    await showMonthOf(date, container, user);

    const cell = dayByLabel(container, `${formatDateRu(date)} — свободно 17`);
    expect(cell).not.toBeNull();
    expect(cell).toHaveAttribute('data-selected');
  });

  it('выходные и прошедшие дни по-прежнему выключены', () => {
    const { container } = renderCalendar({ takenTimesByDay: {} });

    const weekend = gridDates()
      .map((date) => ({ date, label: formatDateRu(date) }))
      .find(({ date }) => dayjs(date).day() === 6);
    expect(weekend).toBeDefined();

    const weekendCell = dayByLabel(container, weekend?.label as string);
    expect(weekendCell).not.toBeNull();
    expect(weekendCell).toBeDisabled();

    const yesterday = addDays(today(), -1);
    const pastCell = dayByLabel(container, formatDateRu(yesterday));
    expect(pastCell).not.toBeNull();
    expect(pastCell).toBeDisabled();
  });

  it('без данных о занятости счётчиков нет и дни по занятости не выключаются', async () => {
    const user = userEvent.setup();
    const { container } = renderCalendar();

    expect(container.querySelector('button[data-free-count]')).toBeNull();

    let days = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        'tbody button:not([disabled]):not([data-outside])',
      ),
    );

    if (days.length === 0) {
      const next = container.querySelector<HTMLButtonElement>('[data-direction="next"]');
      expect(next).not.toBeNull();
      await user.click(next as HTMLButtonElement);
      days = Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          'tbody button:not([disabled]):not([data-outside])',
        ),
      );
    }

    expect(days.length).toBeGreaterThan(0);
  });
});
