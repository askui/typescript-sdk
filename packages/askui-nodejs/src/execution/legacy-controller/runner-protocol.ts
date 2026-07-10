/**
 * Minimal subset of the AskUI legacy UI Controller "runner protocol" (JSON over
 * WebSocket, default `ws://127.0.0.1:6769`). Only the messages needed to drive
 * an Android device are included; recording and interactive annotation are
 * intentionally omitted.
 */

export type RunnerProtocolRequest =
  | { readonly msgName: 'CONTROL_REQUEST'; readonly controlCommand: object }
  | { readonly msgName: 'CAPTURE_SCREENSHOT_REQUEST' }
  | { readonly msgName: 'GET_STARTING_ARGUMENTS_REQUEST' };

export interface RunnerProtocolResponse {
  readonly msgName: string;
  readonly data: {
    readonly error?: string;
    readonly image?: string;
    readonly msg?: string;
    readonly arguments?: Record<string, string | number | boolean>;
  };
}
