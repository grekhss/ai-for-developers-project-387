import { useRef, useState } from 'react';
import { Alert, Button, Group, Radio, Stack, Stepper, Text } from '@mantine/core';
import MeetingCalendar from './components/MeetingCalendar.tsx';
import TimeSlots from './components/TimeSlots.tsx';
import { useMeetings } from './hooks/useMeetings.ts';
import { useMeetingTypes } from './hooks/useMeetingTypes.ts';
import { meetingsApi, type MeetingsApi } from './lib/meetings/api.ts';
import { meetingTypesApi, type MeetingTypesApi } from './lib/meeting-types/api.ts';
import { formatDateRu, now } from './lib/date.ts';
import { freeSlotCounts, takenTimesByDay, unavailableTimes } from './lib/availability.ts';
import { NO_MEETING_TYPES_HINT, NO_MEETING_TYPES_TITLE } from './guestViewCopy.ts';

type MeetingTypesState = 'loading' | 'error' | 'empty' | 'ready';

function meetingTypesState(loading: boolean, error: string | null, count: number): MeetingTypesState {
  if (loading) return 'loading';
  if (error !== null) return 'error';
  if (count === 0) return 'empty';
  return 'ready';
}

interface GuestViewProps {
  /** Подменяется в тестах, чтобы не делить записи между сценариями. */
  api?: MeetingsApi;
  /** Типы встреч — тот же шов: в тестах подставляется свой фейк (T1). */
  typesApi?: MeetingTypesApi;
}

/** Сводка успешной записи для Alert'а: id и статус ответа здесь не нужны. */
interface BookedSummary {
  typeName: string;
  date: string;
  time: string;
}

/**
 * Гостевое представление (F7): Stepper «Тип → Время → Готово» по D4. Тип —
 * радио-список активных типов (гостю сервер отдаёт только активные, S3), время —
 * календарь с инлайн-сеткой TimeSlots, подтверждение — сводка и «Записаться».
 * Модалку со слотами не используем: её кнопка «Записаться» дублирует шаг
 * подтверждения (D4). Успех и ошибка (409 «слот занят» и прочие) — волосяные
 * Alert'и над степпером, тостов нет. Состояние страницы (шаг, выбор) и оба хука
 * живут здесь, а не в App: вид монтируется только после входа, иначе оба
 * списка ушли бы на сервер без сессии (401, Q12a).
 */
