#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API_BASE = 'https://www.googleapis.com/webmasters/v3';
const PACIFIC_TIME_ZONE = 'America/Los_Angeles';
const TRUSTED_AUTH_URIS = new Set([
  'https://accounts.google.com/o/oauth2/auth',
  'https://accounts.google.com/o/oauth2/v2/auth',
]);
const TRUSTED_TOKEN_URIS = new Set([
  'https://accounts.google.com/o/oauth2/token',
  'https://oauth2.googleapis.com/token',
]);
const CONFIG_DIR = process.env.GSC_CONFIG_DIR || path.join(homedir(), '.config', 'codex-gsc');
const DATA_DIR = process.env.GSC_DATA_DIR || path.join(homedir(), '.local', 'share', 'codex-gsc');
const CLIENT_FILE = process.env.GSC_OAUTH_CLIENT_FILE || path.join(CONFIG_DIR, 'oauth-client.json');
const TOKEN_FILE = process.env.GSC_TOKEN_FILE || path.join(CONFIG_DIR, 'token.json');
const ALIASES_FILE = process.env.GSC_ALIASES_FILE || path.join(CONFIG_DIR, 'sites.json');

export function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {};
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const equalsAt = value.indexOf('=');
    if (equalsAt !== -1) {
      options[value.slice(2, equalsAt)] = value.slice(equalsAt + 1);
      continue;
    }
    const key = value.slice(2);
    const next = rest[index + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return { command, options, positional };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(file, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${file}`);
    throw error;
  }
}

async function findRepositoryRoot(file) {
  let current = path.dirname(path.resolve(file));
  while (true) {
    try {
      await stat(path.join(current, '.git'));
      return current;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function assertOutsideRepository(file, label) {
  const repositoryRoot = await findRepositoryRoot(file);
  if (repositoryRoot) {
    throw new Error(`${label} must stay outside Git repositories. Move ${file} outside ${repositoryRoot}.`);
  }
}

async function assertPrivateFile(file, label) {
  const details = await stat(file);
  if (process.platform !== 'win32' && (details.mode & 0o077) !== 0) {
    throw new Error(`${label} is readable by other users. Restrict it to mode 600: ${file}`);
  }
  await assertOutsideRepository(file, label);
}

async function readSensitiveJson(file, { optional = false, label = 'Sensitive file' } = {}) {
  try {
    await assertPrivateFile(file, label);
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null;
    throw error;
  }
  return readJson(file);
}

async function secureWriteJson(file, value) {
  await assertOutsideRepository(file, 'Sensitive GSC data');
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
}

async function loadClient() {
  const document = await readSensitiveJson(CLIENT_FILE, { label: 'OAuth client file' });
  if (!document.installed) {
    throw new Error(`Expected a Desktop/Installed OAuth client in ${CLIENT_FILE}`);
  }
  const client = document.installed;
  for (const field of ['client_id', 'client_secret', 'auth_uri', 'token_uri']) {
    if (!client[field]) throw new Error(`OAuth client is missing installed.${field}`);
  }
  if (!TRUSTED_AUTH_URIS.has(client.auth_uri)) {
    throw new Error(`OAuth client uses an untrusted authorization endpoint: ${client.auth_uri}`);
  }
  if (!TRUSTED_TOKEN_URIS.has(client.token_uri)) {
    throw new Error(`OAuth client uses an untrusted token endpoint: ${client.token_uri}`);
  }
  return client;
}

function base64Url(buffer) {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function redact(message, values) {
  return [...new Set(values
    .filter((value) => typeof value === 'string' && value.length >= 4)
    .flatMap((value) => [value, encodeURIComponent(value)]))]
    .sort((left, right) => right.length - left.length)
    .reduce(
      (redacted, value) => redacted.split(value).join('[REDACTED]'),
      String(message || '')
    );
}

async function postForm(url, values) {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 1000) };
  }
  if (!response.ok) {
    const detail = body.error_description || body.error || body.raw || 'unknown error';
    throw new Error(
      `OAuth token endpoint returned ${response.status}: ${redact(detail, [
        values.client_secret,
        values.code,
        values.refresh_token,
      ])}`
    );
  }
  return body;
}

async function saveToken(token, previous = {}) {
  const merged = {
    ...previous,
    ...token,
    refresh_token: token.refresh_token || previous.refresh_token,
    scope: token.scope || previous.scope || SCOPE,
    obtained_at: new Date().toISOString(),
    expires_at: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : previous.expires_at,
  };
  delete merged.expires_in;
  await secureWriteJson(TOKEN_FILE, merged);
  return merged;
}

async function getAccessToken({ forceRefresh = false } = {}) {
  const token = await readSensitiveJson(TOKEN_FILE, { optional: true, label: 'OAuth token file' });
  if (!token?.refresh_token) {
    throw new Error(`No authorized refresh token found at ${TOKEN_FILE}. Run the auth command interactively.`);
  }
  if (!forceRefresh && token.access_token && Number(token.expires_at) > Date.now() + 90_000) {
    return token.access_token;
  }
  const client = await loadClient();
  const refreshed = await postForm(client.token_uri, {
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token',
  });
  return (await saveToken(refreshed, token)).access_token;
}

export function buildAuthorizationUrl(client, {
  redirectUri,
  state,
  challenge,
}) {
  if (!redirectUri?.startsWith('http://127.0.0.1:')) {
    throw new Error('OAuth redirect URI must use a loopback IPv4 address');
  }
  const authUrl = new URL(client.auth_uri);
  authUrl.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return authUrl;
}

async function apiRequest(url, init = {}, allowRetry = true) {
  const accessToken = await getAccessToken({ forceRefresh: !allowRetry });
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (response.status === 401 && allowRetry) return apiRequest(url, init, false);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 1500) };
  }
  if (!response.ok) {
    const detail = body?.error?.message || body?.error_description || body?.raw || 'unknown error';
    throw new Error(
      `Search Console API returned ${response.status}: ${redact(detail, [accessToken])}`
    );
  }
  return body;
}

function openBrowser(url) {
  if (process.platform === 'darwin') {
    const child = spawn('/usr/bin/open', [url], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }
  const command = process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

async function authorize({ noOpen = false } = {}) {
  const client = await loadClient();
  const state = base64Url(randomBytes(24));
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());

  let finish;
  let fail;
  const callback = new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname !== '/') {
      response.writeHead(404).end('Not found');
      return;
    }
    if (requestUrl.searchParams.get('state') !== state) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('OAuth state mismatch. Return to Codex and retry.');
      fail(new Error('OAuth state mismatch'));
      return;
    }
    const oauthError = requestUrl.searchParams.get('error');
    if (oauthError) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end(`Authorization failed: ${oauthError}`);
      fail(new Error(`Google authorization failed: ${oauthError}`));
      return;
    }
    const code = requestUrl.searchParams.get('code');
    if (!code) {
      response.writeHead(400).end('Missing authorization code');
      fail(new Error('OAuth callback did not include an authorization code'));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><meta charset="utf-8"><title>Authorized</title><p>Google Search Console authorization received. You can close this tab and return to Codex.</p>');
    finish(code);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const redirectUri = `http://127.0.0.1:${address.port}`;
  const authUrl = buildAuthorizationUrl(client, {
    redirectUri,
    state,
    challenge,
  });

  process.stderr.write(`Authorize Google Search Console in your browser:\n${authUrl}\n`);
  if (!noOpen) openBrowser(authUrl);
  const timeout = setTimeout(() => fail(new Error('OAuth authorization timed out after 10 minutes')), 10 * 60 * 1000);
  try {
    const code = await callback;
    const token = await postForm(client.token_uri, {
      client_id: client.client_id,
      client_secret: client.client_secret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    if (!token.refresh_token) {
      throw new Error('Google did not return a refresh token. Revoke the prior grant and retry with consent.');
    }
    await saveToken(token);
    return {
      authorized: true,
      scope: token.scope || SCOPE,
      tokenFile: TOKEN_FILE,
      expiresAt: new Date(Date.now() + Number(token.expires_in || 0) * 1000).toISOString(),
    };
  } finally {
    clearTimeout(timeout);
    server.close();
  }
}

export function pacificDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function shiftDate(dateText, deltaDays) {
  const [year, month, day] = dateText.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return value.toISOString().slice(0, 10);
}

function defaultEndDate(endLag, now = new Date()) {
  const parts = pacificDateParts(now);
  return shiftDate(`${parts.year}-${parts.month}-${parts.day}`, -endLag);
}

function positiveInteger(value, fallback, label) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

export function parseDimensions(value) {
  if (!value || value === 'none' || value === 'summary') return [];
  const dimensions = value.split(',').map((item) => item.trim()).filter(Boolean);
  const allowed = new Set(['date', 'hour', 'country', 'device', 'page', 'query', 'searchAppearance']);
  for (const dimension of dimensions) {
    if (!allowed.has(dimension)) throw new Error(`Unsupported dimension: ${dimension}`);
  }
  return dimensions;
}

async function resolveSite(value) {
  if (!value) throw new Error('Missing --site. Use an exact property identifier or a configured alias.');
  if (value.startsWith('sc-domain:') || value.startsWith('http://') || value.startsWith('https://')) return value;
  const document = await readSensitiveJson(ALIASES_FILE, { optional: true, label: 'Site aliases file' });
  const resolved = document?.aliases?.[value];
  if (!resolved) throw new Error(`Unknown site alias: ${value}. Run sites, then add it with the alias command.`);
  return resolved;
}

export function queryPeriod(options, now = new Date()) {
  const days = positiveInteger(options.days, 28, '--days');
  const endLag = positiveInteger(options['end-lag'], 3, '--end-lag');
  const endDate = options['end-date'] || defaultEndDate(endLag, now);
  const startDate = options['start-date'] || shiftDate(endDate, -(days - 1));
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/u.test(endDate)) {
    throw new Error('Dates must use YYYY-MM-DD');
  }
  if (startDate > endDate) throw new Error('Start date must not be after end date');
  return { startDate, endDate };
}

async function runQuery(site, options, dimensions) {
  const period = queryPeriod(options);
  const searchType = options.type || 'web';
  const dataState = options['data-state'] || 'final';
  const rowLimit = Math.min(25_000, positiveInteger(options['row-limit'], 25_000, '--row-limit'));
  const maxRows = positiveInteger(options['max-rows'], 50_000, '--max-rows');
  const rows = [];
  let startRow = 0;
  let pagesFetched = 0;
  let responseAggregationType = null;
  let apiMetadata = null;
  let lastRequested = 0;
  let lastReturned = 0;

  while (rows.length < maxRows) {
    const requestRows = Math.min(rowLimit, maxRows - rows.length);
    const requestBody = {
      ...period,
      type: searchType,
      dataState,
      dimensions,
      aggregationType: 'auto',
      rowLimit: requestRows,
      startRow,
    };
    const response = await apiRequest(`${API_BASE}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
    pagesFetched += 1;
    responseAggregationType = response.responseAggregationType || responseAggregationType;
    apiMetadata = response.metadata || apiMetadata;
    const batch = response.rows || [];
    lastRequested = requestRows;
    lastReturned = batch.length;
    for (const row of batch) {
      const normalized = {};
      dimensions.forEach((dimension, index) => {
        normalized[dimension] = row.keys?.[index] ?? null;
      });
      normalized.clicks = Number(row.clicks || 0);
      normalized.impressions = Number(row.impressions || 0);
      normalized.ctr = Number(row.ctr || 0);
      normalized.position = Number(row.position || 0);
      rows.push(normalized);
    }
    if (batch.length < requestRows) break;
    startRow += batch.length;
  }

  return {
    dimensions,
    rowCount: rows.length,
    pagesFetched,
    truncated: rows.length >= maxRows && lastReturned === lastRequested,
    dataCompleteness: dimensions.some((dimension) => dimension === 'query' || dimension === 'page') ? 'top-rows' : 'aggregate',
    responseAggregationType,
    apiMetadata,
    rows,
  };
}

export function siteSlug(site) {
  return site.replace(/^https?:\/\//u, '').replace(/[^a-zA-Z0-9._-]+/gu, '_').replace(/^_+|_+$/gu, '') || 'property';
}

async function createSnapshot(site, options) {
  const presets = {
    summary: [],
    date: ['date'],
    query: ['query'],
    page: ['page'],
    'query-page': ['query', 'page'],
  };
  const requested = (options.datasets || 'summary,date,query,page,query-page').split(',').map((item) => item.trim()).filter(Boolean);
  for (const name of requested) {
    if (!presets[name]) throw new Error(`Unknown snapshot dataset: ${name}`);
  }
  const datasets = {};
  for (const name of requested) {
    datasets[name] = await runQuery(site, options, presets[name]);
  }
  const fetchedAt = new Date().toISOString();
  const period = queryPeriod(options);
  const snapshot = {
    schemaVersion: 1,
    source: 'google-search-console-api',
    fetchedAt,
    property: site,
    searchType: options.type || 'web',
    dataState: options['data-state'] || 'final',
    period,
    datasets,
  };
  const directory = path.join(DATA_DIR, 'snapshots', siteSlug(site));
  const filename = `${period.endDate}_${fetchedAt.replaceAll(':', '-').replace(/\.\d{3}Z$/u, 'Z')}.json`;
  const output = options.output ? path.resolve(options.output) : path.join(directory, filename);
  await secureWriteJson(output, snapshot);
  const summary = {
    source: snapshot.source,
    fetchedAt,
    property: site,
    searchType: snapshot.searchType,
    dataState: snapshot.dataState,
    period,
    path: output,
    datasets: Object.fromEntries(Object.entries(datasets).map(([name, value]) => [name, {
      rowCount: value.rowCount,
      pagesFetched: value.pagesFetched,
      truncated: value.truncated,
      dataCompleteness: value.dataCompleteness,
    }])),
  };
  await secureWriteJson(path.join(directory, 'latest.json'), summary);
  return summary;
}

async function listSites() {
  const body = await apiRequest(`${API_BASE}/sites`);
  return (body.siteEntry || []).map((entry) => ({
    siteUrl: entry.siteUrl,
    permissionLevel: entry.permissionLevel,
  })).sort((left, right) => left.siteUrl.localeCompare(right.siteUrl));
}

async function saveAlias(name, site) {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(name)) throw new Error('Alias names must use lowercase letters, digits, dots, underscores, or hyphens');
  if (!(site.startsWith('sc-domain:') || site.startsWith('http://') || site.startsWith('https://'))) {
    throw new Error('Alias target must be an exact Domain or URL-prefix property identifier');
  }
  const current = await readSensitiveJson(ALIASES_FILE, { optional: true, label: 'Site aliases file' }) || { aliases: {} };
  current.aliases = { ...(current.aliases || {}), [name]: site };
  await secureWriteJson(ALIASES_FILE, current);
  return { alias: name, site, aliasesFile: ALIASES_FILE };
}

async function fileStatus(file) {
  const repositoryRoot = await findRepositoryRoot(file);
  try {
    const details = await stat(file);
    return {
      present: true,
      mode: (details.mode & 0o777).toString(8).padStart(3, '0'),
      ownerOnly: process.platform === 'win32' ? null : (details.mode & 0o077) === 0,
      repositoryRoot,
      modifiedAt: details.mtime.toISOString(),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { present: false, repositoryRoot };
    throw error;
  }
}

async function doctor() {
  const clientStatus = await fileStatus(CLIENT_FILE);
  const tokenStatus = await fileStatus(TOKEN_FILE);
  const aliasesStatus = await fileStatus(ALIASES_FILE);
  const warnings = [];
  let clientType = null;
  let trustedEndpoints = null;
  let tokenExpiresAt = null;
  let hasRefreshToken = false;
  const clientSafe = clientStatus.present && clientStatus.ownerOnly !== false && !clientStatus.repositoryRoot;
  const tokenSafe = tokenStatus.present && tokenStatus.ownerOnly !== false && !tokenStatus.repositoryRoot;
  for (const [label, status] of [
    ['OAuth client file', clientStatus],
    ['OAuth token file', tokenStatus],
    ['Site aliases file', aliasesStatus],
  ]) {
    if (status.ownerOnly === false) warnings.push(`${label} must use owner-only permissions (mode 600).`);
    if (status.repositoryRoot) warnings.push(`${label} must stay outside Git repositories.`);
  }
  if (clientSafe) {
    const client = await readJson(CLIENT_FILE);
    clientType = client.installed ? 'installed' : client.web ? 'web' : 'unknown';
    trustedEndpoints = Boolean(
      client.installed
      && TRUSTED_AUTH_URIS.has(client.installed.auth_uri)
      && TRUSTED_TOKEN_URIS.has(client.installed.token_uri),
    );
    if (!trustedEndpoints) warnings.push('OAuth client must use Google\'s trusted authorization and token endpoints.');
  }
  if (tokenSafe) {
    const token = await readJson(TOKEN_FILE);
    tokenExpiresAt = token.expires_at ? new Date(Number(token.expires_at)).toISOString() : null;
    hasRefreshToken = Boolean(token.refresh_token);
  }
  const ready = clientSafe && tokenSafe && clientType === 'installed' && trustedEndpoints && hasRefreshToken;
  const blockers = [];
  if (!clientSafe || clientType !== 'installed' || !trustedEndpoints) {
    blockers.push({
      code: 'oauth-client-not-ready',
      message: 'Create and install a user-owned Google Desktop OAuth client.',
    });
  }
  if (!tokenSafe || !hasRefreshToken) {
    blockers.push({
      code: 'oauth-token-not-ready',
      message: 'Complete interactive OAuth authorization to create a renewable token.',
    });
  }
  const nextActions = [];
  if (!ready) nextActions.push('Read references/oauth-setup.md and complete the user-owned credential steps.');
  if (warnings.length) nextActions.push('Resolve every warning before authorization or data access.');
  if (blockers.some((blocker) => blocker.code === 'oauth-token-not-ready')) {
    nextActions.push('Run auth interactively after the OAuth client is installed.');
  }
  if (!ready) nextActions.push('Run doctor again and require ready: true.');
  return {
    ready,
    warnings,
    blockers,
    nextActions,
    setupGuide: 'references/oauth-setup.md',
    configDirectory: CONFIG_DIR,
    clientFile: { path: CLIENT_FILE, ...clientStatus, clientType, trustedEndpoints },
    tokenFile: { path: TOKEN_FILE, ...tokenStatus, hasRefreshToken, accessTokenExpiresAt: tokenExpiresAt },
    aliasesFile: { path: ALIASES_FILE, ...aliasesStatus },
    dataDirectory: DATA_DIR,
    requiredScope: SCOPE,
  };
}

function help() {
  return `Google Search Console CLI\n\nCommands:\n  doctor\n  auth [--no-open]\n  refresh\n  sites\n  alias --name NAME --site EXACT_PROPERTY\n  query --site SITE [--dimensions query,page] [--days 28] [--end-lag 3]\n        [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD] [--type web]\n        [--data-state final] [--row-limit 25000] [--max-rows 50000]\n        [--output FILE | --stdout]\n  snapshot --site SITE [query flags] [--datasets summary,date,query,page,query-page] [--output FILE]\n  latest --site SITE\n\nSensitive credentials and GSC data must stay outside Git repositories.\nRaw query rows are suppressed unless --output or --stdout is provided.\n\nEnvironment overrides:\n  GSC_CONFIG_DIR, GSC_DATA_DIR, GSC_OAUTH_CLIENT_FILE, GSC_TOKEN_FILE, GSC_ALIASES_FILE\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(help());
      return;
    case 'doctor':
      printJson(await doctor());
      return;
    case 'auth':
      printJson(await authorize({ noOpen: Boolean(options['no-open']) }));
      return;
    case 'refresh': {
      await getAccessToken({ forceRefresh: true });
      const status = await doctor();
      printJson({
        refreshed: true,
        tokenFile: status.tokenFile.path,
        mode: status.tokenFile.mode,
        accessTokenExpiresAt: status.tokenFile.accessTokenExpiresAt,
      });
      return;
    }
    case 'sites':
      printJson({ sites: await listSites() });
      return;
    case 'alias':
      printJson(await saveAlias(options.name, options.site));
      return;
    case 'query': {
      const site = await resolveSite(options.site);
      if (options.output && options.stdout) throw new Error('Use either --output or --stdout, not both');
      const dimensions = parseDimensions(options.dimensions || 'query');
      const result = {
        schemaVersion: 1,
        source: 'google-search-console-api',
        fetchedAt: new Date().toISOString(),
        property: site,
        searchType: options.type || 'web',
        dataState: options['data-state'] || 'final',
        period: queryPeriod(options),
        result: await runQuery(site, options, dimensions),
      };
      if (options.output) {
        const output = path.resolve(options.output);
        await secureWriteJson(output, result);
        printJson({ ...result, result: { ...result.result, rows: undefined }, path: output });
      } else if (options.stdout) {
        printJson(result);
      } else {
        printJson({
          ...result,
          result: { ...result.result, rows: undefined },
          rawRowsSuppressed: true,
          next: 'Use --output with a path outside Git repositories, or --stdout to explicitly print raw rows.',
        });
      }
      return;
    }
    case 'snapshot': {
      const site = await resolveSite(options.site);
      printJson(await createSnapshot(site, options));
      return;
    }
    case 'latest': {
      const site = await resolveSite(options.site);
      const pointer = path.join(DATA_DIR, 'snapshots', siteSlug(site), 'latest.json');
      const latest = await readJson(pointer);
      printJson({ ...latest, pointer });
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}\n\n${help()}`);
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`gsc: ${error.message}\n`);
    process.exitCode = 1;
  });
}
