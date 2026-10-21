import { describe, it, expect } from 'vitest';
import { devRoleForPath } from './devRole.ts';

describe('devRoleForPath (дев-обход AUTH_DISABLED)', () => {
  it('/admin и вложенные пути — владелец, всё остальное — гость', () => {
    expect(devRoleForPath('/admin')).toBe('admin');
    expect(devRoleForPath('/admin/meetings')).toBe('admin');
    expect(devRoleForPath('/')).toBe('guest');
    expect(devRoleForPath('/guest')).toBe('guest');
    // Граница: /administrator — не /admin, это по-прежнему гость.
    expect(devRoleForPath('/administrator')).toBe('guest');
  });
});
