import { describe, expect, it } from 'vitest';
import { loginSchema } from './schema';

// Moved off LoginPage.test.tsx (WRH-19 TC-01/TC-02/TC-03/TC-04) - these were
// paid for as full page mounts (render, type, submit, wait for the
// translated error text) to prove what is actually pure zod validation.
// LoginPage.tsx reads errors.email.message/errors.password.message
// (react-hook-form + zodResolver) straight into t(...), so asserting on the
// raw message key here is exactly what the mount test's translated text
// ultimately traced back to.
describe('loginSchema', () => {
  it('accepts a valid email and password', () => {
    const result = loginSchema.safeParse({
      email: 'jane@example.com',
      password: 'correct-password',
    });
    expect(result.success).toBe(true);
  });

  it('requires email when empty', () => {
    // An empty string fails both .min(1) and .email() (zod runs every check,
    // not abort-on-first) - the mount test this replaces only ever asserted
    // the required message renders, so this only pins that one down too.
    const result = loginSchema.safeParse({ email: '', password: 'some-password' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ['email'], message: 'auth.login.emailRequired' }),
      );
    }
  });

  it('requires password when empty', () => {
    const result = loginSchema.safeParse({ email: 'jane@example.com', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({ path: ['password'], message: 'auth.login.passwordRequired' }),
      ]);
    }
  });

  it('requires both fields when both are empty', () => {
    const result = loginSchema.safeParse({ email: '', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path[0]);
      expect(paths).toContain('email');
      expect(paths).toContain('password');
    }
  });

  it('rejects a malformed email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'some-password' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({ path: ['email'], message: 'auth.login.emailInvalid' }),
      ]);
    }
  });
});
