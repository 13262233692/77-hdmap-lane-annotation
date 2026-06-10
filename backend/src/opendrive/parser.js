import sax from 'sax';
import {
  cubicPoly,
  cubicPolyDerivative,
  cubicPolySecondDerivative,
  cubicPolyCurvature,
  cubicPolyHeading,
  lateralOffsetPoint
} from '../math/cubicPolynomial.js';

export function parseOpenDrive(buffer) {
  return new Promise((resolve, reject) => {
    const parser = sax.parser(false, { trim: true, lowercase: true, normalize: true });

    const result = {
      header: {},
      roads: []
    };

    let currentRoad = null;
    let currentPlanView = null;
    let currentGeometry = null;
    let currentLanes = null;
    let currentLaneSection = null;
    let currentLane = null;
    let currentWidth = null;
    let currentOffset = null;

    const getAttr = (attrs, key) => {
      if (!attrs) return undefined;
      return attrs[key];
    };

    parser.onerror = reject;

    parser.onopentag = (node) => {
      const name = node.name;
      const attrs = node.attributes;

      switch (name) {
        case 'header':
          result.header = {
            revMajor: parseFloat(getAttr(attrs, 'revmajor') || 0),
            revMinor: parseFloat(getAttr(attrs, 'revminor') || 0),
            north: parseFloat(getAttr(attrs, 'north') || 0),
            south: parseFloat(getAttr(attrs, 'south') || 0),
            east: parseFloat(getAttr(attrs, 'east') || 0),
            west: parseFloat(getAttr(attrs, 'west') || 0),
            vendor: getAttr(attrs, 'vendor') || ''
          };
          break;

        case 'road':
          currentRoad = {
            id: getAttr(attrs, 'id') || '',
            name: getAttr(attrs, 'name') || '',
            length: parseFloat(getAttr(attrs, 'length') || 0),
            junction: getAttr(attrs, 'junction') || '-1',
            planView: { geometries: [] },
            lanes: { laneOffsets: [], laneSections: [] }
          };
          break;

        case 'planview':
          if (currentRoad) currentPlanView = currentRoad.planView;
          break;

        case 'geometry':
          currentGeometry = {
            s: parseFloat(getAttr(attrs, 's') || 0),
            x: parseFloat(getAttr(attrs, 'x') || 0),
            y: parseFloat(getAttr(attrs, 'y') || 0),
            hdg: parseFloat(getAttr(attrs, 'hdg') || 0),
            length: parseFloat(getAttr(attrs, 'length') || 0),
            type: null,
            params: {}
          };
          break;

        case 'line':
          if (currentGeometry) {
            currentGeometry.type = 'line';
            currentGeometry.params = {};
          }
          break;

        case 'arc':
          if (currentGeometry) {
            currentGeometry.type = 'arc';
            currentGeometry.params = {
              curvature: parseFloat(getAttr(attrs, 'curvature') || 0)
            };
          }
          break;

        case 'spiral':
          if (currentGeometry) {
            currentGeometry.type = 'spiral';
            currentGeometry.params = {
              curvStart: parseFloat(getAttr(attrs, 'curvstart') || 0),
              curvEnd: parseFloat(getAttr(attrs, 'curvend') || 0)
            };
          }
          break;

        case 'poly3':
          if (currentGeometry) {
            currentGeometry.type = 'poly3';
            currentGeometry.params = {
              a: parseFloat(getAttr(attrs, 'a') || 0),
              b: parseFloat(getAttr(attrs, 'b') || 0),
              c: parseFloat(getAttr(attrs, 'c') || 0),
              d: parseFloat(getAttr(attrs, 'd') || 0)
            };
          }
          break;

        case 'parampoly3':
          if (currentGeometry) {
            currentGeometry.type = 'paramPoly3';
            currentGeometry.params = {
              aU: parseFloat(getAttr(attrs, 'au') || 0),
              bU: parseFloat(getAttr(attrs, 'bu') || 0),
              cU: parseFloat(getAttr(attrs, 'cu') || 0),
              dU: parseFloat(getAttr(attrs, 'du') || 0),
              aV: parseFloat(getAttr(attrs, 'av') || 0),
              bV: parseFloat(getAttr(attrs, 'bv') || 0),
              cV: parseFloat(getAttr(attrs, 'cv') || 0),
              dV: parseFloat(getAttr(attrs, 'dv') || 0),
              pRange: getAttr(attrs, 'prange') || 'arcLength'
            };
          }
          break;

        case 'lanes':
          if (currentRoad) currentLanes = currentRoad.lanes;
          break;

        case 'laneoffset':
          if (currentLanes) {
            currentOffset = {
              s: parseFloat(getAttr(attrs, 's') || 0),
              a: parseFloat(getAttr(attrs, 'a') || 0),
              b: parseFloat(getAttr(attrs, 'b') || 0),
              c: parseFloat(getAttr(attrs, 'c') || 0),
              d: parseFloat(getAttr(attrs, 'd') || 0)
            };
          }
          break;

        case 'lanesection':
          currentLaneSection = {
            s: parseFloat(getAttr(attrs, 's') || 0),
            singleSide: getAttr(attrs, 'singleside') === 'true',
            left: [],
            center: null,
            right: []
          };
          break;

        case 'left':
          if (currentLaneSection) currentLaneSection._side = 'left';
          break;

        case 'center':
          if (currentLaneSection) currentLaneSection._side = 'center';
          break;

        case 'right':
          if (currentLaneSection) currentLaneSection._side = 'right';
          break;

        case 'lane':
          if (currentLaneSection && currentLaneSection._side) {
            currentLane = {
              id: parseInt(getAttr(attrs, 'id') || 0),
              type: getAttr(attrs, 'type') || 'none',
              level: getAttr(attrs, 'level') === 'true',
              widths: [],
              links: { predecessor: [], successor: [] }
            };
          }
          break;

        case 'width':
          if (currentLane) {
            currentWidth = {
              sOffset: parseFloat(getAttr(attrs, 'soffset') || 0),
              a: parseFloat(getAttr(attrs, 'a') || 0),
              b: parseFloat(getAttr(attrs, 'b') || 0),
              c: parseFloat(getAttr(attrs, 'c') || 0),
              d: parseFloat(getAttr(attrs, 'd') || 0)
            };
          }
          break;

        case 'link':
          break;

        case 'predecessor':
          if (currentLane) {
            currentLane.links.predecessor.push({ id: parseInt(getAttr(attrs, 'id') || 0) });
          }
          break;

        case 'successor':
          if (currentLane) {
            currentLane.links.successor.push({ id: parseInt(getAttr(attrs, 'id') || 0) });
          }
          break;
      }
    };

    parser.onclosetag = (name) => {
      switch (name) {
        case 'road':
          if (currentRoad) {
            result.roads.push(currentRoad);
          }
          currentRoad = null;
          currentPlanView = null;
          currentLanes = null;
          break;

        case 'geometry':
          if (currentGeometry && currentPlanView) {
            currentPlanView.geometries.push(currentGeometry);
          }
          currentGeometry = null;
          break;

        case 'laneoffset':
          if (currentOffset && currentLanes) {
            currentLanes.laneOffsets.push(currentOffset);
          }
          currentOffset = null;
          break;

        case 'lanesection':
          if (currentLaneSection && currentLanes) {
            delete currentLaneSection._side;
            currentLanes.laneSections.push(currentLaneSection);
          }
          currentLaneSection = null;
          break;

        case 'lane':
          if (currentLane && currentLaneSection) {
            const side = currentLaneSection._side;
            if (side === 'left') {
              currentLaneSection.left.push(currentLane);
            } else if (side === 'center') {
              currentLaneSection.center = currentLane;
            } else if (side === 'right') {
              currentLaneSection.right.push(currentLane);
            }
          }
          currentLane = null;
          break;

        case 'width':
          if (currentWidth && currentLane) {
            currentLane.widths.push(currentWidth);
          }
          currentWidth = null;
          break;
      }
    };

    parser.onend = () => {
      resolve(result);
    };

    const xmlString = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : buffer;
    parser.write(xmlString).close();
  });
}

