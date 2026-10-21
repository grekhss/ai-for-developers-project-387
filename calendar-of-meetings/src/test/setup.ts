import '@testing-library/jest-dom/vitest'
import 'dayjs/locale/ru'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom не реализует matchMedia, а Mantine вызывает его в use-provider-color-scheme
window.matchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})

// jsdom не реализует ResizeObserver, а Mantine's ScrollArea (внутри Modal и
// Table.ScrollContainer, появляющихся в админ-панели F6) зовёт его в
// use-resize-observer — без заглушки рендер падает с ReferenceError.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub

afterEach(cleanup)
