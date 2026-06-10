export function cubicPoly(p, s) {
  return p.a + p.b * s + p.c * s * s + p.d * s * s * s;
}

export function cubicPolyDerivative(p, s) {
  return p.b + 2 * p.c * s + 3 * p.d * s * s;
}

export function cubicPolySecondDerivative(p, s) {
  return 2 * p.c + 6 * p.d * s;
}

export function curvature(dx, dy, ddx, ddy) {
  const numerator = Math.abs(dx * ddy - dy * ddx);
  const denominator = Math.pow(dx * dx + dy * dy, 1.5);
  return denominator === 0 ? 0 : numerator / denominator;
}

export function heading(dx, dy) {
  return Math.atan2(dy, dx);
}

export function normalVector(dx, dy) {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    nx: -dy / len,
    ny: dx / len
  };
}

export function tangentVector(dx, dy) {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    tx: dx / len,
    ty: dy / len
  };
}

export function lateralOffset(x, y, hdg, offset) {
  return {
    x: x - Math.sin(hdg) * offset,
    y: y + Math.cos(hdg) * offset
  };
}

export function fresnelApprox(s) {
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
