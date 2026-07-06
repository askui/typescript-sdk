import { AgentOsError } from './agent-os-error';

export class AgentOsActionNotSupportedError extends AgentOsError {
  constructor(action: string) {
    super(
      `The action "${action}" is not supported by the AskUI AgentOS. `
      + 'Android automation is temporarily unavailable and will be reintroduced '
      + 'in a future release.',
    );
    this.name = 'AgentOsActionNotSupportedError';
  }
}
