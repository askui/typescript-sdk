import { execFile } from 'child_process';
import { Action, ControlCommand, InputEvent } from '../../core/ui-control-commands';
import { logger } from '../../lib/logger';
import { DeviceClient } from '../device-client';
import { UiControllerClientConnectionState } from '../ui-controller-client-connection-state';
import { AndroidError } from './android-error';
import { AndroidNotConnectedError } from './android-not-connected-error';
import { NoAndroidDeviceError } from './no-android-device-error';

export type AndroidKeyboardMode = 'input-text' | 'adb-keyboard';

export interface AndroidAdbClientArgs {
  /** Select a specific device by its adb serial. Defaults to the first device. */
  readonly id?: string;
  /** Path to the `adb` executable. Defaults to `adb` (must be on PATH). */
  readonly adbPath?: string;
  /** Delay applied after each action, in milliseconds. Defaults to `0`. */
  readonly actionDelayInMs?: number;
  /**
   * How text is typed. `input-text` uses `adb shell input text` (ASCII, no
   * setup). `adb-keyboard` uses the ADBKeyboard IME broadcast for full Unicode
   * support (requires ADBKeyboard installed and set as the default IME).
   * Defaults to `input-text`.
   */
  readonly keyboard?: AndroidKeyboardMode;
}

/**
 * Drives an Android device directly via `adb`, implementing {@link DeviceClient}
 * so it is interchangeable with the desktop AgentOS gRPC client. Replaces the
 * legacy UI Controller's WebSocket/adbkit path: every operation is a plain
 * `adb` invocation, so no separate controller process or binary is required.
 */
export class AndroidAdbClient implements DeviceClient {
  private static readonly EXEC_MAX_BUFFER = 256 * 1024 * 1024;

  connectionState = UiControllerClientConnectionState.NOT_CONNECTED;

  private readonly adbPath: string;

  private readonly keyboard: AndroidKeyboardMode;

  private readonly actionDelayInMs: number;

  private deviceId: string | undefined;

  private screenWidth = 0;

  private screenHeight = 0;

  private mousePosition = { x: 0, y: 0 };

  constructor(private args: AndroidAdbClientArgs = {}) {
    this.adbPath = args.adbPath ?? 'adb';
    this.keyboard = args.keyboard ?? 'input-text';
    this.actionDelayInMs = args.actionDelayInMs ?? 0;
    this.deviceId = args.id;
  }

