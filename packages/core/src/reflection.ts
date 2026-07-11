import { z } from 'zod';

export const correctionObservationSchema = z.object({
  taskId: z.string().min(1),
  projectId: z.string().nullable(),
  skillFamilyId: z.string().min(1),
  before: z.string().min(1),
  after: z.string().min(1),
  accepted: z.boolean(),
  occurredAt: z.string().datetime(),
});
export type CorrectionObservation = z.infer<typeof correctionObservationSchema>;

export const skillRevisionProposalSchema = z.object({
  id: z.string(),
  skillFamilyId: z.string(),
  proposedSkillId: z.string(),
  projectId: z.string().nullable(),
  summary: z.string(),
  proposedInstructions: z.string(),
  evidence: z.array(
    z.object({ taskId: z.string(), before: z.string(), after: z.string(), occurredAt: z.string() }),
  ),
  requiresApproval: z.literal(true),
  status: z.enum(['proposed', 'approved', 'rejected']),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type SkillRevisionProposal = z.infer<typeof skillRevisionProposalSchema>;

export function detectCorrectionPattern(
  observations: CorrectionObservation[],
): { summary: string; instruction: string; evidence: SkillRevisionProposal['evidence'] } | null {
  const accepted = observations.filter((item) => item.accepted).slice(-5);
  if (accepted.length < 3) return null;
  const shorter = accepted.filter((item) => wordCount(item.after) < wordCount(item.before) * 0.8);
  const lessApologetic = accepted.filter(
    (item) => apologyCount(item.after) < apologyCount(item.before),
  );
  const instructions: string[] = [];
  const summaries: string[] = [];
  if (shorter.length >= 3) {
    instructions.push('Keep replies concise and remove unnecessary detail.');
    summaries.push('shorter replies');
  }
  if (lessApologetic.length >= 3) {
    instructions.push('Use direct, courteous language without excessive apology.');
    summaries.push('less apologetic wording');
  }
  if (!instructions.length) return null;
  return {
    summary: `Repeated accepted edits favor ${summaries.join(' and ')}.`,
    instruction: instructions.join(' '),
    evidence: accepted.map(({ taskId, before, after, occurredAt }) => ({
      taskId,
      before,
      after,
      occurredAt,
    })),
  };
}

const wordCount = (value: string): number => value.trim().split(/\s+/).filter(Boolean).length;
const apologyCount = (value: string): number =>
  value.match(/\b(?:sorry|apolog(?:y|ize|ise|etic)|regret)\b/gi)?.length ?? 0;
