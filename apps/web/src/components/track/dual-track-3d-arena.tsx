/**
 * Dual Track 3D Arena — Woven-themed 3D MOT renderer.
 *
 * Ported from the validated prototype (prototypes/3d-mot-cage-woven.html).
 * This component manages its OWN 3D ball physics — it does NOT read 2D positions.
 * The parent controls game flow (phases, scoring); this component renders and handles clicks.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  type Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type PerspectiveCamera,
  Raycaster,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import {
  getTrackIdentityColor,
  type Phase as DualTrackPhase,
  type TrackFeedbackState,
  type TrackIdentityColor,
  type TrackIdentityColorId,
  type TrackIdentityVisualColorId,
} from '../../lib/dual-track-runtime';

// =============================================================================
// Props
// =============================================================================

export interface DualTrack3dArenaProps {
  readonly ballCount: number;
  readonly phase: DualTrackPhase;
  readonly selectedIndices: readonly number[];
  readonly targetIndices: readonly number[];
  readonly colorIdentityEnabled: boolean;
  readonly targetColorByBall: Partial<Record<number, TrackIdentityColorId>>;
  readonly feedbackState: TrackFeedbackState;
  readonly activeSequentialHighlightTargetId?: number;
  readonly activeSequentialHighlightColor?: TrackIdentityColor | null;
  readonly selectionColorByBall: Partial<Record<number, TrackIdentityVisualColorId>>;
  readonly show: boolean;
  readonly active: boolean;
  readonly isPaused: boolean;
  readonly onReadyChange?: (ready: boolean) => void;
  readonly onBallTap: (id: number) => void;
  /** Ref exposing a function to project a ball's 3D position to screen coords. */
  readonly getBallScreenPositionRef?: {
    current: ((id: number) => { x: number; y: number; size: number } | null) | null;
  };
}

// =============================================================================
// Constants — ported from prototype
// =============================================================================

/** Cage dimensions adapt to viewport aspect ratio */
const CAGE_LANDSCAPE = { w: 10, h: 6, d: 7 };
const CAGE_PORTRAIT = { w: 5.5, h: 11, d: 5.5 };

function getCageDimensions(aspect: number): { w: number; h: number; d: number } {
  if (aspect >= 1) return CAGE_LANDSCAPE;
  if (aspect <= 0.6) return CAGE_PORTRAIT;
  // Interpolate between portrait and landscape
  const t = (aspect - 0.6) / 0.4;
  return {
    w: CAGE_PORTRAIT.w + t * (CAGE_LANDSCAPE.w - CAGE_PORTRAIT.w),
    h: CAGE_PORTRAIT.h + t * (CAGE_LANDSCAPE.h - CAGE_PORTRAIT.h),
    d: CAGE_PORTRAIT.d + t * (CAGE_LANDSCAPE.d - CAGE_PORTRAIT.d),
  };
}

const BALL_RADIUS = 0.35;
const BALL_SPEED = 3.0;
const PAD = BALL_RADIUS + 0.15;
const CAMERA_FOV = 42;

// Woven palette
const COLOR_DEFAULT = new Color('#e0be40'); // yellow — tracking/idle
const COLOR_IVORY = new Color('#ece0c8'); // ivory — highlight phase (clean background for prompts)
const COLOR_SELECTED = new Color('#44cc66'); // bright green — player selection
const COLOR_CORRECT = new Color('#3d9a6a'); // woven green — feedback positive
const COLOR_WRONG = new Color('#b85555'); // woven red — feedback negative
const COLOR_MISSED = new Color('#d4b040'); // amber — missed target
const _tmpColor = new Color(); // reusable for identity color lookups

