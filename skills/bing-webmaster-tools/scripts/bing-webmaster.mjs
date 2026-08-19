#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';

const API_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';
const CONFIG_DIR = process.env.BING_WEBMASTER_CONFIG_DIR || path.join(homedir(), '.config', 'codex-bing-webmaster');
const DATA_DIR = process.env.BING_WEBMASTER_DATA_DIR || path.join(homedir(), '.local', 'share', 'codex-bing-webmaster');
const CREDENTIALS_FILE = process.env.BING_WEBMASTER_CREDENTIALS_FILE || path.join(CONFIG_DIR, 'credentials.json');
const ALIASES_FILE = process.env.BING_WEBMASTER_ALIASES_FILE || path.join(CONFIG_DIR, 'sites.json');
const DEFAULT_DATASETS = ['summary', 'date', 'query', 'page', 'query-date', 'page-date', 'crawl', 'crawl-issues', 'feeds'];
const THROTTLE_CODES = new Set([4, 5, 17]);

function parseArgs(argv) {
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
  await assertOutsideRepository(file, 'Sensitive Bing Webmaster data');
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
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

function positiveInteger(value, fallback, label) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function dateText(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const milliseconds = Math.abs(value) > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(milliseconds);
    return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
  }
  const text = String(value);
  const dotNet = text.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/u);
  const parsed = dotNet ? new Date(Number(dotNet[1])) : new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function optionalDateText(value) {
  const parsed = dateText(value);
  return parsed && parsed < '1900-01-01' ? null : parsed;
}

function shiftDate(value, deltaDays) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) throw new Error('Dates must use YYYY-MM-DD');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + deltaDays));
  return date.toISOString().slice(0, 10);
}

function valueFor(object, ...names) {
  for (const name of names) {
    if (object?.[name] !== undefined && object?.[name] !== null) return object[name];
  }
  return null;
}

