import { DatePicker } from '@mantine/dates';
import { isBookableDay } from '../lib/window.ts';
import { now } from '../lib/date.ts';

interface MeetingCalendarProps {
  /** Выбранный день в формате DateStringValue, 'YYYY-MM-DD'. */
  value: string | null;
  /** Вызывается с днём, выбранным пользователем. */
  onSelect: (date: string) => void;
}

/**
 * Единственный компонент, который знает про `@mantine/dates`. Наружу отдаёт
 * только строки 'YYYY-MM-DD', поэтому остальной код приложения не зависит от
 * версии Mantine и от того, как она устроена внутри.
 */
export default function MeetingCalendar({ value, onSelect }: MeetingCalendarProps) {
  // «Сейчас» фиксируется один раз на рендер: excludeDate зовётся для каждой
  // ячейки месяца, и часы на каждую ячейку читать незачем. Правило «в какие
  // дни можно записаться» живёт в lib (isBookableDay = будни, не прошедший
  // день и гостевое окно Q5), здесь только переворачиваем его под конвенцию
  // excludeDate.
  const moment = now();

  return (
    <DatePicker
      type="default"
      value={value}
      onChange={(date) => {
        // Тип onChange допускает null (allowDeselect), а выключенные дни
        // недоступны для клика и null не присылают — сужаем явно.
        if (date !== null) onSelect(date);
      }}
      excludeDate={(date) => !isBookableDay(date, moment)}
    />
  );
}