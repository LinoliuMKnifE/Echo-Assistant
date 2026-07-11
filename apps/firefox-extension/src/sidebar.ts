export {};

const form = document.querySelector<HTMLFormElement>('#chat-form')!;
const input = document.querySelector<HTMLTextAreaElement>('#message')!;
const transcript = document.querySelector<HTMLElement>('#transcript')!;
const statusElement = document.querySelector<HTMLElement>('#connection')!;

interface RuntimeResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

function addMessage(role: 'user' | 'assistant' | 'error', text: string): void {
  const item = document.createElement('div');
  item.className = `message ${role}`;
  item.textContent = text;
  transcript.append(item);
  item.scrollIntoView({ block: 'end' });
}

function isRuntimeResponse(value: unknown): value is RuntimeResponse {
  return (
    typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean'
  );
}

function responseText(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  if ('answer' in value && typeof value.answer === 'string') return value.answer;
  if ('message' in value && typeof value.message === 'string') return value.message;
  if ('response' in value && typeof value.response === 'string') return value.response;
  return null;
}

async function send(message: unknown): Promise<unknown> {
  const result: unknown = await browser.runtime.sendMessage(message);
  if (!isRuntimeResponse(result)) throw new Error('Echo returned an invalid response.');
  if (!result.ok) throw new Error(result.error ?? 'Echo did not respond.');
  return result.data;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  addMessage('user', message);
  try {
    const data = await send({ type: 'chat', message });
    const reply =
      responseText(data) ?? 'Echo received your message. Open the desktop app to continue.';
    addMessage('assistant', reply);
  } catch (error) {
    addMessage('error', error instanceof Error ? error.message : 'Could not reach Echo.');
  }
});

document.querySelector('#share-selection')?.addEventListener('click', async () => {
  try {
    const data = await send({ type: 'share', mode: 'selected_text' });
    const reply = responseText(data);
    if (!reply) throw new Error('Echo returned no answer.');
    addMessage('assistant', reply);
  } catch (error) {
    addMessage('error', error instanceof Error ? error.message : 'Could not share selection.');
  }
});

void send({ type: 'status' })
  .then(() => {
    statusElement.textContent = 'Connected';
    statusElement.dataset.state = 'connected';
  })
  .catch(() => {
    statusElement.textContent = 'Open Echo desktop to connect';
  });
