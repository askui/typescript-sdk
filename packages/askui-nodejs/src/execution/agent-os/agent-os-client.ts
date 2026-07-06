import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { Action, ControlCommand, InputEvent } from '../../core/ui-control-commands';
import { logger } from '../../lib/logger';
import { getSharpFactory } from '../../utils/base_64_image/sharp';
import { UiControllerClientConnectionState } from '../ui-controller-client-connection-state';
import { delay } from '../misc';
import { AgentOsError } from './agent-os-error';
import { AgentOsNotConnectedError } from './agent-os-not-connected-error';
import { AgentOsActionNotSupportedError } from './agent-os-action-not-supported-error';

interface RunRecordedActionResponse {
  actionID: number;
  requiredMilliseconds: number;
}

interface PollResponse {
  pollEventID: string;
  pollEventParameters?: {
    actionFinished?: {
      actionID: number;
    };
  };
}

interface BitmapMessage {
  width: number;
  height: number;
  lineWidth: number;
  bitsPerPixel: number;
  bytesPerPixel: number;
  data: Buffer;
}

interface CaptureScreenResponse {
  bitmap: BitmapMessage;
}

interface ActionRequest {
  actionClassID: string;
  actionParameters: Record<string, object>;
}

/**
 * Client for the AskUI AgentOS (AskUI Remote Device Controller). Talks gRPC to the
 * `Askui.API.TDKv1.ControllerAPI` service, mirroring the connection approach of the
 * AskUI Python SDK (askui/vision-agent): open an insecure channel to a locally running
 * AgentOS, start a session, start execution, and set the active display.
 *
 * The AgentOS listens on `localhost:23000` when running standalone and on
 * `localhost:26000` when managed by the AskUI OS service (`AskuiCoreService`).
 */
export class AgentOsClient {
  private static readonly SERVICE_MANAGED_ADDRESS = 'localhost:26000';

  private static readonly DEFAULT_PORT = '23000';

  private static readonly REQUEST_TIMEOUT_IN_MS = 30000;

  private static readonly CONNECT_TIMEOUT_IN_MS = 10000;

  private static readonly ACTION_POLL_MAX_RETRIES = 10;

  private static readonly ACTION_POLL_INTERVAL_IN_MS = 50;

  private static readonly TYPING_SPEED_IN_CHARACTERS_PER_SECOND = 50;

  private static readonly MOUSE_MOVE_DURATION_IN_MS = 500;

  private static readonly MOUSE_SCROLL_DURATION_IN_MS = 50;

  private static readonly MODIFIER_KEYS = [
    'command',
    'alt',
    'control',
    'shift',
    'right_shift',
  ];

  connectionState = UiControllerClientConnectionState.NOT_CONNECTED;

  private client: grpc.Client | undefined;

  private sessionInfo: object | undefined;

  private address: string | undefined;

  private displayId = 1;

  constructor(public url: string) {}

  private static buildControllerApiConstructor(): grpc.ServiceClientConstructor {
    const packageDefinition = protoLoader.loadSync(
      path.join(__dirname, 'proto', 'Controller_V1.proto'),
      {
        defaults: true,
        enums: String,
        keepCase: true,
        // 64-bit integers (e.g. the session GUID parts) must round-trip without
        // precision loss, so they are represented as strings.
        longs: String,
        oneofs: true,
      },
    );
    const grpcObject = grpc.loadPackageDefinition(packageDefinition);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (grpcObject as any).Askui.API.TDKv1.ControllerAPI;
  }

  private static normalizeAddress(url: string): string {
    const address = url.replace(/^(https?|wss?):\/\//, '');
    if (address.includes(':')) {
      return address;
    }
    return `${address}:${AgentOsClient.DEFAULT_PORT}`;
  }

  /**
   * Checks whether the AgentOS is managed by the AskUI OS service
   * (`AskuiCoreService`, Windows only). In that case the service occupies the
   * controller session on the default port and clients have to connect to the
   * service-managed address instead.
   */
  private static async isServiceManaged(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }
    return new Promise((resolve) => {
      execFile('sc', ['query', 'AskuiCoreService'], (error, stdout) => {
        resolve(!error && /RUNNING/.test(stdout));
      });
    });
  }

