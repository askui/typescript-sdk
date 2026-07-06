import { AndroidError } from './android-error';

export class AndroidNotConnectedError extends AndroidError {
  constructor() {
    super(
      'There is no connection to an Android device. '
      + 'Make sure to call connect() before sending commands.',
    );
    this.name = 'AndroidNotConnectedError';
  }
}
