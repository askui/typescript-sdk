export class AgentOsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentOsError';
  }
}
