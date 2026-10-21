import { Text } from '@mantine/core';
import { TimeGrid } from '@mantine/dates';
import { generateTimeSlots } from '../lib/slots.ts';

/** Слоты рабочего дня не зависят от состояния, поэтому считаются один раз. */
const SLOTS = generateTimeSlots();

interface TimeSlotsProps {
  /** Слоты этого дня, уже занятые другими записями, 'HH:mm'. */
  takenTimes: string[];
  /** Выбранный слот, 'HH:mm'. */
  time: string | null;
  onChangeTime: (time: string | null) => void;
}

/**
 * Инлайн-сетка слотов под календарём — шаг «Время» гостевого степпера (D4).
 * Модалку со слотами она заменила: та кнопкой «Записаться» дублировала шаг
 * подтверждения. Занятые слоты выключены; если свободных не осталось вовсе,
 * сетка уступает место явному тексту (D4: пустые состояния — тексты, не тишина).
 */
export default function TimeSlots({ takenTimes, time, onChangeTime }: TimeSlotsProps) {
  const hasFreeSlot = SLOTS.some((slot) => !takenTimes.includes(slot));

  if (!hasFreeSlot) {
    return (
      <Text mt="md" c="dimmed">
        На этот день свободных слотов нет
      </Text>
    );
  }

  return <TimeGrid data={SLOTS} value={time} onChange={onChangeTime} disableTime={takenTimes} />;
}
