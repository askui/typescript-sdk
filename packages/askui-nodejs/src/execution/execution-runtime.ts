import { BetaMessage, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages';
import { ControlCommand, ControlCommandCode } from '../core/ui-control-commands';
import { CustomElement } from '../core/model/custom-element';
import { AgentOsClient } from './agent-os/agent-os-client';
import { RepeatError } from './repeat-error';
import { delay } from './misc';
import { InferenceClient } from './inference-client';
import { ControlCommandError } from './control-command-error';
import { Annotation } from '../core/annotation/annotation';
import { CustomElementJson } from '../core/model/custom-element-json';
import { logger } from '../lib/logger';
import { Base64Image } from '../utils/base_64_image/base-64-image';
import { DetectedElement } from '../core/model/annotation-result/detected-element';
import { UiControllerClientConnectionState } from './ui-controller-client-connection-state';
import { Instruction, Snapshot, StepReporter } from '../core/reporting';
import { RetryStrategy } from './retry-strategies/retry-strategy';
import { ModelCompositionBranch } from './model-composition-branch';

export class ExecutionRuntime {
  constructor(
    private agentOsClient: AgentOsClient,
    private inferenceClient: InferenceClient,
    private stepReporter: StepReporter,
    public retryStrategy: RetryStrategy,
  ) { }

  async connect(): Promise<UiControllerClientConnectionState> {
    this.inferenceClient.cacheManager.loadFromFile();
    return this.agentOsClient.connect();
  }

  disconnect(): void {
    this.inferenceClient.cacheManager.saveToFile();
    this.agentOsClient.disconnect();
  }

  async requestControl(
    controlCommand: ControlCommand,
  ): Promise<void> {
    await this.agentOsClient.requestControl(controlCommand);
  }

  async executeInstruction(
    instruction: Instruction,
    modelComposition: ModelCompositionBranch[],
    skipCache = false,
    retryStrategy?: RetryStrategy,
  ): Promise<void> {
    const controlCommand = await this.predictCommandWithRetry(
      instruction,
      modelComposition,
      skipCache,
      retryStrategy,
    );
    if (controlCommand.code === ControlCommandCode.OK) {
      return this.requestControl(controlCommand);
    }

    if (controlCommand.tryToRepeat) {
      await this.requestControl(controlCommand);
      return this.executeCommandRepeatedly(instruction, modelComposition);
    }

    throw new ControlCommandError(controlCommand.actions?.[0]?.text ?? '');
  }

  private readonly EXEC_REPETITION_COUNT = 25;

  private async executeCommandRepeatedly(
    instruction: Instruction,
    modelComposition: ModelCompositionBranch[],
  ): Promise<void> {
    /* eslint-disable no-await-in-loop */
    for (let repeatCount = this.EXEC_REPETITION_COUNT; repeatCount >= 0; repeatCount -= 1) {
      if (repeatCount === 0) {
        throw new RepeatError(
          `Max. number (${this.EXEC_REPETITION_COUNT}) of repetitions of command executions `
          + 'from a single test step reached',
        );
      }

      logger.debug('Repeat command execution....');
      const controlCommand = await this.predictCommandWithRetry(instruction, modelComposition);
      if (controlCommand.code === ControlCommandCode.OK) {
        break;
      }

      if (controlCommand.tryToRepeat) {
        await this.requestControl(controlCommand);
      } else {
        throw new ControlCommandError(controlCommand.actions?.[0]?.text ?? '');
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  /**
   * Command prediction may fail, e.g., due to application still loading
   * --> retry with linear back-off
   */
  /* eslint-disable-next-line consistent-return */
  private async predictCommandWithRetry(
    instruction: Instruction,
    modelComposition: ModelCompositionBranch[],
    skipCache = false,
    retryStrategy?: RetryStrategy,
  ): Promise<ControlCommand> {
    const strategy = retryStrategy ?? this.retryStrategy;
    let command = await this.predictCommand(instruction, modelComposition, skipCache);
    /* eslint-disable no-await-in-loop */
    for (let k = 0; k < strategy.retryCount; k += 1) {
      if (command.code === ControlCommandCode.OK) {
        return command;
      }
      const msUntilRetry = strategy.getDelay(k + 1);
      logger.debug(`Wait ${msUntilRetry} and retry ${k + 1}/${strategy.retryCount} predicting command...`);
      await delay(msUntilRetry);
      command = await this.predictCommand(instruction, modelComposition, skipCache, new ControlCommandError(command.actions?.[0]?.text ?? ''));
    }
    /* eslint-enable no-await-in-loop */
    return command;
  }

  private isImageRequiredByConfig(): boolean {
    return this.stepReporter.config.withScreenshots === 'begin'
      || this.stepReporter.config.withScreenshots === 'always';
  }

  private async isImageRequired(
    instruction: string,
    customElements: CustomElement[],
  ): Promise<boolean> {
    if (this.isImageRequiredByConfig()) return Promise.resolve(true);

    return this.inferenceClient.isImageRequired(instruction, customElements);
  }

  private isAnnotationRequired(): boolean {
    return this.stepReporter.config.withDetectedElements === 'begin'
      || this.stepReporter.config.withDetectedElements === 'always';
  }

  async getScreenshot(): Promise<string> {
    return this.agentOsClient.requestScreenshot();
  }

  private async buildSnapshot(instruction: Instruction): Promise<Snapshot> {
    const createdAt = new Date();
    const screenshot = await this.isImageRequired(
      instruction.value,
      instruction.customElements ?? [],
    )
      ? await this.getScreenshot() : undefined;
    const annotation = this.isAnnotationRequired() ? await this.annotateImage() : undefined;
    return {
      createdAt,
      detectedElements: annotation?.detected_elements,
      screenshot,
    };
  }

  private async predictCommand(
    instruction: Instruction,
    modelComposition: ModelCompositionBranch[],
    skipCache = false,
    retryError?: Error,
  ): Promise<ControlCommand> {
    const snapshot = await this.buildSnapshot(instruction);
    if (retryError !== undefined) this.stepReporter.onStepRetry(snapshot, retryError);
    else this.stepReporter.onStepBegin(snapshot);
    const controlCommand = await this.inferenceClient.predictControlCommand(
      instruction.value,
      modelComposition,
      instruction.customElements,
      snapshot.screenshot,
      skipCache,
    );
    if (instruction.secretText !== undefined) {
      controlCommand.setTextToBeTyped(instruction.secretText);
    }
    return controlCommand;
  }

  async takeScreenshotIfImageisNotProvided(imagePath?: string): Promise<string> {
    if (imagePath !== undefined) {
      return (await Base64Image.fromPath(imagePath)).toString();
    }
    return this.agentOsClient.requestScreenshot();
  }

  async getStartingArguments(): Promise<Record<string, string | number | boolean>> {
    return this.agentOsClient.getStartingArguments();
  }

  async getDetectedElements(
    instruction: string,
    customElementJson?: CustomElementJson[],
  ): Promise<DetectedElement[]> {
    let customElements: CustomElement[] = [];
    const base64Image = await this.takeScreenshotIfImageisNotProvided();
    if (customElementJson !== undefined) {
      customElements = await CustomElement.fromJsonListWithImagePathOrImage(customElementJson);
    }
    return this.inferenceClient.getDetectedElements(instruction, base64Image, customElements);
  }

  async annotateImage(
    imagePath?: string,
    customElementJson?: CustomElementJson[],
    elements?: DetectedElement[],
  ): Promise<Annotation> {
    let customElements: CustomElement[] = [];
    const base64Image = await this.takeScreenshotIfImageisNotProvided(imagePath);
    if (elements !== undefined) {
      if (elements.length === 0) {
        logger.warn("Parameter 'elements' is an empty list.");
      }
      return new Annotation(base64Image, elements);
    }
    if (customElementJson !== undefined) {
      customElements = await CustomElement.fromJsonListWithImagePathOrImage(customElementJson);
    }
    return this.inferenceClient.predictImageAnnotation(base64Image, customElements);
  }

  async predictVQA(
    prompt: string,
    config?: object,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const base64Image = await this.takeScreenshotIfImageisNotProvided();
    return this.inferenceClient.predictVQAAnswer(prompt, base64Image, config);
  }

  async predictActResponse(params: {
    max_tokens: number;
    messages: BetaMessageParam[];
    model: string;
    system?: string;
    tools?: object[];
    betas?: string[];
    tool_choice?: {
      type: 'tool' | 'any' | 'auto';
      name?: string;
    };
  }): Promise<BetaMessage> {
    return this.inferenceClient.predictActResponse(params);
  }
}
