# AGENTS.md

Guidance for AI agents working in this app. The git repo root is one level up.

## Правила сессии

- **Общение с пользователем — только на русском:** статусы, вопросы и отчёты о
  проделанной работе. Сообщения для коммитов — по-английски, как вся
  существующая история репозитория.
- **Git-протокол, формат коммитов и требования к доказательствам описаны в
  корневом `AGENTS.md`** (уровнем выше). Здесь — только правила приложения.

## Commands

This folder is the only package in the repo — there is no root `package.json` and
no workspaces, so every npm command runs from here. Use **npm**
(`package-lock.json` is committed; do not introduce yarn/pnpm/bun). Node 20 /
npm 10 locally.

| Task | Command |
| --- | --- |
| Dev (Vite HMR + API-сервер) | `npm run dev` |
| API-сервер только (watch) | `npm run dev:server` |
| Prod-сборка фронта и сервера | `npm run build` |
| Запуск прод-сервера (API + статика) | `npm start` — только после `npm run build` |
| Lint | `npm run lint` |
| Lint + autofix safe fixes | `npm run lint:fix` |
| Lint language server (for editors) | `npm run lint:lsp` |
| Контракт API → спека + TS-копии + клиентский SDK (с самопроверкой дрейфа) | `npm run contract` |
| Проверка дрейфа артефактов контракта | `npm run contract:check` (входит в `check`) |
| Tests (single run) | `npm test` |
| Tests (watch mode) | `npm run test:watch` |
| Full gate: contract:check + lint + typecheck + tests | `npm run check` |
| Preview собранной статики | `npm run preview` — без `/api`, записи не грузятся |

- **There is no `typecheck` script.** `npm run build` runs `npm run contract`
  then `tsc -b`, and `npm run check` runs `contract:check` + lint + `tsc -b` +
  `tsc -p tsconfig.server.json --noEmit` + vitest without bundling — those are the
  two type gates. Note that `npm run
  dev` gives HMR but **no type feedback**: Vite and `tsx watch` strip types
  without checking them, so run `check` (or
  `npx tsc --noEmit -p tsconfig.app.json --watch` in a second terminal) while
  developing.
- **`npm run dev` starts two processes** (concurrently: `tsx watch server/index.ts`
  and `vite`); Ctrl-C kills both (`-k`). There is a startup race: the first
  request can arrive before `listen(PORT)` → a one-off `LOAD_ERROR` under the
  calendar; acceptable.
- **`npm start` serves only after `npm run build`** — it needs both `dist/` and
  `dist-server/`.
- **`npm run preview` is a build-only smoke check.** It serves the static
  `dist/` without `/api`, so meetings fail to load.
- Hexlet's own suite is separate and external: it runs on every push via
  `.github/workflows/hexlet-check.yml` at the repo root, which must not be
  edited, renamed, or deleted. It does **not** run lint, typecheck, or the local
  tests — nothing in CI does, so `npm run check` is manual.
- There is **no `README.md`** — the Hexlet template one was removed in `e8322d2`.
  Don't reference or try to update it.

## Linting (oxlint, not ESLint)

- **oxlint has no `--watch` mode.** There is no re-running lint loop; live
  feedback comes from the language server (`npm run lint:lsp`, verified working)
  wired up in your editor, or from `npm run check` by hand.
- **There is deliberately no pre-commit hook** — no husky, no lint-staged, no
  active git hooks, and CI does not run the linter. Don't add one unprompted;
  check whether the project has settled first.
- **`plugins` in `.oxlintrc.json` *replaces* the default plugin set, it does not
  extend it.** Adding one plugin silently disables the others, so the array must
  list every plugin the project wants. (`unicorn` is on by default in oxlint but
  is *not* in this project's array, so it is inactive — adding it back is a
  separate decision, not a fix.)
- **`src/lib/api-gen/` is excluded via `ignorePatterns`, not via `plugins`.** The
  hey-api client generated in K3 trips `no-shadow`/`no-underscore-dangle`, which
  are `error`-level, so the whole generated folder is ignored. Don't relax the
  rules for the rest of the project and don't touch `plugins` to fix it; the
  folder still has to pass `tsc -b`, so a generator upgrade that breaks types is
  caught by the gate, not by the linter.
- `correctness` and `suspicious` are set to **error** so they fail the exit
  code. `perf` and `react/only-export-components` stay at `warn`, and
  `--deny-warnings` is not used, so warnings never fail `npm run lint`.
- `react/react-in-jsx-scope` is **off** because the project uses
  `jsx: "react-jsx"` — the rule would demand `React` in scope and flag every
  JSX element as a false positive.
- `npm run lint` exits 0 with `react-perf(jsx-no-new-*-as-prop)` warnings
  printed inline — `perf` is `warn` and `--deny-warnings` isn't used, so those
  are noise, not failures. Inline lambdas passed as props are idiomatic here;
  hoist a handler to a module constant only when it's a pure predicate.

## Testing (vitest + Testing Library)

