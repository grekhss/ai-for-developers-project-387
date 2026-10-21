import { describe, it, expect } from 'vitest';
import { generateTimeSlots } from './slots.ts';

describe('generateTimeSlots', () => {
  it('начинает рабочий день в 09:00 и заканчивает слотом 17:30', () => {
    const slots = generateTimeSlots();

    expect(slots[0]).toBe('09:00');
    expect(slots.at(-1)).toBe('17:30');
  });

  it('генерирует 18 получасовых слотов с шагом 30 минут', () => {
    const slots = generateTimeSlots();

    expect(slots).toHaveLength(18);
    expect(slots.every((slot) => /^\d{2}:\d{2}$/.test(slot))).toBe(true);
  });

  it('не выдаёт слот, который не закончится к концу рабочего дня', () => {
    expect(generateTimeSlots()).not.toContain('17:45');
    expect(generateTimeSlots()).not.toContain('18:00');
  });

  it('принимает границы рабочего дня и длительность слота', () => {
    expect(generateTimeSlots(9 * 60, 12 * 60, 60)).toEqual([
      '09:00',
      '10:00',
      '11:00',
    ]);
  });
});
