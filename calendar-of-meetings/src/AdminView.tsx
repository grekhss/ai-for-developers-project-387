import { useState } from 'react';
import { Alert, Button, Group, Modal, Switch, Table, Tabs, Text, TextInput, Textarea } from '@mantine/core';
import { useMeetingTypes } from './hooks/useMeetingTypes.ts';
import { usePlannedMeetings } from './hooks/usePlannedMeetings.ts';
import { meetingTypesApi, type MeetingTypesApi } from './lib/meeting-types/api.ts';
import { plannedMeetingsApi, type PlannedMeetingsApi } from './lib/planned-meetings/api.ts';
import { formatDateRu } from './lib/date.ts';

interface AdminViewProps {
  /** Типы встреч — тот же шов, что у гостевого вида (T1). */
  typesApi?: MeetingTypesApi;
  /** Админский список запланированных встреч (S4). */
  plannedApi?: PlannedMeetingsApi;
}

/**
 * Админ-панель (F6, D4): две вкладки — «Типы встреч» и «Запланированные
 * встречи». Админ наблюдает и ведёт типы, но не записывается (Q12c), поэтому
 * кнопка действия есть только у типов («Добавить тип»).
 *
 * Состояние страницы (вкладки, открыта ли модалка, поля формы) живёт здесь;
 * данные приходят из хуков, а не дублируются (F3/F6). Типы: деактивация —
 * `Switch` в строке, и она терминальна (Q7) — после выключения переключатель
 * неактивен, реактивации нет. Список встреч — только чтение: даты и сортировку
 * (date → time) уже сделал сервер (S4/Q6), UI лишь рисует колонки, а null'ы
 * легаси-строк показывает как «—» (C5).
 */
export default function AdminView({
  typesApi = meetingTypesApi,
  plannedApi = plannedMeetingsApi,
}: AdminViewProps) {
  const {
    meetingTypes,
    loading: typesLoading,
    error: typesError,
    createMeetingType,
    deactivateMeetingType,
  } = useMeetingTypes(typesApi);
  const { meetings, loading: meetingsLoading, error: meetingsError } = usePlannedMeetings(plannedApi);

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Один текст ошибки: и загрузка, и создание, и деактивация кладут его в свои
  // хуки. Пока открыта модалка, показываем его в ней — иначе он остался бы за
  // оверлеем, где пользователь его не прочитает.
  const error = typesError ?? meetingsError;

  async function handleCreate() {
    const created = await createMeetingType({ name: name.trim(), description });
    // При ошибке модалка остаётся открытой (текст — в `error`): закрыв её, мы
    // потеряли бы введённые поля вместе с причиной отказа.
    if (created !== null) {
      setModalOpen(false);
      setName('');
      setDescription('');
    }
  }

  return (
    <>
      {error !== null && !modalOpen && (
        <Alert color="red" mb="md">{error}</Alert>
      )}

      <Tabs defaultValue="types">
        <Tabs.List>
          <Tabs.Tab value="types">Типы встреч</Tabs.Tab>
          <Tabs.Tab value="meetings">Запланированные встречи</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="types" pt="md">
          <Group justify="flex-end" mb="sm">
            <Button onClick={() => setModalOpen(true)}>Добавить тип</Button>
          </Group>

          {typesLoading ? (
            <Text c="dimmed">Загрузка типов встреч…</Text>
          ) : (
            <Table.ScrollContainer minWidth={480}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Название</Table.Th>
                    <Table.Th>Описание</Table.Th>
                    <Table.Th>Активен</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {meetingTypes.map((type) => (
                    <Table.Tr key={type.id}>
                      <Table.Td>{type.name}</Table.Td>
                      <Table.Td>{type.description}</Table.Td>
                      <Table.Td>
                        {/* Переключатель управляется серверным состоянием, а не
                            локальной копией: после деактивации refresh приносит
                            active: false, и он же становится выключенным. */}
                        <Switch
                          checked={type.active}
                          disabled={!type.active}
                          aria-label={type.name}
                          onChange={() => { void deactivateMeetingType(type.id); }}
                        />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="meetings" pt="md">
          {meetingsLoading ? (
            <Text c="dimmed">Загрузка запланированных встреч…</Text>
          ) : (
            <Table.ScrollContainer minWidth={480}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Дата</Table.Th>
                    <Table.Th>Время</Table.Th>
                    <Table.Th>Тип</Table.Th>
                    <Table.Th>Booker</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {/* Пустое состояние — та же таблица с одной строкой-текстом:
                      кнопки действия тут нет (админ не создаёт встречи, D4). */}
                  {meetings.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={4}>
                        <Text c="dimmed">Пока нет запланированных встреч</Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    meetings.map((meeting) => (
                      <Table.Tr key={`${meeting.date} ${meeting.time}`}>
                        <Table.Td>{formatDateRu(meeting.date)}</Table.Td>
                        <Table.Td>{meeting.time}</Table.Td>
                        <Table.Td>{meeting.type ?? '—'}</Table.Td>
                        <Table.Td>{meeting.booker ?? '—'}</Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Новый тип встречи"
        centered
      >
        {error !== null && (
          <Alert color="red" mb="md">{error}</Alert>
        )}

        {/* required ставит звёздочку в подписи поля — тесты ищут по /^Название/. */}
        <TextInput
          label="Название"
          required
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Textarea
          mt="sm"
          label="Описание"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setModalOpen(false)}>
            Отмена
          </Button>
          {/* Пустое имя сервер отклонит (400, @pattern("\\S")) — не даём его
              отправить вовсе. */}
          <Button disabled={name.trim() === ''} onClick={() => { void handleCreate(); }}>
            Создать
          </Button>
        </Group>
      </Modal>
    </>
  );
}
