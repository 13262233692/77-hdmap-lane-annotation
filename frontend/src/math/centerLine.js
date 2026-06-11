import { normalVector, lateralOffset } from './cubicPolynomial.js';

function raySegmentIntersect(ox, oy, dx, dy, ax, ay, bx, by) {
  const rdx = dx;
  const rdy = dy;
  const sdx = bx - ax;
  const sdy = by - ay;

  const denom = rdx * sdy - rdy * sdx;
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((ax - ox) * sdy - (ay - oy) * sdx) / denom;
  const u = ((ax - ox) * rdy - (ay - oy) * rdx) / denom;

  if (t >= -1000 && t <= 1000 && u >= 0 && u <= 1) {
    return { t, u, x: ox + t * rdx, y: oy + t * rdy };
  }
  return null;
}

function findBoundarySignedDistance(refPt, boundary) {
  const { nx, ny } = normalVector(refPt.dx, refPt.dy);
  const ox = refPt.x;
  const oy = refPt.y;

  let bestHit = null;
  let bestAbsT = Infinity;

  for (let i = 0; i < boundary.length - 1; i++) {
    const a = boundary[i];
    const b = boundary[i + 1];
    const hit = raySegmentIntersect(ox, oy, nx, ny, a.x, a.y, b.x, b.y);
    if (hit && Math.abs(hit.t) < bestAbsT) {
      bestAbsT = Math.abs(hit.t);
      bestHit = hit;
    }
  }

  return bestHit ? bestHit.t : null;
}

export function computeCenterLineSamples(laneData) {
  const { leftBoundary, rightBoundary, refLinePoints } = laneData;
  if (!refLinePoints || refLinePoints.length < 2) return [];
  if (!leftBoundary || leftBoundary.length < 2) return [];
  if (!rightBoundary || rightBoundary.length < 2) return [];

  const samples = [];

  for (const refPt of refLinePoints) {
    const leftDist = findBoundarySignedDistance(refPt, leftBoundary);
    const rightDist = findBoundarySignedDistance(refPt, rightBoundary);

    if (leftDist !== null && rightDist !== null) {
      const centerOffset = (leftDist + rightDist) / 2;
      const centerPt = lateralOffset(refPt.x, refPt.y, refPt.hdg, centerOffset);
      samples.push({
        s: refPt.s,
        x: centerPt.x,
        y: centerPt.y,
        hdg: refPt.hdg,
        offset: centerOffset,
        leftDist,
        rightDist
      });
    }
  }

  return samples;
}

function solveLinearSystem(A, b, n) {
  const aug = [];
  for (let i = 0; i < n; i++) {
    aug.push([...A[i], b[i]]);
  }

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    if (maxRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[maxRow];
      aug[maxRow] = tmp;
    }

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-14) return null;

    for (let j = col; j <= n; j++) {
      aug[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = aug[row][col];
        if (Math.abs(factor) > 1e-14) {
          for (let j = col; j <= n; j++) {
            aug[row][j] -= factor * aug[col][j];
          }
        }
      }
    }
  }

  const x = [];
  for (let i = 0; i < n; i++) {
    x.push(aug[i][n]);
  }
  return x;
}

export function fitCenterLinePolynomial(centerSamples) {
  if (!centerSamples || centerSamples.length < 4) {
    return { a: 0, b: 0, c: 0, d: 0, rmse: Infinity, valid: false };
  }

  const n = centerSamples.length;
  const sStart = centerSamples[0].s;
  const sEnd = centerSamples[centerSamples.length - 1].s;
  const sRange = sEnd - sStart;

  if (sRange < 1e-6) {
    return { a: 0, b: 0, c: 0, d: 0, rmse: Infinity, valid: false };
  }

  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const b = [0, 0, 0, 0];

  for (let i = 0; i < n; i++) {
    const ds = (centerSamples[i].s - sStart) / sRange;
    const ds2 = ds * ds;
    const ds3 = ds2 * ds;
    const offset = centerSamples[i].offset;

    const row = [1, ds, ds2, ds3];

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        A[r][c] += row[r] * row[c];
      }
      b[r] += row[r] * offset;
    }
  }

  const coeff = solveLinearSystem(A, b, 4);

  if (!coeff) {
    return { a: 0, b: 0, c: 0, d: 0, rmse: Infinity, valid: false };
  }

  const [aNorm, bNorm, cNorm, dNorm] = coeff;

  const a = aNorm;
  const bCoeff = bNorm / sRange;
  const cCoeff = cNorm / (sRange * sRange);
  const dCoeff = dNorm / (sRange * sRange * sRange);

  let totalError = 0;
  for (let i = 0; i < n; i++) {
    const ds = centerSamples[i].s - sStart;
    const predOffset = a + bCoeff * ds + cCoeff * ds * ds + dCoeff * ds * ds * ds;
    const err = predOffset - centerSamples[i].offset;
    totalError += err * err;
  }

  const rmse = Math.sqrt(totalError / n);

  return {
    a,
    b: bCoeff,
    c: cCoeff,
    d: dCoeff,
    sStart,
    sEnd,
    sRange,
    rmse,
    valid: true
  };
}

export function evalCenterLinePoly(poly, s) {
  const ds = s - poly.sStart;
  return poly.a + poly.b * ds + poly.c * ds * ds + poly.d * ds * ds * ds;
}

export function sampleCenterLineFromPoly(poly, refLinePoints) {
  if (!poly || !poly.valid || !refLinePoints) return [];

  const samples = [];
  for (const refPt of refLinePoints) {
    if (refPt.s < poly.sStart - 1e-6 || refPt.s > poly.sEnd + 1e-6) continue;
    const offset = evalCenterLinePoly(poly, refPt.s);
    const pt = lateralOffset(refPt.x, refPt.y, refPt.hdg, offset);
    samples.push({
      s: refPt.s,
      x: pt.x,
      y: pt.y,
      hdg: refPt.hdg,
      offset
    });
  }
  return samples;
}

export function deriveAllCenterLines(laneDataMap) {
  const results = {};

  for (const roadId of Object.keys(laneDataMap)) {
    const lanes = laneDataMap[roadId];
    const roadResults = [];

    for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
      const lane = lanes[laneIdx];
      const rawSamples = computeCenterLineSamples(lane);
      const fittedPoly = fitCenterLinePolynomial(rawSamples);
      const fittedSamples = sampleCenterLineFromPoly(fittedPoly, lane.refLinePoints);

      roadResults.push({
        laneIdx,
        laneId: lane.laneId,
        rawSamples,
        fittedPoly,
        fittedSamples
      });
    }

    results[roadId] = roadResults;
  }

  return results;
}
