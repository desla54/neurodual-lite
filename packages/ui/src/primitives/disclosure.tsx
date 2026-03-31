/**
 * Disclosure - Simple collapsible section for settings
 *
 * A lightweight accordion-like component without external dependencies.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { CaretDown } from '@phosphor-icons/react';

export interface DisclosureProps {
  /** Header text displayed in the trigger button */
  readonly title: string;
  /** Optional icon to display before the title */
  readonly icon?: ReactNode;
  /** Optional badge/tag displayed next to the title */
  readonly badge?: ReactNode;
  /**
   * Content to show when expanded.
   *
   * Prefer `render` for expensive content to avoid allocating large React trees on every
   * parent render when the disclosure is closed.
   */
  readonly children?: ReactNode;
  /**
   * Render prop variant of children. When provided, the content is only created when the
   * disclosure is expanded (or kept mounted).
   */
  readonly render?: () => ReactNode;
  /**
   * Controlled open state. If provided, the Disclosure becomes controlled and will call
   * `onOpenChange` instead of managing its own internal state.
   */
  readonly open?: boolean;
  /** Controlled state change handler (used when `open` is provided). */
  readonly onOpenChange?: (open: boolean) => void;
  /** Whether the disclosure is initially open */
  readonly defaultOpen?: boolean;
  /**
   * If true, mount children only after the disclosure is opened at least once.
   * Useful to avoid expensive initial renders when content is hidden by default.
   */
  readonly lazy?: boolean;
  /**
   * When `lazy` is true: keep children mounted after first open.
   * Set to false to unmount on close (state resets when reopened).
   */
  readonly keepMounted?: boolean;
  /** Additional CSS classes for the container */
  readonly className?: string;
}

export function Disclosure({
  title,
  icon,
  badge,
  children,
  render,
  open,
  onOpenChange,
  defaultOpen = false,
  lazy = false,
  keepMounted = true,
  className = '',
}: DisclosureProps): ReactNode {
  const isControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : uncontrolledOpen;
  const hasOpenedRef = useRef(defaultOpen);
  if (isOpen) {
    hasOpenedRef.current = true;
  }

  const shouldRenderChildren = !lazy || isOpen || (keepMounted && hasOpenedRef.current);

  const triggerRef = useRef<HTMLButtonElement>(null);

  const onPointerDown = useCallback(() => {
    triggerRef.current?.classList.add('pressable--pressed');
  }, []);

  const clearPressed = useCallback(() => {
    triggerRef.current?.classList.remove('pressable--pressed');
  }, []);

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          const nextOpen = !isOpen;
          if (isControlled) {
            onOpenChange?.(nextOpen);
            return;
          }
          setUncontrolledOpen(nextOpen);
        }}
        className="pressable w-full flex items-center justify-between gap-3 py-3 px-4 bg-surface border border-border hover:bg-muted/50 rounded-xl transition-colors"
        onPointerDown={onPointerDown}
        onPointerUp={clearPressed}
        onPointerLeave={clearPressed}
        onPointerCancel={clearPressed}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 font-medium text-foreground">
          {icon}
          <span className="truncate">{title}</span>
          {badge}
        </div>
        <CaretDown
          size={18}
          weight="bold"
          className={`text-muted-foreground transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-200 ${
          isOpen ? 'max-h-[12000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {shouldRenderChildren ? <div className="pt-4">{render ? render() : children}</div> : null}
      </div>
    </div>
  );
}
