import { UiControlClient } from './ui-control-client';
import { ExecutionRuntime } from './execution-runtime';
import { StepReporter, Reporter, Step } from '../core/reporting';
import { DeviceClient } from './device-client';
import { InferenceClient } from './inference-client';
import { ControlCommand } from '../core/ui-control-commands/control-command';
import { ControlCommandCode } from '../core/ui-control-commands/control-command-code';
import { UiControllerClientConnectionState } from './ui-controller-client-connection-state';
import { NoRetryStrategy } from './retry-strategies';
import { AskUIAgent } from '../core/models/anthropic';
import { ControlCommandError } from './control-command-error';
import { AIElementArgs } from '../core/ai-element/ai-elements-args';
import { Annotation } from '../core/annotation/annotation';

jest.mock('../lib/logger');

type UiControlClientConstructor = new (
  workspaceId: string | undefined,
  executionRuntime: ExecutionRuntime,
  stepReporter: StepReporter,
  aiElementArgs: AIElementArgs,
  agent: AskUIAgent,
) => UiControlClient;

function buildDeviceClient(): jest.Mocked<DeviceClient> {
  return {
    connect: jest.fn(),
    connectionState: UiControllerClientConnectionState.CONNECTED,
    disconnect: jest.fn(),
    getStartingArguments: jest.fn().mockResolvedValue({}),
    requestControl: jest.fn().mockResolvedValue(undefined),
    requestScreenshot: jest.fn().mockResolvedValue('base64-screenshot'),
    setActiveDisplay: jest.fn().mockResolvedValue(undefined),
  };
}

function buildInferenceClient(predictControlCommand: jest.Mock): InferenceClient {
  return {
    cacheManager: { loadFromFile: jest.fn(), saveToFile: jest.fn() },
    isImageRequired: jest.fn().mockResolvedValue(false),
    predictControlCommand,
    predictImageAnnotation: jest.fn().mockResolvedValue(new Annotation('base64-annotated-image')),
  } as unknown as InferenceClient;
}

function buildReporter(): Reporter {
  return {
    config: {},
    onStepBegin: jest.fn().mockResolvedValue(undefined),
    onStepEnd: jest.fn().mockResolvedValue(undefined),
    onStepRetry: jest.fn().mockResolvedValue(undefined),
  };
}

function buildClient(predictControlCommand: jest.Mock) {
  const deviceClient = buildDeviceClient();
  const inferenceClient = buildInferenceClient(predictControlCommand);
  const reporter = buildReporter();
  const stepReporter = new StepReporter(reporter);
  const executionRuntime = new ExecutionRuntime(
    deviceClient,
    inferenceClient,
    stepReporter,
    new NoRetryStrategy(),
  );
  const agent = new AskUIAgent(executionRuntime);
  const aiElementArgs: AIElementArgs = { additionalLocations: [], onLocationNotExist: 'error' };
  const Ctor = UiControlClient as unknown as UiControlClientConstructor;
  const client = new Ctor(undefined, executionRuntime, stepReporter, aiElementArgs, agent);
  return { client, deviceClient, reporter };
}

const okCommand = () => new ControlCommand(ControlCommandCode.OK, []);
const errorCommand = () => new ControlCommand(ControlCommandCode.ERROR, [], false);

describe('UiControlClient.waitUntil', () => {
  it('reports a single step with a single onStepEnd when the command succeeds immediately', async () => {
    const predictControlCommand = jest.fn().mockResolvedValue(okCommand());
    const { client, reporter } = buildClient(predictControlCommand);

    await client.waitUntil(client.click().button(), 5, 1);

    expect(reporter.onStepBegin).toHaveBeenCalledTimes(1);
    expect(reporter.onStepRetry).not.toHaveBeenCalled();
    expect(reporter.onStepEnd).toHaveBeenCalledTimes(1);
    const [step] = (reporter.onStepEnd as jest.Mock).mock.calls[0] as [Step];
    expect(step.error).toBeUndefined();
  });

  it('prefixes the reported instruction so waitUntil steps are recognizable in the report', async () => {
    const predictControlCommand = jest.fn().mockResolvedValue(okCommand());
    const { client, reporter } = buildClient(predictControlCommand);

    await client.waitUntil(client.click().button(), 5, 1);

    const [step] = (reporter.onStepEnd as jest.Mock).mock.calls[0] as [Step];
    expect(step.instruction.value).toBe('waitUntil: Click on button');
  });

  it('reports failed attempts as retries of the same step, not as separate steps', async () => {
    const predictControlCommand = jest.fn()
      .mockResolvedValueOnce(errorCommand())
      .mockResolvedValueOnce(errorCommand())
      .mockResolvedValueOnce(okCommand());
    const { client, reporter } = buildClient(predictControlCommand);

    await client.waitUntil(client.click().button(), 5, 1);

    expect(reporter.onStepBegin).toHaveBeenCalledTimes(1);
    expect(reporter.onStepRetry).toHaveBeenCalledTimes(2);
    expect(reporter.onStepEnd).toHaveBeenCalledTimes(1);
    const [step] = (reporter.onStepEnd as jest.Mock).mock.calls[0] as [Step];
    expect(step.error).toBeUndefined();
    expect(step.retryCount).toBe(2);
  });

  it('only reports (and saves) a screenshot for the last, truly final failure, not for every failed attempt', async () => {
    const predictControlCommand = jest.fn().mockResolvedValue(errorCommand());
    const { client, reporter } = buildClient(predictControlCommand);

    await expect(client.waitUntil(client.click().button(), 3, 1))
      .rejects.toBeInstanceOf(ControlCommandError);

    // exactly one step is reported as begun and ended -- not one per failed attempt
    expect(reporter.onStepBegin).toHaveBeenCalledTimes(1);
    expect(reporter.onStepEnd).toHaveBeenCalledTimes(1);
    // 3 tries total => 2 intermediate retries before the final, non-retryable failure
    expect(reporter.onStepRetry).toHaveBeenCalledTimes(2);

    const [step] = (reporter.onStepEnd as jest.Mock).mock.calls[0] as [Step];
    expect(step.error).toBeInstanceOf(ControlCommandError);
    // the final, saved failure carries a screenshot (default withScreenshots: 'onFailure')
    expect(step.end?.screenshot).toBeDefined();
  });
});