function evalPlanViewGeometry(geom, s) {
  const ds = s - geom.s;
  if (ds < 0) ds = 0;
  if (ds > geom.length) ds = geom.length;

  let x = geom.x;
  let y = geom.y;
  let hdg = geom.hdg;
  let dx = Math.cos(hdg);
  let dy = Math.sin(hdg);
  let ddx = 0;
  let ddy = 0;

  switch (geom.type) {
    case 'line': {
      x += dx * ds;
      y += dy * ds;
      break;
    }
    case 'arc': {
      const c = geom.params.curvature;
      if (Math.abs(c) < 1e-12) {
        x += dx * ds;
        y += dy * ds;
      } else {
        const theta = c * ds;
        x += (Math.sin(theta) / c) * dx - ((1 - Math.cos(theta)) / c) * dy;
        y += ((1 - Math.cos(theta)) / c) * dx + (Math.sin(theta) / c) * dy;
        hdg += theta;
        dx = Math.cos(hdg);
        dy = Math.sin(hdg);
        ddx = -c * dy;
        ddy = c * dx;
      }
      break;
    }
    case 'poly3': {
      const { a, b, c, d } = geom.params;
      const u = ds;
      const v = a + b * u + c * u * u + d * u * u * u;
      const dv = b + 2 * c * u + 3 * d * u * u;
      const cosH = Math.cos(geom.hdg);
      const sinH = Math.sin(geom.hdg);
      x += cosH * u - sinH * v;
      y += sinH * u + cosH * v;
      const dphi = Math.atan(dv);
      hdg = geom.hdg + dphi;
      dx = Math.cos(hdg);
      dy = Math.sin(hdg);
      const ddv = 2 * c + 6 * d * u;
      const denom = (1 + dv * dv);
      if (Math.abs(denom) > 1e-12) {
        const kLocal = ddv / (denom * Math.sqrt(denom));
        ddx = -kLocal * dy;
        ddy = kLocal * dx;
      }
      break;
    }
    case 'paramPoly3': {
      const { aU, bU, cU, dU, aV, bV, cV, dV, pRange } = geom.params;
      const p = pRange === 'normalized' ? ds / geom.length : ds;
      const p2 = p * p;
      const p3 = p2 * p;
      const u = aU + bU * p + cU * p2 + dU * p3;
      const v = aV + bV * p + cV * p2 + dV * p3;
      const du = bU + 2 * cU * p + 3 * dU * p2;
      const dv = bV + 2 * cV * p + 3 * dV * p2;
      const ddu = 2 * cU + 6 * dU * p;
      const ddv = 2 * cV + 6 * dV * p;
      const cosH = Math.cos(geom.hdg);
      const sinH = Math.sin(geom.hdg);
      x += cosH * u - sinH * v;
      y += sinH * u + cosH * v;
      const localDx = cosH * du - sinH * dv;
      const localDy = sinH * du + cosH * dv;
      const len = Math.sqrt(localDx * localDx + localDy * localDy);
      if (len > 1e-12) {
        dx = localDx / len;
        dy = localDy / len;
      }
      hdg = Math.atan2(dy, dx);
      const localDDx = cosH * ddu - sinH * ddv;
      const localDDy = sinH * ddu + cosH * ddv;
      ddx = localDDx;
      ddy = localDDy;
      break;
    }
    case 'spiral': {
      const { curvStart, curvEnd } = geom.params;
      const c = curvStart + (curvEnd - curvStart) * (ds / geom.length);
      const cDot = (curvEnd - curvStart) / geom.length;
      if (Math.abs(cDot) < 1e-12 && Math.abs(c) < 1e-12) {
        x += dx * ds;
        y += dy * ds;
      } else {
        const L = geom.length;
        const a = Math.sqrt(Math.abs(Math.PI / Math.abs(cDot || 1e-12)));
        const s0 = curvStart / (cDot || 1e-12);
        const fresnel = fresnelApprox((s0 + ds) / a);
        const fresnel0 = fresnelApprox(s0 / a);
        let tx = fresnel.S - fresnel0.S;
        let ty = fresnel.C - fresnel0.C;
        if (cDot < 0) ty = -ty;
        tx *= a;
        ty *= a;
        const cosH = Math.cos(geom.hdg);
        const sinH = Math.sin(geom.hdg);
        x += cosH * tx - sinH * ty;
        y += sinH * tx + cosH * ty;
        hdg = geom.hdg + curvStart * ds + 0.5 * cDot * ds * ds;
        dx = Math.cos(hdg);
        dy = Math.sin(hdg);
        ddx = -c * dy;
        ddy = c * dx;
      }
      break;
    }
  }

  return { x, y, hdg, dx, dy, ddx, ddy };
}

