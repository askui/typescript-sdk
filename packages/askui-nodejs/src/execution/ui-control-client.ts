import { ValidationError } from 'yup';
import { CustomElement } from '../core/model/custom-element';
import { CustomElementJson } from '../core/model/custom-element-json';
import {
  Exec,
  Executable,
  FluentFilters,
  ApiCommands,
  Separators,
  PC_AND_MODIFIER_KEY,
  FluentFiltersOrRelations,
  CommandExecutorContext,
  FluentFiltersOrRelationsGetter,
} from './dsl';
import { UiControllerClientConnectionState } from './ui-controller-client-connection-state';
import { ExecutionRuntime } from './execution-runtime';
import { Annotation } from '../core/annotation/annotation';
import { AnnotationWriter } from '../core/annotation/annotation-writer';
import { AnnotationRequest } from '../core/model/annotation-result/annotation-interface';
import { logger } from '../lib/logger';
import { DetectedElement } from '../core/model/annotation-result/detected-element';
import { ClientArgs } from './ui-controller-client-interface';
import { UiControlClientDependencyBuilder } from './ui-control-client-dependency-builder';
import { Instruction, StepReporter } from '../core/reporting';
import { AIElementCollection } from '../core/ai-element/ai-element-collection';
import { ModelCompositionBranch } from './model-composition-branch';
import { AIElementArgs } from '../core/ai-element/ai-elements-args';
import { FixedRetryStrategy, RetryStrategy } from './retry-strategies';
import { AskUIAgent, AgentHistory, ActOptions } from '../core/models/anthropic';
import { AskUIGetAskUIElementTool, AskUIListAIElementTool } from '../core/models/anthropic/tools/askui-api-tools';

export type RelationsForConvenienceMethods = 'nearestTo' | 'leftOf' | 'above' | 'rightOf' | 'below' | 'contains';
export type TextMatchingOption = 'similar' | 'exact' | 'regex';
export type ElementExistsQueryType = 'otherElement' | 'switch' | 'element' | 'container' | 'checkbox' | 'element' | 'button' | 'table' | 'text' | 'icon' | 'image' | 'textfield';
export interface ElementExistsQueryText {
  value: string;
  matching?: TextMatchingOption;
}
export interface ElementExistsQueryRelation {
  type: RelationsForConvenienceMethods;
  text: string;
}
export interface ElementExistsQuery {
  type: keyof Pick<FluentFilters, ElementExistsQueryType>;
  text?: ElementExistsQueryText;
  relation?: ElementExistsQueryRelation;
}
export interface ExpectExistenceElement extends ElementExistsQuery {
  exists: boolean;
}
export interface ExpectAllExistResult {
  allExist: boolean;
  elements: ExpectExistenceElement[];
}

export class UiControlClient extends ApiCommands {
  private constructor(
    private workspaceId: string | undefined,
    private executionRuntime: ExecutionRuntime,
    private stepReporter: StepReporter,
    private aiElementArgs: AIElementArgs,
    public agent: AskUIAgent,
  ) {
    super();
  }

  static async build(clientArgs: ClientArgs = {}): Promise<UiControlClient> {
    const builder = UiControlClientDependencyBuilder;
    const clientArgsWithDefaults = await builder.getClientArgsWithDefaults(clientArgs);
    const {
      workspaceId,
      executionRuntime,
      stepReporter,
    } = await builder.build(clientArgsWithDefaults);
    const agent = new AskUIAgent(executionRuntime);
    return new UiControlClient(
      workspaceId,
      executionRuntime,
      stepReporter,
      clientArgsWithDefaults.aiElementArgs,
      agent,
    );
  }

  /**
   * Connects to the AskUI AgentOS.
   */
  async connect(): Promise<UiControllerClientConnectionState> {
    const connectionState = await this.executionRuntime.connect();
    await this.agent.initializeOsAgentHandler();
    await this.agent.configureAgent();
    return connectionState;
  }

  /**
   * Disconnects from the AskUI AgentOS.
   */
  disconnect(): void {
    this.executionRuntime.disconnect();
  }

  /**
   * Disconnects from the AskUI AgentOS.
   *
   * @deprecated Use {@link disconnect} instead.
   */
  close(): void {
    this.disconnect();
  }

  private shouldAnnotateAfterCommandExecution(error?: Error): boolean {
    return (this.stepReporter.config.withDetectedElements === 'onFailure' && error !== undefined)
      || (this.stepReporter.config.withDetectedElements === 'always');
  }

