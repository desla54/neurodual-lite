'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from '@phosphor-icons/react';
import { cn } from '../lib/utils';

function hasDialogDescription(node: React.ReactNode): boolean {
  if (node == null || typeof node === 'boolean') {
    return false;
  }

  if (Array.isArray(node)) {
    return node.some(hasDialogDescription);
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    if (node.type === DialogDescription || node.type === DialogPrimitive.Description) {
      return true;
    }

    if (node.type === React.Fragment) {
      return hasDialogDescription(node.props.children);
    }

    return hasDialogDescription(node.props.children);
  }

  return false;
}

// Root du Dialog - gère l'état open/close
const Dialog = DialogPrimitive.Root;

// Trigger optionnel pour ouvrir le dialog
const DialogTrigger = DialogPrimitive.Trigger;

// Portal pour render hors du DOM parent (évite z-index issues)
const DialogPortal = DialogPrimitive.Portal;

// Close button (utilisé dans DialogContent et peut être exposé séparément)
const DialogClose = DialogPrimitive.Close;

// Overlay/Backdrop avec animation fade
const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Fond semi-transparent (opaque sur mobile, blur sur desktop pour perf)
      'fixed inset-0 z-[100] bg-black/40 md:bg-black/30 md:backdrop-blur-sm',
      // Animation d'entrée/sortie
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// Contenu principal du Dialog
// - Focus trap automatique (Radix)
// - Escape key automatique (Radix)
// - aria-modal="true" automatique (Radix)
// - role="dialog" automatique (Radix)
const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideCloseButton?: boolean;
    closeAriaLabel?: string;
  }
>(({ className, children, hideCloseButton = false, closeAriaLabel = 'Close', ...props }, ref) => {
  const { 'aria-describedby': ariaDescribedby, ...contentProps } = props;
  const descriptionPresent = hasDialogDescription(children);

  // Radix warns if `aria-describedby` points to a non-existent description element.
  // If there is no <DialogDescription />, explicitly opt out to avoid noisy console warnings.
  const a11yProps =
    ariaDescribedby !== undefined
      ? { 'aria-describedby': ariaDescribedby }
      : descriptionPresent
        ? {}
        : { 'aria-describedby': undefined };

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Positionnement centré
          'fixed left-[50%] top-[50%] z-[100] translate-x-[-50%] translate-y-[-50%]',
          // Style card
          'w-[calc(100vw-2rem)] max-w-sm max-h-[calc(100vh-2rem)] overflow-auto bg-card/85 backdrop-blur-2xl backdrop-saturate-150 border border-border/50 rounded-2xl p-6 shadow-xl',
          // Animations
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
          'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          'duration-200',
          className,
        )}
        {...contentProps}
        {...a11yProps}
      >
        {children}
        {/* Bouton close accessible avec aria-label */}
        {!hideCloseButton && (
          <DialogPrimitive.Close
            className={cn(
              'absolute right-4 top-4 rounded-full p-1',
              'text-muted-foreground hover:text-foreground',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              'transition-colors',
            )}
            aria-label={closeAriaLabel}
          >
            <XIcon size={20} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

// Header du dialog
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

// Titre avec aria-labelledby automatique via Radix
const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

// Description avec aria-describedby automatique via Radix
const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

// Footer pour les actions
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 sm:gap-0 sm:flex-row sm:justify-end sm:space-x-2 mt-6',
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
