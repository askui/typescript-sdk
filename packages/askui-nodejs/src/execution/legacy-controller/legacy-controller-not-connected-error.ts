import { LegacyControllerError } from './legacy-controller-error';

export class LegacyControllerNotConnectedError extends LegacyControllerError {
  constructor() {
    super(
      'There is no connection to the AskUI legacy UI Controller. '
      + 'Make sure to call connect() before sending commands.',
    );
    this.name = 'LegacyControllerNotConnectedError';
  }
}
