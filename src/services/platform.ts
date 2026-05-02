import { Capacitor } from '@capacitor/core';

/**
 * True when running inside the Capacitor-wrapped Android (or iOS) shell —
 * i.e. the APK build, not the PWA. Used to gate native-only code paths
 * like Health Connect that require Capacitor plugins.
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function isAndroidNative(): boolean {
  return isNative() && Capacitor.getPlatform() === 'android';
}
