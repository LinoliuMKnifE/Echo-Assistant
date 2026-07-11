import { readFileSync } from 'node:fs';

const root = JSON.parse(readFileSync('package.json', 'utf8')).version;
const versions = {
  root,
  desktopPackage: JSON.parse(readFileSync('apps/desktop/package.json', 'utf8')).version,
  tauri: JSON.parse(readFileSync('apps/desktop/src-tauri/tauri.conf.json', 'utf8')).version,
  cargo: readFileSync('apps/desktop/src-tauri/Cargo.toml', 'utf8').match(
    /^version\s*=\s*"([^"]+)"/m,
  )?.[1],
  firefoxPackage: JSON.parse(readFileSync('apps/firefox-extension/package.json', 'utf8')).version,
  firefoxManifest: JSON.parse(readFileSync('apps/firefox-extension/src/manifest.json', 'utf8'))
    .version,
};
const requested = (
  process.argv[2] ||
  process.env.RELEASE_VERSION ||
  process.env.GITHUB_REF_NAME ||
  ''
).replace(/^v/, '');
if (!requested) throw new Error('Pass v<version>, <version>, RELEASE_VERSION, or a release tag.');
for (const [name, version] of Object.entries(versions)) {
  if (version !== root)
    throw new Error(`${name} version ${version ?? '<missing>'} does not match root ${root}.`);
}
if (requested !== root)
  throw new Error(`Release ${requested} does not match package version ${root}.`);
console.log(root);