function fresnelApprox(s) {
  const sign = s < 0 ? -1 : 1;
  s = Math.abs(s);
  const s2 = s * s;
  const s4 = s2 * s2;
  const s6 = s4 * s2;
  const s8 = s6 * s2;

  const f = [
    1.0,
    -1.0 / (2.0 * 3.0),
    1.0 / (2.0 * 4.0 * 5.0),
    -1.0 / (2.0 * 4.0 * 6.0 * 7.0),
    1.0 / (2.0 * 4.0 * 6.0 * 8.0 * 9.0)
  ];
  const g = [
    1.0 / 3.0,
    -1.0 / (2.0 * 5.0),
    1.0 / (2.0 * 4.0 * 7.0),
    -1.0 / (2.0 * 4.0 * 6.0 * 9.0),
    1.0 / (2.0 * 4.0 * 6.0 * 8.0 * 11.0)
  ];

  let C = 0, S = 0;
  for (let k = 0; k < 5; k++) {
    C += f[k] * Math.pow(s2, 2 * k) / (4 * k + 1);
    S += g[k] * Math.pow(s2, 2 * k + 1) / (4 * k + 3);
  }
  C *= s;
  S *= s;

  const s2Inv = 1 / s2;
  if (s > 1.5) {
    const termC = Math.sin(Math.PI * s2 / 2) / (Math.PI * s);
    const termS = Math.cos(Math.PI * s2 / 2) / (Math.PI * s);
    C = 0.5 - termC * (1 - f[1] * s2Inv + f[2] * s4 - f[3] * s6);
    S = 0.5 - termS * (1 - g[1] * s2Inv + g[2] * s4 - g[3] * s6);
  }

  return { C: sign * C, S: sign * S };
}

