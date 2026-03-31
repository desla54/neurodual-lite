/**
 * DrawingCanvas - Handwriting input component with ink effect
 *
 * Captures touch/mouse strokes for handwriting recognition.
 * Features velocity-based stroke width for realistic ink feel.
 * Returns stroke data compatible with $Q Recognizer.
 */

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
}

export interface DrawingCanvasProps {
  /** Width of the canvas */
  width?: number;
  /** Height of the canvas */
  height?: number;
  /** Line color */
  strokeColor?: string;
  /** Base line width (varies with velocity) */
  strokeWidth?: number;
  /** Called when a stroke is completed */
  onStrokeEnd?: (strokes: Stroke[]) => void;
  /** Called continuously while drawing */
  onDraw?: (strokes: Stroke[]) => void;
  /** Called when a new stroke starts */
  onStrokeStart?: () => void;
  /** Called when a tap is detected (short touch with minimal movement) */
  onTap?: () => void;
  /** External control to clear the canvas */
  clearTrigger?: number;
  /** Custom class name */
  className?: string;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Enable ink effect (velocity-based width, default true) */
  inkEffect?: boolean;
}

// =============================================================================
// Component
// =============================================================================

// Tap detection constants
const TAP_MAX_DURATION_MS = 200;
const TAP_MAX_DISTANCE_PX = 8;
const MIN_SEGMENT_DISTANCE_PX = 0.75;
const MAX_CANVAS_DPR = 2;

// Ink effect constants
const MIN_WIDTH_FACTOR = 0.4; // Thinnest at high velocity
const MAX_WIDTH_FACTOR = 1.4; // Thickest at low velocity
const VELOCITY_SMOOTHING = 0.7; // How much to smooth velocity changes
const MAX_VELOCITY = 800; // Pixels per second at which we use min width

/**
 * Resolve CSS color that may contain CSS variables.
 * Canvas 2D context doesn't support CSS variables directly,
 * so we need to resolve them manually.
 */
function resolveCssColor(color: string): string {
  // If it contains var(), try to resolve it
  if (color.includes('var(')) {
    try {
      // Extract variable name from hsl(var(--name)) or var(--name)
      const varMatch = color.match(/var\((--[\w-]+)\)/);
      if (varMatch?.[1]) {
        const varName = varMatch[1];
        const computed = getComputedStyle(document.documentElement)
          .getPropertyValue(varName)
          .trim();
        if (computed) {
          // Replace var(...) with the computed value
          return color.replace(/var\(--[\w-]+\)/, computed);
        }
      }
    } catch {
      // Fallback to original
    }
  }
  return color;
}

