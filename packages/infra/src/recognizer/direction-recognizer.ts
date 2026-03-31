/**
 * Direction Recognizer - PCA-based stroke direction detection
 *
 * Recognizes 8 cardinal/diagonal directions from hand-drawn strokes.
 * Uses Principal Component Analysis on the raw point sequence for robust
 * angle extraction — far superior to simple start→end vectors or CNNs.
 *
 * Algorithm:
 * 1. Trim first/last 10% of points (finger landing/lifting jitter)
 * 2. PCA on 2D point cloud → first eigenvector = dominant direction axis
 * 3. Disambiguate direction using first-vs-last point (PCA gives axis, not ray)
 * 4. Quantize to nearest 45° bin
 * 5. Eigenvalue ratio = confidence (how linear the stroke is)
 *
 * References:
 * - Freeman Chain Code histograms (used as secondary voter)
 * - Sony patent WO2022115746 (cardinal direction handwriting recognition)
 * - $1 Unistroke Recognizer (U. Washington ACE Lab)
 *
 * Directions map to grid positions (0-7, center excluded):
 *   7  0  1
 *   6  X  2
 *   5  4  3
 */

export interface DirectionStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly strokeId: number;
}

export interface DirectionRecognitionResult {
  /** Grid position (0-7) or -1 if unrecognized */
  readonly direction: number;
  /** Direction label for display */
  readonly label: string;
  /** Confidence score (0-1) based on stroke linearity */
  readonly score: number;
  /** Inference time in ms */
  readonly timeMs: number;
}

// Direction labels indexed by position (0-7)
const DIRECTION_LABELS = [
  'up', // 0
  'up-right', // 1
  'right', // 2
  'down-right', // 3
  'down', // 4
  'down-left', // 5
  'left', // 6
  'up-left', // 7
] as const;

/** Minimum number of points for a valid stroke */
const MIN_POINTS = 8;

/** Fraction of points to trim from start/end (reduces landing/lifting noise) */
const TRIM_FRACTION = 0.1;

/** Minimum eigenvalue ratio to consider stroke as directional (vs circular/tap) */
const MIN_LINEARITY_RATIO = 2.5;

/**
 * Compute 2x2 covariance matrix eigenvectors/eigenvalues analytically.
 * For a 2x2 symmetric matrix [[a, b], [b, c]], the eigenvalues are:
 *   λ = ((a+c) ± sqrt((a-c)² + 4b²)) / 2
 */
function eigenDecomp2x2(
  covXX: number,
  covXY: number,
  covYY: number,
): { eigenvalue1: number; eigenvalue2: number; eigenvector1: [number, number] } {
  const trace = covXX + covYY;
  const det = covXX * covYY - covXY * covXY;
  const discriminant = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));

  const lambda1 = trace / 2 + discriminant;
  const lambda2 = trace / 2 - discriminant;

  // Eigenvector for largest eigenvalue
  let vx: number;
  let vy: number;

  if (Math.abs(covXY) > 1e-10) {
    vx = lambda1 - covYY;
    vy = covXY;
  } else if (covXX >= covYY) {
    vx = 1;
    vy = 0;
  } else {
    vx = 0;
    vy = 1;
  }

  // Normalize
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len > 1e-10) {
    vx /= len;
    vy /= len;
  }

  return {
    eigenvalue1: lambda1,
    eigenvalue2: Math.max(0, lambda2),
    eigenvector1: [vx, vy],
  };
}

/**
 * Quantize an angle (radians, from atan2) to one of 8 direction bins (0-7).
 * Bins are centered on each direction: bin 0 = up covers [-22.5°, +22.5°] from -90°.
 */
function angleToBin(angle: number): number {
  // Convert to 0-2π range, then to 0-360°
  // atan2 gives angle from +X axis, Y-down: right=0, down=π/2, left=±π, up=-π/2
  // We want: 0=up, 1=up-right, 2=right, 3=down-right, 4=down, 5=down-left, 6=left, 7=up-left
  // Offset so that 0° maps to "right" (direction 2), then rotate
  const degrees = ((angle * 180) / Math.PI + 360) % 360;

  // Map: 0°=right→bin2, 45°=down-right→bin3, 90°=down→bin4, etc.
  // Shift by +90° so up(270°) → 0
  const shifted = (degrees + 90) % 360;
  const bin = Math.round(shifted / 45) % 8;
  return bin;
}

/**
 * Freeman chain code: compute dominant direction from consecutive point pairs.
 * Returns the bin (0-7) with the most votes, or -1 if too few points.
 */
