export async function storeApiKey(apiKey: string): Promise<void> {
  if (!apiKey.startsWith('sk-') || apiKey.length < 12)
    throw new Error('That key does not look complete.');
  if ('__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('store_api_key', { apiKey });
    return;
  }
  // Browser demo deliberately does not retain the secret.
  await new Promise((resolve) => setTimeout(resolve, 350));
}

export async function credentialStatus(): Promise<boolean> {
  if (!('__TAURI_INTERNALS__' in window)) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('has_api_key');
}

export async function onboardingStatus(): Promise<boolean> {
  if (!('__TAURI_INTERNALS__' in window))
    return localStorage.getItem('luma.setupComplete') === 'yes';
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('is_onboarding_complete');
}

export async function completeOnboarding(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) {
    localStorage.setItem('luma.setupComplete', 'yes');
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('complete_onboarding');
}
