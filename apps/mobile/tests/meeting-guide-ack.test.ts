import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

test('meeting guide acknowledgement uses the versioned AsyncStorage contract', async () => {
  const helperPath = path.join(process.cwd(), 'src/state/meeting-guide-ack.ts');
  assert.ok(fs.existsSync(helperPath), 'meeting guide acknowledgement helper must exist');

  const helper = await import(pathToFileURL(helperPath).href) as {
    hasAcknowledgedMeetingGuide: (storage?: Storage) => Promise<boolean>;
    markMeetingGuideAcknowledged: (storage?: Storage) => Promise<void>;
  };
  const values = new Map<string, string>();
  const storage: Storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
  };

  assert.equal(await helper.hasAcknowledgedMeetingGuide(storage), false);

  await helper.markMeetingGuideAcknowledged(storage);

  assert.equal(values.get('quantum.meeting-guide.v1'), 'acknowledged');
  assert.equal(await helper.hasAcknowledgedMeetingGuide(storage), true);
});

test('legacy or malformed guide values do not unlock participation', async () => {
  const helperPath = path.join(process.cwd(), 'src/state/meeting-guide-ack.ts');
  assert.ok(fs.existsSync(helperPath), 'meeting guide acknowledgement helper must exist');

  const helper = await import(pathToFileURL(helperPath).href) as {
    hasAcknowledgedMeetingGuide: (storage?: Storage) => Promise<boolean>;
  };
  const storage: Storage = {
    getItem: async (key) => key === 'quantum.meeting-guide.v1' ? 'true' : null,
    setItem: async () => undefined,
  };

  assert.equal(await helper.hasAcknowledgedMeetingGuide(storage), false);
});
