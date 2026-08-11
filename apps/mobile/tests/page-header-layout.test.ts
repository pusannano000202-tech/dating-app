import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const pageHeaderPath = new URL('../src/components/PageHeader.tsx', import.meta.url);

test('mobile page header text can shrink and wrap inside narrow Android widths', async () => {
  const source = await readFile(pageHeaderPath, 'utf8');

  assert.match(source, /copy:\s*\{[^}]*minWidth:\s*0/);
  assert.match(source, /description:\s*\{[\s\S]*?flexShrink:\s*1/);
});
