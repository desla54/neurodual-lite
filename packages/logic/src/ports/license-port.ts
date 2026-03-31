/**
 * LicensePort
 *
 * Interface for license key validation (Lemon Squeezy).
 * Implemented by infra (lemon-squeezy-adapter), consumed by ui.
 */

// =============================================================================
// Types
// =============================================================================

/** License key status from Lemon Squeezy */
export type LicenseStatus = 'active' | 'inactive' | 'expired' | 'disabled';

/** License key validation result */
export interface LicenseValidationResult {
  /** Whether the license is valid and active */
  readonly valid: boolean;
  /** License status */
  readonly status: LicenseStatus;
  /** Error message if validation failed */
  readonly error?: string;
  /** License key (masked for display) */
  readonly licenseKeyMasked?: string;
  /** Customer email */
  readonly customerEmail?: string;
  /** Customer name */
  readonly customerName?: string;
  /** Product name */
  readonly productName?: string;
  /** Variant name (e.g., "Annual") */
  readonly variantName?: string;
  /** Number of activations used */
  readonly activationsUsed?: number;
  /** Maximum activations allowed */
  readonly activationsLimit?: number;
  /** Subscription renewal date (null for lifetime) */
  readonly renewsAt?: Date | null;
  /** When the license was created */
  readonly createdAt?: Date;
}

/** Activation result when activating a license on this device */
export interface LicenseActivationResult {
  /** Whether activation was successful */
  readonly activated: boolean;
  /** Error message if activation failed */
  readonly error?: string;
  /** Instance ID for this activation (used for deactivation) */
  readonly instanceId?: string;
  /** License validation result */
  readonly license?: LicenseValidationResult;
}

/** Deactivation result */
export interface LicenseDeactivationResult {
  /** Whether deactivation was successful */
  readonly deactivated: boolean;
  /** Error message if deactivation failed */
  readonly error?: string;
}

/** Checkout URL generation options */
export interface CheckoutOptions {
  /** Customer email (pre-fill checkout) */
  readonly email?: string;
  /** Customer name (pre-fill checkout) */
  readonly name?: string;
  /** Discount code to apply */
  readonly discountCode?: string;
  /** Custom data to attach to the order (e.g., user ID) */
  readonly customData?: Record<string, string>;
}

/** Checkout URL result */
export interface CheckoutUrlResult {
  /** The checkout URL to redirect to */
  readonly url: string;
}

/** Product variant (e.g., Annual subscription) */
export interface LicenseProduct {
  /** Variant ID in Lemon Squeezy */
  readonly variantId: string;
  /** Product name */
  readonly name: string;
  /** Variant name */
  readonly variantName: string;
  /** Price string (e.g., "8,99 €") */
  readonly priceString: string;
  /** Price in cents */
  readonly priceCents: number;
  /** Currency code */
  readonly currencyCode: string;
  /** Is subscription (vs one-time) */
  readonly isSubscription: boolean;
  /** Billing interval for subscriptions */
  readonly interval?: 'month' | 'year';
}

export type LicenseStateListener = (state: LicenseState) => void;

/** Current license state */
export interface LicenseState {
  /** Whether a valid license is active */
  readonly hasValidLicense: boolean;
  /** Current license validation result */
  readonly license: LicenseValidationResult | null;
  /** Whether we're currently validating */
  readonly isValidating: boolean;
  /** Last validation error */
  readonly lastError: string | null;
  /** The stored license key (for re-validation) */
  readonly storedLicenseKey: string | null;
  /** Instance ID for this device activation */
  readonly instanceId: string | null;
}

// =============================================================================
// Port
// =============================================================================

export interface LicensePort {
  /**
   * Get current license state.
   */
  getState(): LicenseState;

  /**
   * Subscribe to license state changes.
   * Returns unsubscribe function.
   */
  subscribe(listener: LicenseStateListener): () => void;

  /**
   * Validate a license key without activating it.
   * Use this to check if a key is valid before activation.
   */
  validateLicense(licenseKey: string): Promise<LicenseValidationResult>;

  /**
   * Activate a license key on this device.
   * This counts towards the activation limit.
   */
  activateLicense(licenseKey: string): Promise<LicenseActivationResult>;

  /**
   * Deactivate the current license from this device.
   * Frees up an activation slot.
   */
  deactivateLicense(): Promise<LicenseDeactivationResult>;

  /**
   * Re-validate the stored license key.
   * Call this periodically or when app resumes.
   */
  refreshLicense(): Promise<LicenseValidationResult | null>;

  /**
   * Get checkout URL for purchasing a license.
   * Redirects user to Lemon Squeezy hosted checkout.
   */
  getCheckoutUrl(variantId: string, options?: CheckoutOptions): Promise<CheckoutUrlResult>;

  /**
   * Get available products/variants.
   */
  getProducts(): Promise<LicenseProduct[]>;

  /**
   * Clear stored license (logout).
   */
  clearLicense(): Promise<void>;

  /**
   * Check if license system is available.
   * Returns true on web, false on mobile (use RevenueCat there).
   */
  isAvailable(): boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/** Mask a license key for display (show first and last 4 chars) */
export function maskLicenseKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/** Create empty license state */
export function createEmptyLicenseState(): LicenseState {
  return {
    hasValidLicense: false,
    license: null,
    isValidating: false,
    lastError: null,
    storedLicenseKey: null,
    instanceId: null,
  };
}
