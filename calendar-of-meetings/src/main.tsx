import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { APP_LOCALE } from './lib/date.ts'
import { devRoleForPath } from './lib/devRole.ts'
import '@mantine/core/styles.css'       // Базовые стили Mantine
import '@mantine/dates/styles.css'      // Стили календаря
import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import 'dayjs/locale/ru'

// Дев-обход авторизации (AUTH_DISABLED=1): роль для сервера берётся из URL —
// /admin это владелец, всё остальное гость. Cookie неподписанная; сервер читает
// её только при включённом обходе, а иначе просто игнорирует (server/session.ts).
// Полная перезагрузка на /admin ставит cookie заново — клиентского роутера нет.
document.cookie = `dev_role=${devRoleForPath(window.location.pathname)}; path=/; SameSite=Lax`

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="dark">
      <DatesProvider settings={{ locale: APP_LOCALE }}>
        <App />
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>,
)
