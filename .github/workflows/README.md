
# Описание воркфлоу

Все агенты OpenCode (воркфлоу 1–4) работают на одной модели —
**`opencode/big-pickle`** (формат `provider/model`), ключ провайдера — секрет
`OPENCODE_API_KEY`. Решение по публикации сессий — в разделе
«Модели и публикация сессий (share)» внизу.

## 1. По требованию в комментариях (opencode)

Автоматически запускает ревью или анализ кода при отправке специальных команд в комментариях.
###  Триггеры запуска: Создание комментария в задачах (Issues) или в ревью пул-реквестов (Pull Request Reviews).
### Условие: Комментарий должен содержать или начинать с команд /oc или /opencode. Вызывать агента могут только доверенные авторы: владелец (OWNER), участники (MEMBER) и коллабораторы (COLLABORATOR); от анонимных пользователей и системных ботов команды игнорируются.
### Модель: `opencode/big-pickle` — универсальная агентская модель: по тексту комментария разбирает задачу в контексте issue/PR, отвечает или делает правки.
### Что делает: Проверяет качество кода, ищет потенциальные баги и предлагает улучшения на основе контекста комментария.
### Прогоны: [Actions → opencode](https://github.com/grekhss/ai-for-developers-project-387/actions/workflows/opencode.yml)

## 2. Автоматическое ревью пул-реквестов (opencode-review)

Проводит полноценный аудит кода при изменении кодовой базы проекта.
### Триггеры запуска: Открытие, обновление (новые коммиты), переоткрытие пул-реквеста или перевод его из статуса черновика (Draft) в готовый к проверке.
### Условие: Пул-реквест не должен быть черновиком, ветка должна находиться в основном репозитории, автор не должен быть ботом.
### Модель: `opencode/big-pickle` — та же модель в роли ревьюера: читает дифф и результаты CI (права токена — только чтение, кроме комментария к PR).
### Что делает: Анализирует изменения, ищет скрытые ошибки и оставляет комментарии с рекомендациями по улучшению кода. Предыдущие незавершенные проверки этого же пул-реквеста автоматически отменяются для экономии ресурсов.
### Прогоны: [Actions → opencode-review](https://github.com/grekhss/ai-for-developers-project-387/actions/workflows/opencode-review.yml)

## 3. Плановый аудит кодовой базы (Scheduled OpenCode Task)

Регулярная еженедельная проверка репозитория на наличие технического долга.
### Триггеры запуска:
#### По расписанию (cron): каждое воскресенье в 09:00 UTC.
#### Вручную (workflow_dispatch) через интерфейс вкладки Actions.
### Модель: `opencode/big-pickle` — самостоятельный обход кодовой базы: без комментария-задания работает по фиксированному промпту.
### Что делает: Сканирует проект на наличие комментариев TODO, формирует по ним сводный отчет и автоматически открывает новую задачу (Issue) на GitHub, если находит критические проблемы, требующие внимания (поэтому у токена остаются права issues: write).
### Прогоны: [Actions → Scheduled OpenCode Task](https://github.com/grekhss/ai-for-developers-project-387/actions/workflows/opencode-scheduled.yml)

## 4. Первичная обработка задач (Issue Triage)

Помогает обрабатывать новые обращения и вопросы от пользователей.
### Триггеры запуска: Создание новой задачи (Issue) в репозитории.
### Условие: Сообщение написано реальным пользователем (не ботом), чей аккаунт на GitHub существует не менее 30 дней (защита от спама).
### Модель: `opencode/big-pickle` — та же агентская модель в роли триажа: решает, есть ли у задачи очевидный ответ.
### Что делает: Анализирует текст проблемы. Если решение очевидно, ИИ отправляет комментарий со ссылками на документацию или примерами обработки ошибок. В иных случаях оставляет задачу для ручной проверки.
### Прогоны: [Actions → Issue Triage](https://github.com/grekhss/ai-for-developers-project-387/actions/workflows/opencode-triage.yml)

## 5. Гейт и Lighthouse (CI)

Гейт качества и метрики производительности на каждый пуш в любую ветку (и вручную через workflow_dispatch).
### Джобы:
#### check (Gate — lint, types, tests): `npm run check` в `calendar-of-meetings/` — контракт-дрейф, oxlint, обе типизации и vitest; таймаут 15 минут.
#### lhci (Lighthouse): сборка пакета, подъём прод-сервера с дев-обходом авторизации (`AUTH_DISABLED=1`, роль гостя для `/`) и 3 прогона Lighthouse по `http://localhost:4000/`; пороги категорий — в `calendar-of-meetings/lighthouserc.json`; таймаут 20 минут.
### Прогоны: [Actions → CI](https://github.com/grekhss/ai-for-developers-project-387/actions/workflows/ci.yml)

## 6. Автоматические релизы (release-please)

Ведёт версии и changelog по Conventional Commits.
### Триггеры запуска: Пуш в main.
### Что делает: Открывает/обновляет release-PR «chore(main): release calendar-of-meetings X.Y.Z» — бамп `package.json` с локфайлом и `calendar-of-meetings/CHANGELOG.md` из истории feat:/fix:. Мердж release-PR владельцем ставит git-тег и GitHub Release. Состояние версий — `.release-please-manifest.json`.
### Важно: манифест — строго плоская карта «путь пакета → строка версии», без служебных ключей: рантайм release-please парсит каждый верхнеуровневый ключ как версию (добавленный когда-то `$schema` ломал все прогоны: `unable to parse version string`). В отличие от манифеста, в `release-please-config.json` `$schema` допустим. Исторический контекст — упавший прогон: [#40554698482](https://github.com/grekhss/ai-for-developers-project-387/actions/runs/40554698482).
### Прогоны: [Actions → release-please](https://github.com/grekhss/ai-for-developers-project-387/actions/workflows/release-please.yml)

# Модели и публикация сессий (share)

- Во всех OpenCode-воркфлоу используется одна модель — `opencode/big-pickle`
  (формат `provider/model`); ключ провайдера передаётся секретом `OPENCODE_API_KEY`.
- **Решение по share:** публикация сессий агента в этом репозитории допустима —
  проект учебный, не коммерческий; секретов и персональных данных в сессиях нет.
- Параметр `share` в `.github/workflows/opencode.yml` **не выставлен**: в
  актуальной документации экшена `anomalyco/opencode/github` такой вход не описан.
  Если документация экшена обновится (вход `share` появится или сменит смысл) —
  решение по публикации и значению параметра нужно пересмотреть.

# Automatic tests

After completing all the steps in the project, automatic tests will become available to you. Tests are run on each commit - once all tasks in the Hexlet interface are completed, make a commit, and the tests will run automatically.

The hexlet-check.yml file is responsible for running these tests - do not delete this file, edit it, or rename the repository.

# Самооценка
Практически все задачи шли довольно спокойно. Изредка (2 или 3 раза) агент на чём-то зависал. И тогда помогало остановить и задать вопрос о причине зависания. Главная проблема под конец - не хватило бесплатных токенов и закончились деньги.
