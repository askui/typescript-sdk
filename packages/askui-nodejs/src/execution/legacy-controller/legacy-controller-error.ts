export class LegacyControllerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyControllerError';
  }
}