  private async beforeNoneInferenceCallCommandExecution(instruction: Instruction): Promise<void> {
    this.stepReporter.resetStep(instruction);
    let annotation: Annotation | undefined;
    if (this.stepReporter.config.withDetectedElements === 'begin'
      || this.stepReporter.config.withDetectedElements === 'always') {
      annotation = await this.executionRuntime.annotateImage();
    }
    const createdAt = new Date();
    await this.stepReporter.onStepBegin({
      createdAt,
      detectedElements: annotation?.detected_elements,
      screenshot: annotation?.image,
    });
  }

  private async afterCommandExecution(instruction: Instruction, error?: Error): Promise<void> {
    const createdAt = new Date();
    let annotation: Annotation | undefined;
    let screenshot: string | undefined;
    if (this.shouldAnnotateAfterCommandExecution(error)) {
      annotation = await this.executionRuntime.annotateImage(
        undefined,
        instruction.customElements,
      );
    }
    if (annotation !== undefined || this.stepReporter.config.withScreenshots === 'always') {
      screenshot = annotation?.image ?? await this.executionRuntime.getScreenshot();
    }
    await this.stepReporter.onStepEnd({
      createdAt,
      detectedElements: annotation?.detected_elements,
      screenshot,
    }, error);
  }

  async annotate(
    annotationRequest: AnnotationRequest = {},
  ): Promise<Annotation> {
    const annotation = await this.executionRuntime.annotateImage(
      annotationRequest.imagePath,
      annotationRequest.customElements,
      annotationRequest.elements,
    );
    AnnotationWriter.write(
      annotation.toHtml(),
      annotationRequest.outputPath,
      annotationRequest.fileNamePrefix,
    );
    return annotation;
  }

  // eslint-disable-next-line class-methods-use-this
  private escapeSeparatorString(instruction: string): string {
    return instruction.split(Separators.STRING).join('"');
  }

  private async buildInstruction(
    instructionString: string,
    customElementJson: CustomElementJson[] = [],
  ): Promise<Instruction> {
    return {
      customElements: await CustomElement.fromJsonListWithImagePathOrImage(customElementJson),
      secretText: this.getAndResetSecretText(),
      value: instructionString,
      valueHumanReadable: this.escapeSeparatorString(instructionString),
    };
  }

  private async getAIElementsByNames(names: string[]): Promise<CustomElementJson[]> {
    if (names.length === 0) {
      return [];
    }
    // eslint-disable-next-line max-len
    const workspaceAIElementCollection = await AIElementCollection.collectAIElements(this.workspaceId, this.aiElementArgs);
    return workspaceAIElementCollection.getByNames(names);
  }

  async fluentCommandExecutor(
    instructionString: string,
    modelComposition: ModelCompositionBranch[],
    context: CommandExecutorContext = { customElementsJson: [], aiElementNames: [] },
    skipCache = false,
    retryStrategy?: RetryStrategy,
  ): Promise<void> {
    const aiElements = await this.getAIElementsByNames(context.aiElementNames);
    const instruction = await this.buildInstruction(
      instructionString,
      [
        ...context.customElementsJson,
        ...aiElements,
      ],
    );
    logger.debug(instruction);
    try {
      this.stepReporter.resetStep(instruction);
      await this.executionRuntime.executeInstruction(
        instruction,
        modelComposition,
        skipCache,
        retryStrategy,
      );
      await this.afterCommandExecution(instruction);
      return await Promise.resolve();
    } catch (error) {
      await this.afterCommandExecution(
        instruction,
        error instanceof Error ? error : new Error(String(error)),
      );
      return Promise.reject(error);
    }
  }

  async getterExecutor(
    instruction: string,
    context: CommandExecutorContext = { customElementsJson: [], aiElementNames: [] },
  ): Promise<DetectedElement[]> {
    const aiElements = await this.getAIElementsByNames(context.aiElementNames);
    const customElements = await CustomElement.fromJsonListWithImagePathOrImage(
      context.customElementsJson,
    );
    const stringWithoutSeparators = this.escapeSeparatorString(instruction);
    logger.debug(stringWithoutSeparators);
    return this.executionRuntime.getDetectedElements(
      instruction,
      [
        ...customElements,
        ...aiElements,
      ],
    );
  }