function findGeometry(geometries, s) {
  let lo = 0, hi = geometries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const geom = geometries[mid];
    if (s < geom.s) {
      hi = mid - 1;
    } else if (s >= geom.s + geom.length) {
      lo = mid + 1;
    } else {
      return geom;
    }
  }
  if (hi < 0) return geometries[0];
  if (lo >= geometries.length) return geometries[geometries.length - 1];
  return geometries[hi];
}

export function sampleReferenceLine(road, stepSize = 0.5) {
  const { planView } = road;
  const points = [];
  const totalLength = road.length;

  for (let s = 0; s <= totalLength; s += stepSize) {
    const geom = findGeometry(planView.geometries, s);
    const pt = evalPlanViewGeometry(geom, s);
    points.push({
      s,
      x: pt.x,
      y: pt.y,
      hdg: pt.hdg,
      curvature: cubicPolyCurvature(pt.dx, pt.dy, pt.ddx, pt.ddy)
    });
  }

  if (points.length === 0 || points[points.length - 1].s < totalLength) {
    const geom = findGeometry(planView.geometries, totalLength);
    const pt = evalPlanViewGeometry(geom, totalLength);
    points.push({
      s: totalLength,
      x: pt.x,
      y: pt.y,
      hdg: pt.hdg,
      curvature: cubicPolyCurvature(pt.dx, pt.dy, pt.ddx, pt.ddy)
    });
  }

  return points;
}

function findWidthAt(lane, sOffset) {
  const widths = lane.widths;
  if (widths.length === 0) return 0;
  let idx = 0;
  for (let i = 0; i < widths.length; i++) {
    if (sOffset >= widths[i].sOffset) idx = i;
    else break;
  }
  const w = widths[idx];
  const ds = sOffset - w.sOffset;
  return cubicPoly(w, ds);
}

function findLaneOffset(road, s) {
  const offsets = road.lanes.laneOffsets;
  if (offsets.length === 0) return 0;
  let idx = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (s >= offsets[i].s) idx = i;
    else break;
  }
  const off = offsets[idx];
  const ds = s - off.s;
  return cubicPoly(off, ds);
}

