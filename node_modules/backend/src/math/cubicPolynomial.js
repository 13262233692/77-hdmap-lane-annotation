export function cubicPoly(p, s) {
  return p.a + p.b * s + p.c * s * s + p.d * s * s * s;
}

export function cubicPolyDerivative(p, s) {
  return p.b + 2 * p.c * s + 3 * p.d * s * s;
}

export function cubicPolySecondDerivative(p, s) {
  return 2 * p.c + 6 * p.d * s;
}

export function cubicPolyCurvature(dx, dy, ddx, ddy) {
  const numerator = Math.abs(dx * ddy - dy * ddx);
  const denominator = Math.pow(dx * dx + dy * dy, 1.5);
  return denominator === 0 ? 0 : numerator / denominator;
}

export function cubicPolyHeading(dx, dy) {
  return Math.atan2(dy, dx);
}

export function lateralOffsetPoint(x, y, heading, offset) {
  return {
    x: x - Math.sin(heading) * offset,
    y: y + Math.cos(heading) * offset
  };
}
