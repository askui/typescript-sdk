import { AndroidError } from './android-error';

export class NoAndroidDeviceError extends AndroidError {
  constructor(deviceId?: string) {
    super(
      deviceId !== undefined
        ? `The Android device "${deviceId}" was not found. Make sure it is connected `
          + '(check "adb devices") and authorized.'
        : 'No Android device was found. Make sure a device or emulator is connected '
          + 'and authorized (check "adb devices").',
    );
    this.name = 'NoAndroidDeviceError';
  }
}
