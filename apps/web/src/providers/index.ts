/**
 * Providers
 *
 * Root-level React context providers for the application.
 */

export {
  SystemProvider,
  useAdapters,
  useAppState,
  useCommandBus,
  useIsOnline,
  useIsReady,
  useNetwork,
  useOptionalAppState,
  useOptionalSystem,
  usePersistence,
  useSessionManager,
  useSystem,
} from './system-provider';

export { PowerSyncProvider } from './powersync-provider';

export { AppPortsProvider, useAppPorts, type AppPorts } from './app-ports-provider';

export { DevDebugServices } from './dev-debug-services';

export { WebHandwritingRecognizerProvider } from './handwriting-recognizer-provider';

export { WebDigitRecognizerProvider } from './digit-recognizer-provider';
