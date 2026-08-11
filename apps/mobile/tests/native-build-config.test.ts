import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

type ExpoPlugin = string | [string, Record<string, unknown>];

type ExpoAppConfig = {
  expo: {
    android?: {
      blockedPermissions?: string[];
    };
    plugins?: ExpoPlugin[];
  };
};

const appConfigPath = fileURLToPath(new URL('../app.json', import.meta.url));
const appConfig = JSON.parse(readFileSync(appConfigPath, 'utf8')) as ExpoAppConfig;

test('android release config blocks permissions Quantum does not use', () => {
  const blockedPermissions = appConfig.expo.android?.blockedPermissions ?? [];

  assert.deepEqual(
    blockedPermissions,
    [
      'android.permission.DUMP',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  );
});

test('native splash screen uses the Quantum launch asset', () => {
  const splashPlugin = appConfig.expo.plugins?.find(
    (plugin): plugin is [string, Record<string, unknown>] =>
      Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
  );

  assert.ok(splashPlugin);
  assert.deepEqual(splashPlugin[1], {
    backgroundColor: '#082438',
    image: './assets/splash-icon.png',
    imageWidth: 200,
    resizeMode: 'contain',
  });
});

test('profile photos use the system photo picker without requesting camera access', () => {
  const pickerPlugin = appConfig.expo.plugins?.find(
    (plugin): plugin is [string, Record<string, unknown>] =>
      Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
  );

  assert.ok(pickerPlugin);
  assert.deepEqual(pickerPlugin[1], {
    photosPermission: '프로필에 사용할 사진을 선택하려면 사진 접근이 필요해요.',
    cameraPermission: false,
  });
});
