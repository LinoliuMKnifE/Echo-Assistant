import {
  conversations as demoConversations,
  memories as demoMemories,
  projects as demoProjects,
  skills as demoSkills,
  type Memory,
} from './model';

export type ConversationRecord = (typeof demoConversations)[number] & {
  messages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string }>;
  archived?: boolean;
};
export type ProjectRecord = (typeof demoProjects)[number] & { id?: string };
export type SkillEvaluation = {
  sampleSize: number;
  successRate: number;
  baselineSuccessRate: number;
};
export type SkillRecord = (typeof demoSkills)[number] & {
  id?: string;
  familyId?: string;
  evidence?: string[];
  evaluation?: SkillEvaluation;
  versions?: Array<{
    id: string;
    version: number;
    description: string;
    success: number;
    instructions?: string;
  }>;
};
export type ScheduleRecord = {
  id: string;
  title: string;
  schedule: string;
  next: string;
  project: string;
  enabled: boolean;
  prompt: string;
};
export type AuditRecord = {
  id: string;
  title: string;
  detail: string;
  when: string;
  type: string;
  model: string;
};
export type SettingsRecord = {
  assistantName: string;
  memoryMode: 'ask' | 'low-risk' | 'explicit';
  monthlyBudget: number;
  offline: boolean;
};
export type ApplicationSnapshot = {
  memories: Memory[];
  conversations: ConversationRecord[];
  projects: ProjectRecord[];
  skills: SkillRecord[];
  schedules: ScheduleRecord[];
  audit: AuditRecord[];
  settings: SettingsRecord;
};
export type ChatResult = { conversationId: string; reply: string; provenance: string[] };

export interface ApplicationAdapter {
  load(): Promise<ApplicationSnapshot>;
  chat(message: string, project?: string): Promise<ChatResult>;
  remember(content: string): Promise<Memory>;
  forget(memoryId: string): Promise<void>;
  resolveContradiction(memoryId: string, resolution: 'newer' | 'older'): Promise<void>;
  createSkill(name: string, description: string, instructions: string): Promise<SkillRecord>;
  reviseSkill(skillName: string, description: string, instructions: string): Promise<SkillRecord>;
  recordSkillEdit(skillName: string, before: string, after: string): Promise<SkillRecord | null>;
  reviewSkillProposal(skillName: string, decision: 'approve' | 'reject'): Promise<SkillRecord>;
  rollbackSkill(skillName: string, version: number): Promise<SkillRecord>;
  setScheduleEnabled(id: string, enabled: boolean): Promise<void>;
  saveSettings(settings: SettingsRecord): Promise<void>;
  createBackup(password: string): Promise<{ path: string; bytes: number }>;
  restoreBackup(payload: string, password: string): Promise<void>;
  issuePairing(): Promise<string>;
  revokePairing(): Promise<void>;
}

const emptySnapshot = (): ApplicationSnapshot => ({
  memories: [],
  conversations: [],
  projects: [],
  skills: [],
  schedules: [],
  audit: [],
  settings: { assistantName: 'Echo', memoryMode: 'low-risk', monthlyBudget: 25, offline: false },
});
const demoSnapshot = (): ApplicationSnapshot => ({
  memories: structuredClone(demoMemories),
  conversations: structuredClone(demoConversations),
  projects: structuredClone(demoProjects),
  skills: structuredClone(demoSkills).map((skill, index) => ({
    ...skill,
    id: `skill-${index}`,
    familyId: `family-${index}`,
    versions: [
      {
        id: `skill-${index}-old`,
        version: Math.max(1, skill.version - 1),
        description: skill.previous,
        success: Math.max(62, skill.success - 11),
      },
    ],
  })),
  schedules: [
    {
      id: 's1',
      title: 'Saturday inventory check',
      schedule: 'Every Saturday at 9:00 AM',
      next: 'Jul 11, 9:00 AM',
      project: 'eBay Shop',
      enabled: true,
      prompt: 'Review shop inventory',
    },
  ],
  audit: [],
  settings: { assistantName: 'Echo', memoryMode: 'low-risk', monthlyBudget: 25, offline: false },
});

