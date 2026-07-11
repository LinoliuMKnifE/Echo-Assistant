import { z } from 'zod';
import type { PairingAuth } from './security.js';

export const EXTENSION_HOST = '127.0.0.1';
export const EXTENSION_PORT = 43117;
export const EXTENSION_PATH = '/v1/extension/request';
export const EXTENSION_ORIGIN = 'moz-extension://01234567-89ab-cdef-0123-456789abcdef';
export const MAX_EXTENSION_REQUEST_BYTES = 8_500_000;

export function isExtensionOrigin(origin: string | undefined): origin is string {
  return /^moz-extension:\/\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(origin ?? '');
}

const pageContext = z
  .object({
    title: z.string().max(2_000),
    url: z
      .string()
      .url()
      .max(8_192)
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
    selectedText: z.string().max(512_000).optional(),
    text: z.string().max(512_000).optional(),
    screenshotDataUrl: z
      .string()
      .max(8_000_000)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/)
      .optional(),
  })
  .strict();

export const extensionEnvelopeSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status'), payload: z.record(z.never()) }),
  z.object({
    operation: z.enum(['selected_text', 'current_page', 'full_page_text', 'screenshot']),
    payload: pageContext,
  }),
  z.object({
    operation: z.literal('chat'),
    payload: z
      .object({ message: z.string().min(1).max(512_000), context: pageContext.optional() })
      .strict(),
  }),
]);
export type ExtensionEnvelope = z.infer<typeof extensionEnvelopeSchema>;
export type ExtensionRequest = {
  method: string;
  path: string;
  remoteAddress: string;
  headers: Record<string, string | undefined>;
  exactBody: string;
};
export type ExtensionResponse = {
  status: number;
  body: { ok: boolean; data?: unknown; error?: string };
};

export class ExtensionRequestService {
  constructor(
    private readonly auth: PairingAuth,
    private readonly dispatch: (request: ExtensionEnvelope) => Promise<unknown>,
  ) {}

  async handle(request: ExtensionRequest): Promise<ExtensionResponse> {
    if (request.remoteAddress !== EXTENSION_HOST)
      return { status: 403, body: { ok: false, error: 'Loopback requests only' } };
    if (request.method !== 'POST' || request.path !== EXTENSION_PATH)
      return { status: 404, body: { ok: false, error: 'Not found' } };
    if (new TextEncoder().encode(request.exactBody).byteLength > MAX_EXTENSION_REQUEST_BYTES)
      return { status: 413, body: { ok: false, error: 'Request is too large' } };
    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]),
    );
    if (!isExtensionOrigin(headers.origin))
      return { status: 403, body: { ok: false, error: 'Extension origin denied' } };
    const timestampText = headers['x-luma-timestamp'];
    const nonce = headers['x-luma-nonce'];
    const signature = headers['x-luma-signature'];
    if (
      !timestampText ||
      !/^\d{13}$/.test(timestampText) ||
      !nonce ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) ||
      !signature ||
      !this.auth.verify(Number(timestampText), nonce, request.exactBody, signature)
    )
      return { status: 401, body: { ok: false, error: 'Pairing authentication failed' } };
    let json: unknown;
    try {
      json = JSON.parse(request.exactBody);
    } catch {
      return { status: 400, body: { ok: false, error: 'Invalid JSON' } };
    }
    const envelope = extensionEnvelopeSchema.safeParse(json);
    if (!envelope.success)
      return { status: 400, body: { ok: false, error: 'Invalid extension request' } };
    try {
      return { status: 200, body: { ok: true, data: await this.dispatch(envelope.data) } };
    } catch {
      return { status: 500, body: { ok: false, error: 'Desktop operation failed' } };
    }
  }
}
