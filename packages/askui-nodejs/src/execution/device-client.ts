import { ControlCommand } from '../core/ui-control-commands';
import { UiControllerClientConnectionState } from './ui-controller-client-connection-state';

/**
 * Transport-agnostic client for a device that AskUI automates (a desktop via the
 * AgentOS gRPC service, or an Android device via the legacy UI Controller). This
 * is the seam {@link ExecutionRuntime} depends on so the transport can be chosen
 * per target without the execution/agent layers knowing which one is in use.
 */
export interface DeviceClient {
  connectionState: UiControllerClientConnectionState;

  connect(): Promise<UiControllerClientConnectionState>;

  disconnect(): void;

  requestControl(controlCommand: ControlCommand): Promise<void>;

  requestScreenshot(): Promise<string>;

  getStartingArguments(): Promise<Record<string, string | number | boolean>>;

  setActiveDisplay(displayId: number): Promise<void>;
}
