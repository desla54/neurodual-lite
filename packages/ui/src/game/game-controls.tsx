/**
 * GameControls component - Response buttons for Dual N-Back.
 *
 * Multi-stimulus support:
 * - position2, position3, position4 colors for multi-position mode
 * - audio2 color for dual-audio mode
 */

import { type ReactNode, forwardRef, memo, useCallback, useEffect, useRef, useState } from 'react';
import { type ControlColor, MODALITY_SHORTCUTS } from '@neurodual/logic';
import {
  GridFour,
  SpeakerHigh,
  Palette,
  Image as ImageIcon,
  Eye,
  MathOperations,
  ArrowsOutCardinal,
  Hash,
  Smiley,
  TextAa,
  MusicNotes,
} from '@phosphor-icons/react';
import { useUITranslations } from '../context/UITranslations';
import { cn } from '../lib/utils';
import { useMountEffect } from '../hooks';
import type { GameControlItem } from './types';

export type { GameControlItem };

/** Icon mapping per modality — gives each button a visual anchor */
const MODALITY_ICONS: Record<string, typeof GridFour> = {
  position: GridFour,
  position2: GridFour,
  position3: GridFour,
  position4: GridFour,
  audio: SpeakerHigh,
  audio2: SpeakerHigh,
  color: Palette,
  image: ImageIcon,
  spatial: ArrowsOutCardinal,
  digits: Hash,
  emotions: Smiley,
  words: TextAa,
  tones: MusicNotes,
  vis1: Eye,
  vis2: Eye,
  vis3: Eye,
  vis4: Eye,
  visvis: Eye,
  visaudio: Eye,
  audiovis: SpeakerHigh,
  arithmetic: MathOperations,
};

// Re-export from logic for backwards compatibility
// SSOT is now in @neurodual/logic/specs/control-config.ts
export { type ControlColor, MODALITY_SHORTCUTS };

interface LegacyProps {
  onVisualClick?: () => void;
  onAudioClick?: () => void;
  visualActive?: boolean;
  audioActive?: boolean;
  visualDisabled?: boolean;
  audioDisabled?: boolean;
  visualLabel?: string;
  audioLabel?: string;
}

export interface GameControlsProps extends LegacyProps {
  controls?: GameControlItem[];
  disabled?: boolean;
  /** Compact mode for tutorial - smaller buttons */
  compact?: boolean;
  /** Extra compact for very small screens (tutorial on iPhone SE) */
  extraCompact?: boolean;
  /** Scale factor for button size (0.7 - 1.3, default 1.0) */
  scale?: number;
  /** Edit mode - buttons become draggable to reorder */
  editMode?: boolean;
  /** Called when buttons are reordered in edit mode */
  onReorder?: (newOrder: string[]) => void;
  /** Optional haptic trigger called on button press (light feedback) */
  onHaptic?: () => void;
  /** Fixed width in pixels (overrides default max-width) */
  width?: number;
}

const noop = () => {};