- **Do not "upgrade" vitest to v5.** npm 10.8.2 cannot resolve its peer graph at
  all: `TypeError: Cannot read properties of null (reading 'edgesOut')` in
  arborist's `#loadPeerSet`. It fails on `npm i -D vitest@5` alone and leaves
  `package.json` untouched. The project is pinned to `vitest@^4.1.11`, whose
  `vite` peer (`^6 || ^7 || ^8`) covers vite 8. Moving to v5 means upgrading
  npm first.
- **Two deps are capped by Node 20, not by preference.** `jsdom` is `^29` (v30
  requires Node `^22.22.2`) and `@testing-library/jest-dom` is `~6.9.1` (v7 and
  6.10.0 require Node ≥22). `~` is deliberate — a caret would drift to 6.10.0
  and break the install. Revisit all three pins together if Node is upgraded.
- **Test config lives in `vite.config.ts`; don't split out a
  `vitest.config.ts`.** Vitest does not merge the two — a `vitest.config.ts`
  fully *displaces* `vite.config.ts` (verified: with one in place, the
  `environment` and `setupFiles` from `vite.config.ts` were gone and all tests
  died on `document is not defined`). JSX still compiles without the `react()`
  plugin, because Vite transforms TSX from tsconfig's `jsx: react-jsx` — so the
  plugin was never what made the tests work, and the breakage is *silent* for
  anything added later (aliases, extra plugins, `define`). Keep one config.
- **Vitest runs two `projects` in `vite.config.ts`: `app` and `server`.**
  `app` — jsdom + `src/test/setup.ts`, files under `src/**`; `server` — node,
  no setup, files under `server/**` (they carry `@vitest-environment node` and
  use `:memory:` SQLite). The setup's `window.matchMedia` stub only applies to
  the app project — under node it would crash. Default `include`/`exclude` are
  not enough here: the explicit `include` also keeps any built
  `dist-server/*.test.js` from running.
- **The config uses `/// <reference types="vitest/config" />` rather than
  importing `defineConfig` from `vitest/config`,** so `vite build` doesn't need
  vitest installed at runtime. Delete that reference and `tsc` fails on the
  `test` key.
- **`src/test/setup.ts` carries load-bearing stubs.** `window.matchMedia`
  is stubbed because jsdom doesn't implement it and Mantine's
  `use-provider-color-scheme` calls it (every render test throws otherwise);
  `ResizeObserver` is stubbed for the same reason — Mantine's `ScrollArea`
  (inside `Modal` and `Table.ScrollContainer`, both used by the admin panel, F6)
  calls it in `use-resize-observer`, and without the stub rendering dies with
  `ReferenceError: ResizeObserver is not defined`;
  `import 'dayjs/locale/ru'` is required because tests import `App.tsx` directly
  and bypass the import in `main.tsx` — without it the calendar silently renders
  "October 2026" / "MoTuWe..."; and `afterEach(cleanup)` is explicit because
  RTL's auto-cleanup only self-registers when a *global* `afterEach` exists.
  Don't delete any of them as unused.
- **No `globals: true`** — `tsconfig.app.json` pins
  `types: ["vite/client"]`, so tests must `import { describe, it, expect } from
  'vitest'`. Adding `globals` means editing that `types` array.
- Tests are **colocated in `src/`**, so `tsc -b` typechecks them for free and a
  type error in a test fails `npm run check`.
- **jsdom gives no `Request`; the global one is Node/undici, and it demands an
  absolute URL** — in a browser a relative one is resolved from `location`. The
  generated SDK builds `new Request('/api/…')` internally, so any test calling
  `createHttpMeetingsApi()` dies with `ERR_INVALID_URL` before `fetch` runs (this
  is how the vacuously green "create бросает при 400 и 409" was caught). Keep the
  `BrowserRequest` shim in `http.test.ts` (all three of `lib/meetings/`,
  `lib/meeting-types/` and `lib/session/` carry their own copy), which prepends the origin a browser
  would add; tests that stub `fetch` should inspect the `Request` they receive —
  `url`, `method`, `headers`, `await text()`, `credentials` — rather than a
  `RequestInit` second argument, because the SDK calls `fetch(request)` with one
  argument. The app itself is unaffected: the browser resolves the empty
  `baseUrl` for it.
- Mantine days are `<button>`s carrying `data-selected` / `data-today` /
  `data-outside`. Query those, not day text — numbers repeat across outside
  days, so `getByText('1')` is ambiguous. `data-today` is unique and is the
  stable click target. Each day gets a localized `aria-label`: "3 октября 2026",
  а у дня с известным счётчиком — "3 октября 2026 — свободно 5". Такие дни
  дополнительно несут `data-free-count` и `title="свободно N"`; дни без данных
  о занятости подписаны как раньше.
