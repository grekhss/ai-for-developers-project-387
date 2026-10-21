import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSession } from './useSession.ts';
import { createInMemorySessionApi } from '../lib/session/inMemory.ts';
import type { SessionApi } from '../lib/session/api.ts';
import type { Session } from '../lib/session/types.ts';

const ADMIN: Session = { role: 'admin', bookerName: null };
const GUEST: Session = { role: 'guest', bookerName: 'Аня' };

function failingApi(): SessionApi {
  return {
    login: () => Promise.reject(new Error('нет связи')),
    logout: () => Promise.reject(new Error('нет связи')),
    me: () => Promise.reject(new Error('нет связи')),
  };
}

describe('useSession', () => {
  it('восстанавливает сессию из me() при загрузке (C9)', async () => {
    const api = createInMemorySessionApi(GUEST);

    const { result } = renderHook(() => useSession(api));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.session).toEqual(GUEST);
    expect(result.current.error).toBeNull();
  });

  it('без cookie сервер отвечает 401 → сессии нет, и это не ошибка', async () => {
    const { result } = renderHook(() => useSession(createInMemorySessionApi()));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('падение GET /api/me — ошибка восстановления, а не разрыв рендера', async () => {
    const { result } = renderHook(() => useSession(failingApi()));

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.loading).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it('login запоминает сессию и снимает ошибку', async () => {
    const api = createInMemorySessionApi();
    const { result } = renderHook(() => useSession(api));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const session = await result.current.login({ password: 'guest', bookerName: 'Аня' });

    await waitFor(() => expect(result.current.session).toEqual(GUEST));

    expect(session).toEqual(GUEST);
    expect(result.current.error).toBeNull();
  });

  it('неудачный login возвращает null, кладёт ошибку и не трогает сессию', async () => {
    const api = createInMemorySessionApi(ADMIN);
    const { result } = renderHook(() => useSession(api));

    await waitFor(() => expect(result.current.session).toEqual(ADMIN));

    await expect(result.current.login({ password: 'не тот' })).resolves.toBeNull();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.session).toEqual(ADMIN);
  });

  it('logout очищает сессию и возвращает true', async () => {
    const api = createInMemorySessionApi(ADMIN);
    const { result } = renderHook(() => useSession(api));

    await waitFor(() => expect(result.current.session).toEqual(ADMIN));

    await expect(result.current.logout()).resolves.toBe(true);

    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.error).toBeNull();
  });

  it('неудачный logout возвращает false, кладёт ошибку и сессию не трогает', async () => {
    const api: SessionApi = {
      login: () => Promise.resolve(ADMIN),
      logout: () => Promise.reject(new Error('нет связи')),
      me: () => Promise.resolve(ADMIN),
    };
    const { result } = renderHook(() => useSession(api));

    await waitFor(() => expect(result.current.session).toEqual(ADMIN));

    await expect(result.current.logout()).resolves.toBe(false);

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.session).toEqual(ADMIN);
  });
});
