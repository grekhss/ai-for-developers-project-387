import { Stack, Text } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { formatDateRu, now } from '../lib/date.ts';
import { isBookableDay } from '../lib/window.ts';

interface MeetingCalendarProps {
  /** Выбранный день в формате DateStringValue, 'YYYY-MM-DD'. */
  value: string | null;
  /** Вызывается с днём, выбранным пользователем. */
  onSelect: (date: string) => void;
  /**
   * Готовые счётчики свободных слотов по bookable-дням. `undefined` — данных
   * нет (загрузка или ошибка загрузки): счётчиков не показываем и дни по
   * занятости не выключаем. Считает их страница через `lib/availability.ts`.
   */
  freeCounts?: Record<string, number>;
  /** «Сейчас» ('YYYY-MM-DD HH:mm'); по умолчанию читается один раз на рендер. */
  moment?: string;
}

/**
 * Единственный компонент, который знает про `@mantine/dates`. Наружу отдаёт
 * только строки 'YYYY-MM-DD', поэтому остальной код приложения не зависит от
 * версии Mantine и от того, как она устроена внутри.
 */
export default function MeetingCalendar({
  value,
  onSelect,
  freeCounts,
  moment = now(),
}: MeetingCalendarProps) {
  // Правило «в какие дни можно записаться» живёт в lib (isBookableDay = будни,
  // не прошедший день и гостевое окно Q5); здесь только переворачиваем его под
  // конвенцию excludeDate и добавляем готовые счётчики от страницы.
  function freeCount(date: string): number | undefined {
    return freeCounts?.[date];
  }

  return (
    <DatePicker
      type="default"
      value={value}
      onChange={(date) => {
        // Тип onChange допускает null (allowDeselect), а выключенные дни
        // недоступны для клика и null не присылают — сужаем явно.
        if (date !== null) onSelect(date);
      }}
      excludeDate={(date) => {
        if (!isBookableDay(date, moment)) return true;

        // Счётчик известен только для bookable-дней; 0 — день занят целиком.
        return freeCount(date) === 0;
      }}
      getDayProps={(date) => {
        const count = freeCount(date);
        if (count === undefined) return {};

        // `disabled` сюда не передаём: он перекрыл бы excludeDate (Month.mjs).
        return {
          'data-free-count': count,
          title: `свободно ${count}`,
        };
      }}
      getDayAriaLabel={(date) => {
        const label = formatDateRu(date);
        const count = freeCount(date);

        return count === undefined ? label : `${label} — свободно ${count}`;
      }}
      renderDay={(date) => {
        const count = freeCount(date);
        const dayNumber = Number(date.slice(8));

        // День без данных рисуем как раньше — одним числом.
        if (count === undefined) return dayNumber;

        return (
          <Stack gap={0} align="center">
            <Text size="sm" lh={1}>{dayNumber}</Text>
            <Text size="xs" c="dimmed" lh={1}>{count}</Text>
          </Stack>
        );
      }}
    />
  );
}
