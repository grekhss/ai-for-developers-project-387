import { defineConfig } from '@hey-api/openapi-ts';

/**
 * Генерация клиентского SDK из contract/openapi.yaml (K3, D5/ADR-0005).
 *
 * Ступень контрактного пайплайна: её зовёт `contract/generate.sh`, а сверку с
 * закоммиченным результатом делает `contract/check.sh`. Руками
 * `src/lib/api-gen` не правится — только через `npm run contract`. Плагины
 * встроены в @hey-api/openapi-ts: это имена, а не отдельные пакеты.
 */
export default defineConfig({
  // Путь обязан начинаться с "./": иначе hey-api трактует "contract/openapi.yaml"
  // как shorthand реестра ("organization/project") и падает.
  input: './contract/openapi.yaml',
  output: {
    // API_GEN_OUT перенаправляет вывод во временный каталог — так check.sh
    // регенерирует SDK и сверяет с закоммиченным diff'ом, не трогая дерево.
    path: process.env.API_GEN_OUT ?? 'src/lib/api-gen',
  },
  plugins: ['@hey-api/typescript', '@hey-api/sdk', '@hey-api/client-fetch'],
});
