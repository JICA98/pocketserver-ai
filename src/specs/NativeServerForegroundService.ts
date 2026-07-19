import type {TurboModule} from 'react-native';
import {Platform, TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  startForegroundService(bindMode: string, port: number): Promise<void>;
  updateNotification(
    bindMode: string,
    port: number,
    activeRequests: number,
  ): Promise<void>;
  stopForegroundService(): Promise<void>;
}

export default Platform.OS === 'android'
  ? TurboModuleRegistry.getEnforcing<Spec>('ServerForegroundServiceModule')
  : (null as any as Spec);
