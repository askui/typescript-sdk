import path from 'path';
import fs from 'fs-extra';
import { promisify } from 'util';
import { exec } from 'child_process';
import Listr from 'listr';
import chalk from 'chalk';
import nunjucks from 'nunjucks';
import { ValidationError } from 'yup';
import { getPathToNodeModulesRoot } from '../../utils/path';
import { CliOptions } from './cli-options-interface';
import { addScript, removeScript } from './add-remove-script-package-json';

export class CreateExampleProject {
  private automationsDirectoryPath: string;

  private exampleTemplateDirectoryName = 'askui_example';

  private automationsDirectoryName: string;

  private projectRootDirectoryPath: string;

  private askUIControllerUrl: string;

  private helperTemplateConfig: { [key: string]: string };

  constructor(readonly cliOptions: CliOptions) {
    this.projectRootDirectoryPath = process.cwd();

    this.automationsDirectoryName = this.getAutomationsDirectoryName();
    this.automationsDirectoryPath = path.join(
      this.projectRootDirectoryPath,
      this.automationsDirectoryName,
    );

    this.askUIControllerUrl = 'https://docs.askui.com/docs/suite/Components/AskUI-Development-Environment#askui-startcontroller-command';
    this.helperTemplateConfig = {};
  }

  private getAutomationsDirectoryName(): string {
    if (this.cliOptions.automationsDirectory) {
      if (/\s/g.test(this.cliOptions.automationsDirectory.trim())) {
        throw new ValidationError('Automations directory (-ad, --automations-directory) must not contain whitespaces');
      }
      return this.cliOptions.automationsDirectory.trim();
    }
    return this.exampleTemplateDirectoryName;
  }

  private async copyTemplateProject(): Promise<Listr.ListrTask<unknown>[]> {
    const exampleProjectPath = path.join(
      'example_projects_templates',
      'typescript',
      this.exampleTemplateDirectoryName,
    );

    const runCommand = promisify(exec);

    return [
      {
        title: 'Detect Operating System',
        task: async () => {
          if (process.platform === 'win32') {
            this.cliOptions.operatingSystem = 'windows';
          } else if (process.platform === 'darwin') {
            this.cliOptions.operatingSystem = 'macos';
          } else if (
            process.platform === 'linux'
            || process.platform === 'freebsd'
            || process.platform === 'openbsd'
          ) {
            this.cliOptions.operatingSystem = 'linux';
          } else {
            throw new Error(`The detected operating system is ${process.platform}. We only support 'windows', 'macos' and 'linux'`);
          }
        },
      },
      {
        title: 'Copy project files',
        task: async () => fs.copy(
          path.join(getPathToNodeModulesRoot(), exampleProjectPath),
          this.automationsDirectoryPath,
        ),
      },
      {
        title: 'Install askui dependency',
        task: async () => {
          await runCommand('npm init -y');
          await removeScript(`${this.projectRootDirectoryPath}/package.json`, 'test');
          await runCommand('npm i -D askui ');
        },
      },
    ];
  }

  private async copyTestFrameworkConfig() {
    const frameworkConfigs = {
      jest: 'jest.config.ts',
    };
    const configFilePath = path.join(
      getPathToNodeModulesRoot(),
      'example_projects_templates',
      'configs',
      frameworkConfigs.jest,
    );
    await fs.copyFile(configFilePath, path.join(
      this.automationsDirectoryPath,
      frameworkConfigs.jest,
    ));
  }

  private async addTestFrameWorkTimeout() {
    const frameworkTimeoutstring = {
      jest: 'jest.setTimeout(60 * 1000 * 60);',
    };
    this.helperTemplateConfig['timeout_placeholder'] = frameworkTimeoutstring.jest;
  }

  private async addReporterConfig() {
    this.helperTemplateConfig['allure_stepreporter_import'] = "import { AskUIAllureStepReporter } from '@askui/askui-reporters';";
    this.helperTemplateConfig['reporter_placeholder'] = 'reporter: new AskUIAllureStepReporter(),';
  }

  private async addAskuiRunCommand() {
    const frameworkExecutionCommand = {
      jest: `jest --config ./${this.automationsDirectoryName}/jest.config.ts --runInBand`,
    };
    await addScript(
      `${this.projectRootDirectoryPath}/package.json`,
      'askui',
      frameworkExecutionCommand.jest,
    );
  }

  private async addESLintRunCommand() {
    await addScript(
      `${this.projectRootDirectoryPath}/package.json`,
      'lint',
      'eslint . --ext .ts',
    );
  }

  private async createAskUIHelperFromTemplate() {
    return [{
      title: 'Write askui config',
      task: async () => new Listr([
        {
          title: 'Create askui-helper.ts ',
          task: async () => {
            const askuiHelperTemplateFilePath = path.join(
              getPathToNodeModulesRoot(),
              'example_projects_templates',
              'templates',
            );

            const templateFileName = 'askui-helper.nj';
            nunjucks.configure(askuiHelperTemplateFilePath, { autoescape: false });
            const result = nunjucks.render(templateFileName, this.helperTemplateConfig);
            const filePath = path.join(this.automationsDirectoryPath, 'helpers', 'askui-helper.ts');
            if (!fs.existsSync(path.join(this.automationsDirectoryPath, 'helpers'))) {
              await fs.mkdir(path.join(this.automationsDirectoryPath, 'helpers'));
            }
            await fs.writeFile(filePath, result, 'utf8');
          },
        },
      ]),
    }];
  }