function freemanChainCodeDominant(points: readonly DirectionStrokePoint[]): {
  bin: number;
  histogram: number[];
} {
  const histogram = new Array(8).fill(0) as number[];

  for (let i = 1; i < points.length; i++) {
    const curr = points[i] as DirectionStrokePoint;
    const prev = points[i - 1] as DirectionStrokePoint;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) continue; // Skip near-zero movements

    const angle = Math.atan2(dy, dx);
    const bin = angleToBin(angle);
    // Weight by segment length for robustness
    histogram[bin] = (histogram[bin] ?? 0) + dist;
  }

  let maxVal = 0;
  let maxBin = -1;
  for (let i = 0; i < 8; i++) {
    if ((histogram[i] as number) > maxVal) {
      maxVal = histogram[i] as number;
      maxBin = i;
    }
  }

  return { bin: maxBin, histogram };
}

export class DirectionRecognizer {
  readonly isReady = true;

  /**
   * Recognize a directional stroke using PCA + Freeman chain code voting.
   */
  recognizeAsync(points: readonly DirectionStrokePoint[]): DirectionRecognitionResult {
    const t0 = performance.now();

    if (points.length < MIN_POINTS) {
      return { direction: -1, label: '', score: 0, timeMs: performance.now() - t0 };
    }

    // Step 1: Trim first/last 10% of points (landing/lifting jitter)
    const trimCount = Math.max(1, Math.floor(points.length * TRIM_FRACTION));
    const trimmed = points.slice(trimCount, points.length - trimCount);

    if (trimmed.length < 4) {
      // Fallback to all points if trimming leaves too few
      return this.recognizeFromPoints(points, t0);
    }

    return this.recognizeFromPoints(trimmed, t0);
  }

  private recognizeFromPoints(
    points: readonly DirectionStrokePoint[],
    t0: number,
  ): DirectionRecognitionResult {
    // Step 2: PCA — compute mean and covariance
    let meanX = 0;
    let meanY = 0;
    for (const p of points) {
      meanX += p.x;
      meanY += p.y;
    }
    meanX /= points.length;
    meanY /= points.length;

    let covXX = 0;
    let covXY = 0;
    let covYY = 0;
    for (const p of points) {
      const dx = p.x - meanX;
      const dy = p.y - meanY;
      covXX += dx * dx;
      covXY += dx * dy;
      covYY += dy * dy;
    }
    covXX /= points.length;
    covXY /= points.length;
    covYY /= points.length;

    // Eigenvector decomposition
    const { eigenvalue1, eigenvalue2, eigenvector1 } = eigenDecomp2x2(covXX, covXY, covYY);

    // Step 3: Linearity check — reject non-directional strokes
    const linearityRatio = eigenvalue2 > 1e-10 ? eigenvalue1 / eigenvalue2 : 1000;

    if (linearityRatio < MIN_LINEARITY_RATIO) {
      return { direction: -1, label: '', score: 0, timeMs: performance.now() - t0 };
    }

    // Step 4: Disambiguate direction (PCA gives axis, not ray)
    // Project first and last point onto eigenvector to determine stroke direction
    const first = points[0] as DirectionStrokePoint;
    const last = points[points.length - 1] as DirectionStrokePoint;
    const projFirst = (first.x - meanX) * eigenvector1[0] + (first.y - meanY) * eigenvector1[1];
    const projLast = (last.x - meanX) * eigenvector1[0] + (last.y - meanY) * eigenvector1[1];

    let dirX = eigenvector1[0];
    let dirY = eigenvector1[1];
    if (projFirst > projLast) {
      // Stroke goes in the negative eigenvector direction — flip
      dirX = -dirX;
      dirY = -dirY;
    }

    // Step 5: Compute angle and quantize to 8 bins
    const pcaAngle = Math.atan2(dirY, dirX);
    const pcaBin = angleToBin(pcaAngle);

    // Step 6: Freeman chain code as secondary voter
    const freeman = freemanChainCodeDominant(points);

    // Step 7: Confidence from eigenvalue ratio + agreement
    // Linearity confidence: how much the stroke is a straight line
    const linearityConfidence = Math.min(1.0, (linearityRatio - MIN_LINEARITY_RATIO) / 15);

    // Agreement bonus: PCA and Freeman agree
    const agree = pcaBin === freeman.bin;
    const agreementBonus = agree ? 0.15 : 0;

    const score = Math.min(1.0, 0.55 + linearityConfidence * 0.3 + agreementBonus);

    // Use PCA result (more robust than Freeman for curved strokes)
    const direction = pcaBin;

    return {
      direction,
      label: DIRECTION_LABELS[direction] ?? '',
      score: Math.max(0, score),
      timeMs: performance.now() - t0,
    };
  }
}

/** Shared singleton */
let sharedInstance: DirectionRecognizer | null = null;

export function getSharedDirectionRecognizer(): DirectionRecognizer {
  if (!sharedInstance) {
    sharedInstance = new DirectionRecognizer();
  }
  return sharedInstance;
}
