import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import {
  BackSide,
  BufferGeometry,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  MathUtils,
  PerspectiveCamera,
  SphereGeometry,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from 'three';
import {
  getTrackIdentityColor,
  type Phase as DualTrackArenaPhase,
  type TrackFeedbackState as DualTrackArenaFeedbackState,
  type TrackIdentityColor,
  type TrackIdentityColorId,
  type TrackIdentityVisualColorId,
} from '../../lib/dual-track-runtime';

interface ScenePalette {
  readonly backgroundGlow: string;
  readonly backgroundCore: string;
  readonly backgroundEdge: string;
  readonly fog: string;
  readonly cage: string;
  readonly cageSoft: string;
  readonly grid: string;
  readonly floor: string;
  readonly shadow: string;
  readonly neutral: string;
  readonly neutralRest: string;
  readonly correct: string;
  readonly incorrect: string;
  readonly amber: string;
  readonly selected: string;
}

export interface DualTrackWebglArenaProps {
  readonly ballCount: number;
  readonly ballDiameter: number;
  readonly arenaWidth: number;
  readonly arenaHeight: number;
  readonly positionsRef: MutableRefObject<readonly { x: number; y: number }[]>;
  readonly phase: DualTrackArenaPhase;
  readonly selectedIndices: readonly number[];
  readonly targetIndices: readonly number[];
  readonly colorIdentityEnabled: boolean;
  readonly targetColorByBall: Partial<Record<number, TrackIdentityColorId>>;
  readonly feedbackState: DualTrackArenaFeedbackState;
  readonly activeSequentialHighlightTargetId?: number;
  readonly activeSequentialHighlightColor?: TrackIdentityColor | null;
  readonly selectionColorByBall: Partial<Record<number, TrackIdentityVisualColorId>>;
  readonly show: boolean;
  readonly active: boolean;
  readonly onReadyChange?: (ready: boolean) => void;
}

interface BallVisual {
  readonly color: string;
  readonly emissive: string;
  readonly emissiveIntensity: number;
  readonly opacity: number;
  readonly haloColor: string;
  readonly haloOpacity: number;
  readonly haloScale: number;
  readonly specularOpacity: number;
}

interface BallDepthProfile {
  readonly phaseA: number;
  readonly phaseB: number;
  readonly speedA: number;
  readonly speedB: number;
  readonly amplitude: number;
  readonly baseDepth: number;
}

interface SceneMetrics {
  readonly aspect: number;
  readonly fov: number;
  readonly cameraZ: number;
  readonly cameraY: number;
  readonly lookAtY: number;
  readonly lookAtZ: number;
  readonly frontZ: number;
  readonly midZ: number;
  readonly backZ: number;
  readonly ballRadius: number;
  readonly parallaxX: number;
  readonly parallaxY: number;
}

const SCENE_PALETTE: ScenePalette = {
  backgroundGlow: '#2a7fb6',
  backgroundCore: '#08111d',
  backgroundEdge: '#01050b',
  fog: '#030915',
  cage: '#9bc3e4',
  cageSoft: '#315f80',
  grid: '#244965',
  floor: '#102538',
  shadow: '#01040a',
  neutral: '#eef7ff',
  neutralRest: '#98acbf',
  correct: '#4cf4a2',
  incorrect: '#ff697f',
  amber: '#ffbf57',
  selected: '#4fe3ff',
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createSceneMetrics(
  arenaWidth: number,
  arenaHeight: number,
  ballDiameter: number,
): SceneMetrics {
  const safeWidth = Math.max(1, arenaWidth);
  const safeHeight = Math.max(1, arenaHeight);
  const aspect = safeWidth / safeHeight;
  const fov = safeWidth < 720 ? 40 : 42;
  const cameraZ = aspect > 1.45 ? 11.6 : 11.2;
  const cameraY = 0.5;
  const lookAtY = -0.18;
  const lookAtZ = -2.4;
  const frontZ = 3.2;
  const midZ = -2.6;
  const backZ = -11.4;
  const midSliceHeight = 2 * Math.tan(MathUtils.degToRad(fov / 2)) * Math.max(0.1, cameraZ - midZ);
  const worldUnitsPerPixelAtMid = midSliceHeight / safeHeight;
  const ballRadius = Math.max(0.12, worldUnitsPerPixelAtMid * ballDiameter * 0.35);
  const parallaxX = safeWidth < 720 ? 0.06 : 0.085;
  const parallaxY = safeWidth < 720 ? 0.035 : 0.05;

  return {
    aspect,
    fov,
    cameraZ,
    cameraY,
    lookAtY,
    lookAtZ,
    frontZ,
    midZ,
    backZ,
    ballRadius,
    parallaxX,
    parallaxY,
  };
}

function getSliceDimensions(metrics: SceneMetrics, z: number): { width: number; height: number } {
  const distance = Math.max(0.1, metrics.cameraZ - z);
  const height = 2 * Math.tan(MathUtils.degToRad(metrics.fov / 2)) * distance;
  return {
    width: height * metrics.aspect,
    height,
  };
}

function projectWorldRadiusToPixels(
  metrics: SceneMetrics,
  arenaHeight: number,
  z: number,
  radius: number,
): number {
  const safeHeight = Math.max(1, arenaHeight);
  const distance = Math.max(0.1, metrics.cameraZ - z);
  const visibleHeight = 2 * Math.tan(MathUtils.degToRad(metrics.fov / 2)) * distance;
  return (radius / visibleHeight) * safeHeight;
}

function pushSegment(
  vertices: number[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): void {
  vertices.push(ax, ay, az, bx, by, bz);
}

function appendRectangle(vertices: number[], width: number, height: number, z: number): void {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  pushSegment(vertices, -halfWidth, -halfHeight, z, halfWidth, -halfHeight, z);
  pushSegment(vertices, halfWidth, -halfHeight, z, halfWidth, halfHeight, z);
  pushSegment(vertices, halfWidth, halfHeight, z, -halfWidth, halfHeight, z);
  pushSegment(vertices, -halfWidth, halfHeight, z, -halfWidth, -halfHeight, z);
}

function createFrameGeometry(metrics: SceneMetrics, z: number): BufferGeometry {
  const dimensions = getSliceDimensions(metrics, z);
  const vertices: number[] = [];

  appendRectangle(vertices, dimensions.width, dimensions.height, z);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  return geometry;
}

function createBridgeGeometry(metrics: SceneMetrics): BufferGeometry {
  const front = getSliceDimensions(metrics, metrics.frontZ);
  const mid = getSliceDimensions(metrics, metrics.midZ);
  const back = getSliceDimensions(metrics, metrics.backZ);
  const vertices: number[] = [];

  pushSegment(
    vertices,
    -front.width / 2,
    -front.height / 2,
    metrics.frontZ,
    -mid.width / 2,
    -mid.height / 2,
    metrics.midZ,
  );
  pushSegment(
    vertices,
    front.width / 2,
    -front.height / 2,
    metrics.frontZ,
    mid.width / 2,
    -mid.height / 2,
    metrics.midZ,
  );
  pushSegment(
    vertices,
    front.width / 2,
    front.height / 2,
    metrics.frontZ,
    mid.width / 2,
    mid.height / 2,
    metrics.midZ,
  );
  pushSegment(
    vertices,
    -front.width / 2,
    front.height / 2,
    metrics.frontZ,
    -mid.width / 2,
    mid.height / 2,
    metrics.midZ,
  );

  pushSegment(
    vertices,
    -mid.width / 2,
    -mid.height / 2,
    metrics.midZ,
    -back.width / 2,
    -back.height / 2,
    metrics.backZ,
  );
  pushSegment(
    vertices,
    mid.width / 2,
    -mid.height / 2,
    metrics.midZ,
    back.width / 2,
    -back.height / 2,
    metrics.backZ,
  );
  pushSegment(
    vertices,
    mid.width / 2,
    mid.height / 2,
    metrics.midZ,
    back.width / 2,
    back.height / 2,
    metrics.backZ,
  );
  pushSegment(
    vertices,
    -mid.width / 2,
    mid.height / 2,
    metrics.midZ,
    -back.width / 2,
    back.height / 2,
    metrics.backZ,
  );

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  return geometry;
}

function createBackGridGeometry(metrics: SceneMetrics): BufferGeometry {
  const back = getSliceDimensions(metrics, metrics.backZ + 0.01);
  const vertices: number[] = [];
  const columns = 5;
  const rows = 4;
  const halfWidth = back.width / 2;
  const halfHeight = back.height / 2;
  const z = metrics.backZ + 0.01;

  for (let column = 1; column < columns; column += 1) {
    const x = -halfWidth + (back.width * column) / columns;
    pushSegment(vertices, x, -halfHeight, z, x, halfHeight, z);
  }

  for (let row = 1; row < rows; row += 1) {
    const y = -halfHeight + (back.height * row) / rows;
    pushSegment(vertices, -halfWidth, y, z, halfWidth, y, z);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  return geometry;
}

function createDepthProfiles(count: number): BallDepthProfile[] {
  const layers = [-0.8, -0.42, -0.06, 0.34, 0.76];

  return Array.from({ length: count }, (_, index) => {
    const seed = index + 1;
    return {
      phaseA: seed * 1.154,
      phaseB: seed * 1.931,
      speedA: 0.09 + (seed % 5) * 0.014,
      speedB: 0.075 + (seed % 7) * 0.012,
      amplitude: 0.14 + (seed % 3) * 0.03,
      baseDepth: layers[(seed * 3) % layers.length] ?? 0,
    };
  });
}

function getDepthDrift(
  profile: BallDepthProfile,
  elapsed: number,
  xNorm: number,
  yNorm: number,
): number {
  const centeredX = xNorm * 2 - 1;
  const centeredY = yNorm * 2 - 1;
  const waveA = Math.sin(elapsed * profile.speedA + profile.phaseA + centeredX * 0.9);
  const waveB = Math.cos(elapsed * profile.speedB + profile.phaseB - centeredY * 0.65);
  return MathUtils.clamp((waveA * 0.58 + waveB * 0.42) * profile.amplitude, -1, 1);
}

function reinforceDepthSeparation(
  targetDepths: number[],
  positions: readonly { x: number; y: number }[],
  profiles: readonly BallDepthProfile[],
  ballDiameter: number,
): void {
  const proximityThreshold = ballDiameter * 2.45;
  const thresholdSq = proximityThreshold * proximityThreshold;

  for (let left = 0; left < positions.length; left += 1) {
    const leftPosition = positions[left];
    const leftProfile = profiles[left];
    if (!leftPosition || !leftProfile) continue;

    for (let right = left + 1; right < positions.length; right += 1) {
      const rightPosition = positions[right];
      const rightProfile = profiles[right];
      if (!rightPosition || !rightProfile) continue;

      const dx = leftPosition.x - rightPosition.x;
      const dy = leftPosition.y - rightPosition.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > thresholdSq) continue;

      const distance = Math.sqrt(distanceSq);
      const overlapMix = 1 - distance / proximityThreshold;
      const minGap = MathUtils.lerp(0.18, 0.56, overlapMix);
      const currentGap = Math.abs((targetDepths[left] ?? 0) - (targetDepths[right] ?? 0));
      if (currentGap >= minGap) continue;

      const prefersLeftInFront =
        leftProfile.baseDepth === rightProfile.baseDepth
          ? left < right
          : leftProfile.baseDepth > rightProfile.baseDepth;
      const direction = prefersLeftInFront ? 1 : -1;
      const center = ((targetDepths[left] ?? 0) + (targetDepths[right] ?? 0)) * 0.5;

      targetDepths[left] = clamp(center + direction * (minGap / 2), -0.96, 0.96);
      targetDepths[right] = clamp(center - direction * (minGap / 2), -0.96, 0.96);
    }
  }
}

function createBallVisuals(input: {
  ballCount: number;
  phase: DualTrackArenaPhase;
  colorIdentityEnabled: boolean;
  selectedIndices: readonly number[];
  targetIndices: readonly number[];
  targetColorByBall: Partial<Record<number, TrackIdentityColorId>>;
  selectionColorByBall: Partial<Record<number, TrackIdentityVisualColorId>>;
  feedbackState: DualTrackArenaFeedbackState;
  activeSequentialHighlightTargetId?: number;
  activeSequentialHighlightColor?: TrackIdentityColor | null;
  palette: ScenePalette;
}): BallVisual[] {
  const {
    ballCount,
    phase,
    colorIdentityEnabled,
    selectedIndices,
    targetIndices,
    targetColorByBall,
    selectionColorByBall,
    feedbackState,
    activeSequentialHighlightTargetId,
    activeSequentialHighlightColor,
    palette,
  } = input;
  const selectedSet = new Set(selectedIndices);
  const targetSet = new Set(targetIndices);
  const correctSet = new Set(feedbackState.correctIndices);
  const wrongIdentitySet = new Set(feedbackState.wrongIdentityIndices);
  const wrongDistractorSet = new Set(feedbackState.wrongDistractorIndices);
  const missedSet = new Set(feedbackState.missedIndices);

  return Array.from({ length: ballCount }, (_, id) => {
    const neutral: BallVisual = {
      color: palette.neutral,
      emissive: '#d2e5f6',
      emissiveIntensity: 0.12,
      opacity: 1,
      haloColor: '#ebf7ff',
      haloOpacity: 0.08,
      haloScale: 1.08,
      specularOpacity: 0.22,
    };

    const rest: BallVisual = {
      ...neutral,
      color: palette.neutralRest,
      emissive: '#7590aa',
      emissiveIntensity: 0.04,
      opacity: 0.78,
      haloOpacity: 0.04,
      haloScale: 1.04,
      specularOpacity: 0.14,
    };

    if (phase === 'feedback') {
      if (correctSet.has(id)) {
        return {
          color: palette.correct,
          emissive: palette.correct,
          emissiveIntensity: 0.72,
          opacity: 1,
          haloColor: palette.correct,
          haloOpacity: 0.22,
          haloScale: 1.16,
          specularOpacity: 0.3,
        };
      }
      if (wrongIdentitySet.has(id)) {
        return {
          color: palette.amber,
          emissive: palette.amber,
          emissiveIntensity: 0.62,
          opacity: 1,
          haloColor: palette.amber,
          haloOpacity: 0.18,
          haloScale: 1.14,
          specularOpacity: 0.26,
        };
      }
      if (wrongDistractorSet.has(id)) {
        return {
          color: palette.incorrect,
          emissive: palette.incorrect,
          emissiveIntensity: 0.6,
          opacity: 1,
          haloColor: palette.incorrect,
          haloOpacity: 0.18,
          haloScale: 1.14,
          specularOpacity: 0.26,
        };
      }
      if (missedSet.has(id)) {
        return {
          ...neutral,
          emissive: palette.amber,
          emissiveIntensity: 0.24,
          haloColor: palette.amber,
          haloOpacity: 0.12,
          haloScale: 1.1,
        };
      }
      return rest;
    }

    if (phase === 'selection') {
      const selectionColorId = selectionColorByBall[id];
      if (selectionColorId) {
        const color = getTrackIdentityColor(selectionColorId);
        return {
          color: color.fill,
          emissive: color.glow,
          emissiveIntensity: 0.38,
          opacity: 1,
          haloColor: color.glow,
          haloOpacity: 0.16,
          haloScale: 1.1,
          specularOpacity: 0.28,
        };
      }
      if (selectedSet.has(id)) {
        return {
          color: palette.selected,
          emissive: palette.selected,
          emissiveIntensity: 0.4,
          opacity: 1,
          haloColor: palette.selected,
          haloOpacity: 0.16,
          haloScale: 1.1,
          specularOpacity: 0.28,
        };
      }
      return neutral;
    }

    if (phase === 'highlight') {
      if (activeSequentialHighlightTargetId === id && activeSequentialHighlightColor) {
        return {
          color: activeSequentialHighlightColor.fill,
          emissive: activeSequentialHighlightColor.glow,
          emissiveIntensity: 0.46,
          opacity: 1,
          haloColor: activeSequentialHighlightColor.glow,
          haloOpacity: 0.2,
          haloScale: 1.15,
          specularOpacity: 0.32,
        };
      }
      if (colorIdentityEnabled) {
        const colorId = targetColorByBall[id];
        if (colorId) {
          const color = getTrackIdentityColor(colorId);
          return {
            color: color.fill,
            emissive: color.glow,
            emissiveIntensity: 0.38,
            opacity: 1,
            haloColor: color.glow,
            haloOpacity: 0.18,
            haloScale: 1.12,
            specularOpacity: 0.3,
          };
        }
        return neutral;
      }
      if (targetSet.has(id)) {
        return {
          color: palette.selected,
          emissive: palette.selected,
          emissiveIntensity: 0.36,
          opacity: 1,
          haloColor: palette.selected,
          haloOpacity: 0.16,
          haloScale: 1.1,
          specularOpacity: 0.28,
        };
      }
      return neutral;
    }

    if (phase === 'tracking') {
      return {
        ...neutral,
        emissiveIntensity: 0.14,
        haloOpacity: 0.06,
      };
    }

    return rest;
  });
}

function configureCameraProjection(camera: PerspectiveCamera, metrics: SceneMetrics): void {
  camera.fov = metrics.fov;
  camera.aspect = metrics.aspect;
  camera.near = 0.1;
  camera.far = 80;
  camera.updateProjectionMatrix();
}

function placeCamera(camera: PerspectiveCamera, metrics: SceneMetrics, swayX = 0, swayY = 0): void {
  camera.position.set(swayX, metrics.cameraY + swayY, metrics.cameraZ);
  camera.lookAt(0, metrics.lookAtY, metrics.lookAtZ);
  camera.updateMatrixWorld();
}

function RenderDriver({ active }: { active: boolean }): null {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    invalidate();
    if (!active) return;

    let frame = 0;
    const loop = (): void => {
      invalidate();
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [active, invalidate]);

  return null;
}

function ArenaVolume({
  metrics,
  palette,
}: {
  metrics: SceneMetrics;
  palette: ScenePalette;
}): ReactNode {
  const frontFrameGeometry = useMemo(() => createFrameGeometry(metrics, metrics.frontZ), [metrics]);
  const midFrameGeometry = useMemo(() => createFrameGeometry(metrics, metrics.midZ), [metrics]);
  const backFrameGeometry = useMemo(() => createFrameGeometry(metrics, metrics.backZ), [metrics]);
  const bridgeGeometry = useMemo(() => createBridgeGeometry(metrics), [metrics]);
  const backGridGeometry = useMemo(() => createBackGridGeometry(metrics), [metrics]);
  const back = useMemo(() => getSliceDimensions(metrics, metrics.backZ), [metrics]);
  const mid = useMemo(() => getSliceDimensions(metrics, metrics.midZ), [metrics]);
  const backGlowRadius = Math.max(back.height * 0.34, back.width * 0.16);

  useEffect(() => {
    return () => {
      frontFrameGeometry.dispose();
      midFrameGeometry.dispose();
      backFrameGeometry.dispose();
      bridgeGeometry.dispose();
      backGridGeometry.dispose();
    };
  }, [backFrameGeometry, backGridGeometry, bridgeGeometry, frontFrameGeometry, midFrameGeometry]);

  return (
    <group>
      <mesh position={[0, 0, metrics.backZ - 0.04]} renderOrder={0}>
        <planeGeometry args={[back.width * 1.04, back.height * 1.04]} />
        <meshBasicMaterial
          color={palette.backgroundCore}
          transparent
          opacity={0.94}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.22, metrics.backZ + 0.08]} renderOrder={1}>
        <circleGeometry args={[backGlowRadius, 64]} />
        <meshBasicMaterial
          color={palette.backgroundGlow}
          transparent
          opacity={0.13}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, -mid.height * 0.24, metrics.midZ - 0.08]} renderOrder={0}>
        <planeGeometry args={[mid.width * 1.02, mid.height * 0.46]} />
        <meshBasicMaterial color={palette.floor} transparent opacity={0.08} depthWrite={false} />
      </mesh>

      <lineSegments geometry={backGridGeometry} renderOrder={2}>
        <lineBasicMaterial color={palette.grid} transparent opacity={0.16} />
      </lineSegments>
      <lineSegments geometry={bridgeGeometry} renderOrder={3}>
        <lineBasicMaterial color={palette.cageSoft} transparent opacity={0.22} />
      </lineSegments>
      <lineSegments geometry={backFrameGeometry} renderOrder={4}>
        <lineBasicMaterial color={palette.cage} transparent opacity={0.48} />
      </lineSegments>
      <lineSegments geometry={midFrameGeometry} renderOrder={4}>
        <lineBasicMaterial color={palette.cageSoft} transparent opacity={0.2} />
      </lineSegments>
      <lineSegments geometry={frontFrameGeometry} renderOrder={4}>
        <lineBasicMaterial color={palette.cage} transparent opacity={0.1} />
      </lineSegments>
      <lineSegments geometry={frontFrameGeometry} renderOrder={5}>
        <lineBasicMaterial color={palette.backgroundGlow} transparent opacity={0.05} />
      </lineSegments>
    </group>
  );
}

