/**
 * Payments Module
 *
 * Exports payment adapters.
 */

export {
  configureRevenueCat,
  revenueCatAdapter,
  type RevenueCatConfig,
} from './revenuecat-adapter';

export {
  configureLemonSqueezy,
  lemonSqueezyAdapter,
  initLemonSqueezyAdapter,
  type LemonSqueezyConfig,
} from './lemon-squeezy-adapter';
