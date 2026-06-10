export const LANE_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_normal;
  attribute float a_side;
  attribute float a_distance;

  uniform mat3 u_viewMatrix;
  uniform mediump float u_pixelRatio;
  uniform float u_lineWidth;

  varying float v_side;
  varying float v_distance;
  varying vec2 v_worldPos;

  void main() {
    float expand = u_lineWidth * 0.5 * u_pixelRatio;
    vec2 pos = a_position + a_normal * expand * a_side;

    vec3 transformed = u_viewMatrix * vec3(pos, 1.0);
    gl_Position = vec4(transformed.xy, 0.0, 1.0);

    v_side = a_side;
    v_distance = a_distance;
    v_worldPos = pos;
  }
`;

export const LANE_FRAGMENT_SHADER = `
  precision mediump float;

  uniform vec4 u_color;
  uniform mediump float u_pixelRatio;
  uniform float u_lineWidth;
  uniform float u_antialias;

  varying float v_side;
  varying float v_distance;
  varying vec2 v_worldPos;

  void main() {
    float halfWidth = u_lineWidth * 0.5 * u_pixelRatio;
    float aaWidth = max(1.0, u_antialias * u_pixelRatio);

    float dist = abs(v_side) * halfWidth;
    float alpha = 1.0 - smoothstep(halfWidth - aaWidth, halfWidth + aaWidth, dist);

    float centerDist = abs(dist - halfWidth * 0.3);
    float centerGlow = smoothstep(halfWidth * 0.15, 0.0, centerDist) * 0.15;

    vec4 finalColor = u_color;
    finalColor.a = finalColor.a * alpha;
    finalColor.rgb += vec3(centerGlow);

    if (finalColor.a < 0.01) discard;
    gl_FragColor = finalColor;
  }
`;

export const REFERENCE_LINE_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_normal;
  attribute float a_side;

  uniform mat3 u_viewMatrix;
  uniform mediump float u_pixelRatio;
  uniform float u_lineWidth;

  varying float v_side;

  void main() {
    float expand = u_lineWidth * 0.5 * u_pixelRatio;
    vec2 pos = a_position + a_normal * expand * a_side;

    vec3 transformed = u_viewMatrix * vec3(pos, 1.0);
    gl_Position = vec4(transformed.xy, 0.0, 1.0);

    v_side = a_side;
  }
`;

export const REFERENCE_LINE_FRAGMENT_SHADER = `
  precision mediump float;

  uniform vec4 u_color;
  uniform mediump float u_pixelRatio;
  uniform float u_lineWidth;

  varying float v_side;

  void main() {
    float halfWidth = u_lineWidth * 0.5 * u_pixelRatio;
    float aaWidth = max(1.0, u_pixelRatio);

    float dist = abs(v_side) * halfWidth;
    float alpha = 1.0 - smoothstep(halfWidth - aaWidth, halfWidth + aaWidth, dist);

    vec4 finalColor = u_color;
    finalColor.a = finalColor.a * alpha;

    if (finalColor.a < 0.01) discard;
    gl_FragColor = finalColor;
  }
`;

export const GRID_VERTEX_SHADER = `
  attribute vec2 a_position;
  uniform mat3 u_viewMatrix;
  varying vec2 v_worldPos;

  void main() {
    vec3 transformed = u_viewMatrix * vec3(a_position, 1.0);
    gl_Position = vec4(transformed.xy, 0.0, 1.0);
    v_worldPos = a_position;
  }
`;

export const GRID_FRAGMENT_SHADER = `
  precision mediump float;
  uniform float u_zoom;
  varying vec2 v_worldPos;

  void main() {
    float gridSize = 10.0;
    float minorSize = gridSize;
    float majorSize = gridSize * 5.0;

    vec2 minor = abs(fract(v_worldPos / minorSize) - 0.5);
    float minorLine = min(minor.x, minor.y) * minorSize * u_zoom;
    float minorAlpha = 1.0 - smoothstep(0.0, 1.5, minorLine);

    vec2 major = abs(fract(v_worldPos / majorSize) - 0.5);
    float majorLine = min(major.x, major.y) * majorSize * u_zoom;
    float majorAlpha = 1.0 - smoothstep(0.0, 1.5, majorLine);

    vec3 minorColor = vec3(0.18, 0.22, 0.28);
    vec3 majorColor = vec3(0.25, 0.32, 0.42);

    vec3 color = mix(minorColor, majorColor, majorAlpha);
    float alpha = max(minorAlpha * 0.4, majorAlpha * 0.7);

    gl_FragColor = vec4(color, alpha);
  }
`;

export const FILL_VERTEX_SHADER = `
  attribute vec2 a_position;
  uniform mat3 u_viewMatrix;

  void main() {
    vec3 transformed = u_viewMatrix * vec3(a_position, 1.0);
    gl_Position = vec4(transformed.xy, 0.0, 1.0);
  }
`;

export const FILL_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec4 u_color;

  void main() {
    gl_FragColor = u_color;
  }
`;
