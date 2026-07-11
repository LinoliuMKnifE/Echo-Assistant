export const DESKTOP_ORIGIN = 'http://127.0.0.1:43117';
export const MAX_TEXT_BYTES = 512_000;
export const MAX_SCREENSHOT_BYTES = 8_000_000;
export const MAX_RESPONSE_BYTES = 2_000_000;
export const ALLOWED_OPERATIONS = [
  'status',
  'pair',
  'selected_text',
  'current_page',
  'full_page_text',
  'screenshot',
  'chat',
] as const;

export type Operation = (typeof ALLOWED_OPERATIONS)[number];

export interface PageContext {
  title: string;
  url: string;
  selectedText?: string;
  text?: string;
  screenshotDataUrl?: string;
}

export interface AssistantResponse {
  answer: string;
  untrustedContextHandled: boolean;
}

const utf8 = new TextEncoder();

export function byteLength(value: string): number {
  return utf8.encode(value).byteLength;
}

export function isAllowedOperation(value: string): value is Operation {
  return (ALLOWED_OPERATIONS as readonly string[]).includes(value);
}

export function validateDesktopOrigin(value: string): string {
  const parsed = new URL(value);
  if (
    parsed.origin !== DESKTOP_ORIGIN ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/'
  ) {
    throw new Error('The desktop connection address is not allowed.');
  }
  return parsed.origin;
}

export function validatePairingToken(token: string): string {
  const clean = token.trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(clean)) {
    throw new Error('The pairing token format is invalid.');
  }
  return clean;
}

export function validatePageContext(context: PageContext): PageContext {
  if (!context || typeof context.title !== 'string' || typeof context.url !== 'string') {
    throw new Error('Page context is incomplete.');
  }
  const url = new URL(context.url);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only normal web pages can be shared.');
  }
  if (context.title.length > 2_000 || context.url.length > 8_192) {
    throw new Error('Page metadata is too large.');
  }
  for (const value of [context.selectedText, context.text]) {
    if (value && byteLength(value) > MAX_TEXT_BYTES)
      throw new Error('Page text is too large to share.');
  }
  if (context.screenshotDataUrl) {
    if (!context.screenshotDataUrl.startsWith('data:image/png;base64,'))
      throw new Error('Screenshot format is invalid.');
    if (byteLength(context.screenshotDataUrl) > MAX_SCREENSHOT_BYTES)
      throw new Error('Screenshot is too large to share.');
  }
  return context;
}

export function validateAssistantResponse(
  value: unknown,
  requireUntrustedContext: boolean,
): AssistantResponse {
  if (
    !value ||
    typeof value !== 'object' ||
    !('answer' in value) ||
    typeof value.answer !== 'string' ||
    !value.answer.trim() ||
    !('untrustedContextHandled' in value) ||
    typeof value.untrustedContextHandled !== 'boolean' ||
    (requireUntrustedContext && !value.untrustedContextHandled)
  ) {
    throw new Error('The desktop response did not confirm safe context handling.');
  }
  return { answer: value.answer, untrustedContextHandled: value.untrustedContextHandled };
}

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export async function signRequest(
  token: string,
  timestamp: string,
  nonce: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8.encode(token),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    utf8.encode(`${timestamp}.${nonce}.${body}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signed)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
