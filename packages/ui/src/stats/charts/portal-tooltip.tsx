import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { Coordinate } from 'recharts';
import type { NameType, Payload, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { CustomTooltip } from './custom-tooltip';
import { resolveTooltipViewportPoint } from './tooltip-position';

export interface PortalTooltipProps<
  TValue extends ValueType = ValueType,
  TName extends NameType = NameType,
> {
  readonly containerRef: RefObject<HTMLElement | null>;
  // Recharts injected props (Tooltip clones `content` and passes these)
  readonly active?: boolean;
  readonly payload?: ReadonlyArray<Payload<TValue, TName>>;
  readonly label?: ValueType;
  readonly coordinate?: Coordinate;
  readonly valueFormatter?: (value: number) => string;
  readonly labelFormatter?: (label: string) => string;
  readonly hideLabel?: boolean;
  readonly payloadFilter?: (
    payload: ReadonlyArray<Payload<TValue, TName>>,
  ) => Array<Payload<TValue, TName>>;
  /** Viewport padding used to keep the tooltip on-screen */
  readonly viewportPadding?: number;
  /** Vertical offset (px) above the active point */
  readonly offsetY?: number;
}

export function PortalTooltip<
  TValue extends ValueType = ValueType,
  TName extends NameType = NameType,
>(props: PortalTooltipProps<TValue, TName>): ReactNode {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 });
  const [dismissed, setDismissed] = useState(false);

  const {
    containerRef,
    coordinate,
    active,
    payload,
    label,
    valueFormatter,
    labelFormatter,
    hideLabel,
    payloadFilter,
    viewportPadding = 12,
    offsetY = 12,
  } = props;

  const tooltipSignature = useMemo(
    () =>
      JSON.stringify({
        label,
        x: coordinate?.x ?? null,
        y: coordinate?.y ?? null,
        payload: payload?.map((entry) => ({
          key: entry.dataKey ?? entry.name ?? null,
          value: entry.value ?? null,
        })),
      }),
    [coordinate?.x, coordinate?.y, label, payload],
  );

  useEffect(() => {
    if (!active) {
      setDismissed(false);
      return;
    }
    setDismissed(false);
  }, [active, tooltipSignature]);

  useLayoutEffect(() => {
    if (!active || dismissed) return;
    const el = tooltipRef.current;
    if (!el) return;

    const next = el.getBoundingClientRect();
    setTooltipSize((prev) => {
      if (Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5) {
        return prev;
      }
      return { width: next.width, height: next.height };
    });
  }, [active, dismissed, label, payload?.length]);

  const container = containerRef.current;

  useEffect(() => {
    if (!active || !container) return;

    const dismiss = () => setDismissed(true);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (container.contains(target) || tooltipRef.current?.contains(target)) return;
      dismiss();
    };

    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('wheel', dismiss, { passive: true });
    window.addEventListener('touchmove', dismiss, { passive: true });
    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('wheel', dismiss);
      window.removeEventListener('touchmove', dismiss);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [active, container, tooltipSignature]);

  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  if (!active || dismissed || !payload || payload.length === 0) return null;
  if (!coordinate) return null;
  if (!container) return null;

  const filteredPayload = payloadFilter ? payloadFilter(payload) : Array.from(payload);
  if (filteredPayload.length === 0) return null;

  const rect = container.getBoundingClientRect();
  const isRotatedFullscreen =
    container.closest('.fullscreen-chart-landscape') != null &&
    window.matchMedia('(orientation: portrait) and (max-width: 768px)').matches;

  const { left: rawLeft, top: rawTop } = resolveTooltipViewportPoint({
    containerRect: rect,
    coordinate,
    offsetY,
    isRotatedFullscreen,
  });

  const width = tooltipSize.width || 240;
  const height = tooltipSize.height || 84;

  const minLeft = viewportPadding + width / 2;
  const maxLeft = window.innerWidth - viewportPadding - width / 2;
  const left =
    minLeft <= maxLeft ? Math.min(Math.max(rawLeft, minLeft), maxLeft) : window.innerWidth / 2;

  const minTop = viewportPadding + height;
  const maxTop = window.innerHeight - viewportPadding;
  const top =
    minTop <= maxTop ? Math.min(Math.max(rawTop, minTop), maxTop) : window.innerHeight / 2;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left,
        top,
        transform: isRotatedFullscreen
          ? 'translate3d(-50%, -100%, 0) rotate(90deg)'
          : 'translate3d(-50%, -100%, 0)',
        transformOrigin: 'center center',
        pointerEvents: 'none',
        zIndex: 10060,
      }}
    >
      <div ref={tooltipRef}>
        <CustomTooltip
          active
          payload={filteredPayload as unknown as Payload<ValueType, NameType>[]}
          label={label}
          valueFormatter={valueFormatter}
          labelFormatter={labelFormatter}
          hideLabel={hideLabel}
        />
      </div>
    </div>,
    document.body,
  );
}