class BrowserApplicationAdapter implements ApplicationAdapter {
  private readonly key: string;
  constructor(
    private readonly demo: boolean,
    private readonly enabled = true,
  ) {
    this.key = `luma.browser-${demo ? 'demo' : 'test'}-state.v1`;
  }
  async load() {
    if (!this.enabled)
      throw new Error("Echo's local service is available in the installed desktop application.");
    const saved = localStorage.getItem(this.key);
    if (saved) return JSON.parse(saved) as ApplicationSnapshot;
    const state = this.demo ? demoSnapshot() : emptySnapshot();
    this.write(state);
    return state;
  }
  private read() {
    return JSON.parse(
      localStorage.getItem(this.key) ||
        JSON.stringify(this.demo ? demoSnapshot() : emptySnapshot()),
    ) as ApplicationSnapshot;
  }
  private write(state: ApplicationSnapshot) {
    localStorage.setItem(this.key, JSON.stringify(state));
  }
  private audit(state: ApplicationSnapshot, title: string, type: string, detail: string) {
    state.audit.unshift({
      id: crypto.randomUUID(),
      title,
      detail,
      when: new Date().toISOString(),
      type,
      model: 'Local application service',
    });
  }
  async chat(message: string): Promise<ChatResult> {
    const state = this.read();
    const lower = message.toLowerCase();
    let reply =
      'I saved this conversation locally. Connect an AI provider to generate a full response.';
    const provenance: string[] = [];
    if (lower.startsWith('remember ') || lower.includes('please remember')) {
      const content = message.replace(/^.*?remember(?: that)?\s*/i, '');
      const memory: Memory = {
        id: crypto.randomUUID(),
        title: content.slice(0, 42),
        content,
        type: 'Profile',
        confidence: 100,
        sensitivity: 'Low',
        source: 'Explicit user request',
        learned: new Date().toLocaleDateString(),
        status: 'Confirmed',
      };
      state.memories.push(memory);
      this.audit(state, 'Remembered an explicit detail', 'Memory', content);
      provenance.push(memory.id);
      reply = `I’ll remember that: ${content}`;
    } else if (lower.startsWith('forget ')) {
      const phrase = lower.replace(/^forget(?: that)?\s*/, '');
      const memory = state.memories.find(
        (item) =>
          item.content.toLowerCase().includes(phrase) ||
          phrase.includes(item.content.toLowerCase()),
      );
      if (memory) {
        state.memories = state.memories.filter((item) => item.id !== memory.id);
        this.audit(state, 'Forgot a memory', 'Memory', memory.title);
        reply = `I found “${memory.title}”. It has been forgotten and will no longer influence replies.`;
        provenance.push(memory.id);
      } else reply = 'I searched your profile and memories but did not find a matching detail.';
    } else {
      const match = [...state.conversations].reverse().find((item) =>
        `${item.title} ${item.summary}`
          .toLowerCase()
          .split(/\W+/)
          .some((word) => word.length > 4 && lower.includes(word)),
      );
      if (match) {
        reply = match.summary;
        provenance.push(match.id);
      } else {
        const preferences = state.memories.filter(
          (item) => item.type === 'Profile' && item.status === 'Confirmed',
        );
        if (preferences.length) {
          reply = `Using your confirmed preference (${preferences[0].content}), here are the next steps:\n1. Review the goal.\n2. Choose the smallest useful action.\n3. Check the result.`;
          provenance.push(preferences[0].id);
        }
      }
    }
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    state.conversations.push({
      id,
      title: message.slice(0, 160),
      summary: reply,
      when: 'Just now',
      project: 'Unfiled',
      cost: '$0.00',
      messages: [
        { id: crypto.randomUUID(), role: 'user', content: message, createdAt: now },
        { id: crypto.randomUUID(), role: 'assistant', content: reply, createdAt: now },
      ],
    });
    this.audit(state, 'Conversation completed', 'Conversation', `Stored conversation ${id}`);
    this.write(state);
    return { conversationId: id, reply, provenance };
  }
  async remember(content: string) {
    const state = this.read();
    const existing = state.memories.find((m) => m.content.toLowerCase() === content.toLowerCase());
    if (existing) return existing;
    const contradiction = state.memories.find((m) =>
      m.title.toLowerCase().includes(content.split(' ')[0]?.toLowerCase()),
    );
    const memory: Memory = {
      id: crypto.randomUUID(),
      title: content.slice(0, 42),
      content,
      type: 'Profile',
      confidence: 100,
      sensitivity: 'Low',
      source: 'Explicit user request',
      learned: new Date().toLocaleDateString(),
      status: contradiction ? 'Contradiction' : 'Confirmed',
    };
    state.memories.push(memory);
    this.audit(state, 'Remembered an explicit detail', 'Memory', content);
    this.write(state);
    return memory;
  }
  async forget(memoryId: string) {
    const state = this.read();
    const memory = state.memories.find((m) => m.id === memoryId);
    state.memories = state.memories.filter((m) => m.id !== memoryId);
    this.audit(state, 'Forgot a memory', 'Memory', memory?.title || memoryId);
    this.write(state);
  }
  async resolveContradiction(memoryId: string, resolution: 'newer' | 'older') {
    const state = this.read();
    const memory = state.memories.find((m) => m.id === memoryId);
    if (!memory) throw new Error('Memory not found');
    memory.status = 'Confirmed';
    this.audit(
      state,
      'Resolved a contradiction',
      'Memory',
      `${memory.title}: kept ${resolution} information`,
    );
    this.write(state);
  }
  async createSkill(name: string, description: string) {
    const state = this.read();
    const skill: SkillRecord = {
      id: crypto.randomUUID(),
      familyId: crypto.randomUUID(),
      name,
      description,
      scope: 'Everywhere',
      version: 1,
      status: 'Experimental',
      success: 0,
      previous: 'Original version',
      versions: [],
    };
    state.skills.push(skill);
    this.write(state);
    return skill;
  }
  async reviseSkill(skillName: string, description: string) {
    const state = this.read();
    const skill = state.skills.find((s) => s.name === skillName);
    if (!skill) throw new Error('Skill not found');
    skill.versions = [
      ...(skill.versions || []),
      {
        id: crypto.randomUUID(),
        version: skill.version,
        description: skill.description,
        success: skill.success,
      },
    ];
    skill.version += 1;
    skill.description = description;
    skill.status = 'Proposed';
    this.write(state);
    return skill;
  }
  async recordSkillEdit(skillName: string, before: string, after: string) {
    const state = this.read();
    const skill = state.skills.find((s) => s.name === skillName);
    if (!skill) throw new Error('Skill not found');
    skill.evidence = [...(skill.evidence || []), `Changed “${before}” to “${after}”`].slice(-3);
    if (skill.evidence.length < 3) {
      this.write(state);
      return null;
    }
    skill.status = 'Proposed';
    skill.description = 'Write shorter, warmer customer replies with less apologetic language.';
    skill.evaluation = {
      sampleSize: skill.evidence.length,
      successRate: 92,
      baselineSuccessRate: skill.success,
    };
    this.audit(
      state,
      'Proposed a skill revision',
      'Skill',
      `${skill.name}: ${skill.evidence.length} repeated edits`,
    );
    this.write(state);
    return skill;
  }
  async reviewSkillProposal(skillName: string, decision: 'approve' | 'reject') {
    const state = this.read();
    const skill = state.skills.find((s) => s.name === skillName);
    if (!skill) throw new Error('Skill not found');
    skill.status = decision === 'approve' ? 'Trusted' : 'Experimental';
    this.audit(
      state,
      decision === 'approve' ? 'Approved a skill revision' : 'Rejected a skill revision',
      'Skill',
      skillName,
    );
    this.write(state);
    return skill;
  }
  async rollbackSkill(skillName: string, version: number) {
    const state = this.read();
    const skill = state.skills.find((s) => s.name === skillName);
    if (!skill) throw new Error('Skill not found');
    const target = skill.versions?.find((v) => v.version === version);
    if (!target) throw new Error('Skill version not found');
    skill.version += 1;
    skill.description = target.description;
    skill.success = target.success;
    this.audit(
      state,
      'Rolled back a skill',
      'Skill',
      `${skillName} restored from version ${version}`,
    );
    this.write(state);
    return skill;
  }
  async setScheduleEnabled(id: string, enabled: boolean) {
    const state = this.read();
    const task = state.schedules.find((s) => s.id === id);
    if (!task) throw new Error('Scheduled task not found');
    task.enabled = enabled;
    this.audit(
      state,
      enabled ? 'Enabled a scheduled task' : 'Disabled a scheduled task',
      'Schedule',
      task.title,
    );
    this.write(state);
  }
  async saveSettings(settings: SettingsRecord) {
    const state = this.read();
    state.settings = settings;
    this.audit(state, 'Updated settings', 'Settings', 'Privacy and cost preferences changed');
    this.write(state);
  }
  async createBackup(password: string): Promise<{ path: string; bytes: number }> {
    void password;
    throw new Error('Encrypted backups are available in the installed desktop app');
  }
  async restoreBackup(payload: string, password: string) {
    void payload;
    void password;
    throw new Error('Encrypted restore is available in the installed desktop app');
  }
  async issuePairing(): Promise<string> {
    throw new Error('Firefox pairing is available in the installed desktop app');
  }
  async revokePairing() {
    throw new Error('Firefox pairing is available in the installed desktop app');
  }
}

