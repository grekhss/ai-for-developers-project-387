import { describe, it, expect } from 'vitest';
import { createInMemorySessionApi } from './inMemory.ts';
import type { Session } from './types.ts';

const ADMIN: Session = { role: 'admin', bookerName: null };
const GUEST: Session = { role: 'guest', bookerName: 'Аня' };

describe('createInMemorySessionApi', () => {
  it('до входа сессии нет: me() отдаёт null, а не ошибку', async () => {
    const api = createInMemorySessionApi();

    expect(await api.me()).toBeNull();
  });

  it('вход по паролю админа выдаёт сессию админа без bookerName', async () => {
    const api = createInMemorySessionApi();

    const session = await api.login({ password: 'admin' });

    expect(session).toEqual(ADMIN);
    expect(await api.me()).toEqual(ADMIN);
  });

  it('вход по паролю гостя запоминает имя — с той же обрезкой, что на сервере', async () => {
    const api = createInMemorySessionApi();

    const session = await api.login({ password: 'guest', bookerName: '  Аня  ' });

    expect(session).toEqual(GUEST);
    expect(await api.me()).toEqual(GUEST);
  });

  it('неверный пароль отклоняется — зеркалит 401 сервера', async () => {
    const api = createInMemorySessionApi();

    await expect(api.login({ password: 'не тот' })).rejects.toThrow('неверный пароль');
    expect(await api.me()).toBeNull();
  });

  it('гость без bookerName отклоняется — зеркалит 400 сервера', async () => {
    const api = createInMemorySessionApi();

    await expect(api.login({ password: 'guest' })).rejects.toThrow('bookerName');
  });

  it('выход очищает сессию, а повторный без входа отклоняется — зеркалит 401', async () => {
    const api = createInMemorySessionApi();
    await api.login({ password: 'admin' });

    await api.logout();

    expect(await api.me()).toBeNull();
    await expect(api.logout()).rejects.toThrow('нет активной сессии');
  });

  it('сеанс из сида доступен сразу — тесты подставляют готовую роль без login', async () => {
    const api = createInMemorySessionApi(ADMIN);

    expect(await api.me()).toEqual(ADMIN);
  });

  it('фабрики не делят состояние', async () => {
    const first = createInMemorySessionApi();
    const second = createInMemorySessionApi();

    await first.login({ password: 'admin' });

    expect(await second.me()).toBeNull();
  });
});
