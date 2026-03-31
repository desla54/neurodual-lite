import { X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AvatarPicker } from './avatar-picker';

interface AvatarSelectionModalProps {
  isOpen: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function AvatarSelectionModal({
  isOpen,
  selectedId,
  onSelect,
  onClose,
}: AvatarSelectionModalProps): ReactNode {
  const { t } = useTranslation();

  if (!isOpen) {
    return null;
  }

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[10010] flex items-center justify-center safe-overlay-padding sm:py-6 animate-in fade-in duration-200">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm cursor-default w-full h-full border-none p-0 m-0"
        onClick={onClose}
        aria-label={t('common.close')}
      />

      <div className="relative z-10 w-full max-w-md mx-auto bg-surface rounded-[2rem] border border-border shadow-soft p-6 space-y-4 animate-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary">{t('settings.profile.avatar')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-background text-muted-foreground hover:text-primary hover:bg-slate-100 transition-colors"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <AvatarPicker
          selectedId={selectedId}
          onSelect={handleSelect}
          label={t('settings.profile.avatar')}
          size="md"
        />
      </div>
    </div>,
    document.body,
  );
}
