/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Единый источник порта с сервером: server/index.ts читает тот же env.
const PORT = process.env.PORT ?? 4000

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // В dev браузер ходит в Vite, а /api уезжает на express-сервер.
      '/api': {
        target: `http://localhost:${PORT}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    // Два проекта вместо одного окружения: у серверных тестов другой
    // environment и, главное, свой (пустой) setupFiles — глобальный
    // src/test/setup.ts пишет в window и падает в node. include задан явно,
    // чтобы собранные dist-server/*.test.js (если появятся) не запускались.
    projects: [
      {
        extends: true,
        test: {
          name: 'app',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts'],
        },
      },
    ],
  },
})