function screenToWorldAtZ(
  camera: PerspectiveCamera,
  arenaWidth: number,
  arenaHeight: number,
  x: number,
  y: number,
  z: number,
  rayPoint: Vector3,
  rayDirection: Vector3,
  out: Vector3,
): Vector3 {
  const safeWidth = Math.max(1, arenaWidth);
  const safeHeight = Math.max(1, arenaHeight);
  const ndcX = (x / safeWidth) * 2 - 1;
  const ndcY = 1 - (y / safeHeight) * 2;

  rayPoint.set(ndcX, ndcY, 0.5).unproject(camera);
  rayDirection.copy(rayPoint).sub(camera.position).normalize();

  const distance = (z - camera.position.z) / rayDirection.z;
  return out.copy(camera.position).addScaledVector(rayDirection, distance);
}

function ArenaScene({
  active,
  ballCount,
  ballDiameter,
  arenaWidth,
  arenaHeight,
  positionsRef,
  phase,
  selectedIndices,
  targetIndices,
  colorIdentityEnabled,
  targetColorByBall,
  feedbackState,
  activeSequentialHighlightTargetId,
  activeSequentialHighlightColor,
  selectionColorByBall,
}: Omit<DualTrackWebglArenaProps, 'show' | 'onReadyChange'>): ReactNode {
  const metrics = useMemo(
    () => createSceneMetrics(arenaWidth, arenaHeight, ballDiameter),
    [arenaHeight, arenaWidth, ballDiameter],
  );
  const camera = useThree((state) => state.camera);
  const targetSet = useMemo(() => new Set(targetIndices), [targetIndices]);
  const selectedSet = useMemo(() => new Set(selectedIndices), [selectedIndices]);
  const feedbackCorrectSet = useMemo(
    () => new Set(feedbackState.correctIndices),
    [feedbackState.correctIndices],
  );
  const feedbackWrongIdentitySet = useMemo(
    () => new Set(feedbackState.wrongIdentityIndices),
    [feedbackState.wrongIdentityIndices],
  );
  const feedbackWrongDistractorSet = useMemo(
    () => new Set(feedbackState.wrongDistractorIndices),
    [feedbackState.wrongDistractorIndices],
  );
  const groupRefs = useRef<(Group | null)[]>([]);
  const sphereRefs = useRef<(Mesh | null)[]>([]);
  const haloRefs = useRef<(Mesh | null)[]>([]);
  const haloMaterialRefs = useRef<(MeshBasicMaterial | null)[]>([]);
  const shadowRefs = useRef<(Mesh | null)[]>([]);
  const shadowMaterialRefs = useRef<(MeshBasicMaterial | null)[]>([]);
  const sphereMaterialRefs = useRef<(MeshStandardMaterial | null)[]>([]);
  const specularRefs = useRef<(Mesh | null)[]>([]);
  const specularMaterialRefs = useRef<(MeshBasicMaterial | null)[]>([]);
  const depthProfilesRef = useRef<BallDepthProfile[]>(createDepthProfiles(ballCount));
  const currentDepthRef = useRef<number[]>(Array.from({ length: ballCount }, () => 0));
  const targetDepthsRef = useRef<number[]>(Array.from({ length: ballCount }, () => 0));
  const referenceCameraRef = useRef(new PerspectiveCamera());
  const rayPointRef = useRef(new Vector3());
  const rayDirectionRef = useRef(new Vector3());
  const worldPointRef = useRef(new Vector3());
  const sphereGeometry = useMemo(
    () => new SphereGeometry(metrics.ballRadius, 28, 28),
    [metrics.ballRadius],
  );
  const specularGeometry = useMemo(
    () => new SphereGeometry(metrics.ballRadius * 0.22, 14, 14),
    [metrics.ballRadius],
  );
  const shadowGeometry = useMemo(
    () => new CircleGeometry(metrics.ballRadius * 1.02, 28),
    [metrics.ballRadius],
  );
  const visuals = useMemo(
    () =>
      createBallVisuals({
        ballCount,
        phase,
        colorIdentityEnabled,
        selectedIndices,
        targetIndices,
        targetColorByBall,
        selectionColorByBall,
        feedbackState,
        activeSequentialHighlightTargetId,
        activeSequentialHighlightColor,
        palette: SCENE_PALETTE,
      }),
    [
      activeSequentialHighlightColor,
      activeSequentialHighlightTargetId,
      ballCount,
      colorIdentityEnabled,
      feedbackState,
      phase,
      selectedIndices,
      selectionColorByBall,
      targetColorByBall,
      targetIndices,
    ],
  );
  const showBalls = active && phase !== 'idle' && phase !== 'countdown' && phase !== 'finished';
  const baseProjectedRadiusPx = useMemo(
    () => projectWorldRadiusToPixels(metrics, arenaHeight, metrics.midZ, metrics.ballRadius),
    [arenaHeight, metrics],
  );

  if (depthProfilesRef.current.length !== ballCount) {
    depthProfilesRef.current = createDepthProfiles(ballCount);
    currentDepthRef.current = Array.from({ length: ballCount }, () => 0);
    targetDepthsRef.current = Array.from({ length: ballCount }, () => 0);
  }

  useLayoutEffect(() => {
    const actualCamera = camera as PerspectiveCamera;
    configureCameraProjection(actualCamera, metrics);
    placeCamera(actualCamera, metrics);

    configureCameraProjection(referenceCameraRef.current, metrics);
    placeCamera(referenceCameraRef.current, metrics);
  }, [camera, metrics]);

  useEffect(() => {
    return () => {
      sphereGeometry.dispose();
      specularGeometry.dispose();
      shadowGeometry.dispose();
    };
  }, [shadowGeometry, sphereGeometry, specularGeometry]);

  useFrame(({ camera: frameCamera, clock }, delta) => {
    const actualCamera = frameCamera as PerspectiveCamera;
    const shouldSway = showBalls && phase === 'tracking';
    const swayX = shouldSway ? Math.sin(clock.elapsedTime * 0.48) * metrics.parallaxX : 0;
    const swayY = shouldSway ? Math.cos(clock.elapsedTime * 0.36) * metrics.parallaxY : 0;
    placeCamera(actualCamera, metrics, swayX, swayY);

    if (!showBalls) return;

    const positions = positionsRef.current;
    const elapsed = clock.elapsedTime;
    const pulse = Math.sin(elapsed * 2.6) * 0.5 + 0.5;
    const dynamicDepth = phase === 'tracking' || phase === 'highlight';
    const projectionCamera = shouldSway ? referenceCameraRef.current : actualCamera;
    const depthStrength =
      phase === 'tracking'
        ? 0.82
        : phase === 'highlight'
          ? 0.58
          : phase === 'feedback'
            ? 0.4
            : phase === 'selection'
              ? 0.28
              : 0.22;

    const targetDepths = targetDepthsRef.current;
    targetDepths.length = ballCount;

    for (let id = 0; id < ballCount; id += 1) {
      const position = positions[id];
      const profile = depthProfilesRef.current[id];
      if (!position || !profile) {
        targetDepths[id] = 0;
        continue;
      }

      const xNorm = arenaWidth > 0 ? position.x / arenaWidth : 0.5;
      const yNorm = arenaHeight > 0 ? position.y / arenaHeight : 0.5;
      const drift = dynamicDepth
        ? getDepthDrift(profile, elapsed, xNorm, yNorm)
        : (currentDepthRef.current[id] ?? profile.baseDepth);

      let bias = 0;
      if (phase === 'highlight') {
        if (activeSequentialHighlightTargetId === id) {
          bias = 0.2;
        } else if (targetSet.has(id)) {
          bias = 0.12;
        }
      } else if (phase === 'selection' && selectedSet.has(id)) {
        bias = 0.1;
      } else if (phase === 'feedback') {
        if (feedbackCorrectSet.has(id)) {
          bias = 0.16;
        } else if (feedbackWrongIdentitySet.has(id) || feedbackWrongDistractorSet.has(id)) {
          bias = 0.08;
        }
      }

      targetDepths[id] = clamp(profile.baseDepth + drift * depthStrength + bias, -0.96, 0.96);
    }

    reinforceDepthSeparation(targetDepths, positions, depthProfilesRef.current, ballDiameter);

    for (let id = 0; id < ballCount; id += 1) {
      const group = groupRefs.current[id];
      const halo = haloRefs.current[id];
      const haloMaterial = haloMaterialRefs.current[id];
      const shadow = shadowRefs.current[id];
      const shadowMaterial = shadowMaterialRefs.current[id];
      const sphere = sphereRefs.current[id];
      const sphereMaterial = sphereMaterialRefs.current[id];
      const specular = specularRefs.current[id];
      const specularMaterial = specularMaterialRefs.current[id];
      const position = positions[id];
      const visual = visuals[id];
      if (
        !group ||
        !halo ||
        !haloMaterial ||
        !shadow ||
        !shadowMaterial ||
        !sphere ||
        !sphereMaterial ||
        !specular ||
        !specularMaterial ||
        !position ||
        !visual
      ) {
        continue;
      }
      const targetDepth = targetDepths[id] ?? 0;
      const nextDepth = MathUtils.damp(
        currentDepthRef.current[id] ?? 0,
        targetDepth,
        dynamicDepth ? 4.2 : 6.8,
        delta,
      );
      currentDepthRef.current[id] = nextDepth;

      const depthMix = (nextDepth + 1) / 2;
      const worldZ = MathUtils.lerp(
        metrics.backZ + metrics.ballRadius * 1.7,
        metrics.frontZ - metrics.ballRadius * 1.2,
        depthMix,
      );
      const projectedRadiusPx = projectWorldRadiusToPixels(
        metrics,
        arenaHeight,
        worldZ,
        metrics.ballRadius,
      );
      const targetProjectedRadiusPx = MathUtils.lerp(
        baseProjectedRadiusPx * 0.95,
        baseProjectedRadiusPx * 1.05,
        depthMix,
      );
      const sizeCompensation = clamp(targetProjectedRadiusPx / projectedRadiusPx, 0.62, 1.48);
      const compensatedProjectedRadiusPx = projectedRadiusPx * sizeCompensation;
      const screenPadding = compensatedProjectedRadiusPx + 2;
      const clampedX = clamp(position.x, screenPadding, arenaWidth - screenPadding);
      const clampedY = clamp(position.y, screenPadding, arenaHeight - screenPadding);

      const worldPoint = screenToWorldAtZ(
        projectionCamera,
        arenaWidth,
        arenaHeight,
        clampedX,
        clampedY,
        worldZ,
        rayPointRef.current,
        rayDirectionRef.current,
        worldPointRef.current,
      );
      group.position.copy(worldPoint);
      group.renderOrder = 3000 + Math.round((worldZ - metrics.backZ) * 100);

      const haloPulse = phase === 'highlight' || phase === 'feedback' ? 0.98 + pulse * 0.05 : 1;
      sphere.scale.setScalar(sizeCompensation);
      halo.scale.setScalar(
        visual.haloScale * sizeCompensation * MathUtils.lerp(0.98, 1.04, depthMix) * haloPulse,
      );
      haloMaterial.opacity =
        visual.haloOpacity *
        MathUtils.lerp(0.48, 1.28, depthMix) *
        (phase === 'tracking' ? 0.92 : 1);

      sphereMaterial.color.set(visual.color).multiplyScalar(MathUtils.lerp(0.68, 1.08, depthMix));
      sphereMaterial.emissive.set(visual.emissive);
      sphereMaterial.emissiveIntensity =
        visual.emissiveIntensity * MathUtils.lerp(0.7, 1.24, depthMix);
      sphereMaterial.opacity = clamp(visual.opacity * MathUtils.lerp(0.58, 1, depthMix), 0.52, 1);
      specular.scale.setScalar(sizeCompensation);
      specularMaterial.opacity = visual.specularOpacity * MathUtils.lerp(0.42, 1.18, depthMix);

      shadow.position.set(
        worldPoint.x + nextDepth * 0.035,
        worldPoint.y -
          MathUtils.lerp(metrics.ballRadius * 0.96, metrics.ballRadius * 0.72, depthMix),
        worldPoint.z - metrics.ballRadius * 0.42,
      );
      const shadowScale =
        MathUtils.lerp(1.46, 0.86, depthMix) * MathUtils.lerp(1.02, 0.98, sizeCompensation);
      shadow.scale.set(shadowScale, shadowScale * 0.62, 1);
      shadowMaterial.opacity = MathUtils.lerp(0.05, 0.2, depthMix);
    }
  });

  return (
    <>
      <RenderDriver active={showBalls} />
      <fogExp2 attach="fog" args={[SCENE_PALETTE.fog, 0.046]} />
      <ambientLight intensity={0.24} />
      <hemisphereLight args={['#dcefff', '#08121d', 0.82]} />
      <directionalLight position={[3.4, 6.8, 9.2]} intensity={1.02} color="#f6fbff" />
      <pointLight position={[-5, -1.8, 7.6]} intensity={0.28} color="#59bfff" />
      <pointLight position={[0, 0, metrics.backZ + 0.8]} intensity={0.18} color="#245980" />

      <ArenaVolume metrics={metrics} palette={SCENE_PALETTE} />

      {Array.from({ length: ballCount }, (_, id) => {
        const visual = visuals[id];
        if (!visual) return null;

        return (
          <group
            key={id}
            ref={(group) => {
              groupRefs.current[id] = group;
            }}
            visible={showBalls}
          >
            <mesh
              ref={(mesh) => {
                shadowRefs.current[id] = mesh;
              }}
              geometry={shadowGeometry}
              renderOrder={10}
            >
              <meshBasicMaterial
                ref={(material) => {
                  shadowMaterialRefs.current[id] = material;
                }}
                color={SCENE_PALETTE.shadow}
                transparent
                opacity={0.12}
                depthWrite={false}
              />
            </mesh>
            <mesh
              ref={(mesh) => {
                haloRefs.current[id] = mesh;
              }}
              geometry={sphereGeometry}
              scale={visual.haloScale}
              renderOrder={20}
            >
              <meshBasicMaterial
                ref={(material) => {
                  haloMaterialRefs.current[id] = material;
                }}
                color={visual.haloColor}
                transparent
                opacity={visual.haloOpacity}
                side={BackSide}
                depthWrite={false}
              />
            </mesh>
            <mesh
              ref={(mesh) => {
                sphereRefs.current[id] = mesh;
              }}
              geometry={sphereGeometry}
              renderOrder={30}
            >
              <meshStandardMaterial
                ref={(material) => {
                  sphereMaterialRefs.current[id] = material;
                }}
                color={visual.color}
                roughness={0.22}
                metalness={0.04}
                emissive={visual.emissive}
                emissiveIntensity={visual.emissiveIntensity}
                transparent
                opacity={visual.opacity}
              />
            </mesh>
            <mesh
              ref={(mesh) => {
                specularRefs.current[id] = mesh;
              }}
              geometry={specularGeometry}
              position={[
                -metrics.ballRadius * 0.22,
                metrics.ballRadius * 0.26,
                metrics.ballRadius * 0.58,
              ]}
              renderOrder={40}
            >
              <meshBasicMaterial
                ref={(material) => {
                  specularMaterialRefs.current[id] = material;
                }}
                color="#ffffff"
                transparent
                opacity={visual.specularOpacity}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

export function DualTrackWebglArena({
  show,
  active,
  ballCount,
  ballDiameter,
  arenaWidth,
  arenaHeight,
  positionsRef,
  phase,
  selectedIndices,
  targetIndices,
  colorIdentityEnabled,
  targetColorByBall,
  feedbackState,
  activeSequentialHighlightTargetId,
  activeSequentialHighlightColor,
  selectionColorByBall,
  onReadyChange,
}: DualTrackWebglArenaProps): ReactNode {
  const canRenderCanvas = show && ballCount > 0 && arenaWidth > 0 && arenaHeight > 0;

  useEffect(() => {
    if (!show) {
      onReadyChange?.(false);
    }

    return () => {
      onReadyChange?.(false);
    };
  }, [show, onReadyChange]);

  useEffect(() => {
    if (!canRenderCanvas) {
      onReadyChange?.(false);
    }
  }, [canRenderCanvas, onReadyChange]);

  const idleVisualsMuted = phase === 'idle';

  if (!show) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]">
      {idleVisualsMuted ? (
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(8,17,29,0.04) 0%, rgba(8,17,29,0.12) 100%)',
          }}
        />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 22%, rgba(42,127,182,0.28) 0%, rgba(11,23,39,0.18) 28%, rgba(8,17,29,0.92) 52%, rgba(1,5,11,1) 100%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 92%, rgba(57,132,188,0.08) 0%, rgba(57,132,188,0.03) 16%, rgba(0,0,0,0) 36%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(211,234,255,0.06) 0%, rgba(211,234,255,0.015) 18%, rgba(0,0,0,0.03) 46%, rgba(0,0,0,0.46) 100%)',
            }}
          />
          <div className="absolute inset-0 rounded-[inherit] border border-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-20px_48px_rgba(0,0,0,0.35)]" />
        </>
      )}
      {canRenderCanvas ? (
        <Canvas
          frameloop="demand"
          dpr={[1, 1.25]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          camera={{ position: [0, 0.42, 14.8], fov: 36, near: 0.1, far: 80 }}
          className="h-full w-full"
          style={{ opacity: idleVisualsMuted ? 0 : 1, transition: 'opacity 180ms ease' }}
          onCreated={({ gl, invalidate }) => {
            gl.setClearColor(new Color('#000000'), 0);
            invalidate();
            onReadyChange?.(true);
          }}
        >
          <ArenaScene
            active={active}
            ballCount={ballCount}
            ballDiameter={ballDiameter}
            arenaWidth={arenaWidth}
            arenaHeight={arenaHeight}
            positionsRef={positionsRef}
            phase={phase}
            selectedIndices={selectedIndices}
            targetIndices={targetIndices}
            colorIdentityEnabled={colorIdentityEnabled}
            targetColorByBall={targetColorByBall}
            feedbackState={feedbackState}
            activeSequentialHighlightTargetId={activeSequentialHighlightTargetId}
            activeSequentialHighlightColor={activeSequentialHighlightColor}
            selectionColorByBall={selectionColorByBall}
          />
        </Canvas>
      ) : null}
    </div>
  );
}
