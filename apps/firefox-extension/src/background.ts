import { clearPairing, desktopRequest, savePairingToken } from './client';
import { validateAssistantResponse, validatePageContext } from './protocol';

type UiMessage =
  | { type: 'status' }
  | { type: 'pair'; token: string }
  | { type: 'unpair' }
  | { type: 'open_desktop' }
  | { type: 'share'; mode: 'selected_text' | 'current_page' | 'full_page_text' | 'screenshot' }
  | { type: 'chat'; message: string };

async function activeTab(): Promise<browser.tabs.Tab> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url))
    throw new Error('Open a normal web page first.');
  return tab;
}

async function pageText(
  tabId: number,
  full: boolean,
): Promise<{ title: string; url: string; selectedText?: string; text?: string }> {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    func: ((includeFullText: boolean) => {
      const selectedText = window.getSelection()?.toString().trim() ?? '';
      return {
        title: document.title,
        url: location.href,
        selectedText: selectedText.slice(0, 500_000),
        text: includeFullText ? (document.body?.innerText ?? '').slice(0, 500_000) : undefined,
      };
    }) as unknown as (includeFullText: boolean) => void,
    args: [full],
  });
  const value = results[0]?.result;
  if (!value) throw new Error('Firefox could not read this page.');
  return validatePageContext(value);
}

async function share(
  mode: 'selected_text' | 'current_page' | 'full_page_text' | 'screenshot',
): Promise<unknown> {
  const tab = await activeTab();
  let context = await pageText(tab.id!, mode === 'full_page_text');
  if (mode === 'selected_text' && !context.selectedText)
    throw new Error('Select some page text first.');
  if (mode === 'screenshot') {
    if (typeof tab.windowId !== 'number')
      throw new Error('Firefox could not identify the active window.');
    const screenshotDataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    context = validatePageContext({ ...context, screenshotDataUrl });
  }
  return validateAssistantResponse(await desktopRequest(mode, context), true);
}

browser.runtime.onMessage.addListener((message: UiMessage) => {
  return (async () => {
    try {
      if (!message || typeof message.type !== 'string')
        throw new Error('Invalid extension request.');
      if (message.type === 'pair') {
        await savePairingToken(message.token);
        try {
          return { ok: true, data: await desktopRequest('status') };
        } catch (error) {
          await clearPairing();
          throw error;
        }
      }
      if (message.type === 'unpair') {
        await clearPairing();
        return { ok: true };
      }
      if (message.type === 'open_desktop') {
        await browser.tabs.create({ url: 'luma://open' });
        return { ok: true };
      }
      if (message.type === 'status') return { ok: true, data: await desktopRequest('status') };
      if (message.type === 'share') return { ok: true, data: await share(message.mode) };
      if (message.type === 'chat') {
        const text = message.message?.trim();
        if (!text || text.length > 20_000) throw new Error('Enter a shorter message.');
        return {
          ok: true,
          data: validateAssistantResponse(await desktopRequest('chat', { message: text }), false),
        };
      }
      throw new Error('Unsupported extension request.');
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unexpected extension error.',
      };
    }
  })();
});
