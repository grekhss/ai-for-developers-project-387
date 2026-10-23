import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import TimeSlots from './TimeSlots.tsx';
import { generateTimeSlots } from '../lib/slots.ts';

function renderSlots(overrides: Partial<Parameters<typeof TimeSlots>[0]> = {}) {
  const props = {
    disabledTimes: [] as string[],
    time: null as string | null,
    onChangeTime: vi.fn(),
    ...overrides,
  };

  // Mantine v9 бросает ошибку без MantineProvider в дереве.
  const view = render(
    <MantineProvider defaultColorScheme="dark">
      <TimeSlots {...props} />
    </MantineProvider>
  );

  return { ...view, props };
}

/** Кнопки-слоты: у сетки есть и прочие кнопки навигации, их отфильтровываем. */
function slotButtons(): HTMLElement[] {
  return screen
    .getAllByRole('button')
    .filter((button) => /^\d{2}:\d{2}$/.test(button.textContent ?? ''));
}

describe('TimeSlots', () => {
  it('показывает сетку слотов рабочего дня', () => {
    renderSlots();

    const slots = slotButtons();

    expect(slots).toHaveLength(18);
    expect(slots[0]).toHaveTextContent('09:00');
    expect(slots.at(-1)).toHaveTextContent('17:30');
  });

  it('выключает недоступные слоты', () => {
    renderSlots({ disabledTimes: ['11:00'] });

    expect(screen.getByRole('button', { name: '11:00' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '12:00' })).toBeEnabled();
  });

  it('отдаёт выбранный слот наружу', async () => {
    const user = userEvent.setup();
    const { props } = renderSlots();

    await user.click(screen.getByRole('button', { name: '11:00' }));

    expect(props.onChangeTime).toHaveBeenCalledWith('11:00');
  });

  it('все слоты заняты — явный текст вместо сетки', () => {
    renderSlots({ disabledTimes: generateTimeSlots() });

    expect(screen.getByText('На этот день свободных слотов нет')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument();
  });
});