export function DrawingCanvas({
  width = 200,
  height = 200,
  strokeColor = 'hsl(var(--woven-text))',
  strokeWidth = 4,
  onStrokeEnd,
  onDraw,
  onStrokeStart,
  onTap,
  clearTrigger = 0,
  className = '',
  disabled = false,
  inkEffect = true,
}: DrawingCanvasProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);

  // Resolve CSS color (handles CSS variables)
  const [resolvedStrokeColor, setResolvedStrokeColor] = useState(() =>
    resolveCssColor(strokeColor),
  );

  // Update resolved color when strokeColor changes or when dark mode might change
  useEffect(() => {
    const updateColor = () => {
      setResolvedStrokeColor(resolveCssColor(strokeColor));
    };

    updateColor();

    // Listen for theme changes via MutationObserver on documentElement class
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class' || mutation.attributeName === 'style') {
          updateColor();
          break;
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, [strokeColor]);
  const currentStrokeRef = useRef<Point[]>([]);

  // Tap detection - use ref to avoid React state timing issues with quick taps
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerTypeRef = useRef<'mouse' | 'touch' | 'pen' | null>(null);
  // Track if we're in a touch/mouse interaction (ref for immediate access)
  const isInteractingRef = useRef(false);
  const isDrawingRef = useRef(false);
  const interactionRectRef = useRef<DOMRect | null>(null);

  // Ink effect state
  const lastPointRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const currentVelocityRef = useRef(0);

  // Store strokes in ref for redraw access without dependency
  const strokesRef = useRef<Stroke[]>([]);
  strokesRef.current = strokes;

  // Initialize canvas context (only on mount or size change)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cap DPR to keep handwriting smooth on mobile while preserving visual quality.
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = resolvedStrokeColor;
    ctx.lineWidth = strokeWidth;
    ctxRef.current = ctx;

    // Redraw existing strokes after canvas reset
    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) continue;
      const first = stroke.points[0];
      if (!first) continue;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.points.length; i++) {
        const point = stroke.points[i];
        if (point) {
          ctx.lineTo(point.x, point.y);
        }
      }
      ctx.stroke();
    }
  }, [width, height, resolvedStrokeColor, strokeWidth]);

  // Clear canvas when trigger changes
  useEffect(() => {
    if (clearTrigger > 0) {
      const ctx = ctxRef.current;
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
      }
      setStrokes([]);
      currentStrokeRef.current = [];
      isInteractingRef.current = false;
      isDrawingRef.current = false;
      touchStartRef.current = null;
      lastPointRef.current = null;
      currentVelocityRef.current = 0;
      interactionRectRef.current = null;
    }
  }, [clearTrigger, width, height]);

  // Get coordinates relative to canvas
  const getCoordinatesFromClient = useCallback((clientX: number, clientY: number): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = interactionRectRef.current ?? canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  // Calculate stroke width based on velocity (ink effect)
  const getInkWidth = useCallback(
    (velocity: number): number => {
      if (!inkEffect) return strokeWidth;

      // Map velocity to width factor (inverse relationship)
      const normalizedVelocity = Math.min(velocity / MAX_VELOCITY, 1);
      const factor = MAX_WIDTH_FACTOR - normalizedVelocity * (MAX_WIDTH_FACTOR - MIN_WIDTH_FACTOR);
      return strokeWidth * factor;
    },
    [strokeWidth, inkEffect],
  );

  // Start drawing
  const startDrawing = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      if (activePointerIdRef.current !== null) return;

      // Only left click for mouse.
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      e.preventDefault();

      const pointerType: 'mouse' | 'touch' | 'pen' =
        e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';

      interactionRectRef.current = e.currentTarget.getBoundingClientRect();
      const point = getCoordinatesFromClient(e.clientX, e.clientY);
      if (!point) return;

      const now = performance.now();

      // Record start for tap detection
      touchStartRef.current = { x: point.x, y: point.y, time: now };
      isInteractingRef.current = true;
      isDrawingRef.current = true;

      // Initialize ink effect state
      lastPointRef.current = { x: point.x, y: point.y, time: now };
      currentVelocityRef.current = 0;

      currentStrokeRef.current = [point];
      onStrokeStart?.();
      activePointerIdRef.current = e.pointerId;
      activePointerTypeRef.current = pointerType;

      if (pointerType !== 'mouse') {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Ignore.
        }
      }

      const ctx = ctxRef.current;
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        // Start with max width (no velocity yet)
        ctx.lineWidth = getInkWidth(0);
        // Ensure stroke color is current (handles theme changes)
        ctx.strokeStyle = resolvedStrokeColor;
      }
    },
    [disabled, getCoordinatesFromClient, getInkWidth, onStrokeStart, resolvedStrokeColor],
  );

  // Continue drawing with ink effect
  const draw = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || disabled) return;
      const activePointerId = activePointerIdRef.current;
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      e.preventDefault();

      const nativeEvent = e.nativeEvent;
      const coalesced = nativeEvent.getCoalescedEvents?.();
      // Android WebView/Chromium variants can expose getCoalescedEvents but return an empty array.
      // Always keep at least the current event to avoid dropping the whole stroke.
      const events = coalesced && coalesced.length > 0 ? coalesced : [nativeEvent];

      const ctx = ctxRef.current;
      let didAddPoint = false;

      for (const ce of events) {
        if (!Number.isFinite(ce.clientX) || !Number.isFinite(ce.clientY)) continue;
        const point = getCoordinatesFromClient(ce.clientX, ce.clientY);
        if (!point) continue;

        const lastPoint = lastPointRef.current;

        if (ctx && lastPoint && inkEffect) {
          const now = performance.now();
          const dx = point.x - lastPoint.x;
          const dy = point.y - lastPoint.y;
          const distance = Math.hypot(dx, dy);
          if (distance < MIN_SEGMENT_DISTANCE_PX) continue;
          const dt = Math.max(now - lastPoint.time, 1); // Avoid division by zero
          const velocity = (distance / dt) * 1000; // Pixels per second

          // Smooth the velocity to avoid jitter
          const smoothedVelocity =
            currentVelocityRef.current * VELOCITY_SMOOTHING + velocity * (1 - VELOCITY_SMOOTHING);
          currentVelocityRef.current = smoothedVelocity;

          // Draw segment with quadratic curve for smoothness
          const newWidth = getInkWidth(smoothedVelocity);

          ctx.beginPath();
          ctx.lineWidth = newWidth;
          ctx.moveTo(lastPoint.x, lastPoint.y);

          // Use midpoint for smoother curves
          const midX = (lastPoint.x + point.x) / 2;
          const midY = (lastPoint.y + point.y) / 2;
          ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midX, midY);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();

          // Update last point
          lastPointRef.current = { x: point.x, y: point.y, time: now };
        } else if (ctx) {
          if (lastPoint) {
            const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
            if (distance < MIN_SEGMENT_DISTANCE_PX) continue;
          }
          // Non-ink mode: simple line
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
          lastPointRef.current = { x: point.x, y: point.y, time: performance.now() };
        }

        currentStrokeRef.current.push(point);
        didAddPoint = true;
      }

      // Notify with current strokes
      if (didAddPoint && onDraw) {
        const allStrokes = [...strokesRef.current, { points: [...currentStrokeRef.current] }];
        onDraw(allStrokes);
      }
    },
    [disabled, getCoordinatesFromClient, onDraw, inkEffect, getInkWidth],
  );

  // End drawing
  const endDrawing = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // Use ref instead of state to avoid React timing issues with quick taps
      if (!isInteractingRef.current) return;
      const activePointerId = activePointerIdRef.current;
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      e.preventDefault();

      isInteractingRef.current = false;
      isDrawingRef.current = false;

      const endPoint = getCoordinatesFromClient(e.clientX, e.clientY);
      const startInfo = touchStartRef.current;
      interactionRectRef.current = null;
      activePointerIdRef.current = null;
      activePointerTypeRef.current = null;

      // Check for tap: short duration + minimal movement
      if (startInfo && endPoint && onTap) {
        const duration = performance.now() - startInfo.time;
        const distance = Math.hypot(endPoint.x - startInfo.x, endPoint.y - startInfo.y);

        if (duration < TAP_MAX_DURATION_MS && distance < TAP_MAX_DISTANCE_PX) {
          // It's a tap - don't create a stroke
          touchStartRef.current = null;
          lastPointRef.current = null;
          currentVelocityRef.current = 0;
          currentStrokeRef.current = [];
          onTap();
          return;
        }
      }

      touchStartRef.current = null;
      lastPointRef.current = null;
      currentVelocityRef.current = 0;

      if (currentStrokeRef.current.length > 0) {
        const newStroke: Stroke = { points: [...currentStrokeRef.current] };
        const newStrokes = [...strokesRef.current, newStroke];
        setStrokes(newStrokes);

        if (onStrokeEnd) {
          onStrokeEnd(newStrokes);
        }
      }

      currentStrokeRef.current = [];
    },
    [onStrokeEnd, onTap, getCoordinatesFromClient],
  );

  // Cancel drawing (e.g., mouse leaves canvas)
  const cancelDrawing = useCallback(() => {
    if (isInteractingRef.current || isDrawingRef.current) {
      isInteractingRef.current = false;
      isDrawingRef.current = false;
      currentStrokeRef.current = [];
      lastPointRef.current = null;
      currentVelocityRef.current = 0;
      touchStartRef.current = null;
      interactionRectRef.current = null;
      activePointerIdRef.current = null;
      activePointerTypeRef.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (activePointerTypeRef.current !== 'mouse') return;
    cancelDrawing();
  }, [cancelDrawing]);

  // On Android WebView / Capacitor, pointer capture can be lost immediately after
  // setPointerCapture — which would fire cancelDrawing and kill the entire stroke.
  // Only cancel for mouse (where leaving the canvas is a real user gesture).
  const handleLostPointerCapture = useCallback(() => {
    if (activePointerTypeRef.current === 'mouse') {
      cancelDrawing();
    }
  }, [cancelDrawing]);

  return (
    <canvas
      ref={canvasRef}
      className={`touch-none select-none ${className}`}
      onPointerDown={startDrawing}
      onPointerMove={draw}
      onPointerUp={endDrawing}
      onPointerCancel={cancelDrawing}
      onPointerLeave={handlePointerLeave}
      onLostPointerCapture={handleLostPointerCapture}
      style={{
        cursor: disabled ? 'not-allowed' : 'crosshair',
      }}
    />
  );
}

// =============================================================================
// Utility: Convert canvas strokes to recognizer format
// =============================================================================

export interface StrokePoint {
  x: number;
  y: number;
  strokeId: number;
}

/**
 * Convert DrawingCanvas strokes to the format expected by QRecognizer
 */
export function canvasStrokesToPoints(strokes: Stroke[]): StrokePoint[] {
  const result: StrokePoint[] = [];

  for (let strokeId = 0; strokeId < strokes.length; strokeId++) {
    const stroke = strokes[strokeId];
    if (!stroke) continue;

    for (const point of stroke.points) {
      result.push({
        x: point.x,
        y: point.y,
        strokeId,
      });
    }
  }

  return result;
}