/** Strip alpha from hsla() strings — Three.js Color doesn't support alpha and spams warnings. */
function stripAlpha(cssColor: string): string {
  if (cssColor.startsWith('hsla(')) {
    // hsla(h, s%, l%, a) → hsl(h, s%, l%)
    const parts = cssColor.slice(5, -1).split(',');
    if (parts.length >= 3)
      return `hsl(${parts[0]?.trim()}, ${parts[1]?.trim()}, ${parts[2]?.trim()})`;
  }
  if (cssColor.startsWith('rgba(')) {
    const parts = cssColor.slice(5, -1).split(',');
    if (parts.length >= 3)
      return `rgb(${parts[0]?.trim()}, ${parts[1]?.trim()}, ${parts[2]?.trim()})`;
  }
  return cssColor;
}

// =============================================================================
// Lat/lon grid geometry for ball surface lines
// =============================================================================

const GRID_R = BALL_RADIUS * 1.012;
const GRID_SEGS = 48;

function buildLatLonGeometry(): BufferGeometry {
  const v: number[] = [];
  for (const latDeg of [-40, 0, 40]) {
    const phi = ((90 - latDeg) * Math.PI) / 180;
    const rRing = GRID_R * Math.sin(phi);
    const y = GRID_R * Math.cos(phi);
    for (let i = 0; i < GRID_SEGS; i++) {
      const a0 = (i / GRID_SEGS) * Math.PI * 2;
      const a1 = ((i + 1) / GRID_SEGS) * Math.PI * 2;
      v.push(
        Math.cos(a0) * rRing,
        y,
        Math.sin(a0) * rRing,
        Math.cos(a1) * rRing,
        y,
        Math.sin(a1) * rRing,
      );
    }
  }
  for (let m = 0; m < 4; m++) {
    const theta = (m / 4) * Math.PI;
    for (let i = 0; i < GRID_SEGS; i++) {
      const p0 = (i / GRID_SEGS) * Math.PI;
      const p1 = ((i + 1) / GRID_SEGS) * Math.PI;
      v.push(
        Math.sin(p0) * Math.cos(theta) * GRID_R,
        Math.cos(p0) * GRID_R,
        Math.sin(p0) * Math.sin(theta) * GRID_R,
        Math.sin(p1) * Math.cos(theta) * GRID_R,
        Math.cos(p1) * GRID_R,
        Math.sin(p1) * Math.sin(theta) * GRID_R,
      );
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(v, 3));
  return geo;
}

// =============================================================================
// Ball color resolution
// =============================================================================

function resolveBallColor(
  id: number,
  phase: DualTrackPhase,
  targetSet: ReadonlySet<number>,
  selectedSet: ReadonlySet<number>,
  colorIdentityEnabled: boolean,
  targetColorByBall: Partial<Record<number, TrackIdentityColorId>>,
  selectionColorByBall: Partial<Record<number, TrackIdentityVisualColorId>>,
  activeHighlightId: number | undefined,
  activeHighlightColor: TrackIdentityColor | null | undefined,
): { color: Color; emissiveIntensity: number; ring?: Color } {
  if (phase === 'feedback') {
    const isTarget = targetSet.has(id);
    const isSelected = selectedSet.has(id);
    if (isTarget && isSelected) return { color: COLOR_CORRECT, emissiveIntensity: 0.3 };
    if (!isTarget && isSelected) return { color: COLOR_WRONG, emissiveIntensity: 0.3 };
    if (isTarget && !isSelected)
      return { color: COLOR_DEFAULT, emissiveIntensity: 0.06, ring: COLOR_MISSED };
    return { color: COLOR_DEFAULT, emissiveIntensity: 0.02 };
  }
  if (phase === 'selection') {
    const selColorId = selectionColorByBall[id];
    if (selColorId) {
      const c = getTrackIdentityColor(selColorId);
      return { color: _tmpColor.set(stripAlpha(c.fill)), emissiveIntensity: 0.2 };
    }
    if (selectedSet.has(id)) return { color: COLOR_SELECTED, emissiveIntensity: 0.2 };
    return { color: COLOR_DEFAULT, emissiveIntensity: 0.06 };
  }
  if (phase === 'highlight') {
    // Sequential identity highlight (letter, digit, shape, tone, etc.)
    if (activeHighlightId === id && activeHighlightColor)
      return {
        color: _tmpColor.set(stripAlpha(activeHighlightColor.fill)),
        emissiveIntensity: 0.25,
      };
    // Color identity mode — each target gets its assigned color
    if (colorIdentityEnabled) {
      const colorId = targetColorByBall[id];
      if (colorId) {
        const c = getTrackIdentityColor(colorId);
        return { color: _tmpColor.set(stripAlpha(c.fill)), emissiveIntensity: 0.25 };
      }
      return { color: COLOR_DEFAULT, emissiveIntensity: 0.06 };
    }
    // Targets in ivory (clean background for prompt fill), distractors stay yellow
    if (targetSet.has(id)) return { color: COLOR_IVORY, emissiveIntensity: 0.15 };
    return { color: COLOR_DEFAULT, emissiveIntensity: 0.06 };
  }
  if (phase === 'tracking') return { color: COLOR_DEFAULT, emissiveIntensity: 0.06 };
  return { color: COLOR_DEFAULT, emissiveIntensity: 0.04 };
}

// =============================================================================
// 3D Ball state (internal — not exposed to parent)
// =============================================================================

interface Ball3d {
  position: Vector3;
  velocity: Vector3;
}

function createBalls3d(count: number, cage: { w: number; h: number; d: number }): Ball3d[] {
  const halfW = cage.w / 2 - PAD;
  const halfD = cage.d / 2 - PAD;
  return Array.from({ length: count }, () => ({
    position: new Vector3(
      (Math.random() - 0.5) * halfW * 2,
      PAD + Math.random() * (cage.h - PAD * 2),
      (Math.random() - 0.5) * halfD * 2,
    ),
    velocity: new Vector3(
      Math.random() - 0.5 || 0.5,
      Math.random() - 0.5 || 0.5,
      Math.random() - 0.5 || 0.5,
    )
      .normalize()
      .multiplyScalar(BALL_SPEED),
  }));
}

// =============================================================================
// Scene component (inside Canvas)
// =============================================================================

function Arena3dScene({
  active,
  ballCount,
  phase,
  isPaused,
  selectedIndices,
  targetIndices,
  colorIdentityEnabled,
  targetColorByBall,
  feedbackState: _feedbackState,
  activeSequentialHighlightTargetId,
  activeSequentialHighlightColor,
  selectionColorByBall,
  onBallTap,
  getBallScreenPositionRef,
}: Omit<DualTrack3dArenaProps, 'show' | 'onReadyChange'>): ReactNode {
  const { camera, gl, size } = useThree();

  // Responsive cage dimensions
  const aspect = size.width / Math.max(1, size.height);
  const cage = useMemo(() => getCageDimensions(aspect), [aspect]);
  const cageRef = useRef(cage);
  cageRef.current = cage;

  // Refs
  const ballsRef = useRef<Ball3d[]>(createBalls3d(ballCount, cage));
  const prevBallCountRef = useRef(ballCount);
  const groupRefs = useRef<(Group | null)[]>([]);
  const solidMeshRefs = useRef<(Mesh | null)[]>([]);
  const matRefs = useRef<(MeshStandardMaterial | null)[]>([]);
  const gridLineMatRefs = useRef<(LineBasicMaterial | null)[]>([]);
  const shadowRefs = useRef<(Mesh | null)[]>([]);
  const ringRefs = useRef<(Mesh | null)[]>([]);
  const cameraBasePosRef = useRef(new Vector3());
  const raycasterRef = useRef(new Raycaster());
  const mouseRef = useRef(new Vector2());
  const visualColorRefs = useRef<Color[]>([]);
  const visualEmissiveRefs = useRef<number[]>([]);

  // Precomputed sets
  const targetSet = useMemo(() => new Set(targetIndices), [targetIndices]);
  const selectedSet = useMemo(() => new Set(selectedIndices), [selectedIndices]);
  // Shared geometries
  const sphereGeo = useMemo(() => new SphereGeometry(BALL_RADIUS, 32, 32), []);
  const ringGeo = useMemo(() => new TorusGeometry(BALL_RADIUS * 1.3, 0.03, 8, 32), []);
  const latLonGeo = useMemo(() => buildLatLonGeometry(), []);
  const shadowGeo = useMemo(() => new CircleGeometry(BALL_RADIUS * 2, 24), []);
  const edgesGeo = useMemo(
    () => new EdgesGeometry(new BoxGeometry(cage.w, cage.h, cage.d)),
    [cage],
  );

  const showBalls = active && phase !== 'idle' && phase !== 'countdown' && phase !== 'finished';

  // Reset ball positions when count changes
  if (prevBallCountRef.current !== ballCount) {
    ballsRef.current = createBalls3d(ballCount, cage);
    prevBallCountRef.current = ballCount;
    visualColorRefs.current = [];
    visualEmissiveRefs.current = [];
  }

  // Fit camera to viewport
  const fitCamera = useCallback(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    cam.aspect = aspect;
    const fovRad = MathUtils.degToRad(cam.fov / 2);
    const distForWidth = cage.w / 2 / (Math.tan(fovRad) * aspect);
    const distForHeight = cage.h / 2 / Math.tan(fovRad);
    const dist = Math.max(distForWidth, distForHeight) * 1.28;
    cam.position.set(0, cage.h * 0.48, Math.max(dist, cage.d * 1.6));
    cam.lookAt(0, cage.h * 0.48, 0);
    cam.updateProjectionMatrix();
    cameraBasePosRef.current.copy(cam.position);
  }, [camera, size.width, size.height]);

  useLayoutEffect(() => {
    fitCamera();
  }, [fitCamera]);

  // Click handler — raycasting
  useEffect(() => {
    const canvas = gl.domElement;
    const handleClick = (event: MouseEvent): void => {
      if (phase !== 'selection') return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const meshes = solidMeshRefs.current.filter((m): m is Mesh => m !== null);
      const hits = raycasterRef.current.intersectObjects(meshes);
      if (hits.length === 0) return;

      const hitMesh = hits[0]?.object;
      const idx = solidMeshRefs.current.indexOf(hitMesh as Mesh);
      if (idx >= 0) onBallTap(idx);
    };
    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [camera, gl.domElement, onBallTap, phase]);

  // Frame update
  useFrame(({ clock }, delta) => {
    const elapsed = clock.elapsedTime;
    const cam = camera as PerspectiveCamera;

    // Camera drift — not during selection
    if (phase !== 'selection' && phase !== 'highlight') {
      const base = cameraBasePosRef.current;
      cam.position.set(
        base.x + Math.sin(elapsed * 0.18) * 0.5,
        base.y + Math.cos(elapsed * 0.13) * 0.25,
        base.z,
      );
      cam.lookAt(0, cage.h * 0.48, 0);
    }

    if (!showBalls) return;

    // During selection: gently separate overlapping balls so all are clickable
    if (phase === 'selection') {
      const balls = ballsRef.current;
      const minSep = BALL_RADIUS * 2.5; // minimum separation in world space
      const minSepSq = minSep * minSep;
      const pushStrength = 2.0; // units per second

      for (let i = 0; i < ballCount; i++) {
        const a = balls[i];
        if (!a) continue;
        for (let j = i + 1; j < ballCount; j++) {
          const b = balls[j];
          if (!b) continue;
          const dx = b.position.x - a.position.x;
          const dy = b.position.y - a.position.y;
          const dz = b.position.z - a.position.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq >= minSepSq || distSq < 0.001) continue;

          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;
          const push = pushStrength * delta;
          a.position.x -= nx * push;
          a.position.y -= ny * push;
          a.position.z -= nz * push;
          b.position.x += nx * push;
          b.position.y += ny * push;
          b.position.z += nz * push;

          // Keep inside cage
          const halfW = cage.w / 2 - PAD;
          const halfD = cage.d / 2 - PAD;
          a.position.x = MathUtils.clamp(a.position.x, -halfW, halfW);
          a.position.y = MathUtils.clamp(a.position.y, PAD, cage.h - PAD);
          a.position.z = MathUtils.clamp(a.position.z, -halfD, halfD);
          b.position.x = MathUtils.clamp(b.position.x, -halfW, halfW);
          b.position.y = MathUtils.clamp(b.position.y, PAD, cage.h - PAD);
          b.position.z = MathUtils.clamp(b.position.z, -halfD, halfD);
        }
      }
    }

    // Move balls — only during tracking and not paused
    if (phase === 'tracking' && !isPaused) {
      const halfW = cage.w / 2 - PAD;
      const halfD = cage.d / 2 - PAD;
      const minY = PAD;
      const maxY = cage.h - PAD;
      const balls = ballsRef.current;

      // Advance positions
      for (let i = 0; i < ballCount; i++) {
        const ball = balls[i];
        if (!ball) continue;
        ball.position.addScaledVector(ball.velocity, delta);

        // Bounce off walls
        if (ball.position.x > halfW) {
          ball.position.x = halfW;
          ball.velocity.x *= -1;
        }
        if (ball.position.x < -halfW) {
          ball.position.x = -halfW;
          ball.velocity.x *= -1;
        }
        if (ball.position.y > maxY) {
          ball.position.y = maxY;
          ball.velocity.y *= -1;
        }
        if (ball.position.y < minY) {
          ball.position.y = minY;
          ball.velocity.y *= -1;
        }
        if (ball.position.z > halfD) {
          ball.position.z = halfD;
          ball.velocity.z *= -1;
        }
        if (ball.position.z < -halfD) {
          ball.position.z = -halfD;
          ball.velocity.z *= -1;
        }
      }

      // Elastic ball-to-ball collisions
      const minDist = BALL_RADIUS * 2;
      const minDistSq = minDist * minDist;
      for (let i = 0; i < ballCount; i++) {
        const a = balls[i];
        if (!a) continue;
        for (let j = i + 1; j < ballCount; j++) {
          const b = balls[j];
          if (!b) continue;
          const dx = b.position.x - a.position.x;
          const dy = b.position.y - a.position.y;
          const dz = b.position.z - a.position.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq >= minDistSq || distSq < 0.0001) continue;

          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;

          // Push apart
          const overlap = minDist - dist;
          const push = overlap / 2;
          a.position.x -= nx * push;
          a.position.y -= ny * push;
          a.position.z -= nz * push;
          b.position.x += nx * push;
          b.position.y += ny * push;
          b.position.z += nz * push;

          // Elastic velocity exchange along collision normal
          const dvn =
            (a.velocity.x - b.velocity.x) * nx +
            (a.velocity.y - b.velocity.y) * ny +
            (a.velocity.z - b.velocity.z) * nz;
          if (dvn <= 0) continue;

          a.velocity.x -= dvn * nx;
          a.velocity.y -= dvn * ny;
          a.velocity.z -= dvn * nz;
          b.velocity.x += dvn * nx;
          b.velocity.y += dvn * ny;
          b.velocity.z += dvn * nz;

          // Renormalize — keep constant speed after collision
          a.velocity.normalize().multiplyScalar(BALL_SPEED);
          b.velocity.normalize().multiplyScalar(BALL_SPEED);
        }
      }
    }

    // Update ball visuals
    for (let i = 0; i < ballCount; i++) {
      const ball = ballsRef.current[i];
      const group = groupRefs.current[i];
      const mat = matRefs.current[i];
      const gridMat = gridLineMatRefs.current[i];
      const shadow = shadowRefs.current[i];
      if (!ball || !group || !mat || !gridMat || !shadow) continue;

      // Position
      group.position.copy(ball.position);

      // Color — smooth lerp toward target
      const {
        color: targetColor,
        emissiveIntensity: targetEmissive,
        ring,
      } = resolveBallColor(
        i,
        phase,
        targetSet,
        selectedSet,
        colorIdentityEnabled,
        targetColorByBall,
        selectionColorByBall,
        activeSequentialHighlightTargetId,
        activeSequentialHighlightColor,
      );
      if (!visualColorRefs.current[i]) visualColorRefs.current[i] = targetColor.clone();
      if (visualEmissiveRefs.current[i] === undefined)
        visualEmissiveRefs.current[i] = targetEmissive;
      const lerpFactor = 1 - Math.exp(-8 * delta);
      visualColorRefs.current[i]!.lerp(targetColor, lerpFactor);
      visualEmissiveRefs.current[i] = MathUtils.lerp(
        visualEmissiveRefs.current[i]!,
        targetEmissive,
        lerpFactor,
      );
      const lerpedColor = visualColorRefs.current[i]!;
      const lerpedEmissive = visualEmissiveRefs.current[i]!;

      // Depth attenuation — far balls get darker, less emissive
      const camZ = cameraBasePosRef.current.z;
      const distZ = camZ - ball.position.z;
      const maxDist = camZ + cage.d / 2;
      const nearness = 1 - MathUtils.clamp(distZ / maxDist, 0, 1);
      const brightness = MathUtils.lerp(0.65, 1.0, nearness);

      mat.color.copy(lerpedColor).multiplyScalar(brightness);
      mat.emissive.copy(lerpedColor).multiplyScalar(brightness);
      mat.emissiveIntensity = lerpedEmissive * brightness;
      gridMat.color.copy(lerpedColor).multiplyScalar(0.15 * brightness);

      // Ring (missed target indicator)
      const ringMesh = ringRefs.current[i];
      if (ringMesh) {
        ringMesh.visible = !!ring;
        if (ring) {
          ringMesh.position.copy(ball.position);
          (ringMesh.material as MeshBasicMaterial).color.copy(ring);
        }
      }

      // Shadow
      shadow.position.set(ball.position.x, 0.015, ball.position.z);
      const heightNorm = ball.position.y / cage.h;
      shadow.scale.setScalar(1 + heightNorm * 1.4);
      (shadow.material as MeshBasicMaterial).opacity = MathUtils.lerp(0.35, 0.06, heightNorm);
    }

    // Expose ball screen positions for parent traveler animations.
    // Uses R3F size (from canvas.parentElement.getBoundingClientRect) which includes
    // width, height, top, left — exactly matching drei's <Html> coordinate system.
    if (getBallScreenPositionRef) {
      getBallScreenPositionRef.current = (id: number) => {
        const ball = ballsRef.current[id];
        if (!ball || size.width === 0 || size.height === 0) return null;

        // Project center — same formula as drei defaultCalculatePosition
        const center = new Vector3().copy(ball.position).project(cam);

        // Behind camera check
        if (center.z > 1) return null;

        // NDC → pixels relative to canvas parent (drei formula)
        const widthHalf = size.width / 2;
        const heightHalf = size.height / 2;
        const localX = center.x * widthHalf + widthHalf;
        const localY = -(center.y * heightHalf) + heightHalf;

        // Project edge for screen-space ball size
        const edge = new Vector3(
          ball.position.x + BALL_RADIUS,
          ball.position.y,
          ball.position.z,
        ).project(cam);
        const edgeLocalX = edge.x * widthHalf + widthHalf;
        const screenRadius = Math.abs(edgeLocalX - localX);

        // size.top/left = page-absolute offset of the canvas parent (from R3F)
        return {
          x: localX + size.left,
          y: localY + size.top,
          size: screenRadius * 2,
        };
      };
    }
  });

  // Cleanup
  useEffect(() => {
    return () => {
      sphereGeo.dispose();
      ringGeo.dispose();
      latLonGeo.dispose();
      shadowGeo.dispose();
      edgesGeo.dispose();
    };
  }, [sphereGeo, ringGeo, latLonGeo, shadowGeo, edgesGeo]);

  return (
    <>
      {/* Lighting — warm woven tones */}
      <ambientLight color="#f0e8d8" intensity={0.4} />
      <hemisphereLight args={['#f0e0c8', '#1a1810', 0.5]} />
      <directionalLight color="#fff4e0" intensity={1.0} position={[3, 9, 5]} />

      {/* ── Cage ── */}
      <group>
        {/* Back wall */}
        <mesh position={[0, cage.h / 2, -cage.d / 2]} renderOrder={1}>
          <planeGeometry args={[cage.w, cage.h]} />
          <meshBasicMaterial
            color="#7a7872"
            transparent
            opacity={0.28}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
        {/* Left wall */}
        <mesh
          position={[-cage.w / 2, cage.h / 2, 0]}
          rotation={[0, Math.PI / 2, 0]}
          renderOrder={1}
        >
          <planeGeometry args={[cage.d, cage.h]} />
          <meshBasicMaterial
            color="#7a7872"
            transparent
            opacity={0.28}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
        {/* Right wall */}
        <mesh
          position={[cage.w / 2, cage.h / 2, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          renderOrder={1}
        >
          <planeGeometry args={[cage.d, cage.h]} />
          <meshBasicMaterial
            color="#7a7872"
            transparent
            opacity={0.28}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
        {/* Ceiling */}
        <mesh position={[0, cage.h, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[cage.w, cage.d]} />
          <meshBasicMaterial
            color="#7a7872"
            transparent
            opacity={0.28}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
        {/* Floor */}
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={0}>
          <planeGeometry args={[cage.w, cage.d]} />
          <meshBasicMaterial
            color="#585650"
            transparent
            opacity={0.4}
            side={DoubleSide}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
        {/* Edges */}
        <lineSegments geometry={edgesGeo} position={[0, cage.h / 2, 0]} renderOrder={10}>
          <lineBasicMaterial color="#9a9890" transparent opacity={0.7} />
        </lineSegments>
        {/* Grid — exact floor dimensions */}
        <primitive
          object={useMemo(() => {
            const v: number[] = [];
            const hw = cage.w / 2;
            const hd = cage.d / 2;
            const step = 1;
            // Lines along X (across width)
            for (let z = -hd; z <= hd + 0.001; z += step) {
              v.push(-hw, 0, z, hw, 0, z);
            }
            // Lines along Z (across depth)
            for (let x = -hw; x <= hw + 0.001; x += step) {
              v.push(x, 0, -hd, x, 0, hd);
            }
            const geo = new BufferGeometry();
            geo.setAttribute('position', new Float32BufferAttribute(v, 3));
            return new LineSegments(
              geo,
              new LineBasicMaterial({ color: '#706a5e', transparent: true, opacity: 0.6 }),
            );
          }, [cage])}
          position={[0, 0.03, 0]}
        />
      </group>

      {/* ── Fixation cross ── */}
      <group position={[0, cage.h / 2, 0]} visible={phase === 'tracking'}>
        <mesh>
          <boxGeometry args={[0.4, 0.06, 0.06]} />
          <meshBasicMaterial color="#d4b040" />
        </mesh>
        <mesh>
          <boxGeometry args={[0.06, 0.4, 0.06]} />
          <meshBasicMaterial color="#d4b040" />
        </mesh>
      </group>

      {/* ── Balls ── */}
      {Array.from({ length: ballCount }, (_, id) => (
        <group
          key={id}
          ref={(g) => {
            groupRefs.current[id] = g;
          }}
          visible={showBalls}
        >
          {/* Solid sphere */}
          <mesh
            ref={(m) => {
              solidMeshRefs.current[id] = m;
            }}
            geometry={sphereGeo}
          >
            <meshStandardMaterial
              ref={(m) => {
                matRefs.current[id] = m;
              }}
              color="#e0be40"
              roughness={0.2}
              metalness={0.05}
              emissive="#e0be40"
              emissiveIntensity={0.06}
            />
          </mesh>
          {/* Lat/lon grid lines */}
          <lineSegments geometry={latLonGeo}>
            <lineBasicMaterial
              ref={(m) => {
                gridLineMatRefs.current[id] = m;
              }}
              color="#6a5838"
            />
          </lineSegments>
        </group>
      ))}

      {/* ── Blob shadows ── */}
      {Array.from({ length: ballCount }, (_, id) => (
        <mesh
          key={`shadow-${id}`}
          ref={(m) => {
            shadowRefs.current[id] = m;
          }}
          geometry={shadowGeo}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={0}
          visible={showBalls}
        >
          <meshBasicMaterial color="#0a0800" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}

      {/* ── Rings (missed target indicator) ── */}
      {Array.from({ length: ballCount }, (_, id) => (
        <mesh
          key={`ring-${id}`}
          ref={(m) => {
            ringRefs.current[id] = m;
          }}
          geometry={ringGeo}
          visible={false}
        >
          <meshBasicMaterial color="#d4b040" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

// =============================================================================
// Wrapper (Canvas + CSS)
// =============================================================================

export function DualTrack3dArena({
  show,
  active,
  ballCount,
  phase,
  selectedIndices,
  targetIndices,
  colorIdentityEnabled,
  targetColorByBall,
  feedbackState,
  activeSequentialHighlightTargetId,
  activeSequentialHighlightColor,
  selectionColorByBall,
  isPaused,
  onReadyChange,
  getBallScreenPositionRef,
  onBallTap,
}: DualTrack3dArenaProps): ReactNode {
  const canRender = show && ballCount > 0;

  useEffect(() => {
    if (!show) onReadyChange?.(false);
    return () => onReadyChange?.(false);
  }, [show, onReadyChange]);

  useEffect(() => {
    if (!canRender) onReadyChange?.(false);
  }, [canRender, onReadyChange]);

  if (!show) return null;

  return (
    <div
      className="absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
      style={{ cursor: phase === 'selection' ? 'pointer' : 'default' }}
    >
      {canRender ? (
        <Canvas
          frameloop="always"
          dpr={[1, 2]}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            toneMapping: 4, // ACESFilmicToneMapping
            toneMappingExposure: 1.0,
          }}
          camera={{ fov: CAMERA_FOV, near: 0.1, far: 100 }}
          className="h-full w-full"
          onCreated={({ gl: renderer, scene, invalidate }) => {
            renderer.setClearColor(new Color('#16140f'), 1);
            scene.background = new Color('#16140f');
            invalidate();
            onReadyChange?.(true);
          }}
        >
          <Arena3dScene
            active={active}
            ballCount={ballCount}
            phase={phase}
            isPaused={isPaused}
            selectedIndices={selectedIndices}
            targetIndices={targetIndices}
            colorIdentityEnabled={colorIdentityEnabled}
            targetColorByBall={targetColorByBall}
            feedbackState={feedbackState}
            activeSequentialHighlightTargetId={activeSequentialHighlightTargetId}
            activeSequentialHighlightColor={activeSequentialHighlightColor}
            selectionColorByBall={selectionColorByBall}
            onBallTap={onBallTap}
            getBallScreenPositionRef={getBallScreenPositionRef}
          />
        </Canvas>
      ) : null}
    </div>
  );
}