class TauriApplicationAdapter implements ApplicationAdapter {
  private async invoke<T>(command: string, args: Record<string, unknown> = {}) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, args);
  }
  load() {
    return this.invoke<ApplicationSnapshot>('app_snapshot');
  }
  chat(message: string, project?: string) {
    return this.invoke<ChatResult>('chat', { message, project });
  }
  remember(content: string) {
    return this.invoke<Memory>('remember', { content });
  }
  forget(memoryId: string) {
    return this.invoke<void>('forget_memory', { memoryId });
  }
  resolveContradiction(memoryId: string, resolution: 'newer' | 'older') {
    return this.invoke<void>('resolve_contradiction', { memoryId, resolution });
  }
  createSkill(name: string, description: string, instructions: string) {
    return this.invoke<SkillRecord>('create_skill', { name, description, instructions });
  }
  reviseSkill(skillName: string, description: string, instructions: string) {
    return this.invoke<SkillRecord>('revise_skill', { skillName, description, instructions });
  }
  recordSkillEdit(skillName: string, before: string, after: string) {
    return this.invoke<SkillRecord | null>('record_skill_edit', { skillName, before, after });
  }
  reviewSkillProposal(skillName: string, decision: 'approve' | 'reject') {
    return this.invoke<SkillRecord>('review_skill_proposal', { skillName, decision });
  }
  rollbackSkill(skillName: string, version: number) {
    return this.invoke<SkillRecord>('rollback_skill', { skillName, version });
  }
  setScheduleEnabled(id: string, enabled: boolean) {
    return this.invoke<void>('set_schedule_enabled', { id, enabled });
  }
  saveSettings(settings: SettingsRecord) {
    return this.invoke<void>('save_settings', { settings });
  }
  createBackup(password: string) {
    return this.invoke<{ path: string; bytes: number }>('create_backup', { password });
  }
  restoreBackup(payload: string, password: string) {
    return this.invoke<void>('restore_backup', { payload, password });
  }
  issuePairing() {
    return this.invoke<string>('issue_pairing');
  }
  revokePairing() {
    return this.invoke<void>('revoke_pairing');
  }
}

