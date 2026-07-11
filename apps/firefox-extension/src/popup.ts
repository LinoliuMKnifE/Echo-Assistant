export {};

const statusElement = document.querySelector<HTMLElement>('#status')!;
const pairForm = document.querySelector<HTMLFormElement>('#pair-form')!;
const tokenInput = document.querySelector<HTMLInputElement>('#token')!;
const actions = document.querySelector<HTMLElement>('#actions')!;

interface RuntimeResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

function isRuntimeResponse(value: unknown): value is RuntimeResponse {
  return (
    typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean'
  );
}

async function send(message: unknown): Promise<unknown> {
  const result: unknown = await browser.runtime.sendMessage(message);
  if (!isRuntimeResponse(result)) throw new Error('Echo returned an invalid response.');
  if (!result.ok) throw new Error(result.error ?? 'Echo did not respond.');
  return result.data;
}

function answerText(value: unknown): string | null {
  return typeof value === 'object' &&
    value !== null &&
    'answer' in value &&
    typeof value.answer === 'string'
    ? value.answer
    : null;
}

async function refresh(): Promise<void> {
  try {
    await send({ type: 'status' });
    statusElement.textContent = 'Connected to Echo';
    statusElement.dataset.state = 'connected';
    pairForm.hidden = true;
    actions.hidden = false;
  } catch {
    statusElement.textContent = 'Desktop app not connected';
    statusElement.dataset.state = 'disconnected';
    pairForm.hidden = false;
    actions.hidden = true;
  }
}

pairForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusElement.textContent = 'Pairing…';
  try {
    await send({ type: 'pair', token: tokenInput.value });
    tokenInput.value = '';
    await refresh();
  } catch (error) {
    statusElement.textContent = error instanceof Error ? error.message : 'Pairing failed.';
  }
});

actions.addEventListener('click', async (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-mode]');
  if (!button) return;
  statusElement.textContent = 'Sending…';
  button.disabled = true;
  try {
    const data = await send({ type: 'share', mode: button.dataset.mode });
    statusElement.textContent = answerText(data) ?? 'Echo returned no answer.';
  } catch (error) {
    statusElement.textContent =
      error instanceof Error ? error.message : 'Could not send this page.';
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#open-sidebar')?.addEventListener('click', async () => {
  await browser.sidebarAction.open();
  window.close();
});

document.querySelector('#open-desktop')?.addEventListener('click', async () => {
  statusElement.textContent = 'Opening Echo…';
  try {
    await send({ type: 'open_desktop' });
    window.close();
  } catch (error) {
    statusElement.textContent = error instanceof Error ? error.message : 'Could not open Echo.';
  }
});

void refresh();
