import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildAuthorizationUrl,
  queryPeriod,
  redact,
  siteSlug,
} from './gsc.mjs';

const scriptPath = fileURLToPath(new URL('./gsc.mjs', import.meta.url));
const fetchMockPath = fileURLToPath(new URL('./gsc.fetch-mock.mjs', import.meta.url));
const repositoryRoot = path.resolve(path.dirname(scriptPath), '../../..');

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('authorization URL uses the read-only scope and loopback redirect', () => {
  const url = buildAuthorizationUrl(
    {
      client_id: 'mock-client-id',
      auth_uri: 'https://accounts.google.com/o/oauth2/v2/auth',
    },
    {
      redirectUri: 'http://127.0.0.1:43210',
      state: 'mock-state',
      challenge: 'mock-challenge',
    }
  );

  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/webmasters.readonly');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:43210');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.throws(
    () => buildAuthorizationUrl(
      { client_id: 'mock-client-id', auth_uri: 'https://accounts.google.com/o/oauth2/v2/auth' },
      { redirectUri: 'https://example.com/callback', state: 'state', challenge: 'challenge' }
    ),
    /loopback IPv4/
  );
});

test('Pacific-time defaults remain stable across UTC and DST boundaries', () => {
  assert.deepEqual(queryPeriod({}, new Date('2026-03-09T06:30:00.000Z')), {
    startDate: '2026-02-06',
    endDate: '2026-03-05',
  });
  assert.deepEqual(
    queryPeriod({ days: '7', 'end-date': '2026-07-10' }, new Date('2026-07-24T18:00:00.000Z')),
    { startDate: '2026-07-04', endDate: '2026-07-10' }
  );
});

test('property storage keys and error messages do not leak secrets', () => {
  assert.equal(siteSlug('sc-domain:example.com'), 'sc-domain_example.com');
  assert.equal(siteSlug('https://www.example.com/path/'), 'www.example.com_path');
  assert.equal(
    redact('request failed for mock-secret and mock-secret%2Fvalue', [
      'mock-secret',
      'mock-secret/value',
    ]),
    'request failed for [REDACTED] and [REDACTED]'
  );
});

test('CLI refreshes tokens, preserves properties, paginates, and redacts snapshots', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'gsc-skill-'));
  const configDirectory = path.join(temporary, 'config');
  const dataDirectory = path.join(temporary, 'data');
  const clientFile = path.join(configDirectory, 'oauth-client.json');
  const tokenFile = path.join(configDirectory, 'token.json');
  const environment = {
    GSC_CONFIG_DIR: configDirectory,
    GSC_DATA_DIR: dataDirectory,
    NODE_OPTIONS: `--import=${pathToFileURL(fetchMockPath).href}`,
  };

  try {
    const doctorResult = await runCli(['doctor'], environment);
    assert.equal(doctorResult.code, 0, doctorResult.stderr);
    const doctor = JSON.parse(doctorResult.stdout);
    assert.equal(doctor.ready, false);
    assert.deepEqual(doctor.blockers.map((blocker) => blocker.code), [
      'oauth-client-not-ready',
      'oauth-token-not-ready',
    ]);
    assert.equal(doctor.setupGuide, 'references/oauth-setup.md');

    await mkdir(configDirectory, { recursive: true });
    await writeFile(
      clientFile,
      `${JSON.stringify({
        installed: {
          client_id: 'mock-client-id',
          client_secret: 'mock-client-secret',
          auth_uri: 'https://accounts.google.com/o/oauth2/v2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        },
      })}\n`,
      { mode: 0o600 }
    );
    await writeFile(
      tokenFile,
      `${JSON.stringify({
        access_token: 'mock-expired-access-token',
        refresh_token: 'mock-initial-refresh-token',
        expires_at: 1,
      })}\n`,
      { mode: 0o600 }
    );
    await chmod(clientFile, 0o600);
    await chmod(tokenFile, 0o600);

    const sitesResult = await runCli(['sites'], environment);
    assert.equal(sitesResult.code, 0, sitesResult.stderr);
    const sites = JSON.parse(sitesResult.stdout).sites;
    assert.deepEqual(sites.map((site) => site.siteUrl), [
      'https://www.example.com/',
      'sc-domain:example.com',
    ]);
    assert.equal(sitesResult.stdout.includes('mock-fresh-access-token'), false);
    assert.equal((await stat(tokenFile)).mode & 0o777, 0o600);

    const snapshotResult = await runCli(
      [
        'snapshot',
        '--site',
        'sc-domain:example.com',
        '--start-date',
        '2026-07-01',
        '--end-date',
        '2026-07-28',
        '--datasets',
        'summary,query',
        '--row-limit',
        '2',
        '--max-rows',
        '3',
      ],
      environment
    );
    assert.equal(snapshotResult.code, 0, snapshotResult.stderr);
    const summary = JSON.parse(snapshotResult.stdout);
    assert.equal(summary.property, 'sc-domain:example.com');
    assert.equal(summary.datasets.summary.rowCount, 1);
    assert.equal(summary.datasets.summary.dataCompleteness, 'aggregate');
    assert.equal(summary.datasets.query.rowCount, 3);
    assert.equal(summary.datasets.query.pagesFetched, 2);
    assert.equal(summary.datasets.query.truncated, true);
    assert.equal(summary.datasets.query.dataCompleteness, 'top-rows');

    const snapshotText = await readFile(summary.path, 'utf8');
    const snapshot = JSON.parse(snapshotText);
    assert.equal(snapshot.property, 'sc-domain:example.com');
    assert.equal(snapshot.datasets.query.rows[2].query, 'gamma');
    for (const secret of [
      'mock-client-secret',
      'mock-fresh-access-token',
      'mock-initial-refresh-token',
    ]) {
      assert.equal(snapshotText.includes(secret), false);
      assert.equal(snapshotResult.stdout.includes(secret), false);
    }

    const unsafeOutput = path.join(repositoryRoot, 'unsafe-gsc-output.json');
    const unsafeResult = await runCli(
      [
        'query',
        '--site',
        'https://www.example.com/',
        '--dimensions',
        'summary',
        '--start-date',
        '2026-07-01',
        '--end-date',
        '2026-07-28',
        '--output',
        unsafeOutput,
      ],
      environment
    );
    assert.equal(unsafeResult.code, 1);
    assert.match(unsafeResult.stderr, /must stay outside Git repositories/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
