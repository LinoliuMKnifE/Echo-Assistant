import { describe, expect, it } from 'vitest';
import {
  byteLength,
  isAllowedOperation,
  signRequest,
  validateAssistantResponse,
  validateDesktopOrigin,
  validatePageContext,
  validatePairingToken,
} from '../src/protocol';

describe('extension security boundaries', () => {
  it('allows only the fixed loopback service origin', () => {
    expect(validateDesktopOrigin('http://127.0.0.1:43117')).toBe('http://127.0.0.1:43117');
    expect(() => validateDesktopOrigin('http://localhost:43117')).toThrow();
    expect(() => validateDesktopOrigin('https://example.com')).toThrow();
  });
  it('accepts only high-entropy token syntax', () => {
    expect(validatePairingToken('a'.repeat(32))).toHaveLength(32);
    expect(() => validatePairingToken('short')).toThrow();
    expect(() => validatePairingToken('a'.repeat(31) + '!')).toThrow();
  });
  it('rejects unsupported operations and privileged page schemes', () => {
    expect(isAllowedOperation('selected_text')).toBe(true);
    expect(isAllowedOperation('shell')).toBe(false);
    expect(() => validatePageContext({ title: 'Settings', url: 'about:config' })).toThrow();
    expect(() =>
      validatePageContext({ title: 'Local file', url: 'file:///private.txt' }),
    ).toThrow();
  });
  it('rejects text beyond the client boundary', () => {
    expect(() =>
      validatePageContext({
        title: 'Large',
        url: 'https://example.com',
        text: 'x'.repeat(512_001),
      }),
    ).toThrow();
  });
  it('measures UTF-8 payloads instead of JavaScript characters', () => {
    expect(byteLength('é')).toBe(2);
  });
  it('binds the authentication signature to nonce and exact body', async () => {
    const token = 'a'.repeat(32);
    const first = await signRequest(token, '1700000000000', 'nonce-one', '{"operation":"status"}');
    const repeat = await signRequest(token, '1700000000000', 'nonce-one', '{"operation":"status"}');
    const replayVariant = await signRequest(
      token,
      '1700000000000',
      'nonce-two',
      '{"operation":"status"}',
    );
    expect(first).toBe(repeat);
    expect(replayVariant).not.toBe(first);
  });
  it('matches the desktop HMAC interoperability vector', async () => {
    const token = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
    const signature = await signRequest(
      token,
      '1700000000000',
      'abcdefghijklmnop',
      '{"operation":"status","payload":{}}',
    );
    expect(signature).toBe('g5zsjwtsiRNrW0RgkNlhZLHivTpNYRMjKSJ_e8gUudc');
  });
  it('requires an answer and confirmed untrusted-context handling', () => {
    expect(
      validateAssistantResponse({ answer: 'Safe answer', untrustedContextHandled: true }, true)
        .answer,
    ).toBe('Safe answer');
    expect(() => validateAssistantResponse({ received: true }, true)).toThrow();
    expect(() =>
      validateAssistantResponse({ answer: 'Unchecked', untrustedContextHandled: false }, true),
    ).toThrow();
  });
});
