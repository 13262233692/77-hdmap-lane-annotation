import { evalRoadAt, findLaneOffsetAt, findWidthAt, evalPlanViewGeometry, findGeometry } from './planView.js';
import { curvature, lateralOffset, heading as calcHeading } from './cubicPolynomial.js';

const MAX_SEGMENTS = 2000;
const MIN_SEGMENTS_PER_GEOM = 4;

export function adaptiveSampleRoad(road, options = {}) {
  const {
    maxAngle = 0.08,
    maxDistance = 5.0,
    minStep = 0.1,
    maxStep = 10.0
  } = options;

  const geometries = road.geometries;
  if (!geometries || geometries.length === 0) return [];

  const samples = [];
  const totalLength = road.length;

  for (const geom of geometries) {
    const geomStart = geom.s;
    const geomEnd = geom.s + geom.length;

    const stack = [[geomStart, geomEnd, MIN_SEGMENTS_PER_GEOM]];
    const geomSamples = [];

    while (stack.length > 0) {
      const [start, end, minSegs] = stack.pop();
      const range = end - start;
      const estSegs = Math.max(minSegs, Math.ceil(range / maxStep));
      const step = range / estSegs;

      let needsSplit = false;
      let splitPoint = -1;
      let maxK = 0;
      let prevPt = null;

      for (let i = 0; i <= estSegs; i++) {
        const s = start + step * i;
        const pt = evalPlanViewGeometry(geom, s);
        const k = curvature(pt.dx, pt.dy, pt.ddx, pt.ddy);

        if (prevPt) {
          const dx = pt.x - prevPt.x;
          const dy = pt.y - prevPt.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const hdgDiff = Math.abs(angleDiff(pt.hdg, prevPt.hdg));

          if (dist > maxDistance || hdgDiff > maxAngle) {
            needsSplit = true;
            splitPoint = (start + prevPt.s + step / 2) / 1;
            if (!splitPoint || splitPoint <= prevPt.s) {
              splitPoint = prevPt.s + step / 2;
            }
          }

          if (k > maxK) maxK = k;
        }

        if (!needsSplit) {
          prevPt = { ...pt, s, curvature: k };
        } else {
          break;
        }
      }

      if (needsSplit && estSegs < MAX_SEGMENTS) {
        stack.push([splitPoint, end, minSegs]);
        stack.push([start, splitPoint, minSegs]);
      } else {
        for (let i = 0; i <= estSegs; i++) {
          const s = start + step * i;
          const pt = evalPlanViewGeometry(geom, s);
          const k = curvature(pt.dx, pt.dy, pt.ddx, pt.ddy);
          geomSamples.push({
            s,
            x: pt.x,
            y: pt.y,
            hdg: pt.hdg,
            dx: pt.dx,
            dy: pt.dy,
            curvature: k
          });
        }
      }
    }

    geomSamples.sort((a, b) => a.s - b.s);

    for (let i = 0; i < geomSamples.length; i++) {
      if (samples.length === 0 || geomSamples[i].s > samples[samples.length - 1].s + 1e-9) {
        samples.push(geomSamples[i]);
      }
    }
  }

  if (samples.length > 0 && samples[samples.length - 1].s < totalLength - 1e-6) {
    const pt = evalRoadAt(road, totalLength);
    if (pt) {
      samples.push({
        s: totalLength,
        x: pt.x,
        y: pt.y,
        hdg: pt.hdg,
        dx: pt.dx,
        dy: pt.dy,
        curvature: curvature(pt.dx, pt.dy, pt.ddx, pt.ddy)
      });
    }
  }

  return samples;
}

function angleDiff(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}