  private exec(args: string[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      execFile(
        this.adbPath,
        args,
        { encoding: 'buffer', maxBuffer: AndroidAdbClient.EXEC_MAX_BUFFER },
        (error, stdout, stderr) => {
          if (error) {
            const details = stderr?.toString().trim() || error.message;
            reject(new AndroidError(`adb ${args.join(' ')} failed: ${details}`));
            return;
          }
          resolve(stdout);
        },
      );
    });
  }

  private async shell(command: string): Promise<string> {
    if (this.deviceId === undefined) {
      throw new AndroidNotConnectedError();
    }
    const output = await this.exec(['-s', this.deviceId, 'shell', command]);
    return output.toString().trim();
  }

  private async listDevices(): Promise<string[]> {
    const output = (await this.exec(['devices'])).toString();
    return output
      .split('\n')
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.endsWith('\tdevice'))
      .map((line) => line.split('\t')[0] as string);
  }

  private async resolveDeviceId(): Promise<string> {
    const devices = await this.listDevices();
    if (this.args.id !== undefined) {
      if (!devices.includes(this.args.id)) {
        throw new NoAndroidDeviceError(this.args.id);
      }
      return this.args.id;
    }
    if (devices.length === 0) {
      throw new NoAndroidDeviceError();
    }
    return devices[0] as string;
  }

  private async updateScreenSize(): Promise<void> {
    const output = await this.shell('wm size');
    // Prefer the override size ("Override size: WxH") if present, else physical.
    const matches = [...output.matchAll(/(?:Physical|Override) size:\s*(\d+)x(\d+)/g)];
    const last = matches[matches.length - 1];
    if (last) {
      this.screenWidth = Number(last[1]);
      this.screenHeight = Number(last[2]);
    }
  }

  async connect(): Promise<UiControllerClientConnectionState> {
    this.connectionState = UiControllerClientConnectionState.CONNECTING;
    try {
      this.deviceId = await this.resolveDeviceId();
      await this.updateScreenSize();
      this.connectionState = UiControllerClientConnectionState.CONNECTED;
      logger.debug(`Connected to Android device ${this.deviceId} (${this.screenWidth}x${this.screenHeight})`);
      return this.connectionState;
    } catch (error) {
      this.connectionState = UiControllerClientConnectionState.ERROR;
      this.deviceId = this.args.id;
      if (error instanceof AndroidError) {
        throw error;
      }
      throw new AndroidError(
        `Connection to an Android device via adb failed. Make sure "${this.adbPath}" `
        + `is installed and a device is connected. Cause: ${error}`,
      );
    }
  }

  disconnect(): void {
    this.deviceId = this.args.id;
    this.connectionState = UiControllerClientConnectionState.NOT_CONNECTED;
  }

  // eslint-disable-next-line class-methods-use-this
  async setActiveDisplay(): Promise<void> {
    // Android targets a single device/display selected at connect time.
  }

  private requireConnected(): void {
    if (
      this.deviceId === undefined
      || this.connectionState !== UiControllerClientConnectionState.CONNECTED
    ) {
      throw new AndroidNotConnectedError();
    }
  }

  private delay(): Promise<void> {
    if (this.actionDelayInMs <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      setTimeout(resolve, this.actionDelayInMs);
    });
  }

  async requestControl(controlCommand: ControlCommand): Promise<void> {
    this.requireConnected();
    /* eslint-disable no-await-in-loop, no-restricted-syntax */
    for (const action of controlCommand.actions) {
      await this.runAction(action);
      await this.delay();
    }
    /* eslint-enable no-await-in-loop, no-restricted-syntax */
  }

  private async runAction(action: Action): Promise<void> {
    switch (action.inputEvent) {
      case InputEvent.NO_COMMAND:
        break;
      case InputEvent.MOUSE_MOVE:
        this.mousePosition = { x: action.position.x, y: action.position.y };
        break;
      case InputEvent.MOUSE_MOVE_RELATIVELY:
        this.mousePosition = {
          x: this.mousePosition.x + action.position.x,
          y: this.mousePosition.y + action.position.y,
        };
        break;
      case InputEvent.MOUSE_DOWN:
        await this.shell(`input motionevent DOWN ${this.mousePosition.x} ${this.mousePosition.y}`);
        break;
      case InputEvent.MOUSE_UP:
        await this.shell(`input motionevent UP ${this.mousePosition.x} ${this.mousePosition.y}`);
        break;
      case InputEvent.MOUSE_CLICK_LEFT:
      case InputEvent.MOUSE_CLICK_RIGHT:
      case InputEvent.MOUSE_CLICK_MIDDLE:
        await this.shell(`input tap ${this.mousePosition.x} ${this.mousePosition.y}`);
        break;
      case InputEvent.MOUSE_CLICK_DOUBLE_LEFT:
      case InputEvent.MOUSE_CLICK_DOUBLE_RIGHT:
      case InputEvent.MOUSE_CLICK_DOUBLE_MIDDLE:
        await this.shell(`input tap ${this.mousePosition.x} ${this.mousePosition.y}`);
        await this.shell(`input tap ${this.mousePosition.x} ${this.mousePosition.y}`);
        break;
      case InputEvent.MOUSE_SCROLL:
        // Negated to match the desktop scroll orientation.
        await this.shell(`input roll ${-action.position.x} ${-action.position.y}`);
        break;
      case InputEvent.TYPE:
        await this.typeText(action.text);
        break;
      case InputEvent.TYPE_TEXT:
        await this.shell(`input tap ${action.position.x} ${action.position.y}`);
        await this.typeText(action.text);
        break;
      case InputEvent.PRESS_ANDROID_SINGLE_KEY:
        await this.shell(`input keyevent ${action.text.toUpperCase()}`);
        break;
      case InputEvent.PRESS_ANDROID_KEY_SEQUENCE: {
        // Press the keys one after another. `+` and whitespace both separate keys.
        const keys = action.text.toUpperCase().split(/[\s+]+/).filter(Boolean);
        await this.shell(`input keyevent ${keys.join(' ')}`);
        break;
      }
      case InputEvent.EXECUTE_COMMAND:
        await this.shell(action.text);
        break;
      default:
        throw new AndroidError(
          `The action "${action.inputEvent}" is not supported on Android.`,
        );
    }
  }

  private async typeText(text: string): Promise<void> {
    if (this.keyboard === 'adb-keyboard') {
      // ADBKeyboard IME broadcast (base64-encoded UTF-8) supports full Unicode.
      const encoded = Buffer.from(text, 'utf-8').toString('base64');
      await this.shell(`am broadcast -a ADB_INPUT_B64 --es msg ${encoded}`);
      return;
    }
    // `input text` treats spaces specially and does not support Unicode.
    const escaped = text
      .replace(/(["`$\\])/g, '\\$1')
      .replace(/ /g, '%s');
    await this.shell(`input text "${escaped}"`);
  }

  async requestScreenshot(): Promise<string> {
    this.requireConnected();
    const png = await this.exec(['-s', this.deviceId as string, 'exec-out', 'screencap', '-p']);
    return `data:image/png;base64,${png.toString('base64')}`;
  }

  async getStartingArguments(): Promise<Record<string, string | number | boolean>> {
    this.requireConnected();
    return {
      deviceId: this.deviceId as string,
      displayNum: 0,
      height: this.screenHeight,
      runtime: 'android',
      width: this.screenWidth,
    };
  }
}
