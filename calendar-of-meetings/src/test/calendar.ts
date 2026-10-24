import dayjs from 'dayjs';
import { APP_LOCALE } from '../lib/date.ts';

/** Минимальная часть `userEvent`, нужная для перелистывания календаря. */
interface DayClicker {
  click: (element: Element) => Promise<void>;
}

/** Кнопка дня по точному `aria-label`; `null`, если дня нет в показанной сетке. */
export function dayByLabel(container: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label]')).find(
      (button) => button.getAttribute('aria-label') === label,
    ) ?? null
  );
}

function monthHeader(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>('.mantine-DatePicker-calendarHeaderLevel');
}

async function advanceToMonth(
  target: string,
  container: HTMLElement,
  user: DayClicker,
  remaining: number,
): Promise<void> {
  if (monthHeader(container)?.textContent === target) return;

  if (remaining === 0) {
    throw new Error(`календарь не перелистнулся к месяцу ${target}`);
  }

  const next = container.querySelector<HTMLButtonElement>('[data-direction="next"]');

  if (next === null) {
    throw new Error(`нет кнопки перехода к месяцу ${target}`);
  }

  await user.click(next);
  await advanceToMonth(target, container, user, remaining - 1);
}

/**
 * Перелистывает календарь вперёд к месяцу даты. Даты гостевого окна не дальше
 * двух месяцев от текущего, поэтому двух кликов достаточно.
 */
export async function showMonthOf(
  date: string,
  container: HTMLElement,
  user: DayClicker,
): Promise<void> {
  const target = dayjs(date).locale(APP_LOCALE).format('MMMM YYYY');
  await advanceToMonth(target, container, user, 2);
}

/** Ищет день по `aria-label`; если его нет, листает на месяц вперёд. */
export async function findDayCell(
  user: DayClicker,
  container: HTMLElement,
  label: string,
): Promise<HTMLButtonElement | null> {
  let cell = dayByLabel(container, label);

  if (cell === null) {
    const next = container.querySelector<HTMLButtonElement>('[data-direction="next"]');

    if (next !== null) {
      await user.click(next);
      cell = dayByLabel(container, label);
    }
  }

  return cell;
}