function numberFor(object, ...names) {
  const value = valueFor(object, ...names);
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positionFor(object, ...names) {
  const value = numberFor(object, ...names);
  return value !== null && value >= 0 ? value : null;
}

function integerFor(object, ...names) {
  const value = numberFor(object, ...names);
  return value === null ? null : Math.trunc(value);
}

function booleanFor(object, ...names) {
  const value = valueFor(object, ...names);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (['true', 'yes', '1'].includes(value.toLowerCase())) return true;
    if (['false', 'no', '0'].includes(value.toLowerCase())) return false;
  }
  return null;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function normalizeSite(row) {
  return {
    url: String(valueFor(row, 'Url', 'URL', 'url', 'SiteUrl', 'siteURL') || ''),
    isVerified: booleanFor(row, 'IsVerified', 'isVerified') || false,
  };
}

function normalizeTraffic(row) {
  const clicks = integerFor(row, 'Clicks', 'clicks') || 0;
  const impressions = integerFor(row, 'Impressions', 'impressions') || 0;
  return {
    date: dateText(valueFor(row, 'Date', 'date')),
    clicks,
    impressions,
    ctr: ratio(clicks, impressions),
  };
}

function normalizeQuery(row) {
  const clicks = integerFor(row, 'Clicks', 'clicks') || 0;
  const impressions = integerFor(row, 'Impressions', 'impressions') || 0;
  return {
    query: String(valueFor(row, 'Query', 'query') || ''),
    date: dateText(valueFor(row, 'Date', 'date')),
    clicks,
    impressions,
    ctr: ratio(clicks, impressions),
    avgImpressionPosition: positionFor(row, 'AvgImpressionPosition', 'avgImpressionPosition'),
    avgClickPosition: positionFor(row, 'AvgClickPosition', 'avgClickPosition'),
  };
}

function normalizePage(row) {
  const normalized = normalizeQuery(row);
  return {
    page: String(valueFor(row, 'Page', 'page', 'PageUrl', 'PageURL', 'pageURL', 'Query', 'query') || ''),
    date: normalized.date,
    clicks: normalized.clicks,
    impressions: normalized.impressions,
    ctr: normalized.ctr,
    avgImpressionPosition: normalized.avgImpressionPosition,
    avgClickPosition: normalized.avgClickPosition,
  };
}

function normalizeCrawl(row) {
  return {
    date: dateText(valueFor(row, 'Date', 'date')),
    crawledPages: integerFor(row, 'CrawledPages', 'crawledPages') || 0,
    inIndex: integerFor(row, 'InIndex', 'inIndex') || 0,
    crawlErrors: integerFor(row, 'CrawlErrors', 'crawlErrors') || 0,
    http2xx: integerFor(row, 'Code2xx', 'HttpStatus2xx', 'http2xx') || 0,
    http301: integerFor(row, 'Code301', 'HttpStatus301', 'http301') || 0,
    http302: integerFor(row, 'Code302', 'HttpStatus302', 'http302') || 0,
    http4xx: integerFor(row, 'Code4xx', 'HttpStatus4xx', 'http4xx') || 0,
    http5xx: integerFor(row, 'Code5xx', 'HttpStatus5xx', 'http5xx') || 0,
    allOtherCodes: integerFor(row, 'AllOtherCodes', 'allOtherCodes') || 0,
    blockedByRobots: integerFor(row, 'BlockedByRobotsTxt', 'blockedByRobotsTxt', 'blockedByRobots') || 0,
    connectionTimeout: integerFor(row, 'ConnectionTimeout', 'connectionTimeout') || 0,
    dnsFailures: integerFor(row, 'DnsFailures', 'DNSFailures', 'dnsFailures') || 0,
    malware: integerFor(row, 'ContainsMalware', 'Malware', 'malware') || 0,
    inLinks: integerFor(row, 'InLinks', 'inLinks') || 0,
  };
}

function normalizeCrawlIssue(row) {
  return {
    url: String(valueFor(row, 'Url', 'URL', 'url') || ''),
    type: String(valueFor(row, 'Issues', 'IssueType', 'issueType', 'type') ?? 'unknown'),
    httpStatus: integerFor(row, 'HttpCode', 'HttpStatus', 'httpStatus'),
    inLinks: integerFor(row, 'InLinks', 'inLinks') || 0,
    lastCrawledAt: optionalDateText(valueFor(row, 'LastCrawled', 'LastCrawledDate', 'lastCrawledAt')),
  };
}

function normalizeFeed(row) {
  return {
    url: String(valueFor(row, 'Url', 'URL', 'url') || ''),
    status: String(valueFor(row, 'Status', 'status') || 'Unknown'),
    type: valueFor(row, 'Type', 'feedType'),
    urlCount: integerFor(row, 'UrlCount', 'URLCount', 'urlCount') || 0,
    submittedAt: optionalDateText(valueFor(row, 'Submitted', 'SubmittedDate', 'submittedAt')),
    lastCrawledAt: optionalDateText(valueFor(row, 'LastCrawled', 'LastCrawledDate', 'lastCrawledAt')),
    fileSize: integerFor(row, 'FileSize', 'fileSize'),
    isCompressed: booleanFor(row, 'Compressed', 'IsCompressed', 'isCompressed') || false,
  };
}

function normalizeUrlInfo(row) {
  return {
    url: String(valueFor(row, 'Url', 'URL', 'url') || ''),
    discoveredAt: optionalDateText(valueFor(row, 'DiscoveryDate', 'DiscoveredDate', 'discoveredAt')),
    lastCrawledAt: optionalDateText(valueFor(row, 'LastCrawledDate', 'LastCrawled', 'lastCrawledAt')),
    httpStatus: integerFor(row, 'HttpStatus', 'HttpCode', 'httpStatus'),
    documentSize: integerFor(row, 'DocumentSize', 'documentSize'),
    inIndex: booleanFor(row, 'InIndex', 'inIndex'),
    isPage: booleanFor(row, 'IsPage', 'isPage'),
    anchorCount: integerFor(row, 'AnchorCount', 'anchorCount'),
    totalChildURLCount: integerFor(row, 'TotalChildUrlCount', 'TotalChildURLCount', 'totalChildURLCount'),
  };
}

function normalizeQuota(row) {
  return {
    dailyQuota: Math.max(0, integerFor(row, 'DailyQuota', 'dailyQuota') || 0),
    monthlyQuota: Math.max(0, integerFor(row, 'MonthlyQuota', 'monthlyQuota') || 0),
  };
}

const API_DATASETS = {
  traffic: { method: 'GetRankAndTrafficStats', normalize: normalizeTraffic, dimensions: ['date'], updateCadence: 'daily', dataCompleteness: 'aggregate' },
  queries: { method: 'GetQueryStats', normalize: normalizeQuery, dimensions: ['query', 'date'], updateCadence: 'weekly', dataCompleteness: 'top-rows' },
  pages: { method: 'GetPageStats', normalize: normalizePage, dimensions: ['page', 'date'], updateCadence: 'weekly', dataCompleteness: 'top-rows' },
  'query-pages': { method: 'GetQueryPageStats', normalize: normalizePage, dimensions: ['page', 'date'], updateCadence: 'weekly', dataCompleteness: 'candidate-drilldown', requiredOption: 'query' },
  'page-queries': { method: 'GetPageQueryStats', normalize: normalizeQuery, dimensions: ['query', 'date'], updateCadence: 'weekly', dataCompleteness: 'candidate-drilldown', requiredOption: 'page' },
  crawl: { method: 'GetCrawlStats', normalize: normalizeCrawl, dimensions: ['date'], updateCadence: 'daily', dataCompleteness: 'aggregate' },
  'crawl-issues': { method: 'GetCrawlIssues', normalize: normalizeCrawlIssue, dimensions: ['url', 'type'], updateCadence: 'service-defined', dataCompleteness: 'current-state' },
  feeds: { method: 'GetFeeds', normalize: normalizeFeed, dimensions: ['url'], updateCadence: 'service-defined', dataCompleteness: 'current-state' },
  'url-info': { method: 'GetUrlInfo', normalize: normalizeUrlInfo, dimensions: ['url'], updateCadence: 'service-defined', dataCompleteness: 'current-state', requiredOption: 'url' },
  quota: { method: 'GetUrlSubmissionQuota', normalize: normalizeQuota, dimensions: [], updateCadence: 'service-defined', dataCompleteness: 'current-state' },
};

class BingApiError extends Error {
  constructor(message, { status = null, code = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'BingApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function serviceError(body, status = null, retryAfter = null) {
  if (!body || typeof body !== 'object') return null;
  const candidates = [body.error, body.Error, body, body.d].filter((value) => value && typeof value === 'object' && !Array.isArray(value));
  for (const candidate of candidates) {
    const rawCode = valueFor(candidate, 'code', 'Code', 'ErrorCode');
    const rawMessage = valueFor(candidate, 'message', 'Message');
    if (rawCode !== null || rawMessage !== null) {
      const code = rawCode === null ? null : Number(rawCode);
      return new BingApiError(String(rawMessage || 'Bing Webmaster service error'), {
        status,
        code: Number.isFinite(code) ? code : rawCode,
        retryAfter,
      });
    }
  }
  return null;
}

async function loadApiKey() {
  const environmentKey = process.env.BING_WEBMASTER_API_KEY?.trim();
  if (environmentKey) return { apiKey: environmentKey, source: 'environment' };
  const document = await readSensitiveJson(CREDENTIALS_FILE, { optional: true, label: 'Bing Webmaster credentials file' });
  const apiKey = document?.apiKey?.trim();
  if (!apiKey) throw new Error(`No API key found. Run auth interactively or set BING_WEBMASTER_API_KEY.`);
  return { apiKey, source: 'credentials-file' };
}

function redactSecret(value, secret) {
  const text = String(value || 'unknown error');
  return secret ? text.replaceAll(secret, '[REDACTED]') : text;
}

function endpointUrl(method, apiKey, params = {}) {
  const url = new URL(`${API_BASE.replace(/\/$/u, '')}/${method}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  url.searchParams.set('apikey', apiKey);
  return url;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function apiRequest(method, params = {}, { attempts = 2 } = {}) {
  const { apiKey } = await loadApiKey();
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(endpointUrl(method, apiKey, params), {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json; charset=utf-8' },
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      let body;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new BingApiError(`Bing Webmaster ${method} returned non-JSON data`, { status: response.status });
      }
      const retryAfterHeader = Number(response.headers.get('retry-after'));
      const retryAfter = Number.isFinite(retryAfterHeader) ? retryAfterHeader : null;
      const apiError = serviceError(body, response.status, retryAfter);
      if (apiError) throw apiError;
      if (!response.ok) throw new BingApiError(`Bing Webmaster ${method} returned HTTP ${response.status}`, { status: response.status, retryAfter });
      if (!Object.hasOwn(body, 'd')) throw new BingApiError(`Bing Webmaster ${method} response is missing the WCF d wrapper`, { status: response.status });
      return body.d;
    } catch (error) {
      lastError = error;
      const retryable = error?.name === 'TimeoutError'
        || error?.name === 'AbortError'
        || error instanceof TypeError
        || (error instanceof BingApiError && (THROTTLE_CODES.has(Number(error.code)) || error.status === 429 || Number(error.status) >= 500));
      if (!retryable || attempt >= attempts) break;
      const delay = Math.min(30_000, Math.max(1000 * (2 ** (attempt - 1)), Number(error.retryAfter || 0) * 1000));
      await sleep(delay);
    }
  }
  if (lastError instanceof BingApiError && lastError.code !== null) {
    throw new Error(`Bing Webmaster ${method} failed with service code ${lastError.code}: ${redactSecret(lastError.message, apiKey)}`);
  }
  throw new Error(`Bing Webmaster ${method} failed: ${redactSecret(lastError?.message, apiKey)}`);
}

async function listSites() {
  const payload = await apiRequest('GetUserSites');
  const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];
  return rows.map(normalizeSite).filter((site) => site.url).sort((left, right) => left.url.localeCompare(right.url));
}

async function resolveSite(value) {
  if (!value) throw new Error('Missing --site. Use an exact Bing site URL or a configured alias.');
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const document = await readSensitiveJson(ALIASES_FILE, { optional: true, label: 'Bing site aliases file' });
  const resolved = document?.aliases?.[value];
  if (!resolved) throw new Error(`Unknown site alias: ${value}. Run sites, then add it with alias.`);
  return resolved;
}

async function saveAlias(name, site) {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(name || '')) throw new Error('Alias names must use lowercase letters, digits, dots, underscores, or hyphens');
  if (!(site?.startsWith('http://') || site?.startsWith('https://'))) throw new Error('Alias target must be an exact http(s) site URL returned by Bing');
  await assertOutsideRepository(ALIASES_FILE, 'Bing site aliases file');
  const current = await readSensitiveJson(ALIASES_FILE, { optional: true, label: 'Bing site aliases file' }) || { aliases: {} };
  current.aliases = { ...(current.aliases || {}), [name]: site };
  await secureWriteJson(ALIASES_FILE, current);
  return { alias: name, saved: true, aliasesFile: ALIASES_FILE, siteIdentifierSuppressed: true };
}

async function hiddenPrompt(prompt) {
  if (!input.isTTY || !output.isTTY) throw new Error('Interactive auth requires a TTY. Set BING_WEBMASTER_API_KEY and use auth --from-env instead.');
  output.write(prompt);
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  let value = '';
  try {
    for await (const chunk of input) {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') {
          output.write('\n');
          return value.trim();
        }
        if (character === '\u0003') throw new Error('Authorization cancelled');
        if (character === '\u007f') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    }
  } finally {
    input.setRawMode(false);
    input.pause();
  }
  return value.trim();
}

async function authorize({ fromEnv = false } = {}) {
  await assertOutsideRepository(CREDENTIALS_FILE, 'Bing Webmaster credentials file');
  const apiKey = fromEnv ? process.env.BING_WEBMASTER_API_KEY?.trim() : await hiddenPrompt('Bing Webmaster API key: ');
  if (!apiKey) throw new Error(fromEnv ? 'BING_WEBMASTER_API_KEY is empty' : 'API key is empty');
  const previous = process.env.BING_WEBMASTER_API_KEY;
  process.env.BING_WEBMASTER_API_KEY = apiKey;
  try {
    const sites = await listSites();
    await secureWriteJson(CREDENTIALS_FILE, {
      authType: 'api-key',
      apiKey,
      validatedAt: new Date().toISOString(),
    });
    return {
      authorized: true,
      authType: 'api-key',
      credentialsFile: CREDENTIALS_FILE,
      mode: (await fileStatus(CREDENTIALS_FILE)).mode,
      siteCount: sites.length,
      verifiedSiteCount: sites.filter((site) => site.isVerified).length,
    };
  } finally {
    if (previous === undefined) delete process.env.BING_WEBMASTER_API_KEY;
    else process.env.BING_WEBMASTER_API_KEY = previous;
  }
}

function queryParameters(site, dataset, options) {
  const definition = API_DATASETS[dataset];
  if (!definition) throw new Error(`Unknown dataset: ${dataset}`);
  const params = { siteUrl: site };
  if (definition.requiredOption) {
    const value = options[definition.requiredOption];
    if (!value) throw new Error(`${dataset} requires --${definition.requiredOption}`);
    params[definition.requiredOption] = JSON.stringify(value);
  }
  return { definition, params };
}

async function fetchDataset(site, dataset, options = {}) {
  const { definition, params } = queryParameters(site, dataset, options);
  const payload = await apiRequest(definition.method, params);
  const sourceRows = Array.isArray(payload) ? payload : payload === null || payload === undefined ? [] : [payload];
  const rows = sourceRows.map(definition.normalize);
  return {
    sourceMethod: definition.method,
    dimensions: definition.dimensions,
    rowCount: rows.length,
    updateCadence: definition.updateCadence,
    dataCompleteness: definition.dataCompleteness,
    apiCoverage: coverage(rows),
    latestDate: coverage(rows)?.endDate || null,
    rows,
  };
}

function coverage(rows) {
  const dates = rows.map((row) => row.date).filter(Boolean).sort();
  return dates.length ? { startDate: dates[0], endDate: dates.at(-1) } : null;
}

function filterWindow(rows, window) {
  return rows.filter((row) => !row.date || (row.date >= window.startDate && row.date <= window.endDate));
}

function datasetDocument(rows, rawRows, definition, dimensions = definition.dimensions) {
  return {
    sourceMethod: definition.method,
    dimensions,
    rowCount: rows.length,
    rawRowCount: rawRows.length,
    apiCoverage: coverage(rawRows),
    selectedCoverage: coverage(rows),
    latestDate: coverage(rows)?.endDate || null,
    updateCadence: definition.updateCadence,
    dataCompleteness: definition.dataCompleteness,
    rows,
  };
}

function aggregatePerformance(rows, keyName) {
  const groups = new Map();
  for (const row of rows) {
    const key = row[keyName];
    if (!key) continue;
    const group = groups.get(key) || {
      [keyName]: key,
      clicks: 0,
      impressions: 0,
      impressionPositionTotal: 0,
      impressionPositionWeight: 0,
      clickPositionTotal: 0,
      clickPositionWeight: 0,
      recordCount: 0,
      latestDate: null,
    };
    group.clicks += row.clicks || 0;
    group.impressions += row.impressions || 0;
    if (row.avgImpressionPosition !== null && row.avgImpressionPosition !== undefined && row.impressions > 0) {
      group.impressionPositionTotal += row.avgImpressionPosition * row.impressions;
      group.impressionPositionWeight += row.impressions;
    }
    if (row.avgClickPosition !== null && row.avgClickPosition !== undefined && row.clicks > 0) {
      group.clickPositionTotal += row.avgClickPosition * row.clicks;
      group.clickPositionWeight += row.clicks;
    }
    group.recordCount += 1;
    if (row.date && (!group.latestDate || row.date > group.latestDate)) group.latestDate = row.date;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    [keyName]: group[keyName],
    clicks: group.clicks,
    impressions: group.impressions,
    ctr: ratio(group.clicks, group.impressions),
    avgImpressionPosition: group.impressionPositionWeight > 0 ? group.impressionPositionTotal / group.impressionPositionWeight : null,
    avgClickPosition: group.clickPositionWeight > 0 ? group.clickPositionTotal / group.clickPositionWeight : null,
    recordCount: group.recordCount,
    latestDate: group.latestDate,
  })).sort((left, right) => right.impressions - left.impressions || right.clicks - left.clicks || String(left[keyName]).localeCompare(String(right[keyName])));
}

function siteSlug(site) {
  return `site-${createHash('sha256').update(site).digest('hex').slice(0, 16)}`;
}

function requestedSnapshotDatasets(options) {
  const requested = (options.datasets ? String(options.datasets).split(',') : DEFAULT_DATASETS).map((value) => value.trim()).filter(Boolean);
  const allowed = new Set(DEFAULT_DATASETS);
  for (const name of requested) if (!allowed.has(name)) throw new Error(`Unknown snapshot dataset: ${name}`);
  return [...new Set(requested)];
}

async function createSnapshot(site, options) {
  await assertOutsideRepository(
    options.output ? path.resolve(options.output) : path.join(DATA_DIR, 'snapshots', 'pending.json'),
    'Bing snapshot output',
  );
  await assertOutsideRepository(path.join(DATA_DIR, 'snapshots', 'latest.json'), 'Bing snapshot pointer');
  const requested = requestedSnapshotDatasets(options);
  const requiredSources = new Set();
  for (const name of requested) {
    if (['summary', 'date'].includes(name)) requiredSources.add('traffic');
    else if (['query', 'query-date'].includes(name)) requiredSources.add('queries');
    else if (['page', 'page-date'].includes(name)) requiredSources.add('pages');
    else requiredSources.add(name);
  }

  const raw = {};
  for (const source of ['traffic', 'queries', 'pages', 'crawl', 'crawl-issues', 'feeds']) {
    if (requiredSources.has(source)) raw[source] = (await fetchDataset(site, source, options)).rows;
  }

  const days = positiveInteger(options.days, 28, '--days');
  const trafficEnd = coverage(raw.traffic || [])?.endDate;
  const allDatedRows = Object.values(raw).flat().filter((row) => row.date);
  const inferredEnd = coverage(allDatedRows)?.endDate;
  const endDate = options['end-date'] || trafficEnd || inferredEnd || new Date().toISOString().slice(0, 10);
  shiftDate(endDate, 0);
  const window = {
    startDate: shiftDate(endDate, -(days - 1)),
    endDate,
    days,
    anchorSource: options['end-date'] ? 'explicit-end-date' : trafficEnd ? 'latest-traffic-date' : inferredEnd ? 'latest-dated-row' : 'fetch-date',
  };

  const selected = Object.fromEntries(Object.entries(raw).map(([name, rows]) => [name, filterWindow(rows, window)]));
  const datasets = {};
  if (requested.includes('summary')) {
    const rows = selected.traffic || [];
    const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
    const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    datasets.summary = {
      sourceMethod: API_DATASETS.traffic.method,
      dimensions: [],
      rowCount: 1,
      rawRowCount: (raw.traffic || []).length,
      apiCoverage: coverage(raw.traffic || []),
      selectedCoverage: coverage(rows),
      latestDate: coverage(rows)?.endDate || null,
      updateCadence: 'daily',
      dataCompleteness: 'aggregate',
      rows: [{ clicks, impressions, ctr: ratio(clicks, impressions) }],
    };
  }
  if (requested.includes('date')) datasets.date = datasetDocument(selected.traffic || [], raw.traffic || [], API_DATASETS.traffic);
  if (requested.includes('query-date')) datasets['query-date'] = datasetDocument(selected.queries || [], raw.queries || [], API_DATASETS.queries);
  if (requested.includes('page-date')) datasets['page-date'] = datasetDocument(selected.pages || [], raw.pages || [], API_DATASETS.pages);
  if (requested.includes('query')) {
    const rows = aggregatePerformance(selected.queries || [], 'query');
    datasets.query = {
      ...datasetDocument(rows, raw.queries || [], API_DATASETS.queries, ['query']),
      selectedCoverage: coverage(selected.queries || []),
      latestDate: coverage(selected.queries || [])?.endDate || null,
    };
  }
  if (requested.includes('page')) {
    const rows = aggregatePerformance(selected.pages || [], 'page');
    datasets.page = {
      ...datasetDocument(rows, raw.pages || [], API_DATASETS.pages, ['page']),
      selectedCoverage: coverage(selected.pages || []),
      latestDate: coverage(selected.pages || [])?.endDate || null,
    };
  }
  for (const name of ['crawl', 'crawl-issues', 'feeds']) {
    if (requested.includes(name)) datasets[name] = datasetDocument(selected[name] || [], raw[name] || [], API_DATASETS[name]);
  }

  const fetchedAt = new Date().toISOString();
  const snapshot = { schemaVersion: 1, source: 'bing-webmaster-api', fetchedAt, site, window, datasets };
  const directory = path.join(DATA_DIR, 'snapshots', siteSlug(site));
  const filename = `${window.endDate}_${fetchedAt.replaceAll(':', '-').replace(/\.\d{3}Z$/u, 'Z')}.json`;
  const outputFile = options.output ? path.resolve(options.output) : path.join(directory, filename);
  await secureWriteJson(outputFile, snapshot);
  const summary = {
    source: snapshot.source,
    fetchedAt,
    site,
    window,
    path: outputFile,
    datasets: Object.fromEntries(Object.entries(datasets).map(([name, value]) => [name, {
      rowCount: value.rowCount,
      rawRowCount: value.rawRowCount,
      apiCoverage: value.apiCoverage,
      selectedCoverage: value.selectedCoverage,
      latestDate: value.latestDate,
      updateCadence: value.updateCadence,
      dataCompleteness: value.dataCompleteness,
    }])),
  };
  await secureWriteJson(path.join(directory, 'latest.json'), summary);
  return { ...summary, site: undefined, siteIdentifierSuppressed: true };
}

async function doctor() {
  const credentialStatus = await fileStatus(CREDENTIALS_FILE);
  const aliasesStatus = await fileStatus(ALIASES_FILE);
  const environmentReady = Boolean(process.env.BING_WEBMASTER_API_KEY?.trim());
  const credentialSafe = credentialStatus.present && credentialStatus.ownerOnly !== false && !credentialStatus.repositoryRoot;
  const warnings = [];
  for (const [label, status] of [
    ['Bing Webmaster credentials file', credentialStatus],
    ['Bing site aliases file', aliasesStatus],
  ]) {
    if (status.ownerOnly === false) warnings.push(`${label} must use owner-only permissions (mode 600).`);
    if (status.repositoryRoot) warnings.push(`${label} must stay outside Git repositories.`);
  }
  let credentialReady = false;
  let authType = null;
  let validatedAt = null;
  if (credentialSafe) {
    const credentials = await readJson(CREDENTIALS_FILE);
    credentialReady = Boolean(credentials?.apiKey?.trim());
    authType = credentials?.authType || null;
    validatedAt = credentials?.validatedAt || null;
  }
  const ready = environmentReady || (credentialSafe && credentialReady);
  const blockers = ready ? [] : [{
    code: 'api-key-not-ready',
    message: 'Create and install a user-owned Bing Webmaster API key.',
  }];
  const nextActions = [];
  if (!ready) nextActions.push('Read references/api-key-setup.md and create a user-owned API key.');
  if (warnings.length) nextActions.push('Resolve every warning before authorization or data access.');
  if (!ready) {
    nextActions.push('Run auth interactively, then run doctor again and require ready: true.');
  }
  return {
    ready,
    warnings,
    blockers,
    nextActions,
    setupGuide: 'references/api-key-setup.md',
    authentication: {
      type: 'api-key',
      source: environmentReady ? 'environment' : credentialReady ? 'credentials-file' : null,
      environmentVariablePresent: environmentReady,
      credentialsFile: { path: CREDENTIALS_FILE, ...credentialStatus, authType, validatedAt, containsApiKey: credentialReady },
    },
    aliasesFile: { path: ALIASES_FILE, ...aliasesStatus },
    configDirectory: CONFIG_DIR,
    dataDirectory: DATA_DIR,
    apiBase: API_BASE,
    readOnly: true,
  };
}

function selfTest() {
  const failures = [];
  const expect = (condition, label) => { if (!condition) failures.push(label); };
  expect(dateText('/Date(1316156400000-0700)/') === '2011-09-16', 'WCF date parsing');
  expect(dateText('2026-07-16T08:15:30Z') === '2026-07-16', 'ISO date parsing');
  const page = normalizePage({ Query: 'https://example.com/a', Date: '/Date(1316156400000-0700)/', Clicks: '2', Impressions: 10, AvgImpressionPosition: 5 });
  expect(page.page === 'https://example.com/a' && page.ctr === 0.2, 'page normalization');
  expect(normalizeQuery({ Query: 'alpha', AvgClickPosition: -1 }).avgClickPosition === null, 'position sentinel normalization');
  expect(normalizeFeed({ Url: 'https://example.com/sitemap.xml', Submitted: '1601-01-01T00:00:00Z' }).submittedAt === null, 'date sentinel normalization');
  expect(!siteSlug('https://private.example/').includes('private.example'), 'private site storage key');
  expect(redactSecret('failed key-value', 'key-value') === 'failed [REDACTED]', 'secret redaction');
  const aggregated = aggregatePerformance([
    { query: 'alpha', date: '2026-07-01', clicks: 1, impressions: 10, avgImpressionPosition: 10, avgClickPosition: 8 },
    { query: 'alpha', date: '2026-07-08', clicks: 3, impressions: 30, avgImpressionPosition: 4, avgClickPosition: 2 },
  ], 'query')[0];
  expect(aggregated.clicks === 4 && aggregated.impressions === 40 && aggregated.avgImpressionPosition === 5.5 && aggregated.avgClickPosition === 3.5, 'weighted aggregation');
  expect(filterWindow([{ date: '2026-07-01' }, { date: '2026-07-08' }], { startDate: '2026-07-02', endDate: '2026-07-09' }).length === 1, 'window filtering');
  if (failures.length) throw new Error(`Self-test failed: ${failures.join(', ')}`);
  return { ok: true, checks: 9 };
}

function help() {
  return `Bing Webmaster Tools CLI\n\nCommands:\n  doctor\n  auth [--from-env]\n  sites [--output FILE | --stdout]\n  alias --name NAME --site EXACT_SITE_URL\n  query --site SITE [--dataset queries] [--query TEXT] [--page URL] [--url URL]\n        [--output FILE | --stdout]\n  snapshot --site SITE [--days 28] [--end-date YYYY-MM-DD]\n           [--datasets summary,date,query,page,query-date,page-date,crawl,crawl-issues,feeds] [--output FILE]\n  latest --site SITE [--stdout]\n  self-test\n\nRaw query datasets:\n  traffic, queries, pages, query-pages, page-queries, crawl, crawl-issues, feeds, url-info, quota\n\nSensitive credentials and Bing Webmaster data must stay outside Git repositories.\nSite identifiers and raw query rows are suppressed unless --output or --stdout is provided.\nThe API endpoint is fixed to the official Bing Webmaster HTTPS service.\n\nEnvironment overrides:\n  BING_WEBMASTER_API_KEY, BING_WEBMASTER_CONFIG_DIR, BING_WEBMASTER_DATA_DIR,\n  BING_WEBMASTER_CREDENTIALS_FILE, BING_WEBMASTER_ALIASES_FILE\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
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
      printJson(await authorize({ fromEnv: Boolean(options['from-env']) }));
      return;
    case 'sites': {
      if (options.output && options.stdout) throw new Error('Use either --output or --stdout, not both');
      if (options.output) await assertOutsideRepository(path.resolve(options.output), 'Bing site list output');
      const sites = await listSites();
      const result = {
        schemaVersion: 1,
        source: 'bing-webmaster-api',
        fetchedAt: new Date().toISOString(),
        sites,
      };
      if (options.output) {
        const outputFile = path.resolve(options.output);
        await secureWriteJson(outputFile, result);
        printJson({
          source: result.source,
          fetchedAt: result.fetchedAt,
          siteCount: sites.length,
          verifiedSiteCount: sites.filter((site) => site.isVerified).length,
          path: outputFile,
          siteIdentifiersSuppressed: true,
        });
      } else if (options.stdout) {
        printJson(result);
      } else {
        printJson({
          source: result.source,
          fetchedAt: result.fetchedAt,
          siteCount: sites.length,
          verifiedSiteCount: sites.filter((site) => site.isVerified).length,
          siteIdentifiersSuppressed: true,
          next: 'Use --output with a path outside Git repositories, or --stdout to explicitly print private site identifiers.',
        });
      }
      return;
    }
    case 'alias':
      printJson(await saveAlias(options.name, options.site));
      return;
    case 'query': {
      if (options.output && options.stdout) throw new Error('Use either --output or --stdout, not both');
      if (options.output) await assertOutsideRepository(path.resolve(options.output), 'Bing query output');
      const site = await resolveSite(options.site);
      const dataset = options.dataset || 'queries';
      const result = {
        schemaVersion: 1,
        source: 'bing-webmaster-api',
        fetchedAt: new Date().toISOString(),
        site,
        dataset,
        result: await fetchDataset(site, dataset, options),
      };
      if (options.output) {
        const outputFile = path.resolve(options.output);
        await secureWriteJson(outputFile, result);
        printJson({
          schemaVersion: result.schemaVersion,
          source: result.source,
          fetchedAt: result.fetchedAt,
          dataset: result.dataset,
          result: { ...result.result, rows: undefined },
          path: outputFile,
          siteIdentifierSuppressed: true,
        });
      } else if (options.stdout) {
        printJson(result);
      } else {
        printJson({
          schemaVersion: result.schemaVersion,
          source: result.source,
          fetchedAt: result.fetchedAt,
          dataset: result.dataset,
          result: { ...result.result, rows: undefined },
          siteIdentifierSuppressed: true,
          rawRowsSuppressed: true,
          next: 'Use --output with a path outside Git repositories, or --stdout to explicitly print private rows.',
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
      const latest = await readSensitiveJson(pointer, { label: 'Bing snapshot pointer' });
      if (options.stdout) printJson({ ...latest, pointer });
      else printJson({ ...latest, site: undefined, pointer, siteIdentifierSuppressed: true });
      return;
    }
    case 'self-test':
      printJson(selfTest());
      return;
    default:
      throw new Error(`Unknown command: ${command}\n\n${help()}`);
  }
}

main().catch((error) => {
  process.stderr.write(`bing-webmaster: ${error.message}\n`);
  process.exitCode = 1;
});
