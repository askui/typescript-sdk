export class AndroidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AndroidError';
  }
}