  private async getCandidateAddresses(): Promise<string[]> {
    const address = AgentOsClient.normalizeAddress(this.url);
    if (
      address.endsWith(`:${AgentOsClient.DEFAULT_PORT}`)
      && await AgentOsClient.isServiceManaged()
    ) {
      return [AgentOsClient.SERVICE_MANAGED_ADDRESS, address];
    }
    return [address];
  }

  private static async openChannel(address: string): Promise<grpc.Client> {
    const ControllerApi = AgentOsClient.buildControllerApiConstructor();
    const client = new ControllerApi(address, grpc.credentials.createInsecure(), {
      'grpc.max_receive_message_length': 2 ** 30,
      'grpc.max_send_message_length': 2 ** 30,
    });
    return new Promise((resolve, reject) => {
      client.waitForReady(
        new Date(Date.now() + AgentOsClient.CONNECT_TIMEOUT_IN_MS),
        (error?: Error) => {
          if (error) {
            client.close();
            reject(error);
            return;
          }
          resolve(client);
        },
      );
    });
  }

  private requireClient(): grpc.Client {
    if (
      this.client === undefined
      || this.connectionState !== UiControllerClientConnectionState.CONNECTED
    ) {
      throw new AgentOsNotConnectedError();
    }
    return this.client;
  }

