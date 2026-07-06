import { CredentialArgs } from './credentials-args';
import { ProxyAgentArgs } from '../shared/proxy-agent-args';
import { ModelCompositionBranch } from './model-composition-branch';
import { Reporter } from '../core/reporting';
import { Context } from './context';
import { RetryStrategy } from './retry-strategies/retry-strategy';
import { AIElementArgs } from '../core/ai-element/ai-elements-args';
import { CacheConfig } from '../core/cache';
import { AndroidAdbClientArgs } from './android/android-adb-client';

/**
 * The runtime AskUI automates: the `desktop` via the AskUI AgentOS (gRPC), or an
 * `android` device directly via `adb`.
 */
export type Runtime = 'desktop' | 'android';

/**
 * Context object to provide additional information about the context of (test) automation.
 *
 * @property {(boolean | undefined)} [isCi] - Default: Determined automatically by
 *    https://github.com/watson/is-ci; see https://github.com/watson/ci-info#supported-ci-tools for
 *    all supported CI tools. Can be used for overriding the automatic detection of CI tools, e.g.,
 *    if not supported by `is-ci`, so that AskUI can be optimized for the corresponding
 *    environment, e.g., adjusting caching behavior.
 */
export interface ContextArgs {
  readonly isCi?: boolean | undefined;
}

/**
 * Configuration options for AskUI's UiControlClient.
 *
 * @property {string} [uiControllerUrl] - Default: `'localhost:23000'`. The gRPC address of
 *    the AskUI AgentOS (AskUI Remote Device Controller) that interacts with the operating
 *    system, e.g., simulating input events and capturing screenshots. When the AgentOS is
 *    managed by the AskUI OS service (`AskuiCoreService`), it listens on `localhost:26000`
 *    instead, which is tried automatically as a fallback if the default address is used.
 * @property {string} [inferenceServerUrl] - Default: `'https://inference.askui.com'`.
 *    Address of the AskUI's inference server which is responsible for understanding the
 *    screenshots and extracting data from them and returning commands for the UiController.
 * @property {(CredentialArgs | undefined)} [credentials] - Optional. Credentials for
 *    the authenticating and authorizing with the inference server.
 * @property {(ProxyAgentArgs | undefined)} [proxyAgents] - Optional. Proxy agents for http(s)
 *    requests against the inference server if running behind a proxy.
 * @property {number} [resize] - Optional. Length in px to resize the screenshot image to before
 *    sending it to the inference server so that the screenshot image's longer side is equal to or
 *    less than it. Aspect ratio (of width and height) is preserved. This can be used to reduce the
 *    inference time by reducing the request size, e.g., if network bandwidth is limited. But it
 *    can cause a decrease in the prediction quality. If undefined, the screenshot image is not
 *    resized but sent as is.
 * @property {(Reporter | Reporter[] | undefined)} [reporter] - Default: `[]`. To configure the
 *    reporter(s) to report on steps (see
 *    https://docs.askui.com/docs/next/general/Components/askui-ui-control-client#reporter).
 * @property {ModelCompositionBranch[]} [modelComposition] - Default: `[]`. To configure the model
 *    composition for the inference server, i.e., which models are used for the inference, e.g.,
 *    test recognition or object detection.
 * @property {(Context | undefined)} [context] - Optional. Context object to provide additional
 *    information about the context of (test) automation, e.g., to allow for optimizations based on
 *    the environment, e.g., CI/CD.
 * @property {(RetryStrategy | undefined)} [retryStrategy] - Default: `new LinearRetryStrategy()`.
 *    Strategy for retrying failed requests to the inference server. This can help manage transient
 *    errors or network issues, improving the reliability of interactions with the server.
 * @property {AIElementArgs} [aiElementArgs] - Options for configuring how AI elements are
 *   collected.
 * @property {Runtime} [runtime] - Default: `'desktop'`. The runtime to automate. `'desktop'`
 *   connects to the AskUI AgentOS via gRPC (see `uiControllerUrl`); `'android'` automates an
 *   Android device directly via `adb` (see `android`).
 * @property {AndroidAdbClientArgs} [android] - Optional. Options for the Android runtime, e.g.
 *   the device serial (`id`) or the `adb` path (`adbPath`). Only used when `runtime` is
 *   `'android'`.
 */
export interface ClientArgs {
  readonly uiControllerUrl?: string
  readonly runtime?: Runtime
  readonly android?: AndroidAdbClientArgs
  readonly inferenceServerUrl?: string
  readonly credentials?: CredentialArgs | undefined
  readonly proxyAgents?: ProxyAgentArgs | undefined
  readonly resize?: number
  readonly modelComposition?: ModelCompositionBranch[]
  readonly reporter?: Reporter | Reporter[] | undefined
  readonly context?: ContextArgs | undefined
  readonly inferenceServerApiVersion?: string
  readonly retryStrategy?: RetryStrategy
  readonly aiElementArgs?: AIElementArgs
  readonly cacheConfig?: CacheConfig
}

export interface ClientArgsWithDefaults extends ClientArgs {
  readonly uiControllerUrl: string
  readonly runtime: Runtime
  readonly inferenceServerUrl: string
  readonly context: Context
  readonly inferenceServerApiVersion: string
  readonly aiElementArgs: AIElementArgs
  readonly retryStrategy?: RetryStrategy
}
