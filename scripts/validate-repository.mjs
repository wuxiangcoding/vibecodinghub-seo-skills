#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const errors = [];

function fail(message) {
  errors.push(message);
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), 'utf8'));
  } catch (error) {
    fail(`${relativePath}: invalid JSON (${error.message})`);
    return null;
  }
}

function frontmatter(text, file) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) {
    fail(`${file}: missing YAML frontmatter`);
    return {};
  }
  const result = {};
  for (const line of match[1].split(/\r?\n/u)) {
    const field = line.match(/^([a-z][a-z0-9_-]*):\s*(.+)$/u);
    if (field) result[field[1]] = field[2].replace(/^['"]|['"]$/gu, '');
  }
  return result;
}

async function validateMarkdownLinks(file, text) {
  const links = text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu);
  for (const match of links) {
    const rawTarget = match[1].trim().split(/\s+['"]/u)[0];
    if (/^(?:https?:|mailto:|#)/u.test(rawTarget)) continue;
    const targetWithoutFragment = rawTarget.split('#')[0];
    if (!targetWithoutFragment) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(targetWithoutFragment);
    } catch {
      fail(`${path.relative(repositoryRoot, file)}: malformed link ${rawTarget}`);
      continue;
    }
    const target = path.resolve(path.dirname(file), decoded);
    if (!(await exists(target))) {
      fail(`${path.relative(repositoryRoot, file)}: missing relative link target ${rawTarget}`);
    }
  }
}

function validateAgentYaml(relativePath, text, skillName) {
  if (text.includes('\t')) fail(`${relativePath}: tabs are not allowed in YAML`);
  if (!/^interface:\r?\n/u.test(text)) fail(`${relativePath}: missing interface mapping`);
  for (const field of ['display_name', 'short_description', 'default_prompt']) {
    const pattern = new RegExp(`^  ${field}:\\s+"[^"]+"\\s*$`, 'mu');
    if (!pattern.test(text)) fail(`${relativePath}: missing quoted interface.${field}`);
  }
  if (!text.includes(`$${skillName}`)) {
    fail(`${relativePath}: default_prompt must invoke $${skillName}`);
  }
}

async function validateSkills() {
  const skillsRoot = path.join(repositoryRoot, 'skills');
  const entries = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expected = [
    'bing-webmaster-tools',
    'google-search-console',
    'yandex-webmaster',
  ];
  if (JSON.stringify(entries) !== JSON.stringify(expected)) {
    fail(`skills/: expected only ${expected.join(', ')}, found ${entries.join(', ')}`);
  }

  for (const skillName of entries) {
    const skillRelative = `skills/${skillName}/SKILL.md`;
    const agentRelative = `skills/${skillName}/agents/openai.yaml`;
    const skillFile = path.join(repositoryRoot, skillRelative);
    const agentFile = path.join(repositoryRoot, agentRelative);
    if (!(await exists(skillFile))) {
      fail(`${skillRelative}: file is required`);
      continue;
    }
    if (!(await exists(agentFile))) {
      fail(`${agentRelative}: file is required`);
      continue;
    }
    const skillText = await readFile(skillFile, 'utf8');
    const metadata = frontmatter(skillText, skillRelative);
    if (metadata.name !== skillName) {
      fail(`${skillRelative}: frontmatter name must equal directory name`);
    }
    if (!metadata.description || metadata.description.length < 40) {
      fail(`${skillRelative}: description must explain the trigger and capability`);
    }
    await validateMarkdownLinks(skillFile, skillText);

    const agentText = await readFile(agentFile, 'utf8');
    validateAgentYaml(agentRelative, agentText, skillName);
  }
}

async function validateManifests() {
  const codex = await readJson('.codex-plugin/plugin.json');
  const claude = await readJson('.claude-plugin/plugin.json');
  const claudeMarketplace = await readJson('.claude-plugin/marketplace.json');
  const codexMarketplace = await readJson('.agents/plugins/marketplace.json');
  const packageJson = await readJson('package.json');
  if (!codex || !claude || !claudeMarketplace || !codexMarketplace || !packageJson) return;

  const expectedName = 'vibecodinghub-seo-skills';
  const versions = new Set([
    codex.version,
    claude.version,
    claudeMarketplace.plugins?.[0]?.version,
    packageJson.version,
  ]);
  if (versions.size !== 1 || versions.has(undefined)) {
    fail('plugin manifests, Claude marketplace, and package.json must use one version');
  }
  for (const [label, manifest] of [
    ['Codex manifest', codex],
    ['Claude manifest', claude],
  ]) {
    if (manifest.name !== expectedName) fail(`${label}: unexpected plugin name`);
    if (manifest.author?.name !== 'WuxiangCoding') fail(`${label}: missing author name`);
  }
  if (codex.skills !== './skills/') fail('Codex manifest: skills must be ./skills/');
  if (!Array.isArray(codex.interface?.defaultPrompt) || codex.interface.defaultPrompt.length > 3) {
    fail('Codex manifest: interface.defaultPrompt must be an array of at most three prompts');
  }
  if (claudeMarketplace.name !== 'wuxiangcoding') {
    fail('Claude marketplace: unexpected marketplace name');
  }
  if (claudeMarketplace.plugins?.[0]?.source !== './') {
    fail('Claude marketplace: root plugin source must be ./');
  }
  const codexEntry = codexMarketplace.plugins?.[0];
  if (codexMarketplace.name !== 'wuxiangcoding') {
    fail('Codex marketplace: unexpected marketplace name');
  }
  if (codexEntry?.name !== expectedName || codexEntry?.source?.path !== './') {
    fail('Codex marketplace: root plugin entry is invalid');
  }
  for (const field of ['installation', 'authentication']) {
    if (!codexEntry?.policy?.[field]) fail(`Codex marketplace: policy.${field} is required`);
  }
  if (!codexEntry?.category) fail('Codex marketplace: category is required');
}

async function validateScripts(files) {
  for (const file of files.filter((candidate) => candidate.endsWith('.mjs'))) {
    try {
      await execute(process.execPath, ['--check', file]);
    } catch (error) {
      fail(`${path.relative(repositoryRoot, file)}: Node syntax check failed (${error.stderr || error.message})`);
    }
  }
}

async function validateSensitiveContent(files) {
  const forbiddenNames = [
    /(^|\/)oauth-client[^/]*\.json$/u,
    /(^|\/)client_secret[^/]*\.json$/u,
    /(^|\/)token\.json$/u,
    /(^|\/)credentials\.json$/u,
    /(^|\/)snapshots\//u,
  ];
  const contentPatterns = [
    { label: 'macOS user path', pattern: /\/Users\/[A-Za-z0-9._-]+\//u },
    { label: 'Windows user path', pattern: /[A-Za-z]:\\Users\\[^\\\s]+\\/u },
    { label: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{35}/u },
    { label: 'Google OAuth client ID', pattern: /\b\d{6,}-[a-z0-9_-]{20,}\.apps\.googleusercontent\.com\b/iu },
    { label: 'Google access token', pattern: /\bya29\.[0-9A-Za-z_-]{20,}\b/u },
    { label: 'Yandex token', pattern: /\by0_[0-9A-Za-z_-]{20,}\b/u },
    { label: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u },
  ];
  const textExtensions = new Set(['.md', '.mjs', '.js', '.json', '.yaml', '.yml', '.txt']);

  for (const file of files) {
    const relative = path.relative(repositoryRoot, file).split(path.sep).join('/');
    for (const pattern of forbiddenNames) {
      if (pattern.test(relative)) fail(`${relative}: sensitive file path must not be committed`);
    }
    const extension = path.extname(file);
    if (!textExtensions.has(extension) && path.basename(file) !== 'LICENSE') continue;
    const text = await readFile(file, 'utf8');
    if (text.includes('[TODO' + ':')) fail(`${relative}: unresolved TODO placeholder`);
    for (const { label, pattern } of contentPatterns) {
      if (pattern.test(text)) fail(`${relative}: possible ${label}`);
    }
    if (extension === '.md') await validateMarkdownLinks(file, text);
  }
}

async function main() {
  const files = await walk(repositoryRoot);
  await validateSkills();
  await validateManifests();
  await validateScripts(files);
  await validateSensitiveContent(files);

  if (errors.length > 0) {
    process.stderr.write(`Repository validation failed:\n- ${errors.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Repository validation passed (${files.length} files checked).\n`);
}

main().catch((error) => {
  process.stderr.write(`Repository validation crashed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
