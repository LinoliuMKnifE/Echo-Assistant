#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { once } from 'node:events';

const ADDON_ID = 'luma-local-assistant@luma.local';
const EXTENSION_HOST = '01234567-89ab-cdef-0123-456789abcdef';
const MARKER = `echo-firefox-release-${Date.now()}`;

function fail(message) {
  throw new Error(message);
}

function argumentsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (
      !['--xpi', '--sidecar', '--pairing-token', '--firefox', '--geckodriver'].includes(key) ||
      !argv[index + 1]
    )
      fail(
        `Usage: ${basename(process.argv[1])} --xpi <signed.xpi> (--sidecar <executable> | --pairing-token <token>) [--firefox <executable>] [--geckodriver <executable>]`,
      );
    result[key.slice(2)] = argv[index + 1];
  }
  if (!result.xpi || Boolean(result.sidecar) === Boolean(result['pairing-token']))
    fail('--xpi and exactly one of --sidecar or --pairing-token are required');
  result.xpi = resolve(result.xpi);
  if (result.sidecar) result.sidecar = resolve(result.sidecar);
  return result;
}

function zipEntries(buffer) {
  const endStart = Math.max(0, buffer.length - 65_557);
  let end = -1;
  for (let offset = buffer.length - 22; offset >= endStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) fail('XPI is not a valid ZIP archive');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const names = new Set();
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) fail('XPI central directory is malformed');
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.add(
      buffer
        .subarray(offset + 46, offset + 46 + nameLength)
        .toString('utf8')
        .toLowerCase(),
    );
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

async function assertAmoSigned(xpi) {
  const entries = zipEntries(await readFile(xpi));
  for (const required of ['meta-inf/manifest.mf', 'meta-inf/mozilla.sf', 'meta-inf/mozilla.rsa']) {
    if (!entries.has(required)) fail(`XPI is not AMO-signed: missing ${required}`);
  }
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function request(url, method = 'GET', body, headers = {}) {
  const response = await globalThis.fetch(url, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) fail(`${method} ${url} failed (${response.status}): ${text}`);
  return data;
}

async function waitFor(url, child, label, headers) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`${label} exited with code ${child.exitCode}`);
    try {
      return await request(url, 'GET', undefined, headers);
    } catch {
      await new Promise((done) => globalThis.setTimeout(done, 100));
    }
  }
  fail(`${label} did not become ready`);
}

async function waitForDesktop() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      await globalThis.fetch('http://127.0.0.1:43117/v1/extension/request');
      return;
    } catch {
      await new Promise((done) => globalThis.setTimeout(done, 100));
    }
  }
  fail('installed Echo desktop did not expose its extension listener');
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    once(child, 'exit'),
    new Promise((done) => globalThis.setTimeout(done, 3_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

const args = argumentsFrom(process.argv.slice(2));
const root = await mkdtemp(join(tmpdir(), 'echo-firefox-release-'));
const fixture = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><title>Echo release fixture</title><p id="marker">${MARKER}</p>`);
});
let sidecar;
let geckodriver;
let sessionId;
let geckoUrl;

try {
  await assertAmoSigned(args.xpi);
  const fixturePort = await listen(fixture);
  const token = args['pairing-token'] ?? 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
  if (args.sidecar) {
    sidecar = spawn(args.sidecar, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    sidecar.stdin.end(
      `${JSON.stringify({
        token: 'firefox-release-renderer-token',
        databasePath: join(root, 'echo.db'),
        dataDirectory: join(root, 'data'),
        pairingToken: token,
      })}\n`,
    );
    await waitFor('http://127.0.0.1:43117/app/v1/health', sidecar, 'sidecar', {
      authorization: 'Bearer firefox-release-renderer-token',
    });
  } else {
    await waitForDesktop();
  }

  const portServer = createServer();
  const geckoPort = await listen(portServer);
  await new Promise((done) => portServer.close(done));
  geckoUrl = `http://127.0.0.1:${geckoPort}`;
  geckodriver = spawn(args.geckodriver ?? 'geckodriver', ['--port', String(geckoPort)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  await waitFor(`${geckoUrl}/status`, geckodriver, 'geckodriver');

  const prefs = {
    'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: EXTENSION_HOST }),
    'browser.shell.checkDefaultBrowser': false,
    'browser.startup.homepage_override.mstone': 'ignore',
  };
  const firefoxOptions = { args: ['-headless'], prefs };
  if (args.firefox) firefoxOptions.binary = args.firefox;
  const created = await request(`${geckoUrl}/session`, 'POST', {
    capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': firefoxOptions } },
  });
  sessionId = created.value.sessionId ?? created.sessionId;
  if (!sessionId) fail('geckodriver did not return a session id');
  const wd = `${geckoUrl}/session/${sessionId}`;
  const installed = await request(`${wd}/moz/addon/install`, 'POST', {
    path: isAbsolute(args.xpi) ? args.xpi : resolve(args.xpi),
    temporary: false,
  });
  if ((installed.value ?? installed) !== ADDON_ID)
    fail(`Installed unexpected add-on id: ${JSON.stringify(installed.value ?? installed)}`);

  await request(`${wd}/url`, 'POST', { url: `moz-extension://${EXTENSION_HOST}/popup.html` });
  const result = await request(`${wd}/execute/async`, 'POST', {
    script: `const done = arguments[arguments.length - 1];
      (async () => {
        const pair = await browser.runtime.sendMessage({ type: 'pair', token: ${JSON.stringify(token)} });
        if (!pair?.ok) throw new Error(pair?.error || 'Pairing failed');
        const tab = await browser.tabs.create({ url: ${JSON.stringify(`http://127.0.0.1:${fixturePort}/`)}, active: true });
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Fixture page did not load')), 10000);
          const listener = (id, change) => {
            if (id === tab.id && change.status === 'complete') {
              clearTimeout(timeout); browser.tabs.onUpdated.removeListener(listener); resolve();
            }
          };
          browser.tabs.onUpdated.addListener(listener);
        });
        await browser.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
          const range = document.createRange(); range.selectNodeContents(document.querySelector('#marker'));
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }});
        const shared = await browser.runtime.sendMessage({ type: 'share', mode: 'selected_text' });
        done(shared);
      })().catch((error) => done({ ok: false, error: String(error?.stack || error) }));`,
    args: [],
  });
  const value = result.value ?? result;
  if (!value?.ok) fail(`Extension round trip failed: ${value?.error ?? JSON.stringify(value)}`);
  if (typeof value.data?.answer !== 'string' || !value.data.answer.trim())
    fail('Extension returned no answer');
  if (value.data.untrustedContextHandled !== true)
    fail('Extension did not confirm untrusted context handling');
  console.log(`Firefox release probe passed: ${value.data.answer}`);
} finally {
  if (sessionId && geckoUrl)
    await request(`${geckoUrl}/session/${sessionId}`, 'DELETE').catch(() => {});
  await stop(geckodriver);
  await stop(sidecar);
  if (fixture.listening) await new Promise((done) => fixture.close(done));
  await rm(root, { recursive: true, force: true });
}
