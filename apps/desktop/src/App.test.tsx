import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

describe('Echo desktop', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState({}, '', '/?test=1');
    invokeMock.mockReset();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });
  it('guides a user through first-run setup without retaining the API key in browser storage', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: /assistant that remembers/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.type(screen.getByPlaceholderText('sk-…'), 'sk-demo-key-long-enough');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      await screen.findByRole('heading', { name: /choose how Echo remembers/i }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('apiKey')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain('sk-demo');
  });

  it('shows packaged onboarding despite a legacy flag and saved key when no Echo marker exists', async () => {
    localStorage.setItem('luma.setupComplete', 'yes');
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    invokeMock.mockImplementation(async (command: string) => command === 'has_api_key');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /assistant that remembers/i }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('heading', { name: /add your OpenAI API key/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/use the OpenAI key already saved/i)).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith('complete_onboarding');
  });

  it('skips packaged onboarding only when the versioned Echo marker exists', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'is_onboarding_complete') return true;
      if (command === 'sidecar_session') throw new Error('test fallback');
      if (command === 'app_snapshot')
        return {
          memories: [],
          conversations: [],
          projects: [],
          skills: [],
          schedules: [],
          audit: [],
          settings: {
            assistantName: 'Echo',
            memoryMode: 'low-risk',
            monthlyBudget: 25,
            offline: false,
          },
        };
    });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /assistant that remembers/i })).toBeNull();
  });

  it('writes the native marker only after the final setup action', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'is_onboarding_complete') return false;
      if (command === 'has_api_key') return true;
    });
    const user = userEvent.setup();
    render(<App />);
    const name = await screen.findByLabelText(/what would you like to call/i);
    await user.clear(name);
    await user.type(name, 'Nova');
    await user.click(await screen.findByRole('button', { name: /continue/i }));
    await user.click(await screen.findByLabelText(/use the OpenAI key already saved/i));
    for (let step = 0; step < 3; step++)
      await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(invokeMock).not.toHaveBeenCalledWith('complete_onboarding');
    await user.click(screen.getByRole('button', { name: /open Nova/i }));
    expect(invokeMock).toHaveBeenCalledWith('save_settings', {
      settings: {
        assistantName: 'Nova',
        memoryMode: 'low-risk',
        monthlyBudget: 25,
        offline: false,
      },
    });
    expect(invokeMock).toHaveBeenCalledWith('complete_onboarding');
    await vi.waitFor(() =>
      expect(
        invokeMock.mock.calls.filter(([command]) => command === 'sidecar_session'),
      ).toHaveLength(2),
    );
    expect(invokeMock).not.toHaveBeenCalledWith('store_api_key', expect.anything());
    const saveIndex = invokeMock.mock.calls.findIndex(([command]) => command === 'save_settings');
    const completeIndex = invokeMock.mock.calls.findIndex(
      ([command]) => command === 'complete_onboarding',
    );
    expect(invokeMock.mock.invocationCallOrder[saveIndex]).toBeLessThan(
      invokeMock.mock.invocationCallOrder[completeIndex],
    );
  });

  it('navigates every main product area with accessible current-page state', async () => {
    localStorage.setItem('luma.setupComplete', 'yes');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'Chat' });
    expect(screen.getByText('echo')).toBeInTheDocument();
    expect(document.querySelector('.brand img.echo-mark')).toHaveAttribute(
      'src',
      '/assets/echo-mark.svg',
    );
    for (const name of [
      'Conversations',
      'Your profile',
      'Memories',
      'Projects',
      'Skills',
      'Scheduled tasks',
      'Tools & permissions',
      'Activity',
      'Settings',
      'Backup & restore',
      'Chat',
    ]) {
      const link = screen.getByRole('button', { name });
      await user.click(link);
      expect(link).toHaveAttribute('aria-current', 'page');
    }
  });

  it('shows the release version in Settings', async () => {
    localStorage.setItem('luma.setupComplete', 'yes');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(screen.getByText('Echo version 0.1.0')).toBeInTheDocument();
  });

  it('searches local conversations, memories, projects, and skills', async () => {
    localStorage.setItem('luma.setupComplete', 'yes');
    history.replaceState({}, '', '/?demo=1');
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Search everything'), 'card');
    expect(screen.getByRole('heading', { name: /results for “card”/i })).toBeInTheDocument();
    expect(screen.getByText('eBay thank-you card direction')).toBeInTheDocument();
    expect(screen.getByText('Card listing description')).toBeInTheDocument();
  });

  it('requires confirmation before forgetting a memory', async () => {
    localStorage.setItem('luma.setupComplete', 'yes');
    history.replaceState({}, '', '/?demo=1');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Memories' }));
    await user.click(screen.getAllByRole('button', { name: /forget/i })[0]);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forget it' })).toBeInTheDocument();
  });

  it('uses a confirmed preference in a later answer and exposes its source', async () => {
    localStorage.setItem('luma.setupComplete', 'yes');
    const user = userEvent.setup();
    render(<App />);
    const composer = await screen.findByLabelText('Message Echo');
    await user.type(composer, 'Please remember that I prefer short step-by-step instructions');
    await user.click(screen.getByLabelText('Send message'));
    await user.type(composer, 'Help me plan tomorrow');
    await user.click(screen.getByLabelText('Send message'));
    expect(await screen.findByText(/1\. Review the goal/)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /used 1 local source/i }).at(-1)!);
    expect(screen.getByRole('complementary', { name: 'Sources used' })).toHaveTextContent(
      'short step-by-step instructions',
    );
  });

  it('validates the backup password before attempting a backup', async () => {
    localStorage.setItem('luma.setupComplete', 'yes');
    history.replaceState({}, '', '/?demo=1');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Backup & restore' }));

    await user.type(screen.getByLabelText('Backup password'), 'short');
    await user.type(screen.getByLabelText('Confirm password'), 'short');
    await user.click(screen.getByRole('button', { name: /back up now/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 12 characters/i);

    await user.clear(screen.getByLabelText('Backup password'));
    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Backup password'), 'a-long-enough-password');
    await user.type(screen.getByLabelText('Confirm password'), 'a-different-long-password');
    await user.click(screen.getByRole('button', { name: /back up now/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
  });

  it('does not provide the simulated service in an ordinary browser session', async () => {
    localStorage.setItem('luma.setupComplete', 'yes');
    history.replaceState({}, '', '/');
    render(<App />);
    expect(await screen.findByText(/installed desktop application/i)).toBeInTheDocument();
  });
});
