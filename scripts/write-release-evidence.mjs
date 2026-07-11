import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const platform = process.argv[2];
const paths = process.argv.slice(3);
if (!platform || !paths.length)
  throw new Error('Usage: node scripts/write-release-evidence.mjs <platform> <artifact...>');
if (!['windows', 'macos', 'firefox'].includes(platform))
  throw new Error('Platform must be windows, macos, or firefox.');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(process.env.RELEASE_VERSION || ''))
  throw new Error('RELEASE_VERSION must be an explicit semantic version.');
if (!process.env.GITHUB_SHA) throw new Error('GITHUB_SHA is required.');
if (process.env.RELEASE_VERIFICATION_STATUS !== 'verified')
  throw new Error(
    'RELEASE_VERIFICATION_STATUS=verified is required after all release checks pass.',
  );
if (process.env.RELEASE_SIGNATURE_STATUS !== 'verified')
  throw new Error('RELEASE_SIGNATURE_STATUS=verified is required after artifact signatures pass.');
const qualityGates = (process.env.RELEASE_GATES || '').split(',').filter(Boolean);
if (!qualityGates.length) throw new Error('RELEASE_GATES must list the checks that passed.');
const artifacts = paths.map((path) => ({
  name: basename(path),
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  signatureStatus: 'verified',
}));
const evidence = {
  schemaVersion: 1,
  product: 'Echo',
  version: process.env.RELEASE_VERSION,
  platform,
  commit: process.env.GITHUB_SHA,
  tag: process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : null,
  run:
    process.env.GITHUB_SERVER_URL &&
    `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  generatedAt: new Date().toISOString(),
  verificationStatus: 'verified',
  qualityGates,
  migration: process.env.RELEASE_MIGRATION || 'not-applicable',
  artifacts,
};
writeFileSync('RELEASE_EVIDENCE.json', `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(
  'RELEASE_EVIDENCE.md',
  `# Echo release evidence\n\n- Version: ${evidence.version}\n- Platform: ${platform}\n- Commit: \`${evidence.commit}\`\n- Tag: ${evidence.tag ?? 'manual dispatch'}\n- Generated: ${evidence.generatedAt}\n- Verification: ${evidence.verificationStatus}\n- Migration: ${evidence.migration}\n\n## Gates\n\n${evidence.qualityGates.map((gate) => `- ${gate}`).join('\n')}\n\n## Artifacts\n\n${artifacts.map((artifact) => `- \`${artifact.name}\`: \`${artifact.sha256}\` (signature: ${artifact.signatureStatus})`).join('\n')}\n`,
);
