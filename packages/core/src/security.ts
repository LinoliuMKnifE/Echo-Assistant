import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from 'node:crypto';

const MAGIC = Buffer.from('LUMA1');
const deriveBackupKey = (password: string, salt: Uint8Array): Buffer =>
  scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
export function encryptBackup(data: Uint8Array, password: string): Uint8Array {
  if (password.length < 12) throw new Error('Recovery password must be at least 12 characters');
  const salt = randomBytes(16),
    nonce = randomBytes(12),
    key = deriveBackupKey(password, salt);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, salt, nonce, cipher.getAuthTag(), encrypted]);
}
export function decryptBackup(payload: Uint8Array, password: string): Uint8Array {
  const data = Buffer.from(payload);
  if (data.length < 49 || !timingSafeEqual(data.subarray(0, 5), MAGIC))
    throw new Error('Not a Luma backup');
  const salt = data.subarray(5, 21),
    nonce = data.subarray(21, 33),
    tag = data.subarray(33, 49),
    encrypted = data.subarray(49);
  const key = deriveBackupKey(password, salt);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    throw new Error('Backup password is incorrect or the backup is damaged');
  }
}
export class PairingAuth {
  private readonly seen = new Map<string, number>();
  private revoked = false;
  constructor(
    private readonly token: Uint8Array,
    private readonly maxSkewMs = 60_000,
    private readonly maxNonces = 4_096,
  ) {}
  sign(timestamp: number, nonce: string, body: string): string {
    if (this.revoked) throw new Error('Pairing token has been revoked');
    return createHmac('sha256', this.token)
      .update(`${timestamp}.${nonce}.${body}`)
      .digest('base64url');
  }
  verify(timestamp: number, nonce: string, body: string, signature: string): boolean {
    const now = Date.now();
    for (const [value, seenAt] of this.seen) {
      if (now - seenAt > this.maxSkewMs) this.seen.delete(value);
    }
    if (
      this.revoked ||
      Math.abs(now - timestamp) > this.maxSkewMs ||
      this.seen.has(nonce) ||
      !/^[A-Za-z0-9_-]{43}$/.test(signature)
    )
      return false;
    const expected = Buffer.from(this.sign(timestamp, nonce, body), 'base64url'),
      actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) return false;
    if (this.seen.size >= this.maxNonces) this.seen.delete(this.seen.keys().next().value!);
    this.seen.set(nonce, now);
    return true;
  }
  revoke(): void {
    this.revoked = true;
    this.seen.clear();
  }
}
export function safeChildPath(root: string, requested: string): string {
  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/$/, '');
  const normalized = requested.replaceAll('\\', '/');
  if (
    normalized.includes('\0') ||
    normalized.split('/').includes('..') ||
    normalized.startsWith('/')
  )
    throw new Error('Unsafe path');
  return `${normalizedRoot}/${normalized}`;
}
export const markUntrusted = (content: string): string =>
  `<untrusted-content>\n${content.replaceAll('</untrusted-content>', '&lt;/untrusted-content&gt;')}\n</untrusted-content>`;