  /**
   * Takes a prompt that contains a question you want to be answered
   * or the data you want to have extracted from your screen.
   *
   * The optional 'config' can be used to specifiy the JSON schema the
   * returned object shall have (https://json-schema.org).
   *
   * See the following examples on how to use it:
   *
   * let isWidgetsNew =
   *   await aui.ask(
   *     "Does the sidebar element 'Widgets' have a 'NEW' tag?",
   *     {
   *       json_schema: {
   *         "type": "boolean"
   *       }
   *     });
   *
   * Output of console.log(isWidgetsNew): true
   *
   * let newClients =
   *   await aui.ask(
   *     "How many new clients?",
   *     {
   *       json_schema: {
   *         "type": "number"
   *       }
   *     });
   *
   * Output of console.log(newClients): 9123
   *
   * let userNames =
   *   await aui.ask(
   *     "Return a list with the users names.",
   *     {
   *       json_schema: {
   *         "type": "array",
   *         "items": {
   *           "type": "string"
   *         }
   *       }
   *     });
   *
   * Output of console.log(userNames):
   * [
   *   'Yiorgos Avraamu',
   *   'Avram Tsarios',
   *   'Quintin Ed',
   *   'Enéas Kwadwo',
   *   'Agapetus Tadeáš'
   * ]
   *
   * let users =
   *   await aui.ask(
   *     "Extract the users from the table.",
   *     {
   *       json_schema: {
   *         "type": "array",
   *         "items": {
   *           "type": "object",
   *           "properties": {
   *             "name": {
   *               "type": "string"
   *             },
   *             "usage": {
   *               "type": "number"
   *             }
   *           },
   *           "additionalProperties": false,
   *           "required": ["name", "usage"]
   *         },
   *       },
   *     });
   *
   * Output of console.log(users):
   * [
   *   { name: 'Yiorgos Avraamu', usage: 50 },
   *   { name: 'Avram Tarasios', usage: 10 },
   *   { name: 'Quintin Ed', usage: 74 },
   *   { name: 'Eneás Kwadwo', usage: 98 },
   *   { name: 'Agapetus Tadeáš', usage: 22 }
   * ]
   *
   * @param {string} prompt - The question you want to be answered or
   *                          the data you want to have extracted.
   * @param {Object} config - object that specifies the return json: {json_schema: {...}}.
   * @returns {any} - The answer as JSON specified in the config object.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ask(prompt: string, config?: object): Promise<any> {
    return this.executionRuntime.predictVQA(prompt, config);
  }

  private secretText: string | undefined = undefined;

  private getAndResetSecretText(): string | undefined {
    const { secretText } = this;
    this.secretText = undefined;
    return secretText;
  }

  /**
   * Types a text inside the filtered element.
   *
   * By default, the `text` is included in the logs and sent over to the askui Inference server to
   * predict in which context the typing has to occur. You can exclude the `text` from the logs
   * and the request to the askui Inference server setting `options.isSecret` to `true`.
   * This should not change the quality of the prediction of the askui Inference server. In this
   * case, `options.secretMask` is included in logs and sent over instead of the `text`.
   *
   * @param {string} text - A text to type.
   * @param {Object} [options]
   * @param {boolean} [options.isSecret = false] - If set to `true`, `text` is neither included in
   *   logs of askui nor sent over to askui Inference for prediction.
   * @param {string} [options.secretMask = '****'] - If `options.isSecret` is set to `true`, this
   *   is included in logs and sent over to askui Inference for prediction instead of the `text`.
   *
   * @return {FluentFilters}
   */
  override typeIn(text: string, { isSecret = false, secretMask = '****' }: { isSecret?: boolean; secretMask?: string; } = {}): FluentFilters {
    if (text.length === 0) {
      throw new ValidationError('Empty string is not allowed. Typing of an empty string was rejected.');
    }

    if (isSecret) {
      this.secretText = text;
      return super.typeIn(secretMask);
    }

    return super.typeIn(text);
  }

  /**
   * Types a text at the current position.
   *
   * By default, the `text` is included in the logs and sent over to the askui Inference server to
   * predict in which context the typing has to occur. You can exclude the `text` from the logs
   * and the request to the askui Inference server setting `options.isSecret` to `true`.
   * This should not change the quality of the prediction of the askui Inference server. In this
   * case, `options.secretMask` is included in logs and sent over instead of the `text`.
   *
   * @param {string} text - A text to type.
   * @param {Object} options
   * @param {boolean} [options.isSecret = false] - If set to `true`, `text` is neither included in
   *   logs of askui nor sent over to askui Inference for prediction.
   * @param {string} [options.secretMask = '****'] - If `options.isSecret` is set to `true`, this
   *   is included in logs and sent over to askui Inference for prediction instead of the `text`.
   *
   * @return {Exec}
   */
  override type(text: string, { isSecret = false, secretMask = '****' }: { isSecret?: boolean; secretMask?: string; } = {}): Exec {
    if (text.length === 0) {
      throw new ValidationError('Empty string is not allowed. Typing of an empty string was rejected.');
    }

    if (isSecret) {
      this.secretText = text;
      return super.type(secretMask);
    }

    return super.type(text);
  }