export function buildLaneBoundaries(road) {
  const { planView, lanes } = road;
  const laneSections = lanes.laneSections;
  if (laneSections.length === 0) return [];

  const result = [];

  for (let lsIdx = 0; lsIdx < laneSections.length; lsIdx++) {
    const section = laneSections[lsIdx];
    const sStart = section.s;
    const sEnd = lsIdx < laneSections.length - 1 ? laneSections[lsIdx + 1].s : road.length;

    const allLanes = [];
    for (const l of section.left) allLanes.push({ side: 'left', lane: l });
    if (section.center) allLanes.push({ side: 'center', lane: section.center });
    for (const l of section.right) allLanes.push({ side: 'right', lane: l });

    for (const { side, lane } of allLanes) {
      if (lane.type === 'none') continue;

      const refLinePoints = [];
      const leftBoundary = [];
      const rightBoundary = [];

      let accWidth = 0;
      const startId = lane.id;
      const sameSideLanes = side === 'left' ? section.left : (side === 'right' ? section.right : []);
      if (side !== 'center') {
        for (const l of sameSideLanes) {
          if (side === 'left' ? l.id > startId : l.id < startId) {
            const w = findWidthAt(l, 0);
            accWidth += w;
          }
          if (l.id === startId) break;
        }
      }

      const step = 0.5;
      for (let s = sStart; s <= sEnd; s += step) {
        const geom = findGeometry(planView.geometries, s);
        const pt = evalPlanViewGeometry(geom, s);
        const laneOffset = findLaneOffset(road, s);
        const laneWidth = findWidthAt(lane, s - sStart);

        const innerT = accWidth + laneOffset;
        const outerT = accWidth + laneWidth + laneOffset;

        const innerPt = lateralOffsetPoint(pt.x, pt.y, pt.hdg, side === 'left' ? innerT : -innerT);
        const outerPt = lateralOffsetPoint(pt.x, pt.y, pt.hdg, side === 'left' ? outerT : -outerT);

        if (side === 'left') {
          leftBoundary.push({ s, x: outerPt.x, y: outerPt.y });
          rightBoundary.push({ s, x: innerPt.x, y: innerPt.y });
        } else if (side === 'right') {
          leftBoundary.push({ s, x: innerPt.x, y: innerPt.y });
          rightBoundary.push({ s, x: outerPt.x, y: outerPt.y });
        } else {
          leftBoundary.push({ s, x: innerPt.x, y: innerPt.y });
          rightBoundary.push({ s, x: innerPt.x, y: innerPt.y });
        }

        refLinePoints.push({
          s,
          x: pt.x,
          y: pt.y,
          hdg: pt.hdg,
          curvature: cubicPolyCurvature(pt.dx, pt.dy, pt.ddx, pt.ddy)
        });
      }

      result.push({
        roadId: road.id,
        laneId: lane.id,
        laneType: lane.type,
        sStart,
        sEnd,
        side,
        width: {
          a: lane.widths[0]?.a || 0,
          b: lane.widths[0]?.b || 0,
          c: lane.widths[0]?.c || 0,
          d: lane.widths[0]?.d || 0
        },
        refLinePoints,
        leftBoundary,
        rightBoundary
      });
    }
  }

  return result;
}

export function processRoadForFrontend(road) {
  const { planView } = road;
  const geometries = planView.geometries.map(g => ({
    s: g.s,
    x: g.x,
    y: g.y,
    hdg: g.hdg,
    length: g.length,
    type: g.type,
    params: g.params
  }));

  const laneOffsets = road.lanes.laneOffsets.map(o => ({
    s: o.s,
    a: o.a,
    b: o.b,
    c: o.c,
    d: o.d
  }));

  const laneSections = road.lanes.laneSections.map(section => {
    const processLane = (l, side) => ({
      id: l.id,
      type: l.type,
      side,
      widths: l.widths.map(w => ({
        sOffset: w.sOffset,
        a: w.a,
        b: w.b,
        c: w.c,
        d: w.d
      }))
    });

    return {
      s: section.s,
      left: section.left.map(l => processLane(l, 'left')),
      center: section.center ? processLane(section.center, 'center') : null,
      right: section.right.map(l => processLane(l, 'right'))
    };
  });

  return {
    id: road.id,
    name: road.name,
    length: road.length,
    junction: road.junction,
    geometries,
    laneOffsets,
    laneSections
  };
}
