import {
  DESKTOP_ORIGIN,
  MAX_RESPONSE_BYTES,
  byteLength,
  createNonce,
  isAllowedOperation,
  signRequest,
  validatePairingToken,
} from './protocol';

interface StoredPairing {
  token: string;
}

async function getPairing(): Promise<StoredPairing | null> {
  const stored = await browser.storage.local.get('pairingToken');
  if (typeof stored.pairingToken !== 'string') return null;
  try {
    return { token: validatePairingToken(stored.pairingToken) };
  } catch {
    return null;
  }
}

export async function savePairingToken(token: string): Promise<void> {
  await browser.storage.local.set({ pairingToken: validatePairingToken(token) });
}

export async function clearPairing(): Promise<void> {
  await browser.storage.local.remove('pairingToken');
}

export async function desktopRequest(operation: string, payload: unknown = {}): Promise<unknown> {
  if (!isAllowedOperation(operation) || operation === 'pair')
    throw new Error('This operation is not allowed.');
  const pairing = await getPairing();
  if (!pairing) throw new Error('Pair Echo with the desktop app first.');
  const envelope = { operation, payload };
  const body = JSON.stringify(envelope);
  if (byteLength(body) > 8_500_000) throw new Error('The request is too large.');
  const timestamp = Date.now().toString();
  const nonce = createNonce();
  const signature = await signRequest(pairing.token, timestamp, nonce, body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${DESKTOP_ORIGIN}/v1/extension/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Luma-Timestamp': timestamp,
        'X-Luma-Nonce': nonce,
        'X-Luma-Signature': signature,
      },
      body,
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const text = await response.text();
    if (byteLength(text) > MAX_RESPONSE_BYTES)
      throw new Error('The desktop response was too large.');
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? 'Pairing was rejected. Pair again from Settings.'
          : `Desktop request failed (${response.status}).`,
      );
    const data: unknown = text ? JSON.parse(text) : {};
    if (!data || typeof data !== 'object') throw new Error('The desktop response was invalid.');
    return data;
  } finally {
    clearTimeout(timer);
  }
}
