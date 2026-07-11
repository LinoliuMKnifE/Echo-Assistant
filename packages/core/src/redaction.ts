// Redacts common secret patterns before persistence (chat messages, memories, audit detail).
// Conservative by design: only matches high-confidence secret shapes, leaves normal prose alone.
const SECRET_PATTERNS: Array<{ pattern: RegExp; marker: string }> = [
  { pattern: /sk-proj-[A-Za-z0-9_-]{10,}/g, marker: '[REDACTED:openai-key]' },
  { pattern: /sk-[A-Za-z0-9_-]{10,}/g, marker: '[REDACTED:openai-key]' },
  { pattern: /Bearer\s+\S+/gi, marker: '[REDACTED:bearer-token]' },
  { pattern: /AKIA[0-9A-Z]{16}/g, marker: '[REDACTED:aws-key]' },
  { pattern: /api[_-]?key\s*[:=]\s*\S+/gi, marker: '[REDACTED:api-key]' },
];

export const redactSecrets = (value: string): string =>
  SECRET_PATTERNS.reduce((text, { pattern, marker }) => text.replace(pattern, marker), value);

export const sanitizePersistedValue = <T>(value: T): T => {
  if (typeof value === 'string') return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map(sanitizePersistedValue) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizePersistedValue(item)]),
    ) as T;
  return value;
};

export const serializePersistedValue = (value: unknown): string =>
  JSON.stringify(sanitizePersistedValue(value));
