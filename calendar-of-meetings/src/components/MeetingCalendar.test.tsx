import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import dayjs from 'dayjs';
import MeetingCalendar from './MeetingCalendar.tsx';
import { APP_LOCALE, addDays, formatDateRu, now, today } from '../lib/date.ts';
import { nextBookableDate } from '../test/bookableDate.ts';
import { dayByLabel, showMonthOf } from '../test/calendar.ts';

function renderCalendar(
  props: {
    value?: string | null;
    freeCounts?: Record<string, number>;
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
          freeCounts={props.freeCounts}
          moment={moment}
        />
      </DatesProvider>
    </MantineProvider>,
  );

  return { ...view, onSelect, moment };
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
      freeCounts: { [date]: 0 },
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
      freeCounts: { [date]: 17 },
    });

    await showMonthOf(date, container, user);

    const cell = dayByLabel(container, `${formatDateRu(date)} — свободно 17`);
    expect(cell).not.toBeNull();
    expect(cell).toBeEnabled();
    expect(cell).toHaveAttribute('title', 'свободно 17');
    expect(cell).toHaveAttribute('data-free-count', '17');

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
      freeCounts: { [date]: 17 },
    });

    await showMonthOf(date, container, user);

    const cell = dayByLabel(container, `${formatDateRu(date)} — свободно 17`);
    expect(cell).not.toBeNull();
    expect(cell).toHaveAttribute('data-selected');
  });

  it('выходные и прошедшие дни по-прежнему выключены', async () => {
    const user = userEvent.setup();
    const { container } = renderCalendar({ freeCounts: {} });

    const weekend = gridDates()
      .map((date) => ({ date, label: formatDateRu(date) }))
      .find(({ date }) => dayjs(date).day() === 6);
    expect(weekend).toBeDefined();

    const weekendCell = dayByLabel(container, weekend?.label as string);
    expect(weekendCell).not.toBeNull();
    expect(weekendCell).toBeDisabled();

    // Вчерашний день может быть в хвосте прошлого месяца: если в текущей сетке
    // его нет, листаем на месяц назад, а не предполагаем разметку.
    const yesterday = addDays(today(), -1);
    let pastCell = dayByLabel(container, formatDateRu(yesterday));
    if (pastCell === null) {
      const previous = container.querySelector<HTMLButtonElement>('[data-direction="prev"]');
      expect(previous).not.toBeNull();
      await user.click(previous as HTMLButtonElement);
      pastCell = dayByLabel(container, formatDateRu(yesterday));
    }

    expect(pastCell).not.toBeNull();
    expect(pastCell).toBeDisabled();
  });

  it('без данных о занятости счётчиков нет, подпись совпадает с дефолтной', async () => {
    const user = userEvent.setup();
    const date = nextBookableDate(now());
    const { container } = renderCalendar();

    await showMonthOf(date, container, user);

    const cell = dayByLabel(container, formatDateRu(date));
    expect(cell).not.toBeNull();
    expect(cell).toBeEnabled();
    expect(cell).toHaveAttribute('aria-label', formatDateRu(date));
    expect(cell).not.toHaveAttribute('data-free-count');
    expect(cell).not.toHaveAttribute('title');
    expect(container.querySelector('button[data-free-count]')).toBeNull();
    expect(container.querySelector('button[title]')).toBeNull();
  });
});
