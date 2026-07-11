import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('luma.setupComplete', 'yes'));
  await page.goto('/?test=1');
});

test('persists an explicit memory across reload and exposes its provenance', async ({ page }) => {
  await page.getByLabel('Message Echo').fill('Please remember that I prefer numbered instructions');
  await page.getByLabel('Send message').click();
  await expect(page.getByText(/I’ll remember that/i)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Memories' }).click();
  await expect(page.getByRole('heading', { name: 'I prefer numbered instructions' })).toBeVisible();
  await expect(page.getByText('Explicit user request')).toBeVisible();
});

test('forgets a persisted memory through confirmation and records an audit event', async ({
  page,
}) => {
  await page.getByLabel('Message Echo').fill('Remember that my test color is indigo');
  await page.getByLabel('Send message').click();
  await page.getByRole('button', { name: 'Memories' }).click();
  await expect(page.getByRole('heading', { name: 'my test color is indigo' })).toBeVisible();
  await page.getByRole('button', { name: 'Forget' }).click();
  await page.getByRole('button', { name: 'Forget it' }).click();
  await expect(page.getByText('my test color is indigo', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Activity' }).click();
  await expect(page.getByText('Forgot a memory')).toBeVisible();
});

test('stores a conversation and recalls its local summary after reload', async ({ page }) => {
  await page.getByLabel('Message Echo').fill('Plan the lavender packaging launch');
  await page.getByLabel('Send message').click();
  await expect(page.getByText(/saved this conversation locally/i)).toBeVisible();
  await page.reload();
  await page.getByLabel('Message Echo').fill('What did we decide about lavender packaging?');
  await page.getByLabel('Send message').click();
  await expect(page.getByRole('button', { name: /used 1 local source/i })).toBeVisible();
});

test('keeps empty production mode free of seeded demo records', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.getByText('No projects yet')).toBeVisible();
  await expect(page.getByText('Thank-you Card Studio')).not.toBeVisible();
});

test('applies a confirmed preference after restart and exposes profile provenance', async ({
  page,
}) => {
  await page
    .getByLabel('Message Echo')
    .fill('Please remember that I prefer short step-by-step instructions');
  await page.getByLabel('Send message').click();
  await page.reload();
  await page.getByLabel('Message Echo').fill('Help me plan tomorrow');
  await page.getByLabel('Send message').click();
  await expect(page.getByText(/1\. Review the goal/)).toBeVisible();
  await page.getByRole('button', { name: 'Your profile' }).click();
  await expect(page.getByText('Explicit user request')).toBeVisible();
  await expect(page.getByText('100%', { exact: true }).first()).toBeVisible();
});

test('forgets a preference through natural language and stops applying it', async ({ page }) => {
  await page.getByLabel('Message Echo').fill('Remember that I prefer short answers');
  await page.getByLabel('Send message').click();
  await page.getByLabel('Message Echo').fill('Forget that I prefer short answers');
  await page.getByLabel('Send message').click();
  await expect(page.getByText(/has been forgotten/i)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Your profile' }).click();
  await expect(page.getByText('I prefer short answers', { exact: true })).not.toBeVisible();
});

test('opens the exact local source behind a recalled answer', async ({ page }) => {
  await page
    .getByLabel('Message Echo')
    .fill('We decided the eBay thank-you cards use a soft botanical silhouette');
  await page.getByLabel('Send message').click();
  await page.reload();
  await page.getByLabel('Message Echo').fill('What did we decide about the eBay thank-you cards?');
  await page.getByLabel('Send message').click();
  await page.getByRole('button', { name: /used 1 local source/i }).click();
  await expect(page.getByRole('complementary', { name: 'Sources used' })).toContainText(
    'soft botanical silhouette',
  );
});

test('turns repeated edits into reviewable evidence and requires approval', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Skills' }).click();
  const edit = page.getByRole('button', { name: 'Record an edit' }).first();
  let dialogIndex = 0;
  page.on('dialog', (dialog) =>
    dialog.accept(
      dialogIndex++ % 2 === 0
        ? 'Sorry your parcel is delayed'
        : 'Your parcel is delayed; I’ll update you tomorrow',
    ),
  );
  for (let index = 0; index < 3; index += 1) {
    await edit.click();
  }
  await expect(page.getByText(/skill improvement is ready/i)).toBeVisible();
  await page.getByRole('button', { name: 'Review proposal' }).click();
  await expect(page.getByRole('complementary', { name: 'Skill version history' })).toContainText(
    'Repeated edits',
  );
  await expect(page.getByText(/proposed 92%/i)).toBeVisible();
  await page.getByRole('button', { name: 'Approve proposal' }).click();
  await expect(page.getByText('Skill proposal approved')).toBeVisible();
});

test('compares skill performance and restores a prior version', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Skills' }).click();
  await page.getByRole('button', { name: 'Version history' }).first().click();
  await expect(page.getByText(/Success rate 92%/)).toBeVisible();
  await expect(page.getByText(/Success rate 81%/)).toBeVisible();
  await page.getByRole('button', { name: /Restore this version/ }).click();
  await page.getByRole('button', { name: 'Restore version' }).click();
  await expect(page.getByText('Previous skill version restored')).toBeVisible();
});

test('does not run a browser simulation without an explicit test or demo flag', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText(/installed desktop application/i)).toBeVisible();
  await expect(page.getByText('Thank-you Card Studio')).not.toBeVisible();
});