export default function GuestView({ api = meetingsApi, typesApi = meetingTypesApi }: GuestViewProps) {
  const [step, setStep] = useState(0);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [lastBooked, setLastBooked] = useState<BookedSummary | null>(null);
  const [creating, setCreating] = useState(false);
  // Синхронная защита от двойного клика: `creating` успевает обновиться только
  // к следующему рендеру, а второй клик может прийти раньше.
  const creatingRef = useRef(false);
  const { meetings, loading, refreshing, loaded, error, refresh, createMeeting } = useMeetings(api);
  const { meetingTypes, loading: typesLoading, error: typesError } = useMeetingTypes(typesApi);

  // Одно «сейчас» на рендер: календарь, счётчики и сетка слотов считают одинаково.
  const moment = now();
  // Единственный источник занятости: из него берут данные и счётчики календаря,
  // и недоступные слоты сетки — разойтись они не могут.
  const takenByDay = takenTimesByDay(meetings);
  // Счётчики — только по достоверным данным: пока список ни разу не загрузился,
  // `meetings` пуст, и «0 свободных» выключило бы весь месяц. Ошибка создания
  // (409) не сбрасывает `loaded`: список уже перечитан и достоверен.
  const freeCounts = loaded ? freeSlotCounts(moment, takenByDay) : undefined;
  const selectedType = meetingTypes.find((type) => type.id === typeId) ?? null;
  const takenTimes = selectedDate === null ? [] : takenByDay[selectedDate] ?? [];
  // Сетка выключает занятые и уже начавшиеся сегодня слоты — по тому же правилу,
  // по которому календарь считает свободные.
  const disabledTimes =
    selectedDate === null ? [] : unavailableTimes(selectedDate, takenTimes, moment);
  // «Выбор заполнен» и «слот ещё свободен» — разные вопросы. Сводка на шаге
  // «Готово» показывает выбор, даже если после перечитывания слот стал занят;
  // «Далее» и «Записаться» смотрят на актуальную доступность.
  const selectionComplete = selectedType !== null && selectedDate !== null && time !== null;
  const selectedTimeAvailable = loaded && time !== null && !disabledTimes.includes(time);
  const typesState = meetingTypesState(typesLoading, typesError, meetingTypes.length);

  // Смена любого выбора гасит строку успеха: она описывает прежнюю запись.
  function selectType(id: string) {
    setLastBooked(null);
    setTypeId(id);
  }

  function selectDate(date: string) {
    setLastBooked(null);
    // Сброс слота прямо в обработчике, а не в эффекте (ARCHITECTURE §5):
    // время относится к прежнему дню и в подтверждении не должно врать.
    setTime(null);
    setSelectedDate(date);
  }

  function selectTime(nextTime: string | null) {
    setLastBooked(null);
    setTime(nextTime);
  }

  async function handleBook() {
    if (
      !selectionComplete ||
      !selectedTimeAvailable ||
      creatingRef.current ||
      selectedType === null ||
      selectedDate === null ||
      time === null
    ) {
      return;
    }

    creatingRef.current = true;
    setCreating(true);

    try {
      const created = await createMeeting({
        date: selectedDate,
        time,
        meeting_type_id: selectedType.id,
      });
      // Строка «Запись: …» — только при успехе: иначе при ошибке создания
      // под красным Alert'ом висела бы и синяя запись. После успеха `time` не
      // сбрасываем: сводка должна остаться на экране, а повторную запись
      // блокирует обновлённая занятость.
      if (created !== null) {
        setLastBooked({ typeName: selectedType.name, date: selectedDate, time });
      }
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  return (
    <>
      {lastBooked !== null && (
        <Alert color="blue" mb="md">
          Запись: {lastBooked.typeName}, {formatDateRu(lastBooked.date)}, {lastBooked.time}
        </Alert>
      )}

      {(error !== null || typesError !== null) && (
        <Alert color="red" mb="md">{error ?? typesError}</Alert>
      )}

      {typesState === 'loading' && <Text c="dimmed">Загрузка типов встреч…</Text>}

      {typesState === 'empty' && (
        // Активных типов нет — записываться не на что; объясняем причину и кто
        // её устранит (D4: пустые состояния — тексты). При ошибке загрузки
        // выше уже есть Alert, второго сообщения не дублируем.
        <Stack gap={4}>
          <Text c="dimmed">{NO_MEETING_TYPES_TITLE}</Text>
          <Text size="sm" c="dimmed">
            {NO_MEETING_TYPES_HINT}
          </Text>
        </Stack>
      )}

      {typesState === 'ready' && (
        // Назад — только на пройденные шаги: allowNextStepsSelect выключен,
        // иначе гость прыгнул бы на «Готово» без даты и времени.
        <Stepper active={step} onStepClick={setStep} allowNextStepsSelect={false}>
          <Stepper.Step label="Тип">
            <Radio.Group value={typeId} onChange={selectType} label="Тип встречи">
              <Stack mt="xs">
                {meetingTypes.map((type) => (
                  <Radio
                    key={type.id}
                    value={type.id}
                    label={type.name}
                    description={type.description}
                  />
                ))}
              </Stack>
            </Radio.Group>

            <Button mt="md" disabled={selectedType === null} onClick={() => setStep(1)}>
              Далее
            </Button>
          </Stepper.Step>

          <Stepper.Step label="Время">
            <MeetingCalendar
              value={selectedDate}
              onSelect={selectDate}
              freeCounts={freeCounts}
              moment={moment}
            />

            {/* Список прочитан один раз при монтировании; кнопка даёт гостю
                увидеть чужие записи, не перезагружая страницу. */}
            <Group justify="flex-end" mt="xs">
              <Button
                variant="subtle"
                size="xs"
                disabled={loading || refreshing || creating}
                onClick={() => { void refresh(); }}
              >
                {refreshing ? 'Обновление…' : 'Обновить'}
              </Button>
            </Group>

            {selectedDate === null ? (
              <Text mt="md" c="dimmed">Выберите дату, чтобы посмотреть свободные слоты.</Text>
            ) : loading ? (
              <Text mt="md" c="dimmed">Загрузка записей…</Text>
            ) : !loaded ? (
              // Без списка записей все слоты выглядели бы свободными: это
              // враньё, которое ведёт к 409. Сетку не показываем до refresh.
              <Text mt="md" c="dimmed">Слоты недоступны: список записей не загружен.</Text>
            ) : (
              <TimeSlots
                disabledTimes={disabledTimes}
                time={selectedTimeAvailable ? time : null}
                onChangeTime={selectTime}
              />
            )}

            <Button
              mt="md"
              disabled={!selectedTimeAvailable}
              onClick={() => setStep(2)}
            >
              Далее
            </Button>
          </Stepper.Step>

          <Stepper.Step label="Готово">
            {selectionComplete && (
              <>
                <Text>Тип: {selectedType.name}</Text>
                <Text>Дата: {formatDateRu(selectedDate)}</Text>
                <Text>Время: {time}</Text>
              </>
            )}

            <Button
              mt="md"
              disabled={!selectionComplete || !selectedTimeAvailable || creating}
              onClick={() => { void handleBook(); }}
            >
              {creating ? 'Запись…' : 'Записаться'}
            </Button>
          </Stepper.Step>
        </Stepper>
      )}
    </>
  );
}
