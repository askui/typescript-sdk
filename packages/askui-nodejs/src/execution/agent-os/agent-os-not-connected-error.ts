import { AgentOsError } from './agent-os-error';

export class AgentOsNotConnectedError extends AgentOsError {
  constructor() {
    super(
      'There is no connection to the AskUI AgentOS. '
      + 'Make sure to call connect() before sending commands.',
    );
    this.name = 'AgentOsNotConnectedError';
  }
}
