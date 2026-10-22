# AGENTS.md

Repo-wide rules for AI agents. The application lives in `calendar-of-meetings/`;
read `calendar-of-meetings/AGENTS.md` for its technical rules. `docs/` holds the
glossary, ADRs and plans at the repository root.

## Правила сессии

- **Общение с пользователем — только на русском.** Статусы, вопросы и отчёты —
  по-русски. Сообщения коммитов и текст PR — по-английски, как вся история
  репозитория.
- **Ветка на задачу, PR в `main`.** Ветка создаётся от актуального
  `origin/main` и называется `<type>/<short-slug>` (`feat/…`, `fix/…`,
  `docs/…`, `chore/…`). Коммитить и пушить можно только в свою ветку; коммит
  или пуш напрямую в `main` запрещён.
- **PR — единственный путь в `main`.** Перед PR: `git fetch origin`, ветка
  основана на актуальном `origin/main`, гейт зелёный. PR открывается через
  `gh pr create --base main`. Мерж PR, закрытие issues и любые операции в чужих
  репозиториях — только по отдельной команде владельца.
  `git push --force-with-lease` допустим только для своей ветки.
- **Коммиты — Conventional Commits с доказательствами.** Заголовок:
  `<type>(<scope>): <imperative summary>`. Тело:

  ```
  Why:
  <почему изменение нужно>

  What:
  <что изменено, по пунктам>

  Evidence:
  - `<команда>` -> PASS/FAIL, фактический результат (число тестов и т.п.)
  - новые/изменённые сценарии
  - ручные проверки или явная пометка, что их не было

  Refs: <issue / план / PR>
  ```

  `Evidence` должен позволять повторить проверку. Красный гейт = нет коммита:
  сначала фикс или отчёт владельцу.
- **Гейт проекта:** `cd calendar-of-meetings && npm run check`
  (`contract:check` + oxlint + обе типизации + vitest). Запускать перед
  коммитом, если изменение затрагивает код; для docs-only — тоже, чтобы
  доказать отсутствие поломок.
- **Не трогать** `.github/workflows/hexlet-check.yml` (внешняя проверка
  Hexlet) и не переписывать историю `main`.
