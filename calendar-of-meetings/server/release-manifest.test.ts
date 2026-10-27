// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Защита от повторения инцидента release-please (упавший прогон
 * 40554698482): манифест — строго плоская карта «путь пакета → строка
 * версии», а рантайм release-please 17.3.0 парсит КАЖДЫЙ верхнеуровневый
 * ключ как версию. Служебный ключ `$schema` (разрешённый официальной
 * JSON-схемой, но не пропущенный рантаймом) ломал все прогоны:
 * «unable to parse version string». Поэтому здесь: (1) ключи манифеста —
 * ровно пакеты из release-please-config.json, ничего лишнего; (2) значения
 * — валидные semver-строки. Оба файла лежат в корне git-репозитория —
 * уровнем выше пакета (файл читается по пути, а не импортом).
 */

const GIT_ROOT = join(import.meta.dirname, '..', '..');

const manifest = JSON.parse(
  readFileSync(join(GIT_ROOT, '.release-please-manifest.json'), 'utf8'),
) as Record<string, string>;

const config = JSON.parse(
  readFileSync(join(GIT_ROOT, 'release-please-config.json'), 'utf8'),
) as { packages: Record<string, unknown> };

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

describe('манифест release-please', () => {
  it('ключи — ровно пакеты из release-please-config.json, без служебных', () => {
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(config.packages).sort());
  });

  it('значения — валидные semver-строки', () => {
    for (const [pkg, version] of Object.entries(manifest)) {
      expect(version, `версия пакета ${pkg}`).toMatch(SEMVER);
    }
  });
});
