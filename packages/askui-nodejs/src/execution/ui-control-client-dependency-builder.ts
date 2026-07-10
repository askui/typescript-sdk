import isCI from 'is-ci';
import { HttpClientGot } from '../utils/http/http-client-got';
import { AgentOsClient } from './agent-os/agent-os-client';
import { AndroidAdbClient } from './android/android-adb-client';
import { LegacyAndroidClient } from './legacy-controller/legacy-android-client';
import { DeviceClient } from './device-client';
import { InferenceClient } from './inference-client';
import {
  ClientArgs,
  ClientArgsWithDefaults,
} from './ui-controller-client-interface';
import { Analytics } from '../utils/analytics';
import { envProxyAgents } from '../utils/proxy/proxy-builder';
import { ExecutionRuntime } from './execution-runtime';
import { StepReporter } from '../core/reporting';
import { readCredentials } from './read-credentials';
import { LinearRetryStrategy } from './retry-strategies/linear-retry-strategy';
import { CacheManager, DummyCacheManager } from '../core/cache';
import { logger } from '../lib/logger';

export class UiControlClientDependencyBuilder {
  private static async buildHttpClient(
    clientArgs: ClientArgsWithDefaults,
  ): Promise<HttpClientGot> {
    const analytics = new Analytics();
    const analyticsHeaders = await analytics.getAnalyticsHeaders(
      clientArgs.context,
    );
    const analyticsCookies = await analytics.getAnalyticsCookies();
    return new HttpClientGot(
      clientArgs.credentials?.token,
      analyticsHeaders,
      analyticsCookies,
      clientArgs.proxyAgents,
    );
  }

  private static async buildInferenceClient(
    clientArgs: ClientArgsWithDefaults,
  ): Promise<InferenceClient> {
    const httpClient = await UiControlClientDependencyBuilder.buildHttpClient(
      clientArgs,
    );
    let cacheManager = new DummyCacheManager();
    if (clientArgs.cacheConfig) {
      cacheManager = new CacheManager(clientArgs.cacheConfig);
    }
    return new InferenceClient(
      clientArgs.inferenceServerUrl,
      httpClient,
      cacheManager,
      clientArgs.resize,
      clientArgs.credentials?.workspaceId,
      clientArgs.modelComposition,
      clientArgs.inferenceServerApiVersion,
    );
  }

  private static buildDeviceClient(
    clientArgs: ClientArgsWithDefaults,
  ): DeviceClient {
    if (clientArgs.runtime === 'android') {
      const android = clientArgs.android ?? {};
      if ((android.transport ?? 'legacy-controller') === 'adb') {
        return new AndroidAdbClient(android);
      }
      return new LegacyAndroidClient(android);
    }
    return new AgentOsClient(clientArgs.agentOsUrl);
  }

  static async build(clientArgs: ClientArgsWithDefaults): Promise<{
    executionRuntime: ExecutionRuntime;
    stepReporter: StepReporter;
    workspaceId: string | undefined;
  }> {
    const deviceClient = UiControlClientDependencyBuilder.buildDeviceClient(clientArgs);
    const inferenceClient = await UiControlClientDependencyBuilder.buildInferenceClient(clientArgs);
    const stepReporter = new StepReporter(clientArgs.reporter);
    const workspaceId = clientArgs.credentials?.workspaceId;
    return {
      executionRuntime: new ExecutionRuntime(
        deviceClient,
        inferenceClient,
        stepReporter,
        clientArgs.retryStrategy ?? new LinearRetryStrategy(),
      ),
      stepReporter,
      workspaceId,
    };
  }

  static async getClientArgsWithDefaults(
    clientArgs: ClientArgs,
  ): Promise<ClientArgsWithDefaults> {
    if (clientArgs.uiControllerUrl !== undefined && clientArgs.agentOsUrl === undefined) {
      logger.warn(
        "'uiControllerUrl' is deprecated and will be removed in a future release. "
        + "Use 'agentOsUrl' instead.",
      );
    }
    return {
      ...clientArgs,
      agentOsUrl: clientArgs.agentOsUrl ?? clientArgs.uiControllerUrl ?? 'localhost:26000',
      aiElementArgs: {
        additionalLocations: clientArgs.aiElementArgs?.additionalLocations ?? [],
        onLocationNotExist: clientArgs.aiElementArgs?.onLocationNotExist ?? 'error',
      },
      context: {
        isCi: clientArgs.context?.isCi ?? isCI,
      },
      credentials: readCredentials(clientArgs),
      inferenceServerApiVersion: clientArgs.inferenceServerApiVersion ?? 'v1',
      inferenceServerUrl:
        clientArgs.inferenceServerUrl ?? 'https://inference.askui.com',
      proxyAgents: clientArgs.proxyAgents ?? (await envProxyAgents()),
      runtime: clientArgs.runtime ?? 'desktop',
    };
  }
}
