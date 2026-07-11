import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { LumaApplicationService } from './application-service.js';
import { MockProvider, OpenAIResponsesProvider, type ModelSettings } from './providers.js';
import type { ExtractedMemory } from './types.js';

const roots: string[] = [];
const workspace = (): string => {
  const path = mkdtempSync(join(tmpdir(), 'luma-service-'));
  roots.push(path);
  return path;
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const extraction = (changes: Partial<ExtractedMemory> = {}): ExtractedMemory => ({
  worthRemembering: true,
  memoryType: 'profile',
  subject: 'user',
  title: 'Response preference',
  content: 'Prefers short step-by-step instructions',
  confidence: 1,
  importance: 0.9,
  sensitivity: 'low',
  durability: 'durable',
  evidence: 'Please remember that I prefer short step-by-step instructions.',
  inferred: false,
  existingMemoryId: null,
  relation: 'new',
  requiresConfirmation: false,
  expiresAt: null,
  ...changes,
});
const models: ModelSettings = {
  reasoning: 'reasoning',
  standard: 'standard',
  fast: 'fast',
  embedding: 'embedding',
  prices: {},
};

describe('durable Luma application scenarios', () => {
  it('persists preferences with provenance across close/reopen and forgets with audit (scenarios 1, 2, 10)', () => {
    const root = workspace(),
      databasePath = join(root, 'luma.db');
    let service = new LumaApplicationService({ databasePath });
    const conversation = service.createConversation('Preferences');
    service.appendMessage(
      conversation.id,
      'user',
      'Please remember that I prefer short step-by-step instructions.',
    );
    const saved = service.remember(extraction(), conversation.id)!;
    expect(service.profile()[0]).toMatchObject({
      memoryId: saved.id,
      statement: 'Prefers short step-by-step instructions',
      sourceConversationId: conversation.id,
      confidence: 1,
    });
    service.close();
    service = new LumaApplicationService({ databasePath });
    expect(service.profile()[0]?.sourceExcerpt).toContain('Please remember');
    expect(service.listConversations()).toHaveLength(1);
    expect(service.forget('short step-by-step', true)).toHaveLength(1);
    expect(service.profile()).toHaveLength(0);
    expect(service.listAudit().some((event) => event.action === 'delete' && event.approved)).toBe(
      true,
    );
    service.close();
  });

  it('recalls prior conversations and prevents project contamination while offline (scenarios 3, 10)', () => {
    const root = workspace(),
      service = new LumaApplicationService({ databasePath: join(root, 'luma.db') });
    const cards = service.createProject({ name: 'eBay cards' });
    const unrelated = service.createProject({ name: 'Garden' });
    const decision = service.createConversation('Thank-you cards', cards.id);
    service.appendMessage(decision.id, 'user', 'What should the card use?');
    service.appendMessage(
      decision.id,
      'assistant',
      'We decided the eBay thank-you cards should use the blue silhouette.',
    );
    service.updateConversationSummary(
      decision.id,
      'Use the blue silhouette for eBay thank-you cards.',
    );
    const other = service.createConversation('Seeds', unrelated.id);
    service.appendMessage(other.id, 'user', 'Plant tomatoes.');
    expect(service.searchConversations('eBay cards', cards.id).map((item) => item.id)).toEqual([
      decision.id,
    ]);
    expect(service.searchConversations('tomatoes', cards.id)).toHaveLength(0);
    expect(service.listConversations(cards.id).map((item) => item.id)).toEqual([decision.id]);
    service.close();
  });

  it('applies confirmed communication preferences and returns inspectable recall sources', async () => {
    const root = workspace(),
      service = new LumaApplicationService({ databasePath: join(root, 'luma.db') });
    const project = service.createProject({ name: 'Cards' });
    const source = service.createConversation('Earlier decision', project.id);
    const sourceMessage = service.appendMessage(
      source.id,
      'assistant',
      'Use blue envelopes for every card order.',
    );
    const preferenceConversation = service.createConversation('Preferences');
    service.remember(
      extraction({ content: 'Keep replies concise and use bullet points.' }),
      preferenceConversation.id,
    );
    const current = service.createConversation('Follow-up', project.id);
    const provider = new MockProvider('Use blue envelopes.');

    const result = await service.runAgentTurn(current.id, 'blue envelopes', provider, models);

    expect(provider.requests[0]?.system).toContain('Keep replies concise and use bullet points.');
    expect(provider.requests[0]?.input).toContain(`[conversation:${source.id}]`);
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        conversationId: source.id,
        conversationTitle: 'Earlier decision',
        messageId: sourceMessage.id,
      }),
    );
    expect(service.getConversation(current.id)?.messages.at(-1)?.content).toBe(
      'Use blue envelopes.',
    );
    service.close();
  });

  it('retains both sides of a contradiction until explicit resolution (scenario 4)', () => {
    const root = workspace(),
      service = new LumaApplicationService({ databasePath: join(root, 'luma.db') });
    const conversation = service.createConversation('Preference changes');
    const original = service.remember(extraction(), conversation.id)!;
    const candidate = service.remember(
      extraction({
        content: 'Prefers detailed explanations',
        relation: 'contradiction',
        existingMemoryId: original.id,
        requiresConfirmation: true,
        evidence: 'Actually, give me detailed explanations.',
      }),
      conversation.id,
    )!;
    expect(candidate).toMatchObject({ status: 'proposed', contradictsId: original.id });
    expect(service.getMemory(original.id)?.status).toBe('active');
    service.resolveContradiction(candidate.id, 'accept-new');
    expect(service.getMemory(original.id)?.status).toBe('superseded');
    expect(service.getMemory(candidate.id)?.status).toBe('active');
    service.close();
  });

  it('persists proposed skill revisions and creates rollback versions (scenarios 5, 6)', () => {
    const root = workspace(),
      databasePath = join(root, 'luma.db');
    let service = new LumaApplicationService({ databasePath });
    const first = service.createSkill({
      name: 'eBay reply',
      description: 'Concise reply',
      scope: 'global',
      projectId: null,
      triggers: ['eBay reply'],
      instructions: 'Be brief and factual.',
      inputSchema: {},
      outputSchema: {},
      requiredTools: [],
      requiredPermissions: [],
      confirmationRequirements: [],
      examples: [],
      tests: [{ input: 'Late parcel', mustInclude: ['update'], mustNotInclude: ['deeply sorry'] }],
      status: 'trusted',
      createdBy: 'user',
    });
    const proposed = service.reviseSkill(first.id, {
      instructions: 'Be shorter and less apologetic.',
    });
    expect(proposed).toMatchObject({ version: 2, status: 'proposed', parentVersionId: first.id });
    const rollback = service.rollbackSkill(first.id);
    expect(rollback).toMatchObject({
      version: 3,
      parentVersionId: proposed.id,
      instructions: first.instructions,
    });
    service.close();
    service = new LumaApplicationService({ databasePath });
    expect(service.listSkills().map((skill) => skill.version)).toEqual([3, 2, 1]);
    service.close();
  });

  it('proposes a scoped revision from repeated accepted edits and promotes only after approval', () => {
    const root = workspace(),
      service = new LumaApplicationService({ databasePath: join(root, 'luma.db') });
    const project = service.createProject({ name: 'Support' });
    const skill = service.createSkill({
      name: 'Reply',
      description: 'Customer reply',
      scope: 'global',
      projectId: null,
      triggers: ['reply'],
      instructions: 'Reply helpfully.',
      inputSchema: {},
      outputSchema: {},
      requiredTools: [],
      requiredPermissions: [],
      confirmationRequirements: [],
      examples: [],
      tests: [],
      status: 'trusted',
      createdBy: 'user',
    });
    const before =
      'I am deeply sorry and sincerely apologize for this unfortunate problem. Here is a long explanation with several unnecessary details about everything that happened.';
    let proposal = null;
    for (let index = 0; index < 3; index++)
      proposal = service.recordCorrection({
        taskId: `task-${index}`,
        projectId: project.id,
        skillFamilyId: skill.familyId,
        before,
        after: 'Here is the update.',
        accepted: true,
        occurredAt: new Date(2026, 0, index + 1).toISOString(),
      });

    expect(proposal).toMatchObject({
      projectId: project.id,
      requiresApproval: true,
      status: 'proposed',
    });
    expect(proposal!.evidence.map((item) => item.taskId)).toEqual(['task-0', 'task-1', 'task-2']);
    expect(service.getSkill(proposal!.proposedSkillId)).toMatchObject({
      scope: 'project',
      projectId: project.id,
      status: 'proposed',
    });
    expect(service.listSkillProposals('proposed')).toHaveLength(1);
    const approved = service.decideSkillProposal(proposal!.id, 'approve');
    expect(approved).toMatchObject({
      proposal: { status: 'approved' },
      skill: { status: 'trusted' },
    });
    expect(() => service.decideSkillProposal(proposal!.id, 'approve')).toThrow(
      'Open skill proposal not found',
    );
    service.close();
  });

  it('never persists a transient provider key used through the provider lifecycle (scenario 8)', async () => {
    const root = workspace(),
      databasePath = join(root, 'luma.db'),
      secret = 'sk-transient-never-store-123456789';
    const service = new LumaApplicationService({ databasePath });
    const conversation = service.createConversation('No secrets');
    const provider = new OpenAIResponsesProvider(
      async () => secret,
      models,
      async (_input, init) => {
        expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${secret}`);
        return new Response(
          JSON.stringify({
            id: 'response',
            model: 'standard',
            output_text: 'Safe reply',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    );
    await service.runAgentTurn(conversation.id, 'Hello', provider, models);
    const exported = service.exportPortableJson();
    const backup = service.createEncryptedBackup('correct horse battery staple');
    const diagnostics = service.createDiagnosticReport();
    service.close();
    expect(exported).not.toContain(secret);
    expect(diagnostics).not.toContain(secret);
    expect(readFileSync(databasePath).includes(Buffer.from(secret))).toBe(false);
    expect(Buffer.from(backup).includes(Buffer.from(secret))).toBe(false);
  });

  it('redacts pasted secrets from chat messages, memories, and audit before they reach the database', () => {
    const root = workspace(),
      databasePath = join(root, 'luma.db'),
      secret = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';
    const service = new LumaApplicationService({ databasePath });
    const conversation = service.createConversation('Secrets');
    const message = service.appendMessage(
      conversation.id,
      'user',
      `Here is my key: ${secret} please use it.`,
    );
    expect(message.content).not.toContain(secret);
    expect(message.content).toContain('[REDACTED:openai-key]');

    const memory = service.remember(
      extraction({ content: `API key: ${secret}`, evidence: `My key is ${secret}.` }),
      conversation.id,
    )!;
    expect(memory.content).not.toContain(secret);
    expect(memory.sourceExcerpt).not.toContain(secret);

    service.close();
    const raw = readFileSync(databasePath);
    expect(raw.includes(Buffer.from(secret))).toBe(false);

    const reopened = new LumaApplicationService({ databasePath });
    expect(reopened.getConversation(conversation.id)?.messages[0]?.content).not.toContain(secret);
    expect(reopened.listAudit().every((event) => !JSON.stringify(event).includes(secret))).toBe(
      true,
    );
    reopened.close();
  });

  it('leaves ordinary prose untouched by redaction', () => {
    const root = workspace(),
      service = new LumaApplicationService({ databasePath: join(root, 'luma.db') });
    const conversation = service.createConversation('Normal');
    const text = 'The API design keys off the request key=value pairs, not secrets.';
    const message = service.appendMessage(conversation.id, 'user', text);
    expect(message.content).toBe(text);
    service.close();
  });

  it('authenticates, validates, and atomically restores a portable fixture with schedules (scenario 9)', () => {
    const sourceRoot = workspace(),
      sourceData = join(sourceRoot, 'portable-data');
    mkdirSync(sourceData);
    copyFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        'test-fixtures',
        'portable-data',
        'profile.json',
      ),
      join(sourceData, 'profile.json'),
    );
    writeFileSync(join(sourceData, 'api-token.txt'), 'must-not-back-up');
    const source = new LumaApplicationService({
      databasePath: join(sourceRoot, 'source.db'),
      dataDirectory: sourceData,
    });
    const project = source.createProject({
      name: 'Portable project',
      goal: 'Move between Windows and macOS',
    });
    const conversation = source.createConversation('Portable conversation', project.id);
    source.appendMessage(conversation.id, 'user', 'Keep this after restore.');
    source.addSchedule({
      prompt: 'Weekly review',
      projectId: project.id,
      enabled: true,
      timezone: 'America/Los_Angeles',
      nextRunAt: '2030-01-01T09:00:00.000Z',
      recurrenceMs: 604_800_000,
      missedRun: 'run',
    });
    const backup = source.createEncryptedBackup('correct horse battery staple');
    source.close();
    const targetRoot = workspace(),
      targetData = join(targetRoot, 'portable-data');
    const target = new LumaApplicationService({
      databasePath: join(targetRoot, 'target.db'),
      dataDirectory: targetData,
    });
    target.createConversation('Will be replaced');
    expect(() => target.restoreEncryptedBackup(backup, 'wrong password value')).toThrow();
    expect(target.listConversations()[0]?.title).toBe('Will be replaced');
    target.restoreEncryptedBackup(backup, 'correct horse battery staple');
    expect(target.listConversations()[0]?.title).toBe('Portable conversation');
    expect(target.listSchedules()[0]).toMatchObject({
      prompt: 'Weekly review',
      timezone: 'America/Los_Angeles',
    });
    expect(JSON.parse(readFileSync(join(targetData, 'profile.json'), 'utf8'))).toMatchObject({
      displayName: 'Portable User',
    });
    expect(() => readFileSync(join(targetData, 'api-token.txt'))).toThrow();
    target.close();
  });

  it('toggles a scheduled task enabled state, audits it, and rejects an unknown id', () => {
    const root = workspace(),
      service = new LumaApplicationService({ databasePath: join(root, 'luma.db') });
    const schedule = service.addSchedule({
      prompt: 'Weekly review',
      projectId: null,
      enabled: true,
      timezone: 'UTC',
      nextRunAt: '2030-01-01T09:00:00.000Z',
      recurrenceMs: 604_800_000,
      missedRun: 'run',
    });
    service.setScheduleEnabled(schedule.id, false);
    expect(service.listSchedules()[0]).toMatchObject({ id: schedule.id, enabled: false });
    expect(
      service
        .listAudit()
        .some((event) => event.category === 'schedule' && event.action === 'disable'),
    ).toBe(true);
    expect(() => service.setScheduleEnabled('missing-id', true)).toThrow(
      'Scheduled task not found',
    );
    service.close();
  });
});
