import type { LumaApplicationService } from '@luma/core';
import {
  MockProvider,
  OpenAIResponsesProvider,
  id,
  type ModelSettings,
  type Provider,
} from '@luma/core';

// ponytail: no shared "default model settings" exists yet in @luma/core or apps/desktop;
// these are the sidecar's own reasonable defaults (cost table is empty -> $0 estimate until
// the desktop UI configures real prices through a future settings RPC).
const DEFAULT_MODELS: ModelSettings = {
  reasoning: 'gpt-5',
  standard: 'gpt-5-mini',
  fast: 'gpt-5-nano',
  embedding: 'text-embedding-3-small',
  prices: {},
};

export type RpcOk = { ok: true; result: unknown };
export type RpcErr = { ok: false; error: string };
export type RpcResult = RpcOk | RpcErr;

export class RpcRouter {
  private readonly provider: Provider;

  constructor(
    private readonly service: LumaApplicationService,
    openaiApiKey: string | undefined,
  ) {
    this.provider = openaiApiKey
      ? new OpenAIResponsesProvider(async () => openaiApiKey, DEFAULT_MODELS)
      : new MockProvider();
  }

  async dispatch(method: string, params: Record<string, unknown>): Promise<RpcResult> {
    try {
      const result = await this.handle(method, params);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Request failed' };
    }
  }

  private async handle(method: string, params: Record<string, unknown>): Promise<unknown> {
    const service = this.service;
    switch (method) {
      case 'load':
      case 'snapshot':
        return this.snapshot();
      case 'chat': {
        const message = requireString(params, 'message');
        const projectId = optionalString(params, 'project') ?? null;
        const conversation = service.createConversation(message.slice(0, 160), projectId);
        const turn = await service.runAgentTurn(
          conversation.id,
          message,
          this.provider,
          DEFAULT_MODELS,
        );
        return {
          conversationId: conversation.id,
          reply: turn.text,
          provenance: turn.sources.map((source) => source.conversationId),
        };
      }
      case 'remember': {
        const content = requireString(params, 'content');
        const memory = service.remember(
          {
            worthRemembering: true,
            memoryType: 'profile',
            subject: 'user',
            title: content.slice(0, 42),
            content,
            confidence: 1,
            importance: 0.6,
            sensitivity: 'low',
            durability: 'durable',
            evidence: content,
            inferred: false,
            existingMemoryId: null,
            relation: 'new',
            requiresConfirmation: false,
            expiresAt: null,
          },
          'sidecar-rpc',
          null,
        );
        if (!memory) throw new Error('Nothing new to remember');
        return memory;
      }
      case 'forget':
        return service.forget(requireString(params, 'memoryId'), true);
      case 'resolveContradiction': {
        const memoryId = requireString(params, 'memoryId');
        const resolution = requireString(params, 'resolution');
        service.resolveContradiction(memoryId, resolution === 'newer' ? 'accept-new' : 'keep-old');
        return null;
      }
      case 'createSkill':
        return service.createSkill({
          name: requireString(params, 'name'),
          description: requireString(params, 'description'),
          scope: 'global',
          projectId: null,
          instructions: requireString(params, 'instructions'),
          triggers: [],
          inputSchema: {},
          outputSchema: {},
          requiredTools: [],
          requiredPermissions: [],
          confirmationRequirements: [],
          examples: [],
          tests: [],
          status: 'experimental',
          createdBy: 'user',
        });
      case 'reviseSkill': {
        const skillName = requireString(params, 'skillName');
        const skill = findSkillByName(service, skillName);
        return service.reviseSkill(skill.id, {
          description: requireString(params, 'description'),
          instructions: requireString(params, 'instructions'),
        });
      }
      case 'recordSkillEdit': {
        const skillName = requireString(params, 'skillName');
        const before = requireString(params, 'before');
        const after = requireString(params, 'after');
        const skill = findSkillByName(service, skillName);
        const proposal = service.recordCorrection({
          taskId: id(),
          projectId: skill.projectId,
          skillFamilyId: skill.familyId,
          before,
          after,
          accepted: true,
          occurredAt: new Date().toISOString(),
        });
        return proposal ? service.getSkill(proposal.proposedSkillId) : null;
      }
      case 'rollbackSkill': {
        const skillName = requireString(params, 'skillName');
        const version = requireNumber(params, 'version');
        const target = service
          .listSkills()
          .find((skill) => skill.name === skillName && skill.version === version);
        if (!target) throw new Error('Skill version not found');
        return service.rollbackSkill(target.id);
      }
      case 'reviewSkillProposal': {
        const skillName = requireString(params, 'skillName');
        const decision = requireString(params, 'decision');
        if (decision !== 'approve' && decision !== 'reject') throw new Error('Invalid decision');
        const proposal = service.listSkillProposals('proposed').find((item) => {
          const skill = service.getSkill(item.proposedSkillId);
          return skill?.name === skillName;
        });
        if (!proposal) throw new Error('Open skill proposal not found');
        return service.decideSkillProposal(proposal.id, decision).skill;
      }
      case 'setScheduleEnabled': {
        const scheduleId = requireString(params, 'id');
        const enabled = requireBoolean(params, 'enabled');
        service.setScheduleEnabled(scheduleId, enabled);
        return null;
      }
      case 'projects':
        return service.listProjects();
      case 'createProject': {
        const description = optionalString(params, 'description');
        const goal = optionalString(params, 'goal');
        return service.createProject({
          name: requireString(params, 'name'),
          ...(description !== undefined ? { description } : {}),
          ...(goal !== undefined ? { goal } : {}),
        });
      }
      case 'audit':
        return service.listAudit();
      case 'createBackup': {
        const password = requireString(params, 'password');
        const bytes = service.createEncryptedBackup(password);
        return {
          path: service.databasePath,
          bytes: bytes.byteLength,
          data: Buffer.from(bytes).toString('base64'),
        };
      }
      case 'restoreBackup': {
        const payload = requireString(params, 'payload');
        const password = requireString(params, 'password');
        const encoded = payload.includes(',')
          ? payload.slice(payload.lastIndexOf(',') + 1)
          : payload;
        service.restoreEncryptedBackup(new Uint8Array(Buffer.from(encoded, 'base64')), password);
        return null;
      }
      case 'issuePairing':
      case 'revokePairing':
        throw new Error(`${method} is managed by the desktop host, not the sidecar`);
      default:
        throw new Error(`unknown method: ${method}`);
    }
  }

  private snapshot() {
    const service = this.service;
    return {
      memories: service.listMemories(),
      conversations: service.listConversations(),
      projects: service.listProjects(),
      skills: service.listSkills(),
      schedules: service.listSchedules(),
      audit: service.listAudit(),
      settings: {
        assistantName: 'Luma',
        memoryMode: 'low-risk',
        monthlyBudget: 25,
        offline: false,
      },
    };
  }
}

function findSkillByName(service: LumaApplicationService, name: string) {
  const skill = service.listSkills().find((item) => item.name === name);
  if (!skill) throw new Error('Skill not found');
  return skill;
}
function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required`);
  return value;
}
function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}
function requireNumber(params: Record<string, unknown>, key: string): number {
  const value = params[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} is required`);
  return value;
}
function requireBoolean(params: Record<string, unknown>, key: string): boolean {
  const value = params[key];
  if (typeof value !== 'boolean') throw new Error(`${key} is required`);
  return value;
}
