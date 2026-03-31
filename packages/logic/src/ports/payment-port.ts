/**
 * PaymentPort
 *
 * Interface for in-app purchases and subscription management.
 * Implemented by infra (RevenueCat), consumed by ui via Context.
 */

// =============================================================================
// Types
// =============================================================================

/** Product identifiers matching RevenueCat configuration */
export type ProductId = 'premium_monthly' | 'premium_yearly' | 'premium_lifetime';

export interface Product {
  /** Product identifier */
  readonly id: ProductId;
  /** Localized title */
  readonly title: string;
  /** Localized description */
  readonly description: string;
  /** Localized price string (e.g., "3,00 €") */
  readonly priceString: string;
  /** Price in micros (for comparison) */
  readonly priceMicros: number;
  /** Currency code (e.g., "EUR") */
  readonly currencyCode: string;
}

export interface PurchaseResult {
  /** Whether purchase was successful */
  readonly success: boolean;
  /** Product that was purchased */
  readonly productId?: ProductId;
  /** Error message if purchase failed */
  readonly errorMessage?: string;
  /** Whether user cancelled the purchase */
  readonly userCancelled?: boolean;
}

export interface CustomerInfo {
  /** Whether user has any active entitlement */
  readonly isActive: boolean;
  /** Active entitlement identifier */
  readonly activeEntitlement: 'premium' | null;
  /** Expiration date for subscription (null for lifetime) */
  readonly expirationDate: Date | null;
  /** Whether this is a trial */
  readonly isTrialing: boolean;
  /** Original purchase date */
  readonly originalPurchaseDate: Date | null;
}

export type PaymentStateListener = (info: CustomerInfo) => void;

// =============================================================================
// Port
// =============================================================================

export interface PaymentPort {
  /**
   * Initialize the payment system.
   * Must be called before any other method.
   */
  initialize(): Promise<void>;

  /**
   * Get available products for purchase.
   */
  getProducts(): Promise<Product[]>;

  /**
   * Purchase a product.
   * @param productId The product to purchase
   */
  purchase(productId: ProductId): Promise<PurchaseResult>;

  /**
   * Restore previous purchases.
   * Useful when user reinstalls app or switches device.
   */
  restorePurchases(): Promise<CustomerInfo>;

  /**
   * Get current customer info (entitlements).
   */
  getCustomerInfo(): Promise<CustomerInfo>;

  /**
   * Subscribe to customer info changes.
   * Returns unsubscribe function.
   */
  subscribe(listener: PaymentStateListener): () => void;

  /**
   * Set user ID for RevenueCat (should match Supabase user ID).
   * Call this after user authenticates.
   */
  setUserId(userId: string): Promise<void>;

  /**
   * Clear user ID (on logout).
   */
  logout(): Promise<void>;

  /**
   * Check if the payment system is available.
   * Returns false on web (payments only work on mobile).
   */
  isAvailable(): boolean;
}