  private async setupTestFrameWork() {
    return [{
      title: 'Setup Test framework',
      task: async () => new Listr([
        {
          title: 'Install jest',
          task: async () => CreateExampleProject.installTestFrameworkPackages(),
        },
        {
          title: 'Copy config file',
          task: async () => this.copyTestFrameworkConfig(),
        },
        {
          title: 'Add timeout',
          task: async () => this.addTestFrameWorkTimeout(),
        },
        {
          title: 'Add reporter',
          task: async () => this.addReporterConfig(),
        },
        {
          title: 'Add askui run command',
          task: async () => this.addAskuiRunCommand(),
        },
        {
          title: 'Add eslint run command',
          task: async () => this.addESLintRunCommand(),
        },
      ]),
    }];
  }

  private static async installTestFrameworkPackages(): Promise<void> {
    const runCommand = promisify(exec);
    const frameworkDependencies = {
      jest: 'npm i -D @askui/askui-reporters@>2.1.4 typescript ts-node @types/jest@30.0.0 ts-jest@29.4.0 jest@29.7.0 allure-jest@3.3.0 allure-js-commons@3.3.0 eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-import @askui/eslint-plugin-askui hpagent',
    };
    await runCommand(frameworkDependencies.jest);
  }

  private async copyESLintConfigFiles(): Promise<Listr.ListrTask<unknown>[]> {
    const esLintRcFilePath = path.join('example_projects_templates', 'typescript', '.eslintrc.json-template');
    const esLintIgnoreFilePath = path.join('example_projects_templates', 'typescript', '.eslintignore-template');

    return [{
      title: 'Copy ESLint config files',
      task: async () => new Listr([
        {
          title: 'Add eslintrc.json',
          task: async () => fs.copyFile(
            path.join(getPathToNodeModulesRoot(), esLintRcFilePath),
            path.join(this.projectRootDirectoryPath, '.eslintrc.json'),
          ),
        },
        {
          title: 'Add .eslintignore',
          task: async () => fs.copyFile(
            path.join(getPathToNodeModulesRoot(), esLintIgnoreFilePath),
            path.join(this.projectRootDirectoryPath, '.eslintignore'),
          ),
        },
      ]),
    },
    ];
  }

  private async copyGitignore(): Promise<Listr.ListrTask<unknown>[]> {
    const gitignoreFilePath = path.join('example_projects_templates', 'typescript', 'gitignore');

    return [{
      title: 'Copy .gitignore',
      task: async () => new Listr([
        {
          title: 'Add .gitignore',
          task: async () => fs.copyFile(
            path.join(getPathToNodeModulesRoot(), gitignoreFilePath),
            path.join(this.projectRootDirectoryPath, '.gitignore'),
          ),
        },
      ]),
    },
    ];
  }

  private async addVSCodeSettings(): Promise<Listr.ListrTask<unknown>[]> {
    const vscodeSettingsFilePath = path.join('example_projects_templates', 'configs', 'vscode-settings.json');
    const vscodeSettingsTargetDirPath = path.join(this.projectRootDirectoryPath, '.vscode');
    const vscodeSettingsTargetFilePath = path.join(vscodeSettingsTargetDirPath, 'settings.json');
    return [{
      enabled: () => !fs.existsSync(vscodeSettingsTargetFilePath),
      task: async () => {
        await fs.mkdir(vscodeSettingsTargetDirPath, { recursive: true });
        await fs.copyFile(
          path.join(getPathToNodeModulesRoot(), vscodeSettingsFilePath),
          vscodeSettingsTargetFilePath,
        );
      },
      title: 'Copy VSCode settings',
    }];
  }

  private async copyTsConfigFile(): Promise<Listr.ListrTask<unknown>[]> {
    const tsConfigFilePath = path.join(
      'example_projects_templates',
      'typescript',
      'tsconfig.json',
    );
    const tsConfigTargetFilePath = path.join(this.projectRootDirectoryPath, 'tsconfig.json');
    return [
      {
        enabled: () => this.cliOptions.typescriptConfig || !fs.existsSync(tsConfigTargetFilePath),
        task: async () => fs.copyFile(
          path.join(getPathToNodeModulesRoot(), tsConfigFilePath),
          tsConfigTargetFilePath,
        ),
        title: 'Copy ts config file',
      },
    ];
  }

  public async createExampleProject(): Promise<void> {
    const tasks = new Listr();

    tasks.add([
      ...(await this.copyTemplateProject()),
      ...(await this.addVSCodeSettings()),
      ...(await this.setupTestFrameWork()),
      ...(await this.copyESLintConfigFiles()),
      ...(await this.copyGitignore()),
      ...(await this.copyTsConfigFile()),
      ...(await this.createAskUIHelperFromTemplate()),
    ]);

    await tasks.run();
    /* eslint-disable no-console */
    console.log(chalk.greenBright('\nCongratulations!'));
    console.log(
      `askui example was created under ${chalk.gray(
        this.automationsDirectoryPath,
      )}`,
    );

    console.log(
      chalk.redBright(
        `\nPlease make sure the AskUI Controller is running: ${this.askUIControllerUrl}\n`,
      ),
    );
    console.log(
      `You can start your automation with this command ${chalk.green(
        'AskUI-RunProject',
      )}`,
    );
    /* eslint-enable no-console */
  }
}
