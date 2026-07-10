import WebSocket from 'ws';
import { ControlCommand } from '../../core/ui-control-commands';
import { logger } from '../../lib/logger';
import { DeviceClient } from '../device-client';
import { UiControllerClientConnectionState } from '../ui-controller-client-connection-state';
import { LegacyControllerError } from './legacy-controller-error';
import { LegacyControllerNotConnectedError } from './legacy-controller-not-connected-error';
import { RunnerProtocolRequest, RunnerProtocolResponse } from './runner-protocol';

export interface LegacyAndroidClientArgs {
  /** WebSocket address of the legacy UI Controller. Defaults to `ws://127.0.0.1:6769`. */
  readonly controllerUrl?: string;
}

/**
 * Drives an Android device through the AskUI legacy UI Controller over its
 * WebSocket "runner protocol" (default `ws://127.0.0.1:6769`), implementing
 * {@link DeviceClient} so it is interchangeable with the desktop AgentOS gRPC
 * client and the direct-adb Android client.
 *
 * The controller must already be running in Android mode
 * (`AskUI-StartController ... -r android`). The controller serves one command at
 * a time, so requests are serialized.
 */
export class LegacyAndroidClient implements DeviceClient {
  private static readonly DEFAULT_URL = 'ws://127.0.0.1:6769';

  private static readonly REQUEST_TIMEOUT_IN_MS = 30000;

  private static readonly CONNECT_TIMEOUT_IN_MS = 10000;

  connectionState = UiControllerClientConnectionState.NOT_CONNECTED;

  private readonly url: string;

  private ws: WebSocket | undefined;

  private pending: {
    resolve: (response: RunnerProtocolResponse) => void;
    reject: (reason: unknown) => void;
    timeout: NodeJS.Timeout;
  } | undefined;

  constructor(args: LegacyAndroidClientArgs = {}) {
    this.url = args.controllerUrl ?? LegacyAndroidClient.DEFAULT_URL;
  }

  connect(): Promise<UiControllerClientConnectionState> {
    this.connectionState = UiControllerClientConnectionState.CONNECTING;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(
          new LegacyControllerError(
            `Connection to the AskUI legacy UI Controller at "${this.url}" timed out. `
            + 'Make sure it is running in Android mode (AskUI-StartController ... -r android).',
          ),
        );
      }, LegacyAndroidClient.CONNECT_TIMEOUT_IN_MS);

      ws.on('open', () => {
        clearTimeout(timeout);
        this.ws = ws;
        this.connectionState = UiControllerClientConnectionState.CONNECTED;
        logger.debug(`Connected to legacy UI Controller at ${this.url}`);
        resolve(this.connectionState);
      });
      ws.on('message', (data: WebSocket.RawData) => this.onMessage(data));
      ws.on('error', (error: Error) => {
        clearTimeout(timeout);
        this.connectionState = UiControllerClientConnectionState.ERROR;
        reject(
          new LegacyControllerError(
            `Connection to the AskUI legacy UI Controller at "${this.url}" cannot be established. `
            + 'Make sure it is running in Android mode (AskUI-StartController ... -r android). '
            + `Cause: ${error.message}`,
          ),
        );
      });
    });
  }

  private onMessage(data: WebSocket.RawData): void {
    if (this.pending === undefined) {
      return;
    }
    const { resolve, reject, timeout } = this.pending;
    clearTimeout(timeout);
    this.pending = undefined;
    let response: RunnerProtocolResponse;
    try {
      response = JSON.parse(data.toString());
    } catch (error) {
      reject(new LegacyControllerError(`Malformed response from the legacy UI Controller: ${error}`));
      return;
    }
    if (response.data?.error) {
      reject(new LegacyControllerError(response.data.error));
      return;
    }
    resolve(response);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = undefined;
    this.connectionState = UiControllerClientConnectionState.NOT_CONNECTED;
  }

  private sendAndReceive(request: RunnerProtocolRequest): Promise<RunnerProtocolResponse> {
    const { ws } = this;
    if (ws === undefined || this.connectionState !== UiControllerClientConnectionState.CONNECTED) {
      throw new LegacyControllerNotConnectedError();
    }
    if (this.pending !== undefined) {
      throw new LegacyControllerError(
        'A request to the legacy UI Controller is already in flight. '
        + 'Requests must be serialized (check for a missing await).',
      );
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = undefined;
        reject(
          new LegacyControllerError(
            `Request "${request.msgName}" to the legacy UI Controller timed out.`,
          ),
        );
      }, LegacyAndroidClient.REQUEST_TIMEOUT_IN_MS);
      this.pending = { reject, resolve, timeout };
      logger.debug(`Send to legacy UI Controller: ${request.msgName}`);
      ws.send(JSON.stringify(request));
    });
  }

  async requestControl(controlCommand: ControlCommand): Promise<void> {
    await this.sendAndReceive({
      controlCommand: controlCommand.toJson(),
      msgName: 'CONTROL_REQUEST',
    });
  }

  async requestScreenshot(): Promise<string> {
    const response = await this.sendAndReceive({ msgName: 'CAPTURE_SCREENSHOT_REQUEST' });
    if (response.data.image === undefined) {
      throw new LegacyControllerError('The legacy UI Controller returned no screenshot.');
    }
    return response.data.image;
  }

  async getStartingArguments(): Promise<Record<string, string | number | boolean>> {
    const response = await this.sendAndReceive({ msgName: 'GET_STARTING_ARGUMENTS_REQUEST' });
    return response.data.arguments ?? {};
  }

  // eslint-disable-next-line class-methods-use-this
  async setActiveDisplay(): Promise<void> {
    // The legacy controller selects its display/device when it is launched.
  }
}