function GameControlsImpl({
  controls,
  onVisualClick,
  onAudioClick,
  visualActive,
  audioActive,
  visualDisabled,
  audioDisabled,
  visualLabel,
  audioLabel,
  disabled = false,
  compact = false,
  extraCompact = false,
  scale = 1.0,
  editMode = false,
  onReorder,
  onHaptic,
  width,
}: GameControlsProps): ReactNode {
  const t = useUITranslations();

  // Drag state for button reordering
  const [draggedButtonId, setDraggedButtonId] = useState<string | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const currentOrderRef = useRef<string[]>([]);

  const baseItems: GameControlItem[] = controls
    ? controls
    : [
        {
          id: 'visual',
          label: visualLabel ?? t.modality.position,
          shortcut: 'A',
          active: !!visualActive,
          onClick: () => (onVisualClick || noop)(),
          color: 'visual',
        } as GameControlItem,
        {
          id: 'audio',
          label: audioLabel ?? t.modality.audio,
          shortcut: 'L',
          active: !!audioActive,
          onClick: () => (onAudioClick || noop)(),
          color: 'audio',
        } as GameControlItem,
      ].filter((item) => {
        if (item.id === 'visual' && visualDisabled) {
          return false;
        }
        if (item.id === 'audio' && audioDisabled) {
          return false;
        }
        return true;
      });

  const onHapticRef = useRef(onHaptic);
  const onClickByIdRef = useRef<Map<string, GameControlItem['onClick']>>(new Map());
  const editModeRef = useRef(editMode);
  const buttonRefHandlersRef = useRef<Map<string, (el: HTMLButtonElement | null) => void>>(
    new Map(),
  );
  const dragStartHandlersRef = useRef<Map<string, (event: React.PointerEvent) => void>>(new Map());

  onHapticRef.current = onHaptic;

  editModeRef.current = editMode;

  useEffect(() => {
    if (!editMode) {
      setDraggedButtonId(null);
      buttonRefs.current.clear();
    }
  }, [editMode]);

  // Keep current order in sync
  currentOrderRef.current = baseItems.map((item) => item.id);
  onClickByIdRef.current = new Map(baseItems.map((item) => [item.id, item.onClick]));

  // Throttle ref for slot detection during drag (performance optimization)
  const lastSlotCheckRef = useRef(0);
  const SLOT_CHECK_INTERVAL = 50; // ms - throttle getBoundingClientRect calls

  // Document-level pointer handlers for drag
  useEffect(() => {
    if (!editMode || draggedButtonId === null) return;

    const handlePointerMove = (e: PointerEvent) => {
      // Throttle slot detection to reduce layout thrashing
      const now = performance.now();
      if (now - lastSlotCheckRef.current < SLOT_CHECK_INTERVAL) return;
      lastSlotCheckRef.current = now;

      for (const [buttonId, el] of buttonRefs.current.entries()) {
        if (buttonId === draggedButtonId) continue;
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          // Swap buttons
          const currentOrder = [...currentOrderRef.current];
          const draggedIdx = currentOrder.indexOf(draggedButtonId);
          const targetIdx = currentOrder.indexOf(buttonId);
          if (draggedIdx !== -1 && targetIdx !== -1 && draggedIdx !== targetIdx) {
            currentOrder[draggedIdx] = buttonId;
            currentOrder[targetIdx] = draggedButtonId;
            onReorder?.(currentOrder);
          }
          break;
        }
      }
    };

    const handlePointerUp = () => {
      setDraggedButtonId(null);
    };

    // Use passive listeners for better scroll/touch performance
    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerup', handlePointerUp, { passive: true });
    document.addEventListener('pointercancel', handlePointerUp, { passive: true });

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [editMode, draggedButtonId, onReorder]);

  const handleControlClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const controlId = event.currentTarget.dataset['controlId'];
    if (!controlId) return;
    // Trigger haptic as early as possible (avoids feeling "late" if click handler does work).
    onHapticRef.current?.();
    onClickByIdRef.current.get(controlId)?.(event);
  }, []);

  const getButtonRef = useCallback((buttonId: string) => {
    const existingHandler = buttonRefHandlersRef.current.get(buttonId);
    if (existingHandler) {
      return existingHandler;
    }
    const nextHandler = (el: HTMLButtonElement | null) => {
      if (el) {
        buttonRefs.current.set(buttonId, el);
      } else {
        buttonRefs.current.delete(buttonId);
      }
    };
    buttonRefHandlersRef.current.set(buttonId, nextHandler);
    return nextHandler;
  }, []);

  const getDragStartHandler = useCallback((buttonId: string) => {
    const existingHandler = dragStartHandlersRef.current.get(buttonId);
    if (existingHandler) {
      return existingHandler;
    }
    const nextHandler = (e: React.PointerEvent) => {
      if (!editModeRef.current) return;
      e.preventDefault();
      setDraggedButtonId(buttonId);
    };
    dragStartHandlersRef.current.set(buttonId, nextHandler);
    return nextHandler;
  }, []);

  // Determine size mode
  const sizeMode = extraCompact ? 'extraCompact' : compact ? 'compact' : 'normal';
  const count = baseItems.length;

  // Use 3 columns for 5+ buttons (multi-modality modes like Brain Workshop)
  const columns = count > 4 ? 3 : 2;

  // Check if last row is incomplete
  const hasOrphan = count % columns !== 0;

  // Button height: tall for 2 buttons, normal for 3-4, compact for 5+
  const buttonHeight: 'tall' | 'normal' | 'compact' =
    count <= 2 ? 'tall' : count <= 4 ? 'normal' : 'compact';

  // Apply scale via CSS transform (origin center)
  // If width is provided, use it instead of max-width classes
  const containerStyle: React.CSSProperties = {
    ...(scale !== 1.0 && { transform: `scale(${scale})`, transformOrigin: 'center' }),
    ...(width && { width, maxWidth: width }),
  };

  return (
    <div
      role="group"
      aria-label={t.controls.groupLabel}
      style={containerStyle}
      className={cn(
        'grid w-full mx-auto',
        // Column count
        columns === 3 ? 'grid-cols-3' : 'grid-cols-2',
        // Gap and max-width by size mode and column count (only if width not provided)
        !width && sizeMode === 'extraCompact' && 'max-w-[280px] gap-1.5 px-1',
        !width && sizeMode === 'compact' && 'max-w-[340px] gap-2 px-1',
        !width && sizeMode === 'normal' && columns === 3 && 'max-w-[480px] gap-2',
        !width && sizeMode === 'normal' && columns === 2 && 'max-w-[400px] gap-2.5 sm:gap-3.5',
        // Gap only when width is provided
        width && 'gap-2 sm:gap-3',
      )}
    >
      {baseItems.map((item, index) => {
        // Last row orphan handling depends on column count
        const isOrphan = hasOrphan && index === count - 1;
        // For 3 columns with 1 orphan: place in center column (col-start-2)
        // For 2 columns with 1 orphan: span 2 and center
        const orphanMode = isOrphan ? (columns === 3 ? '3col' : '2col') : null;
        const isDragging = draggedButtonId === item.id;

        return (
          <ControlBtn
            key={item.id}
            ref={editMode ? getButtonRef(item.id) : undefined}
            controlId={item.id}
            label={item.label}
            shortcut={item.shortcut}
            active={item.active}
            onClick={editMode ? noop : handleControlClick}
            disabled={disabled}
            color={item.color}
            sizeMode={sizeMode}
            highlighted={item.highlighted}
            error={item.error}
            orphanMode={orphanMode}
            heightMode={buttonHeight}
            editMode={editMode}
            isDragging={isDragging}
            onPointerDown={editMode ? getDragStartHandler(item.id) : undefined}
            data-testid={`btn-match-${item.id}`}
          />
        );
      })}
    </div>
  );
}

