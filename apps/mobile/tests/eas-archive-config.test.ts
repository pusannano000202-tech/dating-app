import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const easIgnorePath = fileURLToPath(new URL('../.easignore', import.meta.url));
const repositoryEasIgnorePath = fileURLToPath(
  new URL('../../../.easignore', import.meta.url),
);

test('EAS archive rules live in the Expo app root and keep app sources', () => {
  const rules = readFileSync(easIgnorePath, 'utf8');

  assert.doesNotMatch(rules, /^\s*\*\s*$/m);
  assert.match(rules, /^node_modules\/$/m);
  assert.match(rules, /^\.env\*\.local$/m);
});

test('repository archive rules keep the monorepo path without uploading the workspace', () => {
  assert.equal(existsSync(repositoryEasIgnorePath), true);

  const rules = readFileSync(repositoryEasIgnorePath, 'utf8');
  assert.doesNotMatch(rules, /^\s*\*\s*$/m);
  assert.doesNotMatch(rules, /^\/?apps\/?$/m);
  assert.match(rules, /^\.git\/$/m);
  assert.match(rules, /^\.next\*\/$/m);
  assert.match(rules, /^apps\/mobile\/node_modules\/$/m);
});
