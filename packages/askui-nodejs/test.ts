/* eslint-disable no-console */
/**
 * Manual end-to-end test for the AskUI AgentOS gRPC client.
 *
 * Requires a running AskUI AgentOS (standalone on localhost:23000 or managed by
 * the AskuiCoreService on localhost:26000). IMPORTANT: The AgentOS only allows a
 * single session — close the AskUI Desktop app (and other SDK sessions) before
 * running this script.
 *
 * Run with:
 *   npm run test:agentos
 *
 * Environment variables:
 *   AGENT_OS_URL=localhost:23000  Override the AgentOS address.
 *   SKIP_INPUT=1                  Only test connect/screenshot/info, skip all
 *                                 mouse/keyboard/command actions.
 *
 * The script opens a maximized Notepad window (Windows) as a safe target for
 * mouse/keyboard actions and force-closes it afterwards.
 */
import fs from 'fs';
import path from 'path';
import { AgentOsClient } from './src/execution/agent-os/agent-os-client';
import { AgentOsActionNotSupportedError } from './src/execution/agent-os/agent-os-action-not-supported-error';
import { AgentOsError } from './src/execution/agent-os/agent-os-error';
import {
  Action,
  ControlCommand,
  ControlCommandCode,
  InputEvent,
} from './src/core/ui-control-commands';
import { UiControllerClientConnectionState } from './src/execution/ui-controller-client-connection-state';

const AGENT_OS_URL = process.env['AGENT_OS_URL'] ?? 'localhost:26000';
const SKIP_INPUT = process.env['SKIP_INPUT'] === '1';
const SCREENSHOT_PATH = path.join(__dirname, 'agentos-test-screenshot.png');

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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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