export function adaptiveSampleByCurvature(road, samples) {
  if (!samples || samples.length < 2) return adaptiveSampleRoad(road);

  const result = [];
  result.push(samples[0]);

  for (let i = 1; i < samples.length; i++) {
    const prev = result[result.length - 1];
    const curr = samples[i];
    const ds = curr.s - prev.s;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const avgK = (prev.curvature + curr.curvature) / 2;
    const targetStep = avgK > 0.001
      ? Math.max(0.1, Math.min(5.0, 0.5 / avgK))
      : 10.0;

    if (dist > targetStep * 1.5 || ds > targetStep * 2) {
      const midS = (prev.s + curr.s) / 2;
      const midPt = evalRoadAt(road, midS);
      if (midPt) {
        result.push({
          s: midS,
          x: midPt.x,
          y: midPt.y,
          hdg: midPt.hdg,
          dx: midPt.dx,
          dy: midPt.dy,
          curvature: curvature(midPt.dx, midPt.dy, midPt.ddx, midPt.ddy)
        });
      }
    }
    result.push(curr);
  }

  return result;
}

export function buildLaneBoundarySamples(road, lane, section, samples) {
  const laneId = lane.id;
  const side = lane.side;
  const sStart = section.s;
  const sEnd = road.length;
  const sectionIdx = road.laneSections.indexOf(section);
  const nextSection = sectionIdx >= 0 && sectionIdx < road.laneSections.length - 1
    ? road.laneSections[sectionIdx + 1]
    : null;
  const actualSEnd = nextSection ? nextSection.s : sEnd;

  let accWidthFromRef = 0;
  const sameSideLanes = side === 'left'
    ? section.left
    : (side === 'right' ? section.right : []);

  if (side !== 'center') {
    const sorted = [...sameSideLanes].sort((a, b) => Math.abs(a.id) - Math.abs(b.id));
    for (const l of sorted) {
      if (side === 'left' ? l.id > laneId : l.id < laneId) {
        const w = findWidthAt(l, 0);
        accWidthFromRef += w;
      }
      if (l.id === laneId) break;
    }
  }

  const filteredSamples = samples.filter(s => s.s >= sStart - 1e-6 && s.s <= actualSEnd + 1e-6);
  if (filteredSamples.length === 0) return { left: [], right: [] };

  const leftBoundary = [];
  const rightBoundary = [];

  for (const s of filteredSamples) {
    const sOffset = s.s - sStart;
    const laneWidth = findWidthAt(lane, sOffset);
    const laneOffset = findLaneOffsetAt(road, s.s);

    const innerOffset = accWidthFromRef + laneOffset;
    const outerOffset = accWidthFromRef + laneWidth + laneOffset;

    const innerPt = lateralOffset(s.x, s.y, s.hdg, side === 'left' ? innerOffset : -innerOffset);
    const outerPt = lateralOffset(s.x, s.y, s.hdg, side === 'left' ? outerOffset : -outerOffset);

    if (side === 'center') {
      leftBoundary.push({ x: innerPt.x, y: innerPt.y, s: s.s });
      rightBoundary.push({ x: innerPt.x, y: innerPt.y, s: s.s });
    } else {
      leftBoundary.push({ x: outerPt.x, y: outerPt.y, s: s.s });
      rightBoundary.push({ x: innerPt.x, y: innerPt.y, s: s.s });
    }
  }

  return { leftBoundary, rightBoundary };
}

export function generateLaneMeshVertices(lane, samples, lineWidth = 1.0) {
  if (!samples || samples.length < 2) return { positions: [], indices: [], uvs: [], normals: [] };

  const positions = [];
  const indices = [];
  const uvs = [];
  const normals = [];

  const halfWidth = lineWidth / 2;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const nx = -Math.sin(s.hdg);
    const ny = Math.cos(s.hdg);
    const tx = Math.cos(s.hdg);
    const ty = Math.sin(s.hdg);

    positions.push(s.x + nx * halfWidth, s.y + ny * halfWidth, 0);
    positions.push(s.x - nx * halfWidth, s.y - ny * halfWidth, 0);

    uvs.push(0, i / (samples.length - 1));
    uvs.push(1, i / (samples.length - 1));

    normals.push(0, 0, 1);
    normals.push(0, 0, 1);
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  return { positions, indices, uvs, normals };
}
