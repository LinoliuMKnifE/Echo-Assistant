import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';

describe('Echo desktop', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState({}, '', '/?test=1');
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
