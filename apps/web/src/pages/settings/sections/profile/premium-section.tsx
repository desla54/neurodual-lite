/**
 * PremiumSection - Activation code management in profile settings.
 * Shows: activation status, code input (web), buy/restore buttons (native), device list.
 */

import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Section,
  usePremiumState,
  useActivateCode,
  useDeactivateDevice,
  useVerifyPremium,
} from '@neurodual/ui';
import {
  Check,
  Warning,
  Devices,
  Trash,
  ArrowClockwise,
  CreditCard,
  ArrowCounterClockwise,
} from '@phosphor-icons/react';
import { FREE_PLAYTIME_MS } from '@neurodual/logic';
import { usePurchaseService } from '@/hooks/use-purchase-service';

export function PremiumSection(): ReactNode {
  const { t } = useTranslation();
  const { data: premiumState } = usePremiumState();
  const activateMutation = useActivateCode();
  const deactivateMutation = useDeactivateDevice();
  const verifyMutation = useVerifyPremium();
  const purchaseService = usePurchaseService();
  const [code, setCode] = useState('');
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [priceString, setPriceString] = useState<string | null>(null);

  const isPremium = premiumState?.isPremium ?? false;
  const totalPlaytimeMs = premiumState?.totalPlaytimeMs ?? 0;
  const remainingMs = premiumState?.remainingFreeTimeMs ?? FREE_PLAYTIME_MS;
  const devices = premiumState?.devices ?? [];
  const activationsUsed = premiumState?.activationsUsed ?? 0;
  const isNative = purchaseService?.isAvailable() ?? false;

  // Fetch product price on mount (native only)
  useEffect(() => {
    if (!purchaseService || !isNative || isPremium) return;
    void purchaseService.getProduct().then((product) => {
      if (product) setPriceString(product.priceString);
    });
  }, [purchaseService, isNative, isPremium]);

  const formatTime = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleActivate = async () => {
    if (!code.trim()) return;
    const result = await activateMutation.mutateAsync(code.trim());
    if (result.success) {
      setCode('');
    }
  };

  const handlePurchase = async () => {
    if (!purchaseService) return;
    setPurchaseLoading(true);
    setPurchaseError(null);
    try {
      const result = await purchaseService.purchase();
      if (!result.success) {
        if (result.error === 'cancelled') return;
        setPurchaseError(
          result.error === 'max_activations'
            ? t('settings.premium.maxActivations', "Nombre maximum d'appareils atteint (3)")
            : t('settings.premium.purchaseError', "Erreur lors de l'achat — réessayez"),
        );
      }
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!purchaseService) return;
    setRestoreLoading(true);
    setPurchaseError(null);
    try {
      const result = await purchaseService.restore();
      if (!result.success) {
        setPurchaseError(
          result.error === 'not_available'
            ? t('settings.premium.noRestore', 'Aucun achat trouvé')
            : t('settings.premium.restoreError', 'Erreur lors de la restauration'),
        );
      }
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <Section title="Premium">
      <Card className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isPremium ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
            }`}
          >
            {isPremium ? <Check size={20} weight="bold" /> : <Warning size={20} weight="bold" />}
          </div>
          <div className="flex-1">
            <div className="font-bold text-foreground">
              {isPremium
                ? t('settings.premium.active', 'Premium actif')
                : t('settings.premium.free', 'Mode gratuit')}
            </div>
            <div className="text-xs text-muted-foreground">
              {isPremium
                ? t(
                    'settings.premium.lifetimeAccess',
                    'Acc\u00e8s \u00e0 vie \u2014 toutes les fonctionnalit\u00e9s d\u00e9bloqu\u00e9es',
                  )
                : totalPlaytimeMs >= FREE_PLAYTIME_MS
                  ? t(
                      'settings.premium.freeTimeExhausted',
                      'Temps gratuit \u00e9puis\u00e9 \u2014 niveau 3+ verrouill\u00e9',
                    )
                  : t('settings.premium.freeTimeRemaining', '{{time}} restant en mode gratuit', {
                      time: formatTime(remainingMs),
                    })}
            </div>
          </div>
        </div>

        {/* Playtime bar (free users only) */}
        {!isPremium && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t('settings.premium.playedTime', 'Temps de jeu')}</span>
              <span>
                {formatTime(totalPlaytimeMs)} / {formatTime(FREE_PLAYTIME_MS)}
              </span>
            </div>
            <div className="h-2 bg-background rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  totalPlaytimeMs >= FREE_PLAYTIME_MS ? 'bg-red-500' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(100, (totalPlaytimeMs / FREE_PLAYTIME_MS) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Native: Buy + Restore buttons */}
        {!isPremium && isNative && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void handlePurchase()}
              disabled={purchaseLoading || restoreLoading}
              className="w-full h-12 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl font-semibold text-sm shadow-sm hover:translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard size={18} weight="bold" />
              {purchaseLoading
                ? t('common.loading', 'Chargement...')
                : t('settings.premium.buyPremium', 'Acheter Premium {{price}}', {
                    price: priceString ?? '4,99\u00a0\u20ac',
                  })}
            </button>
            <button
              type="button"
              onClick={() => void handleRestore()}
              disabled={restoreLoading || purchaseLoading}
              className="w-full h-10 flex items-center justify-center gap-2 text-muted-foreground text-sm hover:text-primary transition-colors disabled:opacity-50"
            >
              <ArrowCounterClockwise size={14} className={restoreLoading ? 'animate-spin' : ''} />
              {restoreLoading
                ? t('common.loading', 'Chargement...')
                : t('settings.premium.restorePurchases', 'Restaurer les achats')}
            </button>
            {purchaseError && <p className="text-xs text-red-500">{purchaseError}</p>}
          </div>
        )}

        {/* Web: Activation code input */}
        {!isPremium && !isNative && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              {t('settings.premium.activationCode', "Code d'activation")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ND-XXXX-XXXX-XXXX"
                className="flex-1 h-11 px-3 rounded-xl bg-background border-2 border-transparent focus:border-primary/20 text-primary font-mono text-sm placeholder:text-muted-foreground/40 focus:outline-none transition-all"
                maxLength={18}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => void handleActivate()}
                disabled={!code.trim() || activateMutation.isPending}
                className="h-11 px-5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm shadow-sm hover:translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {activateMutation.isPending
                  ? t('common.loading', 'Chargement...')
                  : t('settings.premium.activate', 'Activer')}
              </button>
            </div>
            {activateMutation.data && !activateMutation.data.success && (
              <p className="text-xs text-red-500">
                {activateMutation.data.error === 'invalid_code'
                  ? t('settings.premium.invalidCode', 'Code invalide')
                  : activateMutation.data.error === 'max_activations'
                    ? t('settings.premium.maxActivations', "Nombre maximum d'appareils atteint (3)")
                    : t(
                        'settings.premium.networkError',
                        'Erreur r\u00e9seau \u2014 v\u00e9rifiez votre connexion',
                      )}
              </p>
            )}
          </div>
        )}

        {/* Device list (premium users) */}
        {isPremium && devices.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                <Devices size={14} />
                <span>
                  {t('settings.premium.devices', 'Appareils')} ({activationsUsed}/3)
                </span>
              </div>
              <button
                type="button"
                onClick={() => void verifyMutation.mutateAsync()}
                disabled={verifyMutation.isPending}
                className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                title={t('settings.premium.refresh', 'Rafra\u00eechir')}
              >
                <ArrowClockwise
                  size={14}
                  className={verifyMutation.isPending ? 'animate-spin' : ''}
                />
              </button>
            </div>
            <div className="space-y-1.5">
              {devices.map((device) => (
                <div
                  key={device.deviceId}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-background text-sm"
                >
                  <span className="text-foreground truncate flex-1">
                    {device.deviceName || device.deviceId.slice(0, 12)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {new Date(device.activatedAt * 1000).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activation code display + deactivate (premium users) */}
        {isPremium && premiumState?.activationCode && (
          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <div>
              <div className="text-xs text-muted-foreground">
                {t('settings.premium.yourCode', 'Votre code')}
              </div>
              <div className="font-mono text-sm text-foreground">{premiumState.activationCode}</div>
            </div>
            <button
              type="button"
              onClick={() => void deactivateMutation.mutateAsync()}
              disabled={deactivateMutation.isPending}
              className="p-2 text-muted-foreground hover:text-red-500 transition-colors"
              title={t('settings.premium.deactivate', 'D\u00e9sactiver cet appareil')}
            >
              <Trash size={16} />
            </button>
          </div>
        )}
      </Card>
    </Section>
  );
}