async function main(): Promise<void> {
  console.log(`AgentOS end-to-end test against "${AGENT_OS_URL}"`);
  console.log('='.repeat(60));

  const client = new AgentOsClient(AGENT_OS_URL);
  const execute = (...actions: Action[]) => client.requestControl(
    new ControlCommand(ControlCommandCode.OK, actions),
  );

  let screenWidth = 0;
  let screenHeight = 0;

  const connected = await step('connect (with service detection)', async () => {
    const state = await client.connect();
    if (state !== UiControllerClientConnectionState.CONNECTED) {
      throw new AgentOsError(`Unexpected connection state: ${state}`);
    }
    return `state=${state}`;
  });

  if (!connected) {
    printSummary();
    process.exit(1);
  }

  await step('getStartingArguments', async () => {
    const args = await client.getStartingArguments();
    if (args['runtime'] !== 'desktop') {
      throw new AgentOsError(`Unexpected runtime: ${args['runtime']}`);
    }
    return JSON.stringify(args);
  });

  await step('requestScreenshot (BGRA → PNG conversion)', async () => {
    const screenshot = await client.requestScreenshot();
    if (!screenshot.startsWith('data:image/png;base64,')) {
      throw new AgentOsError('Screenshot is not a base64 PNG data URI');
    }
    const { width, height } = pngDimensions(screenshot);
    if (width < 1 || height < 1) {
      throw new AgentOsError(`Implausible dimensions ${width}x${height}`);
    }
    screenWidth = width;
    screenHeight = height;
    fs.writeFileSync(
      SCREENSHOT_PATH,
      Buffer.from(screenshot.split(',')[1] ?? '', 'base64'),
    );
    return `${width}x${height}, saved to ${SCREENSHOT_PATH}`;
  });

  if (!SKIP_INPUT && process.platform === 'win32') {
    await step('EXECUTE_COMMAND (open maximized Notepad)', async () => {
      await execute(new Action(InputEvent.EXECUTE_COMMAND, { x: 0, y: 0 }, 'cmd /c start /MAX notepad', {}));
      await delay(2000);
    });

    await step('TYPE (unicode text)', () => execute(
      new Action(InputEvent.TYPE, { x: 0, y: 0 }, 'AskUI AgentOS gRPC test — äöü ± 😀', {}),
    ));

    await step('PRESS_KEY_SEQUENCE (enter)', () => execute(
      new Action(InputEvent.PRESS_KEY_SEQUENCE, { x: 0, y: 0 }, 'enter', {}),
    ));

    await step('TYPE_TEXT (second line)', () => execute(
      new Action(InputEvent.TYPE_TEXT, { x: 0, y: 0 }, 'second line 1234', {}),
    ));

    await step('MOUSE_MOVE (screen center)', () => execute(
      new Action(
        InputEvent.MOUSE_MOVE,
        { x: Math.round(screenWidth / 2), y: Math.round(screenHeight / 2) },
        '',
        {},
      ),
    ));

    await step('MOUSE_MOVE_RELATIVELY (+50, +30)', () => execute(
      new Action(InputEvent.MOUSE_MOVE_RELATIVELY, { x: 50, y: 30 }, '', {}),
    ));

    await step('MOUSE_SCROLL (vertical −120, horizontal +120)', () => execute(
      new Action(InputEvent.MOUSE_SCROLL, { x: 120, y: -120 }, '', {}),
    ));

    await step('MOUSE_CLICK_LEFT', () => execute(
      new Action(InputEvent.MOUSE_CLICK_LEFT, { x: 0, y: 0 }, '', {}),
    ));

    await step('MOUSE_CLICK_DOUBLE_LEFT (selects a word)', () => execute(
      new Action(InputEvent.MOUSE_CLICK_DOUBLE_LEFT, { x: 0, y: 0 }, '', {}),
    ));

    await step('MOUSE_DOWN + MOUSE_UP', () => execute(
      new Action(InputEvent.MOUSE_DOWN, { x: 0, y: 0 }, '', {}),
      new Action(InputEvent.MOUSE_UP, { x: 0, y: 0 }, '', {}),
    ));

    await step('KEY_PRESS + KEY_RELEASE (hold and release shift)', () => execute(
      new Action(InputEvent.KEY_PRESS, { x: 0, y: 0 }, '', { key: 'shift', modifiers: [] }),
      new Action(InputEvent.KEY_RELEASE, { x: 0, y: 0 }, '', { key: 'shift', modifiers: [] }),
    ));

    await step('PRESS_KEY_SEQUENCE with modifier (control+a, delete)', () => execute(
      new Action(InputEvent.PRESS_KEY_SEQUENCE, { x: 0, y: 0 }, 'control+a', {}),
      new Action(InputEvent.PRESS_KEY_SEQUENCE, { x: 0, y: 0 }, 'delete', {}),
    ));

    await step('EXECUTE_COMMAND (close Notepad)', () => execute(
      new Action(InputEvent.EXECUTE_COMMAND, { x: 0, y: 0 }, 'taskkill /IM notepad.exe /F', {}),
    ));
  } else if (!SKIP_INPUT) {
    console.log('  (input action steps are Windows-only, skipping on this platform)');
  }

  await step('PRESS_ANDROID_SINGLE_KEY rejects (Android unsupported)', async () => {
    try {
      await execute(new Action(InputEvent.PRESS_ANDROID_SINGLE_KEY, { x: 0, y: 0 }, 'home', {}));
    } catch (error) {
      if (error instanceof AgentOsActionNotSupportedError) {
        return 'threw AgentOsActionNotSupportedError as expected';
      }
      throw new AgentOsError(`Wrong error type: ${error}`);
    }
    throw new AgentOsError('Expected an AgentOsActionNotSupportedError but none was thrown');
  });

  await step('disconnect', async () => {
    client.disconnect();
    if (client.connectionState !== UiControllerClientConnectionState.NOT_CONNECTED) {
      throw new AgentOsError(`Unexpected state after disconnect: ${client.connectionState}`);
    }
    // Give the background session teardown a moment to release the session.
    await delay(500);
    return `state=${client.connectionState}`;
  });

  await step('requests after disconnect are rejected', async () => {
    try {
      await client.requestScreenshot();
    } catch (error) {
      if (error instanceof AgentOsError) {
        return 'threw AgentOsNotConnectedError as expected';
      }
      throw error;
    }
    throw new AgentOsError('Expected an error but none was thrown');
  });

  printSummary();
  process.exit(results.every((result) => result.ok) ? 0 : 1);
}

main().catch((error) => {
  console.error('Unexpected failure:', error);
  process.exit(1);
});
