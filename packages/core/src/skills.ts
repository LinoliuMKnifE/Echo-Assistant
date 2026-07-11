import { z } from 'zod';
import { id, now } from './types.js';

export const skillSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  name: z.string(),
  description: z.string(),
  scope: z.enum(['global', 'project']),
  projectId: z.string().nullable(),
  triggers: z.array(z.string()),
  instructions: z.string().min(1),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  requiredTools: z.array(z.string()),
  requiredPermissions: z.array(z.string()),
  confirmationRequirements: z.array(z.string()),
  examples: z.array(z.string()),
  tests: z.array(
    z.object({
      input: z.string(),
      mustInclude: z.array(z.string()),
      mustNotInclude: z.array(z.string()),
    }),
  ),
  version: z.number().int().positive(),
  status: z.enum(['proposed', 'experimental', 'trusted', 'disabled']),
  createdBy: z.enum(['user', 'agent', 'import']),
  createdAt: z.string(),
  updatedAt: z.string(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  userCorrectionCount: z.number().int().nonnegative(),
  lastUsedAt: z.string().nullable(),
  parentVersionId: z.string().nullable(),
});
export type Skill = z.infer<typeof skillSchema>;
export type SkillEvaluation = {
  passed: number;
  failed: number;
  details: Array<{ input: string; passed: boolean; failures: string[] }>;
};

export class SkillRegistry {
  readonly versions = new Map<string, Skill>();
  create(
    input: Omit<
      Skill,
      | 'id'
      | 'familyId'
      | 'version'
      | 'createdAt'
      | 'updatedAt'
      | 'successCount'
      | 'failureCount'
      | 'userCorrectionCount'
      | 'lastUsedAt'
      | 'parentVersionId'
    >,
  ): Skill {
    const stamp = now();
    const skill = skillSchema.parse({
      ...input,
      id: id(),
      familyId: id(),
      version: 1,
      createdAt: stamp,
      updatedAt: stamp,
      successCount: 0,
      failureCount: 0,
      userCorrectionCount: 0,
      lastUsedAt: null,
      parentVersionId: null,
    });
    this.versions.set(skill.id, skill);
    return skill;
  }
  revise(
    parentId: string,
    changes: Partial<
      Pick<
        Skill,
        | 'description'
        | 'instructions'
        | 'triggers'
        | 'tests'
        | 'requiredTools'
        | 'requiredPermissions'
      >
    >,
  ): Skill {
    const parent = this.require(parentId);
    const skill = skillSchema.parse({
      ...parent,
      ...changes,
      id: id(),
      version: parent.version + 1,
      parentVersionId: parent.id,
      updatedAt: now(),
      status: 'proposed',
    });
    this.versions.set(skill.id, skill);
    return skill;
  }
  rollback(versionId: string): Skill {
    const target = this.require(versionId);
    const active = this.latest(target.familyId);
    const restored = skillSchema.parse({
      ...target,
      id: id(),
      version: active.version + 1,
      parentVersionId: active.id,
      status: target.status === 'disabled' ? 'experimental' : target.status,
      updatedAt: now(),
    });
    this.versions.set(restored.id, restored);
    return restored;
  }
  latest(familyId: string): Skill {
    const items = [...this.versions.values()]
      .filter((s) => s.familyId === familyId)
      .sort((a, b) => b.version - a.version);
    if (!items[0]) throw new Error('Skill family not found');
    return items[0];
  }
  evaluate(skill: Skill, run: (input: string, instructions: string) => string): SkillEvaluation {
    const details = skill.tests.map((test) => {
      const output = run(test.input, skill.instructions);
      const failures = [
        ...test.mustInclude.filter((x) => !output.includes(x)).map((x) => `Missing: ${x}`),
        ...test.mustNotInclude.filter((x) => output.includes(x)).map((x) => `Forbidden: ${x}`),
      ];
      return { input: test.input, passed: failures.length === 0, failures };
    });
    return {
      passed: details.filter((d) => d.passed).length,
      failed: details.filter((d) => !d.passed).length,
      details,
    };
  }
  private require(idValue: string): Skill {
    const value = this.versions.get(idValue);
    if (!value) throw new Error('Skill not found');
    return value;
  }
}
