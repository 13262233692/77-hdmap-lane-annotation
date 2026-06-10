import { fresnelApprox } from './cubicPolynomial.js';

export function evalPlanViewGeometry(geom, s) {
  const ds = Math.max(0, Math.min(s - geom.s, geom.length));

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
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        x += (sinT / c) * dx - ((1 - cosT) / c) * dy;
        y += ((1 - cosT) / c) * dx + (sinT / c) * dy;
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
      const ddv = 2 * c + 6 * d * u;
      const cosH = Math.cos(geom.hdg);
      const sinH = Math.sin(geom.hdg);
      x += cosH * u - sinH * v;
      y += sinH * u + cosH * v;
      const dphi = Math.atan(dv);
      hdg = geom.hdg + dphi;
      dx = Math.cos(hdg);
      dy = Math.sin(hdg);
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
        const fr = fresnelApprox((s0 + ds) / a);
        const fr0 = fresnelApprox(s0 / a);
        let tx = fr.S - fr0.S;
        let ty = fr.C - fr0.C;
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

export function findGeometry(geometries, s) {
  if (!geometries || geometries.length === 0) return null;
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

export function evalRoadAt(road, s) {
  const geom = findGeometry(road.geometries, s);
  if (!geom) return null;
  return evalPlanViewGeometry(geom, s);
}

export function findLaneOffsetAt(road, s) {
  const offsets = road.laneOffsets;
  if (!offsets || offsets.length === 0) return 0;
  let idx = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (s >= offsets[i].s) idx = i;
    else break;
  }
  const off = offsets[idx];
  const ds = s - off.s;
  return off.a + off.b * ds + off.c * ds * ds + off.d * ds * ds * ds;
}

export function findWidthAt(lane, sOffset) {
  const widths = lane.widths;
  if (!widths || widths.length === 0) return 0;
  let idx = 0;
  for (let i = 0; i < widths.length; i++) {
    if (sOffset >= widths[i].sOffset) idx = i;
    else break;
  }
  const w = widths[idx];
  const ds = sOffset - w.sOffset;
  return w.a + w.b * ds + w.c * ds * ds + w.d * ds * ds * ds;
}