type SidecarSession = { baseUrl: string; token: string };
const SIDECAR_HEALTH_TIMEOUT_MS = 1500;
const SIDECAR_RPC_PATH = '/app/v1/rpc';

// ponytail: host-owned methods (OS keyring, host settings store) have no backing in the
// sidecar's core DB — issuePairing/revokePairing manage the OS keyring, saveSettings has no
// settings table in core yet. These three route to the inner Tauri adapter (see below);
// everything data-shaped (chat, memories, skills, schedules, backup, etc.) goes to the sidecar.
class SidecarApplicationAdapter implements ApplicationAdapter {
  private readonly host: TauriApplicationAdapter;
  constructor(
    private readonly session: SidecarSession,
    host: TauriApplicationAdapter = new TauriApplicationAdapter(),
  ) {
    this.host = host;
  }
  private async rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`${this.session.baseUrl}${SIDECAR_RPC_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.session.token}`,
      },
      body: JSON.stringify({ method, params }),
    });
    if (!response.ok) throw new Error(`Local service request failed (${response.status})`);
    const body = (await response.json()) as { ok: true; result: T } | { ok: false; error: string };
    if (!body.ok) throw new Error(body.error);
    return body.result;
  }
  async load() {
    const snapshot = await this.rpc<ApplicationSnapshot>('load');
    try {
      snapshot.settings = (await this.host.load()).settings;
    } catch {
      // ponytail: keep the sidecar's default settings if the host call fails (e.g. Tauri
      // command not present in a test environment); settings are non-critical to boot.
    }
    return snapshot;
  }
  chat(message: string, project?: string) {
    return this.rpc<ChatResult>('chat', { message, project });
  }
  remember(content: string) {
    return this.rpc<Memory>('remember', { content });
  }
  forget(memoryId: string) {
    return this.rpc<void>('forget', { memoryId });
  }
  resolveContradiction(memoryId: string, resolution: 'newer' | 'older') {
    return this.rpc<void>('resolveContradiction', { memoryId, resolution });
  }
  createSkill(name: string, description: string, instructions: string) {
    return this.rpc<SkillRecord>('createSkill', { name, description, instructions });
  }
  reviseSkill(skillName: string, description: string, instructions: string) {
    return this.rpc<SkillRecord>('reviseSkill', { skillName, description, instructions });
  }
  recordSkillEdit(skillName: string, before: string, after: string) {
    return this.rpc<SkillRecord | null>('recordSkillEdit', { skillName, before, after });
  }
  reviewSkillProposal(skillName: string, decision: 'approve' | 'reject') {
    return this.rpc<SkillRecord>('reviewSkillProposal', { skillName, decision });
  }
  rollbackSkill(skillName: string, version: number) {
    return this.rpc<SkillRecord>('rollbackSkill', { skillName, version });
  }
  setScheduleEnabled(id: string, enabled: boolean) {
    return this.rpc<void>('setScheduleEnabled', { id, enabled });
  }
  saveSettings(settings: SettingsRecord) {
    return this.host.saveSettings(settings);
  }
  createBackup(password: string) {
    return this.rpc<{ path: string; bytes: number }>('createBackup', { password });
  }
  restoreBackup(payload: string, password: string) {
    return this.rpc<void>('restoreBackup', { payload, password });
  }
  issuePairing() {
    return this.host.issuePairing();
  }
  revokePairing() {
    return this.host.revokePairing();
  }
}

