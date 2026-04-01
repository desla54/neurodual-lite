/**
 * GameLayoutEditor - WYSIWYG 2D free-form layout editor
 *
 * Uses react-rnd for drag + resize of each zone.
 * Zones are rendered as-is (WYSIWYG) with pointer-events disabled on content.
 * Positions are stored as absolute pixel values (ZoneRect).
 */

import { useState } from 'react';
import { Rnd } from 'react-rnd';
import { ArrowsOutCardinal, Check, ArrowCounterClockwise } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { ZoneRect } from '../../stores/settings-store';

/** LayoutZone kept for external typing (gameLayoutOrder, setGameLayoutOrder, etc.) */
export type LayoutZone = 'header' | 'game' | 'controls';

export interface ZoneConfig {
  id: string;
  label: string;
  color: string;
  element: React.ReactNode;
}

interface GameLayoutEditorProps {
  /** Zone descriptors: id, label, color, content element */
  zones: ZoneConfig[];
  /** Initial pixel layouts for each zone (keyed by ZoneConfig.id) */
  initialLayouts: Record<string, ZoneRect>;
  /** Called when user saves — receives updated layouts */
  onSave: (layouts: Record<string, ZoneRect>) => void;
  /** Called when user resets — parent should clear gameZoneLayouts */
  onReset: () => void;
  /** Called when user closes without saving */
  onClose: () => void;
}

const HANDLE_BASE: React.CSSProperties = {
  borderRadius: '50%',
  border: '2px solid white',
  boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
  zIndex: 30,
};

function getHandleStyles(color: string): Record<string, React.CSSProperties> {
  const corner: React.CSSProperties = { ...HANDLE_BASE, width: 14, height: 14, background: color };
  const edgeH: React.CSSProperties = {
    height: 6,
    borderRadius: 3,
    margin: '0 20px',
    zIndex: 30,
    background: `${color}cc`,
  };
  const edgeV: React.CSSProperties = {
    width: 6,
    borderRadius: 3,
    margin: '20px 0',
    zIndex: 30,
    background: `${color}cc`,
  };
  return {
    topLeft: corner,
    topRight: corner,
    bottomLeft: corner,
    bottomRight: corner,
    top: edgeH,
    bottom: edgeH,
    left: edgeV,
    right: edgeV,
  };
}

export function GameLayoutEditor({
  zones,
  initialLayouts,
  onSave,
  onReset,
  onClose,
}: GameLayoutEditorProps): React.ReactNode {
  const { t } = useTranslation();
  const [draftLayouts, setDraftLayouts] = useState<Record<string, ZoneRect>>(initialLayouts);

  const updateZone = (id: string, rect: Partial<ZoneRect>): void => {
    setDraftLayouts((prev) => {
      const current: ZoneRect = prev[id] ?? { x: 0, y: 0, w: 100, h: 100 };
      return { ...prev, [id]: { ...current, ...rect } };
    });
  };

  return (
    <div className="relative w-full h-full bg-woven-bg">
      {/* Toolbar — floats over canvas */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 bg-woven-surface border-b border-woven-border">
        <div className="flex items-center gap-2 text-sm font-medium text-woven-text">
          <ArrowsOutCardinal size={18} className="text-primary" />
          {t('game.layoutEdit.title', 'Edit layout')}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-woven-cell-rest hover:bg-woven-cell-hover text-woven-text transition-colors"
          >
            <ArrowCounterClockwise size={14} />
            {t('game.layoutEdit.reset', 'Reset')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-woven-cell-rest hover:bg-woven-cell-hover text-woven-text transition-colors"
          >
            {t('game.layoutEdit.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => onSave(draftLayouts)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors"
          >
            <Check size={14} />
            {t('game.layoutEdit.save', 'Lock')}
          </button>
        </div>
      </div>

      {/* Canvas — full size, toolbar floats over it */}
      <div className="absolute inset-0">
        {zones.map((zone) => {
          const rect = draftLayouts[zone.id];
          if (!rect) return null;

          return (
            <Rnd
              key={zone.id}
              position={{ x: rect.x, y: rect.y }}
              size={{ width: rect.w, height: rect.h }}
              bounds="parent"
              minWidth={60}
              minHeight={44}
              resizeHandleStyles={getHandleStyles(zone.color)}
              onDragStop={(_e, d) => {
                updateZone(zone.id, { x: Math.round(d.x), y: Math.round(d.y) });
              }}
              onResizeStop={(_e, _dir, ref, _delta, position) => {
                updateZone(zone.id, {
                  x: Math.round(position.x),
                  y: Math.round(position.y),
                  w: Math.round(parseInt(ref.style.width, 10)),
                  h: Math.round(parseInt(ref.style.height, 10)),
                });
              }}
              style={{ zIndex: 10 }}
            >
              {/* Colored border overlay */}
              <div
                className="relative w-full h-full rounded-xl"
                style={{
                  outline: `2px dashed ${zone.color}`,
                  outlineOffset: '-2px',
                  backgroundColor: `${zone.color}10`,
                }}
              >
                {/* Label badge */}
                <div
                  className="absolute top-1 left-1 z-20 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: zone.color }}
                >
                  <ArrowsOutCardinal size={10} />
                  {zone.label}
                </div>

                {/* Zone content — pointer-events disabled to block game interactions */}
                <div className="w-full h-full" style={{ pointerEvents: 'none' }}>
                  {zone.element}
                </div>
              </div>
            </Rnd>
          );
        })}
      </div>

      {/* Instructions */}
      <div className="absolute bottom-0 left-0 right-0 z-50 px-4 py-1.5 text-center text-xs text-woven-text-muted bg-woven-surface border-t border-woven-border">
        {t('game.layoutEdit.instructions', 'Drag to reposition · Resize from edges and corners')}
      </div>
    </div>
  );
}
