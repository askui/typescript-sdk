/* eslint-disable no-console */
/**
 * Manual end-to-end test for the Android device clients.
 *
 * Two transports (select with TRANSPORT):
 *   - adb (TRANSPORT=adb): needs `adb` on PATH (or ADB_PATH) and a connected
 *     device (`adb devices`).
 *   - legacy-controller (default): needs the AskUI legacy UI Controller running
 *     in Android mode (`AskUI-StartController ... -r android`).
 *
 * For the typing step with Unicode: ADBKeyboard installed and set as the default
 * IME (adb transport: set KEYBOARD=adb-keyboard).
 *
 * Run with:
 *   npm run test:android                 # legacy controller (default)
 *   TRANSPORT=adb npm run test:android   # direct adb
 *
 * Environment variables:
 *   TRANSPORT=adb|legacy-controller  Select the transport (default legacy-controller).
 *   CONTROLLER_URL=ws://127.0.0.1:6769  Legacy controller address.
 *   ADB_PATH=/path/to/adb            Override the adb executable.
 *   DEVICE_ID=emulator-5554          Select a specific device (adb, default: first).
 *   KEYBOARD=adb-keyboard            Use the ADBKeyboard IME for Unicode typing (adb).
 *   SKIP_INPUT=1                     Only connect/screenshot/info, skip input actions.
 */
import fs from 'fs';
import path from 'path';
import { AndroidAdbClient } from './src/execution/android/android-adb-client';
import { AndroidError } from './src/execution/android/android-error';
import { AndroidNotConnectedError } from './src/execution/android/android-not-connected-error';
import { LegacyAndroidClient } from './src/execution/legacy-controller/legacy-android-client';
import { LegacyControllerNotConnectedError } from './src/execution/legacy-controller/legacy-controller-not-connected-error';
import { DeviceClient } from './src/execution/device-client';
import {
  Action,
  ControlCommand,
  ControlCommandCode,
  InputEvent,
} from './src/core/ui-control-commands';
import { UiControllerClientConnectionState } from './src/execution/ui-controller-client-connection-state';

const SKIP_INPUT = process.env['SKIP_INPUT'] === '1';
const TRANSPORT = process.env['TRANSPORT'] === 'adb' ? 'adb' : 'legacy-controller';
const SCREENSHOT_PATH = path.join(__dirname, 'android-test-screenshot.png');

interface StepResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: StepResult[] = [];

async function step(name: string, fn: () => Promise<string | void>): Promise<boolean> {
  process.stdout.write(`→ ${name} ... `);
  try {
    const detail = (await fn()) ?? '';
    results.push({ detail, name, ok: true });
    console.log(`✓ ${detail}`);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, ok: false });
    console.log(`✗ ${detail}`);
    return false;
  }
}

function pngDimensions(base64Png: string): { width: number; height: number } {
  const buffer = Buffer.from(base64Png.split(',')[1] ?? '', 'base64');
  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  };
}

function printSummary(): void {
  console.log('='.repeat(60));
  const passed = results.filter((result) => result.ok).length;
  results
    .filter((result) => !result.ok)
    .forEach((result) => console.log(`FAILED: ${result.name}\n  ${result.detail}`));
  console.log(`${passed}/${results.length} steps passed`);
}

function buildClient(): DeviceClient {
  if (TRANSPORT === 'adb') {
    return new AndroidAdbClient({
      ...(process.env['ADB_PATH'] ? { adbPath: process.env['ADB_PATH'] } : {}),
      ...(process.env['DEVICE_ID'] ? { id: process.env['DEVICE_ID'] } : {}),
      keyboard: process.env['KEYBOARD'] === 'adb-keyboard' ? 'adb-keyboard' : 'input-text',
    });
  }
  return new LegacyAndroidClient({
    ...(process.env['CONTROLLER_URL'] ? { controllerUrl: process.env['CONTROLLER_URL'] } : {}),
  });
}