export const GameControls = memo(GameControlsImpl);
GameControls.displayName = 'GameControls';

type SizeMode = 'extraCompact' | 'compact' | 'normal';

interface ControlBtnProps {
  controlId: string;
  label: string;
  shortcut: string;
  active: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled: boolean;
  color: ControlColor;
  sizeMode?: SizeMode;
  highlighted?: boolean;
  error?: boolean;
  /** Orphan button positioning mode: '2col' spans 2 cols, '3col' uses col-start-2 */
  orphanMode?: '2col' | '3col' | null;
  /** Height mode: tall for 2 buttons, normal for 3-4, compact for 5+ */
  heightMode?: 'tall' | 'normal' | 'compact';
  /** Edit mode - button becomes draggable */
  editMode?: boolean;
  /** Is this button currently being dragged */
  isDragging?: boolean;
  /** Pointer down handler for drag */
  onPointerDown?: (e: React.PointerEvent) => void;
  'data-testid'?: string;
}

const ControlBtn = memo(
  forwardRef<HTMLButtonElement, ControlBtnProps>(function ControlBtn(
    {
      controlId,
      label,
      shortcut,
      active,
      onClick,
      disabled,
      color,
      sizeMode = 'normal',
      highlighted = false,
      error = false,
      orphanMode = null,
      heightMode = 'normal',
      editMode = false,
      isDragging = false,
      onPointerDown,
      'data-testid': testId,
    },
    ref,
  ) {
    // Color styles — all mapped to woven-* theme tokens
    const colorStyles: Record<ControlColor, string> = {
      visual: 'text-woven-text',
      audio: 'text-woven-correct',
      accent: 'text-primary',
      warning: 'text-woven-amber',
      // Multi-stimulus position colors (Brain Workshop mode)
      position2: 'text-woven-incorrect',
      position3: 'text-woven-correct',
      position4: 'text-woven-orange',
      // Multi-stimulus vis colors (Brain Workshop mode)
      vis1: 'text-woven-blue',
      vis2: 'text-woven-incorrect',
      vis3: 'text-woven-correct',
      vis4: 'text-woven-orange',
      // Multi-audio (Brain Workshop mode)
      audio2: 'text-woven-cyan',
      // Extended modalities
      arithmetic: 'text-woven-purple',
      image: 'text-woven-blue',
      color: 'text-woven-purple',
      spatial: 'text-emerald-500',
      digits: 'text-cyan-500',
      emotions: 'text-rose-500',
      words: 'text-lime-500',
      tones: 'text-violet-500',
    };

    const activeStyles: Record<ControlColor, string> = {
      visual: 'bg-woven-text text-woven-bg scale-[0.98]',
      audio: 'bg-woven-correct text-white scale-[0.98]',
      accent: 'bg-primary text-white scale-[0.98]',
      warning: 'bg-woven-amber text-white scale-[0.98]',
      // Multi-stimulus position colors
      position2: 'bg-woven-incorrect text-white scale-[0.98]',
      position3: 'bg-woven-correct text-white scale-[0.98]',
      position4: 'bg-woven-orange text-white scale-[0.98]',
      // Multi-stimulus vis colors
      vis1: 'bg-woven-blue text-white scale-[0.98]',
      vis2: 'bg-woven-incorrect text-white scale-[0.98]',
      vis3: 'bg-woven-correct text-white scale-[0.98]',
      vis4: 'bg-woven-orange text-white scale-[0.98]',
      // Multi-audio
      audio2: 'bg-woven-cyan text-white scale-[0.98]',
      // Extended modalities
      arithmetic: 'bg-woven-purple text-white scale-[0.98]',
      image: 'bg-woven-blue text-white scale-[0.98]',
      color: 'bg-woven-purple text-white scale-[0.98]',
      spatial: 'bg-emerald-500 text-white scale-[0.98]',
      digits: 'bg-cyan-500 text-white scale-[0.98]',
      emotions: 'bg-rose-500 text-white scale-[0.98]',
      words: 'bg-lime-500 text-white scale-[0.98]',
      tones: 'bg-violet-500 text-white scale-[0.98]',
    };

    const activePressStyles: Record<ControlColor, string> = {
      // Use "active" only so desktop click doesn't show a sticky pressed state.
      // We'll add a short programmatic flash on pointerdown for mouse.
      visual: 'active:bg-woven-text active:text-woven-bg',
      audio: 'active:bg-woven-correct active:text-white',
      accent: 'active:bg-primary active:text-white',
      warning: 'active:bg-woven-amber active:text-white',
      // Multi-stimulus position colors
      position2: 'active:bg-woven-incorrect active:text-white',
      position3: 'active:bg-woven-correct active:text-white',
      position4: 'active:bg-woven-orange active:text-white',
      // Multi-stimulus vis colors
      vis1: 'active:bg-woven-blue active:text-white',
      vis2: 'active:bg-woven-incorrect active:text-white',
      vis3: 'active:bg-woven-correct active:text-white',
      vis4: 'active:bg-woven-orange active:text-white',
      // Multi-audio
      audio2: 'active:bg-woven-cyan active:text-white',
      // Extended modalities
      arithmetic: 'active:bg-woven-purple active:text-white',
      image: 'active:bg-woven-blue active:text-white',
      color: 'active:bg-woven-purple active:text-white',
      spatial: 'active:bg-emerald-500 active:text-white',
      digits: 'active:bg-cyan-500 active:text-white',
      emotions: 'active:bg-rose-500 active:text-white',
      words: 'active:bg-lime-500 active:text-white',
      tones: 'active:bg-violet-500 active:text-white',
    };

    const buttonElRef = useRef<HTMLButtonElement | null>(null);
    const flashTimerRef = useRef<number | null>(null);

    useMountEffect(() => {
      return () => {
        if (flashTimerRef.current !== null) {
          window.clearTimeout(flashTimerRef.current);
          flashTimerRef.current = null;
        }
      };
    });

    const flashActive = () => {
      const el = buttonElRef.current;
      if (!el) return;

      // Apply a short-lived class to force background color even when :active
      // is too brief to notice on desktop.
      const cls = 'nd-flash-active';
      el.classList.add(cls);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => {
        el.classList.remove(cls);
        flashTimerRef.current = null;
      }, 220);
    };

    // Height depends on button count: tall (2 buttons), normal (3-4), compact (5+)
    const heightStyles = {
      tall: 'h-[80px] sm:h-[88px]', // More square-ish for 2 buttons
      normal: 'h-[60px] sm:h-[66px]', // Standard for 3-4 buttons (touch-friendly)
      compact: 'h-[52px] sm:h-[56px]', // Compact for multi-modality modes (5+)
    };

    // Size mode affects text and rounding
    const sizeStyles: Record<SizeMode, string> = {
      extraCompact: 'text-xs rounded-xl',
      compact: 'text-sm rounded-xl',
      normal: 'text-sm sm:text-base rounded-xl',
    };

    const pointerEventsSupported = typeof window !== 'undefined' && 'PointerEvent' in window;

    return (
      <button
        ref={(el) => {
          buttonElRef.current = el;
          if (typeof ref === 'function') {
            ref(el);
          } else if (ref) {
            (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
          }
        }}
        type="button"
        data-control-id={controlId}
        data-control-color={color}
        data-capture-control="game-response-button"
        data-capture-state={active ? 'active' : 'idle'}
        data-testid={testId}
        onPointerDown={(e) => {
          onPointerDown?.(e);
          if (editMode || disabled) return;
          if (e.button !== 0) return;
          e.preventDefault();
          // Mouse down flash (desktop)
          flashActive();
          onClick(e as unknown as React.MouseEvent<HTMLButtonElement>);
        }}
        onClick={(e) => {
          if (editMode || disabled) return;
          // Keyboard and assistive activations dispatch click with detail=0.
          if (e.detail === 0 || !pointerEventsSupported) {
            onClick(e);
          }
        }}
        disabled={disabled}
        aria-label={`${label} - ${shortcut}`}
        aria-pressed={active}
        className={cn(
          'transition-all duration-150 ease-out font-semibold tracking-normal relative group touch-manipulation',
          // Orphan button positioning: 2-col layout spans 2 cols, 3-col layout uses col-start-2
          orphanMode === '2col' && 'col-span-2 justify-self-center w-[calc(50%-0.25rem)]',
          orphanMode === '3col' && 'col-start-2',
          !orphanMode && 'w-full',
          heightStyles[heightMode],
          sizeStyles[sizeMode],
          'bg-woven-surface border border-woven-border/60 shadow-[0_4px_16px_-4px_hsl(var(--woven-border)/0.3)]',
          colorStyles[color],
          !disabled && !editMode && 'hover:border-woven-border/70 hover:bg-woven-cell-rest/40',
          !disabled && !editMode && activePressStyles[color],
          !disabled && !editMode && 'active:scale-[0.985]',
          active && activeStyles[color],
          // Flash styling: handled in styles.css via button.nd-flash-active[data-control-id]
          // Error flash for tutorials
          error &&
            'bg-woven-incorrect text-white border-woven-incorrect/70 ring-2 ring-woven-incorrect/45 shadow-lg shadow-woven-incorrect/30 animate-tutorial-error scale-[0.98]',
          // Highlighted state for tutorials - ring glow on specific button
          highlighted && !active && 'ring-2 ring-woven-focus/50',
          // Edit mode styling - dashed border, cursor grab
          editMode &&
            'border-2 border-dashed border-cyan-500/50 cursor-grab active:cursor-grabbing',
          // Dragging state - reduced opacity
          isDragging && 'opacity-50 scale-95',
        )}
      >
        <span className="z-10 relative flex items-center justify-center gap-1.5">
          {MODALITY_ICONS[controlId] &&
            (() => {
              const Icon = MODALITY_ICONS[controlId];
              return (
                <Icon
                  size={sizeMode === 'extraCompact' ? 14 : 16}
                  weight="bold"
                  className="opacity-60 shrink-0"
                />
              );
            })()}
          {label}
        </span>
        <KeyboardIndicator shortcut={shortcut} active={active} />
      </button>
    );
  }),
);

const KeyboardIndicator = memo(function KeyboardIndicator({
  shortcut,
  active,
}: {
  shortcut: string;
  active: boolean;
}): ReactNode {
  const t = useUITranslations();
  return (
    <div
      data-capture-badge="game-control-shortcut"
      className={cn(
        'absolute top-1.5 right-1.5 sm:top-2 sm:right-2 md:top-3 md:right-3 flex items-center gap-1 opacity-40 transition-opacity duration-150',
        active ? 'text-white opacity-60' : 'text-woven-text-muted',
      )}
    >
      <span className="hidden md:inline text-xxs font-bold uppercase tracking-wider">
        {t.controls.keyLabel}
      </span>
      <kbd className="px-1 py-0.5 sm:px-1.5 rounded border border-current font-mono text-3xs sm:text-xs font-bold">
        {shortcut}
      </kbd>
    </div>
  );
});