- **Mantine v9 throws without `MantineProvider` in the tree** ("MantineProvider
  was not found in component tree") — every render test must wrap the component
  it renders. `DatesProvider` is only needed for date widgets that read locale
  or weekend days from context; the `TimeSlots` grid does not need it.
- `TimeGrid` slots are `<button>`s whose text is the formatted time, so
  `getByRole('button', { name: '09:00' })` works. Taken slots are `disabled`
  **and** carry `data-disabled`; the active slot gets Mantine's `active`
  class, not a `data-` attribute.
- **Calendar CSS classes are `mantine-DatePicker-*`, not `mantine-Calendar-*`.**
  Verified ones: `-weekday` (7 cells, lowercase 2-letter Russian: `пн`…`вс`),
  `-weekdaysRow`, `-calendarHeaderLevel` (button with "октябрь 2026"),
  `-day`, `-monthTbody`. Don't guess `.mantine-Calendar-header` — it doesn't
  exist in v9 and the failure mode is a confusing
  "undefined and string is invalid for this assertion" instead of a null check.
- **Assert the locale from day `aria-label`s, not from the header text.**
  The header shows the *current* month, so a test asserting "октября" passes in
  October and fails in November. `/^\d{1,2} [а-яё]+ \d{4}( — свободно \d+)?$/`
  proves Russian locale in any month.
- **`App` takes optional `api`, `typesApi`, `plannedApi` and `sessionApi` props,
  and all four are load-bearing in tests.** `lib/meetings/api.ts` exports a module-level
  singleton, so without
  a per-test `createInMemoryMeetingsApi()` the meetings leak between test cases
  in the same file and a slot booked by an earlier test is `disabled` in a later
  one — the click silently does nothing and the test times out on a `findBy`.
  `lib/meeting-types/api.ts` is a singleton the same way: since F7 the guest
  view loads types right after login, and without a fake that request dies on
  jsdom's `Request` and paints the view into a load-error state.
  `lib/planned-meetings/api.ts` is the same kind of singleton: the admin branch
  loads planned meetings right after login (F6), so its tests need a
  `plannedApi` fake — `createInMemoryPlannedMeetingsApi()` (seeded with
  today-or-later dates: the fake mirrors the server and drops the past).
  `lib/session/api.ts` is a singleton the same way, and the whole app is gated
  by login (Q12a), so every render test also passes `sessionApi` — seeded
  guest (`createInMemorySessionApi({ role: 'guest', bookerName: 'Тест' })`) for
  calendar scenarios, `createInMemorySessionApi(null)` to reach the login
  screen. The `renderApp` helper in `App.test.tsx` awaits the end of session
  restore ("Восстановление сессии…") before returning; without it the first
  query races the `me()` promise. The `renderGuestView` helper in
  `GuestView.test.tsx` does the same for the types load ("Загрузка типов
  встреч…").
- **Mantine adds an asterisk inside the label of a `required` field** (an
  `aria-hidden` `<span>` with ` * `), so the normalized label text is «Пароль *»
  and `getByLabelText('Пароль')` finds nothing. Query with a regex
  (`getByLabelText(/^Пароль/)`) rather than dropping `required`.

## Mantine v9 dates — check this before writing date code

`@mantine/dates` is **9.6.3**, whose API differs from most tutorials, Stack
Overflow answers, and your own priors. Verified against
`node_modules/@mantine/dates/lib/**/*.d.ts`:

- **Dates are strings, not `Date` objects.** `DateStringValue = string` in
  `YYYY-MM-DD` form; `DateValue = DateStringValue | Date | null`. Build and
  compare these with `dayjs`.
- **dayjs is a peer dependency** of `@mantine/dates` (`>=1.0.0`) and is listed in
  `dependencies` on purpose. Never remove or replace it — the calendar breaks
  without it. Don't add date-fns/luxon/moment alongside it.
- **`Calendar` cannot select a date.** It exposes `date` / `onDateChange` (the
  *displayed* month) plus `onMonthSelect` / `onYearSelect`. Its `value` and
  `onChange` are inherited from the root `div`'s DOM props
  (`ElementProps<'div'>`), so they are the wrong types for a date — and worse,
  they **silently do nothing at runtime**, because a `<div>` never fires
  `change`. Selection state lives only on `DatePicker`, `DateInput`, and
  `DatePickerInput`; `DatePickerProps` re-declares `value` / `onChange` and
  supports `type="default" | "multiple" | "range"`. `DatePicker` renders
  `Calendar` internally, so it is a drop-in replacement. `Month` is **not** one
  of them: it only takes `month` + `getDayProps` and computes no selection.
- **`onChange` yields a `DateStringValue`, so type state as `string | null`.**
  Don't round-trip through `new Date(str)` — `'YYYY-MM-DD'` parses as UTC
  midnight and renders as the *previous* day in negative-UTC-offset timezones.
  For display use `dayjs(date).format('D MMMM YYYY')`; the `LL` token needs the
  unconfigured `dayjs/plugin/localizedFormat`.
- **Date widgets render English labels by default.** Copy in this app is
  Russian, so wrap date components in
  `<DatesProvider settings={{ locale: 'ru' }}>` and `import 'dayjs/locale/ru'`.
- Prefer `getDayProps` / `renderDay` / `excludeDate` / `getDayAriaLabel` (all
  take a `DateStringValue`) over reaching into internals. Props prefixed `__`
  are private — don't pass them.

## API-контракт (TypeSpec)

- **Источник истины — `contract/main.tsp`** (TypeSpec; K1/ADR-0004). `contract/openapi.yaml`,
  `src/lib/contract.gen.ts` и `server/contract.gen.ts` — **сгенерированные артефакты**:
  руками их не правят, правка идёт в `.tsp` и приезжает через `npm run contract`.
- **Контракт описывает формат и схему, не домен (ADR-0007).** Прошедшие даты, выходные и сетка
  слотов остаются фронтовой политикой; `server/validate.ts` валидирует формат по сгенерированным
  схемам через `ajv` (булев предикат, K4) — руками остаётся то, что JSON Schema не выразит,
  и живёт это в `routes.ts`: обёртка `req.body === undefined` (в Express 5 парсер может не
  сработать), целостность `meeting_type_id` (существующий активный тип) и `booker` из
  подписанной сессии, а не из тела (S5, Q4/C10). Русские тексты ошибок — тоже в роутах.
- **Схемы в `contract/schema/` — артефакт той же компиляции, что и спека.** Эмиттер
  `@typespec/json-schema@~1.11.0` в `tspconfig.yaml` даёт один бандл (`bundleId`) в формате
  JSON Schema **draft 2020-12**, поэтому сервер собирает `ajv` из `ajv/dist/2020`. Две ловушки:
  (1) `seal-object-schemas` оставлен выключенным — `additionalProperties` не появляется и лишние
  поля по-прежнему разрешены, как и в ручном валидаторе; включать его — отдельное решение,
  меняющее поведение; (2) `bundleId` задаёт имя файла без расширения, а `generate.sh` переносит
  его в `contract/schema/calendar-of-meetings.json` — сервер читает его по пути от `import.meta.dirname`,
  что верно и в dev (`server/`), и в проде (`dist-server/`).
- **Импорт `ajv` — именованный, и это не стилистика.** У `ajv` 8.20 нет `exports`-карты и
  `type: module`, файлы CommonJS, а `.d.ts` написан как ES-модуль. В `nodenext` дефолтный импорт
  даёт тип модульного namespace, и `new Ajv2020(...)` не компилируется (TS2351), хотя в рантайме
  Node подставляет класс. Работает только `import { Ajv2020 } from 'ajv/dist/2020.js'` — имя есть
  и в типах, и в `module.exports`; путь обязан быть полным, с `.js` (иначе TS2307).
- **Две копии генерата, а не одна общая**: сервер не может импортировать из `src/`
  (`rootDir: server`), поэтому `openapi-typescript` зовётся дважды; идентичность копий
  фиксирует `server/contract.test.ts`.
- **Типы подключаются alias'ами** — `openapi-typescript` кладёт модели в
  `components['schemas'][...]`, поэтому `src/lib/meetings/types.ts` и `server/types.ts`
  держат `export type Meeting = components['schemas']['Meeting']`, а не re-export имени.
- **Пин `~1.11.0`** — последняя линия TypeSpec, работающая на Node 20 (с 1.12 компилятор
  требует Node ≥22). Не поднимать по отдельности от Node: смена Node → пересмотр пина.
- **`.npmrc` с `legacy-peer-deps=true`** — у `openapi-typescript@7` устаревший peer
  `typescript@^5.x` при TS 6 в проекте; с TS 6 генератор работает (проверено генерацией),
  но флаг глушит peer-проверки **для всего дерева**. Если peer реально несовместим —
  проверять вручную: `npm view <pkg> peerDependencies`.
- **`contract:check` (в `check`) ловит дрейф**: генерирует во временный каталог и делает
  `diff` с закоммиченными артефактами. Правил `.tsp` — сначала `npm run contract`, потом
  гейт; ручная правка `.gen.ts`/`openapi.yaml` гейт роняет.
- **`npm run contract` — единая самопроверяющаяся команда** (D5/ADR-0005): генерирует спеку, обе TS-копии
  и серверные схемы, а в конце зовёт `contract/check.sh`, который то же самое перегенерирует во
  временный каталог и сверит — так успешный прогон гарантирует и свежесть, и детерминизм.
  Скрипта `contract:types` больше нет: ступени живут в `contract/generate.sh`. Новый
  генератор добавляется ступенью в `generate.sh` **и** диффом в `check.sh` — иначе он
  не попадёт в самопроверку (так K4 добавил JSON Schema для сервера).
- **Клиентский SDK — ступень `npx openapi-ts` по `openapi-ts.config.ts`** (K3,
  `@hey-api/openapi-ts@0.95.0`, закреплён точно; рантайм `@hey-api/client-fetch`
  в `dependencies`). Каталог `src/lib/api-gen/` коммитится, как и остальные
  артефакты, и правится только через `npm run contract`. Три ловушки, уже
  оплаченные: (1) путь в `input` обязан начинаться с `./` — иначе hey-api
  трактует `contract/openapi.yaml` как shorthand реестра
  (`organization/project`) и падает; (2) вывод перенаправляется переменной
  `API_GEN_OUT` — так `check.sh` генерирует SDK во временный каталог и сверяет
  `diff -ru`, не трогая дерево; (3) плагины `typescript`/`sdk`/`client-fetch` —
  имена, встроенные в openapi-ts, отдельных пакетов под ними нет. Конфиг лежит
  в корне и подключён в `tsconfig.node.json`, чтобы типизироваться.
- **`http.ts` — единственный адаптер SDK, и он добавляет только то, что контракт
  не выражает**: `credentials: 'include'` (иначе браузер не подложит
  session-cookie и сессия 401, D3) и прежние русские тексты ошибок. Функции SDK
  по умолчанию не бросают, а возвращают `{ data, error }`, поэтому адаптер
  сужает union по `error !== undefined` и пробрасывает исходное сетевое
  исключение как есть. Порт `MeetingsApi` и сигнатуры не менялись — UI их не
  замечает.
- **Ручки в спеке идут впереди сервера, но S4 и S3 их догнали.** Все описанные
  операции теперь смонтированы: `GET /api/admin/meetings` (S4) и три
  `/api/meeting-types` (S3). Контракт намеренно опережал сервер, чтобы SDK (K3)
  собрал ручки до реализации. Их статус-коды и присутствие
  держит `server/contract.test.ts`, который сверяет каждую операцию с обязательным набором кодов.
- **`server/contract.test.ts` сверяет роуты со спекой** (K4): интроспектирует
  `createRoutes(...).stack`, разворачивает Express-пути в форму OpenAPI (`:id` → `{id}`) и
  сверяет пары «путь + метод» с разобранным `openapi.yaml` (dev-зависимость `yaml`). Направление —
  **роуты ⊆ спека**: контракт идёт впереди, поэтому лишняя ручка в спеке допустима, а смонтированная
  ручка вне спеки — нет. Тот же тест держит порядок слоёв: сеанс-гейт должен покрывать всё после
  себя, а `POST /api/login` оставаться единственным открытым роутом.
- **`tsp-output/`** — промежуточный выход `tsp compile`, в `.gitignore`; `npm run contract`
  переносит спеку в `contract/openapi.yaml`, а бандл схем — в
  `contract/schema/calendar-of-meetings.json`.

## Conventions

- **Дев-обход авторизации включается только конфигом.** `AUTH_DISABLED=1` (см.
  `.env.example`) отключает проверку пароля: роль берётся из URL (`/admin` —
  владелец, остальное — гость), `main.tsx` кладёт её в неподписанную cookie
  `dev_role`, а сервер ставит `devSessionGate` вместо `requireSession`
  (`server/session.ts`). Обычный вход (подписанная сессия, роль-по-паролю,
  ADR-0006) не трогается, флаг по умолчанию выключен и в проде его быть не
  должно. Не превращать обход в дефолт и не вычищать как мёртвый код — он нужен
  для локальной проверки корректности.
- **Server imports carry the `.js` suffix** (`server/routes.ts` imports
  `./repository.js`). `moduleResolution: nodenext` + ESM require it, and both
  `tsx` and vitest resolve `.js` → `.ts` for TS importers. Don't mix with `src/`,
  where `moduleResolution: bundler` and extensions are optional. `rootDir:
  server` blocks any import from `src/` — that's deliberate (domain rules stay on
  the front, see ARCHITECTURE §7).
- **User-facing copy is in Russian** (`index.html` is `lang="ru"`, page title
  "Календарь встреч"). Match it — titles, labels, empty states, button text,
  `aria-label`s. Inline explanatory comments are Russian too (see `main.tsx`).
- The app is a **dark theme**: `MantineProvider defaultColorScheme="dark"`.
  Import Mantine's CSS once in `src/main.tsx`, never per component.
- `verbatimModuleSyntax` is on: type-only imports must use `import type`.
- `noUnusedLocals` and `noUnusedParameters` are on and will fail the build.
  Delete unused code rather than prefixing names with `_` to silence it.
- `erasableSyntaxOnly` is on: no TS-only runtime constructs (enums, parameter
  properties, namespaces).
- **`react/set-state-in-effect` is an error, and it is transitive:** calling a
  function that touches `setState` from an effect body is flagged *even if the
  `setState` happens after an `await`*. So a "load on mount" effect can't call
  the hook's own `refresh` — see the inlined `load` in `useMeetings.ts`
  (mirrored in `useMeetingTypes.ts`) for the accepted shape. Don't "simplify"
  it back into `void refresh()`.
- **Domain date rules never read the clock (T3).** `isPast`/`isBookable` take a
  `moment: string` parameter, and `lib/window.ts` (`WINDOW_DAYS`, `windowEnd`,
  `isBookableDay`, `isBookableSlot` — гостевое окно Q5) composes them without
  re-deriving weekend/past rules. Only `today()`/`now()` in `lib/date.ts` read
  system time, and call sites pass their results in — so tests inject a fixed
  `'YYYY-MM-DD HH:mm'` string instead of using `vi.setSystemTime`.
  `server/date.ts` holds the server's own `today()` (same convention, hand-rolled
  local date — `src/` isn't importable from `server/`): `listPlanned` takes the
  boundary as a `from` parameter, and only the route calls `today()`, so the
  repository test injects a fixed date the same way.
- **`strict` is on** in `tsconfig.app.json` (enabled 2026-10-03, so don't assume
  the stock Vite template's laxer defaults). Nullable date/time state — the bulk
  of this app — is checked, so expect `string | null` to be narrowed explicitly
  rather than passed through. `skipLibCheck` is also on, so strict never surfaces
  errors from Mantine's own `.d.ts`.
- `DatePicker`'s `onChange` is typed `(value: DateStringValue | null) => void`
  even with `type="default"` — `allowDeselect` can emit `null`, so a handler
  can't be typed `(date: string) => void`. Narrow inside the wrapper component
  that owns the `DatePicker`.
- **`getDayProps` overrides the props `DatePicker` computes itself.** In
  `DatePicker.mjs` the day props are built as `...getControlProps(date)` *then*
  `...calendarProps.getDayProps?.(date)`, so a hand-passed `selected` replaces
  the real selection — always OR it with the current value. Symmetrically, in
  `Month.mjs` `disabled` is computed from `excludeDate` / `minDate` / `maxDate`
  *before* `...dayProps` is spread, so a `disabled` from `getDayProps` would
  silently defeat `excludeDate`. Don't pass one.
- Day cells expose `data-selected` / `data-today` / `data-disabled`, but
  `data-outside` and `data-weekend` are only set on **enabled** days
  (`!disabled && outside`), so a disabled weekend has neither attribute.
- `tsconfig.app.json` sets `types: ["vite/client"]`, which replaces the usual
  `src/vite-env.d.ts`. Don't create that file.
- `moduleResolution: "bundler"` with `allowImportingTsExtensions` — relative
  imports may carry the `.tsx` extension (see `main.tsx`) but don't have to.
  There are no path aliases, so nested files import via `../`.
- Use the new JSX transform (`jsx: "react-jsx"`). Only `src/main.tsx` imports
  `React`, and only for `React.StrictMode`. New components do **not** need it.
- **No formatter is configured** (no Prettier, no EditorConfig) and linting is
  **oxlint**, not ESLint. Single quotes. Semicolon usage is inconsistent on
  purpose — `App.tsx` has them, `main.tsx` and `vite.config.ts` don't. Match the
  file you're editing instead of reformatting, and don't add a formatter
  unprompted.
- Don't "fix" `postcss.config.cjs` to ESM — the `.cjs` extension is required
  because `package.json` sets `"type": "module"`. Its Mantine breakpoint
  variables must keep matching Mantine's own breakpoints.
- New dependencies go in `dependencies` unless they're build- or lint-only.

## Layout

```
calendar-of-meetings/
├── index.html              # Vite entry; mount point #root, <html lang="ru">
├── vite.config.ts          # react() plugin + vitest projects (app/server) + /api proxy
├── postcss.config.cjs      # CommonJS on purpose (package.json is ESM)
├── .oxlintrc.json
├── .npmrc                  # legacy-peer-deps=true — причина в «API-контракт (TypeSpec)»
├── contract/               # TypeSpec: единственный источник истины контракта API
│   ├── main.tsp            # модели и ручки всего API (включая планируемые); правка только здесь
│   ├── tspconfig.yaml      # emit @typespec/openapi3 + @typespec/json-schema
│   ├── generate.sh         # npm run contract: генерация всех семейств + самопроверка
│   ├── check.sh            # contract:check: генерация во временный каталог + diff
│   ├── schema/             # JSON Schema draft 2020-12 одним бандлом (артефакт, не править)
│   └── openapi.yaml        # сгенерированная спека (коммитится, не править)
├── openapi-ts.config.ts    # клиентский SDK из спеки → src/lib/api-gen (K3; в tsconfig.node.json)
├── tsconfig.json           # project references only
├── tsconfig.app.json       # src/ — the app's compiler options
├── tsconfig.node.json      # vite.config.ts + openapi-ts.config.ts
├── tsconfig.server.json    # server/ + его тесты (nodenext, rootDir: server)
├── tsconfig.server.build.json  # эмитит dist-server/ (тесты исключены)
├── ARCHITECTURE.md         # how it's built and why; read before coding
├── data/meetings.sqlite    # SQLite-файл (в .gitignore; создаётся в server/db.ts)
├── dist-server/            # собранный сервер (в .gitignore)
├── public/favicon.svg      # served at /
├── server/                 # express + better-sqlite3; импорты — с .js-суффиксом
│   ├── index.ts            # wiring: БД → createApp → listen; логики нет
│   ├── app.ts              # createApp: express.json, роуты, статика dist/ + SPA-fallback для /admin
│   ├── routes.ts           # /api/meetings (S5) + /api/meeting-types (S3) + GET /api/admin/meetings (S4, за requireRole('admin'))
│   ├── repository.ts       # createRepository: list/create(draft, booker)/listPlanned(from); UNIQUE → DuplicateMeetingError
│   ├── meeting-types-repository.ts  # createMeetingTypesRepository: create/deactivate/listActive/listAll
│   ├── session.ts          # подпись/разбор session-cookie + requireSession/requireRole (F2/F5) + дев-обход AUTH_DISABLED
│   ├── date.ts             # today() — местная дата 'YYYY-MM-DD'; единственные часы в server/ (S4)
│   ├── db.ts               # createDatabase + defaultDbPath (data/meetings.sqlite)
│   ├── validate.ts         # форматная валидация по схемам контракта через ajv (не домен!)
│   ├── contract.gen.ts     # сгенерированные TS-типы контракта (не править)
│   ├── types.ts            # alias'ы Meeting/MeetingDraft/MeetingType/PlannedMeeting + тела/параметры из operations
│   ├── contract.test.ts    # @vitest-environment node: артефакты контракта + сверка роутов со спекой
│   ├── repository.test.ts  # @vitest-environment node
│   ├── meeting-types-repository.test.ts  # @vitest-environment node
│   └── routes.test.ts      # интеграция: createApp({ meetings, meetingTypes }, …) + listen(0) + fetch
└── src/
    ├── main.tsx            # createRoot, provider stack, Mantine CSS imports
    ├── App.tsx             # гейт по сессии + шапка; рендерит LoginScreen, GuestView или AdminView
    ├── App.test.tsx        # colocated vitest tests
    ├── GuestView.tsx       # гостевой вид: Stepper «Тип → Время → Готово» (F7); state букинга + оба хука
    ├── GuestView.test.tsx  # сценарии букинга: тип, слот, подтверждение, Alert'и
    ├── AdminView.tsx       # админ-панель (F6, D4): вкладки, Switch-деактивация, модалка «Добавить тип», список встреч
    ├── AdminView.test.tsx  # сценарии панели: вкладки, деактивация, создание, легаси-«—», пустое состояние
    ├── components/         # rendering only; props in, no domain rules
    │   ├── MeetingCalendar.tsx  # the only component that renders date selection
    │   ├── TimeSlots.tsx   # инлайн-сетка TimeGrid под календарём (D4); пустое состояние — текст
    │   ├── TimeSlots.test.tsx
    │   └── LoginScreen.tsx   # форма входа (D4); поля формы держит App, компонент рендерит
    ├── hooks/              # React state around lib; the only place with useState
    │   ├── useMeetings.ts  # load/create meetings; takes a MeetingsApi so tests inject a fake
    │   ├── useMeetings.test.ts
    │   ├── useMeetingTypes.ts  # load/create/deactivate meeting types; same injection seam
    │   ├── useMeetingTypes.test.ts
    │   ├── usePlannedMeetings.ts   # load planned meetings (admin list); same injection seam
    │   ├── usePlannedMeetings.test.ts
    │   ├── useSession.ts   # login/logout, роль + bookerName; тот же шов через параметр api
    │   └── useSession.test.ts
    ├── lib/                # framework-free domain code, unit-tested beside itself
    │   ├── contract.gen.ts # сгенерированные TS-типы контракта (не править)
    │   ├── api-gen/        # сгенерированный клиентский SDK hey-api (не править)
    │   ├── date.ts         # APP_LOCALE, today, now, addDays, isWeekend, isPast, isBookable, formatDateRu
    │   ├── date.test.ts
    │   ├── devRole.ts      # роль по URL для дев-обхода (AUTH_DISABLED); cookie ставит main.tsx
    │   ├── devRole.test.ts
    │   ├── window.ts       # гостевое окно Q5 (14 дней): WINDOW_DAYS, windowEnd, isBookableDay, isBookableSlot
    │   ├── window.test.ts
    │   ├── slots.ts        # generateTimeSlots — workday bounds and slot length
    │   ├── slots.test.ts
    │   ├── meetings/
    │   │   ├── types.ts    # alias'ы Meeting/MeetingDraft/DateRange из contract.gen.ts
    │   │   ├── api.ts      # MeetingsApi interface + the instance the app uses (HTTP)
    │   │   ├── http.ts     # createHttpMeetingsApi — адаптер SDK из api-gen на /api/meetings
    │   │   ├── http.test.ts
    │   │   ├── inMemory.ts # тестовая фабрика/fake (createInMemoryMeetingsApi)
    │   │   └── inMemory.test.ts
    │   ├── meeting-types/  # зеркало meetings/ (F3); модули не зависят друг от друга
    │   │   ├── types.ts    # alias'ы MeetingType/MeetingTypeDraft из contract.gen.ts
    │   │   ├── api.ts      # MeetingTypesApi interface + the instance the app uses (HTTP)
    │   │   ├── http.ts     # createHttpMeetingTypesApi — адаптер SDK на /api/meeting-types
    │   │   ├── http.test.ts
    │   │   ├── inMemory.ts # createInMemoryMeetingTypesApi; list() копирует элементы — см. ниже
    │   │   └── inMemory.test.ts
    │   ├── planned-meetings/  # зеркало meetings/ (F6/S4); список только читается
    │   │   ├── types.ts    # alias'ы PlannedMeeting из contract.gen.ts
    │   │   ├── api.ts      # PlannedMeetingsApi interface + the instance the app uses (HTTP)
    │   │   ├── http.ts     # createHttpPlannedMeetingsApi — адаптер SDK на /api/admin/meetings
    │   │   ├── http.test.ts
    │   │   ├── inMemory.ts # createInMemoryPlannedMeetingsApi; фильтр «date >= today()» и сортировка — как на сервере
    │   │   └── inMemory.test.ts
    │   └── session/        # зеркало meetings/ (F2); модули не зависят друг от друга
    │       ├── types.ts    # alias'ы Session/LoginInput из contract.gen.ts
    │       ├── api.ts      # SessionApi interface + the instance the app uses (HTTP)
    │       ├── http.ts     # createHttpSessionApi — адаптер SDK на login/logout/me; 401 от me() → null
    │       ├── http.test.ts
    │       ├── inMemory.ts # createInMemorySessionApi(seed); пароли-фикстуры 'admin'/'guest'
    │       └── inMemory.test.ts
    └── test/setup.ts       # matchMedia + ResizeObserver stubs, dayjs locale, RTL cleanup (app-проект vitest)
```

**Read `ARCHITECTURE.md` first.** It covers the layers, the `MeetingsApi`
contract, the decisions that cost something (controlled slot in `GuestView`,
inlined mount load, `api`/`typesApi`/`plannedApi`/`sessionApi` props in `App`) and
the known gaps. This file covers commands, conventions, and Mantine traps — the
two documents deliberately don't repeat each other.

**Three layers:** `lib/` holds pure functions and types with no React and no
Mantine imports; `components/` renders; `hooks/` is the only place that owns
React state and the only bridge between `components/` and the `api.ts` modules
(`lib/meetings/`, `lib/meeting-types/`, `lib/planned-meetings/`, `lib/session/`).
Domain rules and date formatting live in `lib/` and are duplicated nowhere — if
a second component needs "is this a bookable day?" or "how do we spell a date in
Russian?", it imports from `lib/`, it does not re-derive it. Keep
`@mantine/dates` confined to `components/` that actually render dates, so the
rest of the app passes plain `'YYYY-MM-DD'` strings around.

**Page-level components own only UI state; `lib` state is never mirrored.**
`GuestView` (F7) держит шаг степпера, `typeId`, `selectedDate`, `time` и
`lastBooked` — снимок `{ typeName, date, time }` только для Alert'а «Запись:
…» (у `Meeting` нет ни имени типа, ни времени создания, поэтому «самая
свежая» из отсортированного массива не выводится); `App` держит только поля
формы входа (пароль, имя гостя, «Я гость») — сама сессия принадлежит
`useSession`, а не странице. Сброс при смене выбора happens in the click
handler, not in an effect — любое изменение типа/даты/слота гасит строку
успеха, а дата ещё и слот:

```tsx
onSelect={(date) => { setLastBooked(null); setTime(null); setSelectedDate(date); }}
```

Ступени переключаются кнопками «Далее» с проверками выбора, назад — кликом по
пройденному шагу: `allowNextStepsSelect={false}` не даёт прыгнуть на «Готово»
без даты и времени. `TimeSlots` получает `takenTimes` из записей выбранного
дня — так занятый слот не выбирается и после перечитывания списка. Через
`createMeeting` гостевой флоу всегда прокидывает `meeting_type_id` (контракт
намеренно допускает запись без типа для легаси, но F7-сценарий её не создаёт).
`AdminView` (F6) держит только UI-состояние: активную вкладку, `opened` модалки
и поля `name`/`description` формы — оба списка приходят из `useMeetingTypes` и
`usePlannedMeetings`. Ошибка у двух хуков показывается одним `Alert`; когда
модалка открыта, он переезжает внутрь неё (`error && !modalOpen`), чтобы не
двоилось.

**Data access goes through the `api.ts` interfaces** (`lib/meetings/api.ts`,
`lib/meeting-types/api.ts`, `lib/planned-meetings/api.ts`, `lib/session/api.ts`),
never straight to a concrete
implementation. Each `api.ts` holds the interface *and* the instance the app
uses, so switching to HTTP is a one-line change there; components and hooks
only see the interface.
Hooks take the API as a parameter with that instance as the default, which is
how tests inject a fake without `vi.mock`. The four module folders mirror each
other and must not import from each other — a shared helper (e.g. the SDK
`failure()` mapper) is deliberately duplicated per folder to keep them
independent.

**`createInMemoryMeetingTypesApi().list()` copies elements, not just the
array** — like the HTTP adapter, which re-parses JSON per call. With shared
element references a hook test cannot tell "the list was refreshed" from "the
old object mutated in memory", and a hook that forgot `refresh()` after
`deactivate` would pass (this is exactly what mutation M20 caught, F3). Keep
the copies if you touch the fake.

**Tests must not assume "today is selectable."** Past days and weekends are
disabled by `isBookableDay` (будни в пределах гостевого окна Q5 — 14 дней от
«сейчас»), а полностью занятый день выключается счётчиком свободных слотов, так
что `[data-today]` может быть недоступен и в будний день — например, вечером.
Select "the first enabled day of the displayed month"
(`tbody button:not([disabled])` without `data-outside`) instead, and page to the
next month via `[data-direction="next"]` when the current one has none left.
Сценарии с конкретным временем (`11:00`) берите на будущем буднем дне: у
сегодняшнего к вечеру свободных слотов не остаётся. Assert on `disabled` for
rule checks rather than on dates.

`src/App.css`, `src/index.css`, `src/assets/`, and `public/icons.svg` were dead
Vite-starter leftovers and have since been deleted — don't reintroduce them, and
don't assume any CSS beyond Mantine's stylesheets.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`grekhss/ai-for-developers-project-387`), driven by the `gh` CLI. See `docs/agents/issue-tracker.md` (at the git repo root).

### Triage labels

The five canonical triage roles, each label string equal to its role name. See `docs/agents/triage-labels.md` (at the git repo root).

### Domain docs

Single-context — one `GLOSSARY.md` + `docs/adr/` at the git repo root. See `docs/agents/domain.md` (at the git repo root).