async function main(): Promise<void> {
  console.log(`Android end-to-end test (transport: ${TRANSPORT})`);
  console.log('='.repeat(60));

  const client = buildClient();
  const execute = (...actions: Action[]) => client.requestControl(
    new ControlCommand(ControlCommandCode.OK, actions),
  );

  let screenWidth = 0;
  let screenHeight = 0;

  const connected = await step(`connect (${TRANSPORT})`, async () => {
    const state = await client.connect();
    if (state !== UiControllerClientConnectionState.CONNECTED) {
      throw new AndroidError(`Unexpected connection state: ${state}`);
    }
    return `state=${state}`;
  });

  if (!connected) {
    printSummary();
    process.exit(1);
  }

  await step('getStartingArguments (runtime=android)', async () => {
    const args = await client.getStartingArguments();
    if (args['runtime'] !== 'android') {
      throw new AndroidError(`Unexpected runtime: ${args['runtime']}`);
    }
    return JSON.stringify(args);
  });

  await step('requestScreenshot (screencap → PNG)', async () => {
    const screenshot = await client.requestScreenshot();
    if (!screenshot.startsWith('data:image/png;base64,')) {
      throw new AndroidError('Screenshot is not a base64 PNG data URI');
    }
    const { width, height } = pngDimensions(screenshot);
    if (width < 1 || height < 1) {
      throw new AndroidError(`Implausible dimensions ${width}x${height}`);
    }
    screenWidth = width;
    screenHeight = height;
    fs.writeFileSync(
      SCREENSHOT_PATH,
      Buffer.from(screenshot.split(',')[1] ?? '', 'base64'),
    );
    return `${width}x${height}, saved to ${SCREENSHOT_PATH}`;
  });

  if (!SKIP_INPUT) {
    await step('PRESS_ANDROID_SINGLE_KEY (HOME)', () => execute(
      new Action(InputEvent.PRESS_ANDROID_SINGLE_KEY, { x: 0, y: 0 }, 'home', {}),
    ));

    await step('EXECUTE_COMMAND (input tap, center)', () => execute(
      new Action(
        InputEvent.EXECUTE_COMMAND,
        { x: 0, y: 0 },
        `input tap ${Math.round(screenWidth / 2)} ${Math.round(screenHeight / 2)}`,
        {},
      ),
    ));

    await step('EXECUTE_COMMAND (input swipe, scroll up)', () => execute(
      new Action(
        InputEvent.EXECUTE_COMMAND,
        { x: 0, y: 0 },
        `input swipe ${Math.round(screenWidth / 2)} ${Math.round(screenHeight * 0.7)} `
        + `${Math.round(screenWidth / 2)} ${Math.round(screenHeight * 0.3)}`,
        {},
      ),
    ));

    await step('MOUSE_MOVE + MOUSE_CLICK_LEFT (tap at stored position)', () => execute(
      new Action(InputEvent.MOUSE_MOVE, { x: Math.round(screenWidth / 2), y: Math.round(screenHeight / 2) }, '', {}),
      new Action(InputEvent.MOUSE_CLICK_LEFT, { x: 0, y: 0 }, '', {}),
    ));

    await step('TYPE (into focused field, if any)', () => execute(
      new Action(InputEvent.TYPE, { x: 0, y: 0 }, 'askui android test', {}),
    ));

    await step('PRESS_ANDROID_KEY_SEQUENCE (BACK)', () => execute(
      new Action(InputEvent.PRESS_ANDROID_KEY_SEQUENCE, { x: 0, y: 0 }, 'back', {}),
    ));
  }

  await step('disconnect', async () => {
    client.disconnect();
    if (client.connectionState !== UiControllerClientConnectionState.NOT_CONNECTED) {
      throw new AndroidError(`Unexpected state after disconnect: ${client.connectionState}`);
    }
    return `state=${client.connectionState}`;
  });

  await step('requests after disconnect are rejected', async () => {
    const ExpectedError = TRANSPORT === 'adb'
      ? AndroidNotConnectedError
      : LegacyControllerNotConnectedError;
    try {
      await client.requestScreenshot();
    } catch (error) {
      if (error instanceof ExpectedError) {
        return `threw ${error.name} as expected`;
      }
      throw error;
    }
    throw new AndroidError('Expected an error but none was thrown');
  });

  printSummary();
  process.exit(results.every((result) => result.ok) ? 0 : 1);
}

main().catch((error) => {
  console.error('Unexpected failure:', error);
  process.exit(1);
});