  private static invokeOn<TResponse>(
    client: grpc.Client,
    method: string,
    request: object,
    timeoutInMs = AgentOsClient.REQUEST_TIMEOUT_IN_MS,
  ): Promise<TResponse> {
    logger.debug(`AgentOS request: ${method}`);
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any)[method](
        request,
        { deadline: new Date(Date.now() + timeoutInMs) },
        (error: grpc.ServiceError | null, response: TResponse) => {
          if (error) {
            reject(
              new AgentOsError(
                `The AgentOS request "${method}" failed. Cause: ${error.message}`,
              ),
            );
            return;
          }
          resolve(response);
        },
      );
    });
  }

  private invoke<TResponse>(
    method: string,
    request: object,
    timeoutInMs = AgentOsClient.REQUEST_TIMEOUT_IN_MS,
  ): Promise<TResponse> {
    const { client } = this;
    if (client === undefined) {
      throw new AgentOsNotConnectedError();
    }
    return AgentOsClient.invokeOn(client, method, request, timeoutInMs);
  }

  async connect(): Promise<UiControllerClientConnectionState> {
    this.connectionState = UiControllerClientConnectionState.CONNECTING;
    const candidateAddresses = await this.getCandidateAddresses();
    const errors: string[] = [];
    /* eslint-disable no-await-in-loop, no-restricted-syntax */
    for (const address of candidateAddresses) {
      try {
        this.client = await AgentOsClient.openChannel(address);
        this.address = address;
        await this.startSession();
        this.connectionState = UiControllerClientConnectionState.CONNECTED;
        logger.debug(`Connected to AgentOS at ${address}`);
        return this.connectionState;
      } catch (error) {
        errors.push(`"${address}": ${error}`);
        this.client?.close();
        this.client = undefined;
        this.address = undefined;
      }
    }
    /* eslint-enable no-await-in-loop, no-restricted-syntax */
    this.connectionState = UiControllerClientConnectionState.ERROR;
    throw new AgentOsError(
      'Connection to the AskUI AgentOS cannot be established. '
      + 'Make sure the AskUI AgentOS is installed and running. '
      + `Tried: ${errors.join('; ')}`,
    );
  }

  private async startSession(): Promise<void> {
    const sessionGuid = `{${randomUUID().toUpperCase()}}`;
    const response = await this.invoke<{ sessionInfo: object }>('StartSession', {
      immediateExecution: true,
      sessionGUID: sessionGuid,
    });
    this.sessionInfo = response.sessionInfo;
    await this.invoke('StartExecution', { sessionInfo: this.sessionInfo });
    await this.invoke('SetActiveDisplay', { displayID: this.displayId });
  }

  disconnect(): void {
    const { client, sessionInfo } = this;
    if (client === undefined) {
      return;
    }
    this.client = undefined;
    this.sessionInfo = undefined;
    this.connectionState = UiControllerClientConnectionState.NOT_CONNECTED;
    // End the session gracefully in the background, then close the channel.
    // Keeping this fire-and-forget preserves the synchronous disconnect() API
    // while still releasing the single AgentOS session on the server.
    (async () => {
      try {
        await AgentOsClient.invokeOn(client, 'StopExecution', { sessionInfo });
        await AgentOsClient.invokeOn(client, 'EndSession', { sessionInfo });
      } catch (error) {
        logger.debug(`Ending the AgentOS session failed: ${error}`);
      } finally {
        client.close();
      }
    })();
  }

  async setActiveDisplay(displayId: number): Promise<void> {
    this.requireClient();
    await this.invoke('SetActiveDisplay', { displayID: displayId });
    this.displayId = displayId;
  }

  private async runAction(actionRequest: ActionRequest, timeoutInMs?: number): Promise<void> {
    const response = await this.invoke<RunRecordedActionResponse>(
      'RunRecordedAction',
      {
        actionClassID: actionRequest.actionClassID,
        actionParameters: actionRequest.actionParameters,
        sessionInfo: this.sessionInfo,
      },
      timeoutInMs,
    );
    await delay(response.requiredMilliseconds);
    /* eslint-disable no-await-in-loop */
    for (let retry = 0; retry < AgentOsClient.ACTION_POLL_MAX_RETRIES; retry += 1) {
      const pollResponse = await this.invoke<PollResponse>('Poll', {
        pollEventID: 'PollEventID_ActionFinished',
        sessionInfo: this.sessionInfo,
      });
      if (
        pollResponse.pollEventParameters?.actionFinished?.actionID === response.actionID
      ) {
        return;
      }
      await delay(AgentOsClient.ACTION_POLL_INTERVAL_IN_MS);
    }
    /* eslint-enable no-await-in-loop */
    throw new AgentOsError(
      `The AgentOS did not finish the action "${actionRequest.actionClassID}" in time.`,
    );
  }

  async requestControl(controlCommand: ControlCommand): Promise<void> {
    this.requireClient();
    /* eslint-disable no-await-in-loop, no-restricted-syntax */
    for (const action of controlCommand.actions) {
      for (const actionRequest of AgentOsClient.mapAction(action)) {
        await this.runAction(actionRequest);
      }
    }
    /* eslint-enable no-await-in-loop, no-restricted-syntax */
  }

  private static mouseButtonPressAndRelease(button: string, count: number): ActionRequest[] {
    return [{
      actionClassID: 'ActionClassID_MouseButton_PressAndRelease',
      actionParameters: {
        mouseButtonPressAndRelease: { count, mouseButton: button },
      },
    }];
  }

  private static parseKeySequence(text: string): {
    keyName: string;
    modifierKeyNames: string[];
  } {
    const modifierKeyNames: string[] = [];
    let remaining = text;
    let matched = true;
    while (matched) {
      matched = false;
      /* eslint-disable-next-line no-restricted-syntax */
      for (const modifier of AgentOsClient.MODIFIER_KEYS) {
        if (
          remaining.length > modifier.length + 1
          && remaining.startsWith(`${modifier}+`)
        ) {
          modifierKeyNames.push(modifier);
          remaining = remaining.substring(modifier.length + 1);
          matched = true;
          break;
        }
      }
    }
    return { keyName: remaining, modifierKeyNames };
  }

  private static typeText(text: string): ActionRequest[] {
    return [{
      actionClassID: 'ActionClassID_KeyboardType_UnicodeText',
      actionParameters: {
        keyboardTypeUnicodeText: {
          text: Buffer.from(text, 'utf16le'),
          typingSpeed: AgentOsClient.TYPING_SPEED_IN_CHARACTERS_PER_SECOND,
          typingSpeedValue: 'TypingSpeedValue_CharactersPerSecond',
        },
      },
    }];
  }

  private static mouseScroll(deltaX: number, deltaY: number): ActionRequest[] {
    const actionRequests: ActionRequest[] = [];
    if (deltaX !== 0) {
      actionRequests.push({
        actionClassID: 'ActionClassID_MouseWheelScroll',
        actionParameters: {
          mouseWheelScroll: {
            delta: deltaX,
            deltaType: 'MouseWheelDelta_Raw',
            direction: 'MouseWheelScrollDirection_Horizontal',
            milliseconds: AgentOsClient.MOUSE_SCROLL_DURATION_IN_MS,
          },
        },
      });
    }
    if (deltaY !== 0) {
      actionRequests.push({
        actionClassID: 'ActionClassID_MouseWheelScroll',
        actionParameters: {
          mouseWheelScroll: {
            delta: deltaY,
            deltaType: 'MouseWheelDelta_Raw',
            direction: 'MouseWheelScrollDirection_Vertical',
            milliseconds: AgentOsClient.MOUSE_SCROLL_DURATION_IN_MS,
          },
        },
      });
    }
    return actionRequests;
  }

  private static keyPressOrRelease(action: Action, press: boolean): ActionRequest[] {
    const key = typeof action.parameters['key'] === 'string' ? action.parameters['key'] : action.text;
    const modifiers = Array.isArray(action.parameters['modifiers'])
      ? action.parameters['modifiers'] as string[]
      : [];
    if (press) {
      return [{
        actionClassID: 'ActionClassID_KeyboardKey_Press',
        actionParameters: {
          keyboardKeyPress: { keyName: key, modifierKeyNames: modifiers },
        },
      }];
    }
    return [{
      actionClassID: 'ActionClassID_KeyboardKey_Release',
      actionParameters: {
        keyboardKeyRelease: { keyName: key, modifierKeyNames: modifiers },
      },
    }];
  }

  private static mapAction(action: Action): ActionRequest[] {
    switch (action.inputEvent) {
      case InputEvent.NO_COMMAND:
        return [];
      case InputEvent.MOUSE_MOVE:
        return [{
          actionClassID: 'ActionClassID_MouseMove',
          actionParameters: {
            mouseMove: {
              milliseconds: AgentOsClient.MOUSE_MOVE_DURATION_IN_MS,
              position: { x: action.position.x, y: action.position.y },
            },
          },
        }];
      case InputEvent.MOUSE_MOVE_RELATIVELY:
        return [{
          actionClassID: 'ActionClassID_MouseMove_Delta',
          actionParameters: {
            mouseMoveDelta: {
              delta: { x: action.position.x, y: action.position.y },
              milliseconds: AgentOsClient.MOUSE_MOVE_DURATION_IN_MS,
            },
          },
        }];
      case InputEvent.MOUSE_CLICK_LEFT:
        return AgentOsClient.mouseButtonPressAndRelease('MouseButton_Left', 1);
      case InputEvent.MOUSE_CLICK_RIGHT:
        return AgentOsClient.mouseButtonPressAndRelease('MouseButton_Right', 1);
      case InputEvent.MOUSE_CLICK_MIDDLE:
        return AgentOsClient.mouseButtonPressAndRelease('MouseButton_Middle', 1);
      case InputEvent.MOUSE_CLICK_DOUBLE_LEFT:
        return AgentOsClient.mouseButtonPressAndRelease('MouseButton_Left', 2);
      case InputEvent.MOUSE_CLICK_DOUBLE_RIGHT:
        return AgentOsClient.mouseButtonPressAndRelease('MouseButton_Right', 2);
      case InputEvent.MOUSE_CLICK_DOUBLE_MIDDLE:
        return AgentOsClient.mouseButtonPressAndRelease('MouseButton_Middle', 2);
      case InputEvent.MOUSE_DOWN:
        return [{
          actionClassID: 'ActionClassID_MouseButton_Press',
          actionParameters: {
            mouseButtonPress: { mouseButton: 'MouseButton_Left' },
          },
        }];
      case InputEvent.MOUSE_UP:
        return [{
          actionClassID: 'ActionClassID_MouseButton_Release',
          actionParameters: {
            mouseButtonRelease: { mouseButton: 'MouseButton_Left' },
          },
        }];
      case InputEvent.MOUSE_SCROLL:
        return AgentOsClient.mouseScroll(action.position.x, action.position.y);
      case InputEvent.TYPE:
      case InputEvent.TYPE_TEXT:
        return AgentOsClient.typeText(action.text);
      case InputEvent.PRESS_KEY_SEQUENCE: {
        const { keyName, modifierKeyNames } = AgentOsClient.parseKeySequence(action.text);
        return [{
          actionClassID: 'ActionClassID_KeyboardKey_PressAndRelease',
          actionParameters: {
            keyboardKeyPressAndRelease: { keyName, modifierKeyNames },
          },
        }];
      }
      case InputEvent.KEY_PRESS:
        return AgentOsClient.keyPressOrRelease(action, true);
      case InputEvent.KEY_RELEASE:
        return AgentOsClient.keyPressOrRelease(action, false);
      case InputEvent.EXECUTE_COMMAND:
        return [{
          actionClassID: 'ActionClassID_RunCommand',
          actionParameters: {
            runcommand: {
              command: action.text,
              timeoutInMilliseconds: AgentOsClient.REQUEST_TIMEOUT_IN_MS,
            },
          },
        }];
      case InputEvent.PRESS_ANDROID_KEY_SEQUENCE:
      case InputEvent.PRESS_ANDROID_SINGLE_KEY:
        throw new AgentOsActionNotSupportedError(action.inputEvent);
      default:
        throw new AgentOsError(`Unknown input event "${action.inputEvent}".`);
    }
  }

  private static bitmapToRgba(bitmap: BitmapMessage): Buffer {
    const {
      width, height, lineWidth, bytesPerPixel, data,
    } = bitmap;
    const rgba = Buffer.alloc(width * height * 4);
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const source = row * lineWidth + column * bytesPerPixel;
        const target = (row * width + column) * 4;
        // The AgentOS returns the bitmap in BGRA channel order.
        rgba[target] = data[source + 2] as number;
        rgba[target + 1] = data[source + 1] as number;
        rgba[target + 2] = data[source] as number;
        rgba[target + 3] = 255;
      }
    }
    return rgba;
  }

  async requestScreenshot(): Promise<string> {
    this.requireClient();
    const response = await this.invoke<CaptureScreenResponse>('CaptureScreen', {
      captureParameters: { displayID: this.displayId },
      sessionInfo: this.sessionInfo,
    });
    const { width, height } = response.bitmap;
    const sharpFactory = await getSharpFactory();
    const pngBuffer = await sharpFactory(AgentOsClient.bitmapToRgba(response.bitmap), {
      raw: { channels: 4, height, width },
    })
      .png()
      .toBuffer();
    return `data:image/png;base64,${pngBuffer.toString('base64')}`;
  }

  async getStartingArguments(): Promise<Record<string, string | number | boolean>> {
    this.requireClient();
    const [host = 'localhost', port = AgentOsClient.DEFAULT_PORT] = (
      this.address ?? ''
    ).split(':');
    return {
      displayNum: this.displayId,
      host,
      port,
      runtime: 'desktop',
    };
  }
}
