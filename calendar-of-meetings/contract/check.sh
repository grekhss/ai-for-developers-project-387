#!/usr/bin/env bash
# Дрейф-проверка артефактов контракта (K1/ADR-0004) и финальный шаг единой
# команды генерации (D5/ADR-0005): генерирует контракт во временный каталог и
# сверяет с закоммиченными артефактами. Падает, если артефакты устарели
# относительно contract/main.tsp или отредактированы руками.
#
# Существует в двух ролях и потому не пишет в рабочее дерево:
#   * `npm run contract:check` — часть гейта `npm run check` (без записи в дерево);
#   * самопроверка в конце `contract/generate.sh` — гарантия детерминизма.
# Простой `git diff` после регенерации не годится: он даёт ложное падение на ещё
# не закоммиченном изменении контракта. Каждое новое семейство артефактов
# добавляет сюда свой `diff` (см. generate.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

tmp="node_modules/.tmp/contract-check"
rm -rf "$tmp"
npx tsp compile contract --output-dir "$tmp" >/dev/null
npx openapi-typescript "$tmp/@typespec/openapi3/openapi.yaml" -o "$tmp/contract.gen.ts" >/dev/null

# SDK фронта генерируется из contract/openapi.yaml: дрейф самой спеки по main.tsp
# ловит первый diff ниже, поэтому лишний ввод здесь не нужен.
API_GEN_OUT="$tmp/api-gen" npx openapi-ts >/dev/null

diff -u contract/openapi.yaml "$tmp/@typespec/openapi3/openapi.yaml"
diff -u contract/schema/calendar-of-meetings.json \
  "$tmp/@typespec/json-schema/calendar-of-meetings"
diff -u src/lib/contract.gen.ts "$tmp/contract.gen.ts"
diff -u server/contract.gen.ts "$tmp/contract.gen.ts"
diff -ru src/lib/api-gen "$tmp/api-gen"

echo "contract:check — артефакты совпадают с contract/main.tsp"