  /**
   * Waits for `<delayInMs>` ms, e.g., 1000 ms. The exact delay may be a little longer
   * than `<delayInMs>` but never shorter than that.
   *
   * @param {number} delayInMs - The delay in ms to wait for.
   *
   * @return {Executable}
   */
  // eslint-disable-next-line class-methods-use-this
  waitFor(delayInMs: number): Executable {
    return {
      exec: async (): Promise<void> => {
        const stepTitle = `Wait for ${delayInMs} ms`;
        const instruction = await this.buildInstruction(stepTitle, []);
        await this.beforeNoneInferenceCallCommandExecution(instruction);
        await new Promise((resolve) => { setTimeout(resolve, delayInMs); });
        await this.afterCommandExecution(instruction);
        return Promise.resolve();
      },
    };
  }

  /**
   * Press a key multiple times. At least two times.
   *
   * @param {PC_AND_MODIFIER_KEY} key
   *
   * @param {number} times
   */
  async pressKeyNTimes(key: PC_AND_MODIFIER_KEY, times = 2) {
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < times; i += 1) {
      await this.pressKey(key).exec();
    }
  }

  /**
   * Press an array of keys one after another.
   *
   * For example press the following keys: right, left, enter.
   *
   * pressKeys(['right', 'left', 'enter'])
   *
   * @param {PC_AND_MODIFIER_KEY[]} keys
   */
  async pressKeys(keys: PC_AND_MODIFIER_KEY[]) {
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < keys.length; i += 1) {
      await this.pressKey(keys[i] as PC_AND_MODIFIER_KEY).exec();
    }
  }

  /**
   * Searches for text elements and clicks them
   * one after another when found.
   *
   * @param {string[]} texts - An array of texts to be searched.
   */
  async clickTexts(texts: string[]) {
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < texts.length; i += 1) {
      await this.click().text(texts[i] as string).exec();
    }
  }

  /**
   * Searches for an element of type textfield with a specific placeholder text.
   * If found, clicks it.
   *
   * @param {string} placeholder - The textfields placeholder text.
   */
  async clickTextfield(placeholder: string) {
    await this.click().textfield().contains().text()
      .withText(placeholder)
      .exec();
  }

  /**
   * Searches for an element of type textfield with a specific
   * label nearest to it. If found, clicks it.
   *
   * @param {string} label - The textfields label.
   */
  async clickTextfieldNearestTo(label: string) {
    await this.click().textfield().nearestTo().text(label)
      .exec();
  }

  /**
   * Wait until an AskUICommand does not fail.
   *
   * Use it to wait for an element to appear like this:
   *
   * await waitUntil(
   *     aui.expect().text('Github').exists()
   *   );
   *
   * @param {Executable} AskUICommand - For example: aui.moveMouse(0, 0)
   * @param {number} maxTry - Number of maximum retries
   * @param {number} waitTime - Time in milliseconds
   */
  // eslint-disable-next-line class-methods-use-this
  async waitUntil(AskUICommand: Executable, maxTry = 5, waitTime = 2000): Promise<void> {
    logger.debug(`waitUntil: Starting with maxTry=${maxTry}, waitTime=${waitTime}ms`);
    await AskUICommand.exec({
      instructionPrefix: 'waitUntil: ',
      retryStrategy: new FixedRetryStrategy(waitTime, maxTry - 1),
    });
  }

  private evaluateRelation(
    command: FluentFiltersOrRelations,
    relation: RelationsForConvenienceMethods,
    text: string,
  ): FluentFiltersOrRelations;
  private evaluateRelation(
    command: FluentFiltersOrRelationsGetter,
    relation: RelationsForConvenienceMethods,
    text: string,
  ): FluentFiltersOrRelationsGetter;
  // eslint-disable-next-line class-methods-use-this
  private evaluateRelation(
    command: FluentFiltersOrRelations | FluentFiltersOrRelationsGetter,
    relation: RelationsForConvenienceMethods,
    text: string,
  ): FluentFiltersOrRelations | FluentFiltersOrRelationsGetter {
    switch (relation) {
      case 'leftOf':
        return command.leftOf().text(text);
      case 'above':
        return command.above().text(text);
      case 'rightOf':
        return command.rightOf().text(text);
      case 'below':
        return command.below().text(text);
      case 'contains':
        return command.contains().text(text);
      case 'nearestTo':
        return command.nearestTo().text(text);
      default:
        throw new ValidationError(`'relation' has to be 'nearestTo', 'leftOf', 'above', 'rightOf', 'below' or 'contains' but was '${relation}'`);
    }
  }

  /**
   * Click a button with a specific label.
   * Optional relation identifies the button in relation to another element.
   *
   * **Examples:**
   * ```typescript
   * await aui.clickButton({})
   * await aui.clickButton({label: 'Checkout here'})
   * await aui.clickButton({relation: {type: 'leftOf', text: 'Choose a ticket'}})
   * await aui.clickButton({label: 'Click', {relation: {type: 'leftOf', text: 'Choose a ticket'}})
   * ```
   *
   * @param {Object} params - Object containing properties.
   * @property {string} [params.label] - The text label of the button. Defaults to an empty string.
   * @property {Object} [params.relation] - Object describing the relationship between
   *                                        the clicked button and another element.
   * @property {RelationsForConvenienceMethods} params.relation.type - The type of relation.
   * @property {string} params.relation.text - The text element the relation is based on.
   */
  async clickButton(
    params: {
      label?: string,
      relation?: {
        type: RelationsForConvenienceMethods,
        text: string
      }
    },
  ) {
    let command: FluentFiltersOrRelations | FluentFiltersOrRelationsGetter = this.click().button();

    if (params.label) {
      command = command.withText(params.label);
    }

    if (params.relation) {
      command = this.evaluateRelation(command, params.relation.type, params.relation.text);
    }

    await command.exec();
  }

  /**
   * Click a checkbox with a specific label.
   * You can also specify where the label is placed relationally.
   *
   * **Examples:**
   * ```typescript
   * await aui.clickCheckbox({label: 'Toggle'})
   * await aui.clickCheckbox({label: 'Toggle', relation: {type: 'leftOf'}})
   * ```
   *
   * @param {Object} params - Object containing required `label` property and
   *                          optional `relation` property.
   * @property {string} params.label - The label for the checkbox.
   * @property {Object} [params.relation] - Object describing the relationship between
   *                                        the clicked checkbox and another element.
   * @property {RelationsForConvenienceMethods} params.relation.type - The type of relation.
   */
  async clickCheckbox(
    params: {
      label: string,
      relation?: {
        type: RelationsForConvenienceMethods
      }
    },
  ) {
    let command:
    FluentFiltersOrRelations |
    FluentFiltersOrRelationsGetter = this.click().checkbox();

    if (!params.relation) {
      command = command.nearestTo().text(params.label);
    } else {
      command = this.evaluateRelation(command, params.relation.type, params.label);
    }

    await command.exec();
  }

  /**
   * Click a switch with a specific label.
   * You can also specify where the label is placed relationally.
   *
   * **Examples:**
   * ```typescript
   * await aui.clickSwitch({label: 'Toggle'})
   * await aui.clickSwitch({label: 'Toggle', relation: {type: 'leftOf'}})
   * ```
   *
   * @param {Object} params - Object containing required `label` property and
   *                          optional `relation` property.
   * @property {string} params.label - The label for the checkbox.
   * @property {Object} [params.relation] - Object describing the relationship between
   *                                      the clicked checkbox and another element.
   * @property {RelationsForConvenienceMethods} params.relation.type - The type of relation.
   */
  async clickSwitch(
    params: {
      label: string,
      relation?: {
        type: RelationsForConvenienceMethods
      }
    },
  ) {
    let command: FluentFiltersOrRelations | FluentFiltersOrRelationsGetter = this.click().switch();

    if (!params.relation) {
      command = command.nearestTo().text(params.label);
    } else {
      command = this.evaluateRelation(command, params.relation.type, params.label);
    }

    await command.exec();
  }

  /**
   * Types a given text into a textfield.
   * Use a relation to specify how to find
   * the textfield in relation to a specific label.
   *
   * **Examples:**
   * ```typescript
   * // Finds the textfield nearest to the label 'Email'
   * await aui.typeIntoTextfield({textToWrite: 'Hello World', relation: {label: 'Email'}});
   *
   * // Finds the textfield above/below a label 'Password'
   * await aui.typeIntoTextfield(
   *   {textToWrite: 'Hello World', relation: {type: 'above', label: 'Password'}}
   * );
   * await aui.typeIntoTextfield(
   *   {textToWrite: 'Hello World', relation: {type: 'below', label: 'Password'}}
   * );
   *
   * // If there is no label but a placeholder, the label is contained in the textfield
   * await aui.typeIntoTextfield(
   *   {textToWrite: 'Hello World', relation: {type: 'contains', label: 'Enter email'}}
   * );
   * ```
   *
   * @param {Object} params - Object containing required `textToWrite` property and
   *                          optional `relation` property.
   * @property {string} params.textToWrite - The text to be typed into the textfield.
   * @property {Object} params.relation - Object describing the relationship between the
   *                                      textfield being interacted with and another element.
   * @property {RelationsForConvenienceMethods} params.relation.type - The type of
   *                                                                   relation, optional.
   * @property {string} params.relation.label - The label associated with the related
   *                                            element, optional.
   */
  async typeIntoTextfield(
    params: {
      textToWrite: string,
      relation: {
        type?: RelationsForConvenienceMethods,
        label: string
      }
    },
  ) {
    let command:
    FluentFiltersOrRelations |
    FluentFiltersOrRelationsGetter = this.typeIn(params.textToWrite).textfield();

    if (!params.relation.type) {
      command = command.nearestTo().text(params.relation.label);
    } else {
      command = this.evaluateRelation(command, params.relation.type, params.relation.label);
    }

    await command.exec();
  }

  /**
   * Click on a specific text.
   * You can also use a RegEx or match the text exactly by specifying the specific flag.
   * Use a relation to find the text in relation to a specific text.
   *
   * **Examples:**
   * ```typescript
   * // Click text that matches exactly
   * await aui.clickText({text: 'askui', matching: 'similar'})
   *
   * // Click text that contains 'pie' or 'cake' or 'Pie' or 'Cake'
   * await aui.clickText({text: '.*([Pp]ie|[Cc]ake).*', matching: 'regex'})
   *
   * // Click the text 'TERMINAL' that is left of the text 'Ports'
   * await aui.clickText({
   *     text: 'TERMINAL',
   *     matching: "exact",
   *     relation: { type: 'leftOf', text: 'PORTS' }
   *   })
   * ```
   *
   * @param {Object} params - Object containing required `text` property and optional properties
   *                          for regular expression matching and relation.
   * @property {string} params.text - The text to be clicked.
   * @property {string} params.matching - Whether the text is matched using similarity,
   *                                      exact match or a regular expression.
   * @property {Object} [params.relation] - Object describing the relationship between the
   *                                        clicked text and another element.
   * @property {RelationsForConvenienceMethods} params.relation.type - The type of relation.
   * @property {string} params.relation.text - The label or text associated with the
   *                                           related element or state.
   */
  async clickText(
    params: {
      text: string,
      matching: TextMatchingOption,
      relation?: {
        type: RelationsForConvenienceMethods,
        text: string
      }
    },
  ) {
    let command: FluentFiltersOrRelations | FluentFiltersOrRelationsGetter = this.click().text();
    command = this.evaluateMatchingProperty(
      command,
      { value: params.text, matching: params.matching },
    );
    if (params.relation) {
      command = this.evaluateRelation(command, params.relation.type, params.relation.text);
    }
    await command.exec();
  }

  private evaluateMatchingProperty(
    command: FluentFiltersOrRelations,
    text: ElementExistsQueryText,
  ): FluentFiltersOrRelations;
  private evaluateMatchingProperty(
    command: FluentFiltersOrRelationsGetter,
    text: ElementExistsQueryText,
  ): FluentFiltersOrRelationsGetter;
  // eslint-disable-next-line class-methods-use-this
  private evaluateMatchingProperty(
    command: FluentFiltersOrRelations | FluentFiltersOrRelationsGetter,
    text: ElementExistsQueryText,
  ): FluentFiltersOrRelations | FluentFiltersOrRelationsGetter {
    switch (text.matching ?? 'similar') {
      case 'exact':
        return command.withExactText(text.value);
      case 'regex':
        return command.withTextRegex(text.value);
      case 'similar':
        return command.withText(text.value);
      default:
        throw new ValidationError(`'text.matching' property has to be 'similar', 'exact' or 'regex' but was '${text.matching}'`);
    }
  }

  /**
   * Check if one or multiple elements are detected.
   *
   * **Examples:**
   * ```typescript
   * await aui.expectAllExist([
   *   {
   *     type: 'text',
   *     text: {
   *       value: 'Switch to Dark',
   *       matching: 'similar'
   *     }
   *   },
   * ]);
   *
   * // Check for existence of multiple elements
   * await aui.expectAllExist([
   *   {
   *     type: 'textfield',
   *     relation: {
   *       type: 'rightOf',
   *       text: 'Email:'
   *     }
   *   },
   *   {
   *     type: 'element',
   *     text: {
   *       value: 'Switch to Dark'
   *     }
   *   },
   * ]);
   *
   * // Validate existence
   * const exists = await aui.expectAllExist([...]);
   * exists.allExist // true when every element exists
   *
   * // Check which elements do not exist
   * // with the elements property
   * const nonExistentElements = exists.elements.filter((e) => e.exists===false)
   * ```
   *
   * @param {ElementExistsQuery[]} query - Objects containing the required property
   *                                                   'type' and the optional properties
   *                                                   'text' and 'relation'.
   * @property {string} query.type - The type of the element: 'otherElement' | 'switch' |
   *                                 'element' | 'container' | 'checkbox' | 'element' |
   *                                 'button' | 'table' | 'text' | 'icon' | 'image' | 'textfield'
   * @property {Object} [query.text] - Object containing value and matching strategy.
   * @property {string} query.text.value - The text to match for.
   * @property {string} [query.text.matching] - Whether the text is matched using similarity,
   *                                            exact match or a regular expression.
   * @property {Object} [query.relation] - Object describing the relationship between the
   *                                       clicked text and another element.
   * @property {RelationsForConvenienceMethods} query.relation.type - The type of relation.
   * @property {string} query.relation.text - The label or text associated with the
   *                                          related element or state.
   * @returns {ExpectAllExistResult.allExist} - If every element exists.
   * @returns {ExpectAllExistResult.elements} - ExpectExistenceElement[].
   */
  async expectAllExist(
    query: ElementExistsQuery[],
  ): Promise<ExpectAllExistResult> {
    const elements = await query.reduce(async (accumulatorPromise, subquery) => {
      const acc = await accumulatorPromise;
      const command = this.get()[subquery.type]();
      let finalCommand = subquery.text !== undefined
        ? this.evaluateMatchingProperty(command, subquery.text)
        : command;
      if (subquery.relation) {
        finalCommand = this.evaluateRelation(
          finalCommand,
          subquery.relation.type,
          subquery.relation.text,
        );
      }
      return [
        ...acc,
        {
          ...subquery,
          exists: (await finalCommand.exec()).length > 0,
        },
      ];
    }, Promise.resolve<ExpectExistenceElement[]>([]));
    return {
      elements,
      allExist: elements.every((el) => el.exists),
    };
  }

  /**
   * Holds down a key on the keyboard.
   *
   * **Examples:**
   * ```typescript
   * await aui.keyDown('a').exec();
   * ```
   *
   * @param {PC_AND_MODIFIER_KEY} key - The key to hold down.
   */
  keyDown(key: PC_AND_MODIFIER_KEY): Executable {
    return {
      exec: async (): Promise<void> => {
        const stepTitle = `Hold down key ${key}`;
        const instruction = await this.buildInstruction(stepTitle, []);
        try {
          await this.beforeNoneInferenceCallCommandExecution(instruction);
          await this.agent.getOsAgentHandler().desktopKeyHoldDown(key, []);
          await this.afterCommandExecution(instruction);
        } catch (error) {
          await this.afterCommandExecution(
            instruction,
            error instanceof Error ? error : new Error(String(error)),
          );
          return Promise.reject(error);
        }
        return Promise.resolve();
      },
    };
  }

  /**
   * Releases a key up that was previously held down.
   *
   * **Examples:**
   * ```typescript
   * await aui.keyUp('a').exec();
   * ```
   *
   * @param {PC_AND_MODIFIER_KEY} key - The key to release up.
   */
  keyUp(key: PC_AND_MODIFIER_KEY): Executable {
    return {
      exec: async (): Promise<void> => {
        const stepTitle = `Release key ${key}`;
        const instruction = await this.buildInstruction(stepTitle, []);
        try {
          await this.beforeNoneInferenceCallCommandExecution(instruction);
          await this.agent.getOsAgentHandler().desktopKeyRelease(key, []);
          await this.afterCommandExecution(instruction);
        } catch (error) {
          await this.afterCommandExecution(
            instruction,
            error instanceof Error ? error : new Error(String(error)),
          );
          return Promise.reject(error);
        }
        return Promise.resolve();
      },
    };
  }

  /**
   * Instructs the agent to autonomously achieve a specified goal through UI interactions.
   *
   * This method enables AI-powered automation by allowing the agent to:
   * - Analyze the current screen state and/or provided images
   * - Plan and execute a sequence of UI interactions
   * - Handle complex tasks through natural language instructions
   * - Maintain context across multiple actions
   *
   * The agent can perform various UI interactions including:
   * - Clicking buttons, links, and other interactive elements
   * - Typing text into input fields
   * - Scrolling and navigating through interfaces
   *
   * ### Method Signatures
   * ```typescript
   * act(goal: string, options?: ActOptions): Promise<AgentHistory>
   * act(goal: string, imagePathOrBase64: string, options?: ActOptions): Promise<AgentHistory>
   * ```
   *
   * ### Parameters
   * @param goal - A natural language instruction describing the task to accomplish.
   *               Be specific and clear about the desired outcome.
   * @param imagePathOrBase64 - (Optional) Path to an image file or base64-encoded image string.
   *                           Used to provide additional visual context for the task.
   * @param options - (Optional) Configuration options for the agent's behavior.
   * @param options.chatId - A unique identifier to maintain context between related actions.
   *                        Useful for multi-step tasks that require state preservation.
   * @param options.agentHistory
   *                          - (Optional) Previous interaction history to share between
   *                           different agent instances. Enables cross-platform task coordination.
   *
   * ### Returns
   * @returns Promise<AgentHistory> - A promise that resolves to the updated interaction history,
   *                                 containing details about the actions taken and their outcomes.
   *
   * ### Throws
   * - If the agent is not properly connected
   * - If the provided goal cannot be understood or executed
   * - If required UI elements are not found or accessible
   * - If the image path is invalid or the base64 string is malformed
   *
   * ### Examples
   *
   * #### Basic Usage
   * ```typescript
   * // Simple task execution
   * await aui.act("Open Chrome and navigate to google.com");
   * ```
   *
   * #### Maintaining Context
   * ```typescript
   * // Multi-step task with context preservation
   * await aui.act("Search for current gold prices", {
   *   chatId: "gold-price-task"
   * });
   *
   * await aui.act("Create a new text file and save the price", {
   *   chatId: "gold-price-task"
   * });
   * ```
   *
   * #### Cross-Platform Coordination
   * ```typescript
   * // Share context between desktop and mobile agents
   *
   * const history = await auiDesktop.act("Copy username from desktop app");
   * await auiAndroid.act("Paste username into mobile login", {
   *   agentHistory: history
   * });
   * ```
   *
   * #### Using Images for Context
   * ```typescript
   * // Using image file
   * await aui.act(
   *   "Click the 'Submit' button in the provided image",
   *   'path/to/screenshot.png'
   * );
   *
   * // Using base64 image
   * const base64Image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...";
   * await aui.act(
   *   "Click the 'Submit' button in the provided image",
   *   base64Image
   * );
   * ```
   *
   * ### Best Practices
   * 1. Be specific in your goal descriptions
   * 2. Use chatId for related tasks to maintain context
   * 3. Provide clear visual context when needed
   * 4. Handle errors appropriately in your implementation
   * 5. Consider using agentHistory for complex cross-platform workflows
   */
  async act(goal: string, options?: ActOptions): Promise<AgentHistory>;

  async act(
    goal: string,
    imagePathOrBase64String: string,
    options?: ActOptions): Promise<AgentHistory>;

  async act(
    goal: string,
    imageOrOptions?: string | ActOptions,
    options?: ActOptions,
  ): Promise<AgentHistory> {
    if (typeof imageOrOptions === 'string') {
      return this.agent.act(goal, imageOrOptions, options);
    }
    const fullTitle = `Act: ${goal}`;
    const stepTitle = fullTitle.length > 50 ? `${fullTitle.substring(0, 47)}...` : fullTitle;
    const instruction = await this.buildInstruction(stepTitle, []);
    try {
      await this.beforeNoneInferenceCallCommandExecution(instruction);
      const result = await this.agent.act(goal, undefined, imageOrOptions);
      await this.afterCommandExecution(instruction);
      return result;
    } catch (error) {
      await this.afterCommandExecution(
        instruction,
        error instanceof Error ? error : new Error(String(error)),
      );
      return Promise.reject(error);
    }
  }

  /**
   * Adds tools to the agent that allow it to interact with AI elements.
   *
   * @returns {Promise<void>} - A promise that resolves when the tools are added to the agent.
   */
  async addAIElementsToolsToAgent(): Promise<void> {
    const aiElementLocator = (aiElementName: string) => this.get().aiElement(aiElementName).exec();
    const askUIGetAskUIElementTool = new AskUIGetAskUIElementTool(this.agent.getOsAgentHandler(), aiElementLocator, 'aiElement');
    this.agent.addTool(askUIGetAskUIElementTool);

    const listAIElementNamesFunction = () => (
      AIElementCollection.collectAIElements(this.workspaceId, this.aiElementArgs)
    ).then(
      (aiElementCollection) => aiElementCollection.getNames(),
    );
    const askUIListAIElementTool = new AskUIListAIElementTool(listAIElementNamesFunction);
    this.agent.addTool(askUIListAIElementTool);
  }

  /**
   * Retrieves information about the AgentOS connection.
   *
   * Useful for debugging, logging, or verifying the current configuration.
   *
   * @property {number} displayNum - Display controlled by the AgentOS
   * @property {string} runtime - Runtime type (always "desktop")
   * @property {string} port - Communication port
   * @property {string} host - Host address
   *
   * @example
   * ```typescript
   * const startingArguments = await aui.getControllerStartingArguments();
   * console.log(startingArguments);
   * // Output example:
   * // {
   * //   displayNum: 1,
   * //   host: 'localhost',
   * //   port: '23000',
   * //   runtime: 'desktop',
   * // }
  * ```
  */
  async getControllerStartingArguments(): Promise<Record<string, string | number | boolean>> {
    return this.executionRuntime.getStartingArguments();
  }
}