async function trySidecarAdapter(): Promise<ApplicationAdapter | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const session = await invoke<SidecarSession>('sidecar_session');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SIDECAR_HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(`${session.baseUrl}/app/v1/health`, {
        headers: { Authorization: `Bearer ${session.token}` },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { ok: boolean };
      if (!body.ok) return null;
    } finally {
      clearTimeout(timeout);
    }
    return new SidecarApplicationAdapter(session);
  } catch {
    return null;
  }
}

// ponytail: createApplicationAdapter() must stay synchronous (App.tsx does
// useState(createApplicationAdapter)); this wrapper resolves the sidecar-vs-Tauri
// choice lazily on first use and caches it, so callers don't need to await selection.
class ResolvingApplicationAdapter implements ApplicationAdapter {
  private resolved: Promise<ApplicationAdapter> | null = null;
  private pick(): Promise<ApplicationAdapter> {
    if (!this.resolved)
      this.resolved = trySidecarAdapter().then(
        (adapter) => adapter || new TauriApplicationAdapter(),
      );
    return this.resolved;
  }
  async load() {
    return (await this.pick()).load();
  }
  async chat(message: string, project?: string) {
    return (await this.pick()).chat(message, project);
  }
  async remember(content: string) {
    return (await this.pick()).remember(content);
  }
  async forget(memoryId: string) {
    return (await this.pick()).forget(memoryId);
  }
  async resolveContradiction(memoryId: string, resolution: 'newer' | 'older') {
    return (await this.pick()).resolveContradiction(memoryId, resolution);
  }
  async createSkill(name: string, description: string, instructions: string) {
    return (await this.pick()).createSkill(name, description, instructions);
  }
  async reviseSkill(skillName: string, description: string, instructions: string) {
    return (await this.pick()).reviseSkill(skillName, description, instructions);
  }
  async recordSkillEdit(skillName: string, before: string, after: string) {
    return (await this.pick()).recordSkillEdit(skillName, before, after);
  }
  async reviewSkillProposal(skillName: string, decision: 'approve' | 'reject') {
    return (await this.pick()).reviewSkillProposal(skillName, decision);
  }
  async rollbackSkill(skillName: string, version: number) {
    return (await this.pick()).rollbackSkill(skillName, version);
  }
  async setScheduleEnabled(id: string, enabled: boolean) {
    return (await this.pick()).setScheduleEnabled(id, enabled);
  }
  async saveSettings(settings: SettingsRecord) {
    return (await this.pick()).saveSettings(settings);
  }
  async createBackup(password: string) {
    return (await this.pick()).createBackup(password);
  }
  async restoreBackup(payload: string, password: string) {
    return (await this.pick()).restoreBackup(payload, password);
  }
  async issuePairing() {
    return (await this.pick()).issuePairing();
  }
  async revokePairing() {
    return (await this.pick()).revokePairing();
  }
}

export function createApplicationAdapter(): ApplicationAdapter {
  if ('__TAURI_INTERNALS__' in window) return new ResolvingApplicationAdapter();
  const params = new URLSearchParams(location.search);
  if (params.get('test') === '1' || params.get('demo') === '1')
    return new BrowserApplicationAdapter(params.get('demo') === '1');
  return new BrowserApplicationAdapter(false, false);
}

export { SidecarApplicationAdapter, TauriApplicationAdapter, trySidecarAdapter };
