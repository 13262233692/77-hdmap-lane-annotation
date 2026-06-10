import {
  LANE_VERTEX_SHADER, LANE_FRAGMENT_SHADER,
  REFERENCE_LINE_VERTEX_SHADER, REFERENCE_LINE_FRAGMENT_SHADER,
  GRID_VERTEX_SHADER, GRID_FRAGMENT_SHADER,
  FILL_VERTEX_SHADER, FILL_FRAGMENT_SHADER
} from './shaders.js';

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function createBuffer(gl, data, usage) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), usage);
  return buffer;
}

function createIndexBuffer(gl, data, usage) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(data), usage);
  return buffer;
}

const LANE_COLORS = [
  [1.0, 0.8, 0.2, 0.9],
  [0.4, 0.8, 1.0, 0.9],
  [0.6, 1.0, 0.6, 0.9],
  [1.0, 0.5, 0.7, 0.9],
  [0.8, 0.6, 1.0, 0.9],
  [1.0, 0.6, 0.4, 0.9]
];

const CONTROL_POINT_SHADER_VS = `
  attribute vec2 a_position;
  uniform mat3 u_viewMatrix;
  uniform mediump float u_pixelRatio;
  uniform float u_pointSize;
  void main() {
    vec3 transformed = u_viewMatrix * vec3(a_position, 1.0);
    gl_Position = vec4(transformed.xy, 0.0, 1.0);
    gl_PointSize = u_pointSize * u_pixelRatio;
  }
`;

const CONTROL_POINT_SHADER_FS = `
  precision mediump float;
  uniform vec4 u_color;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float edge = smoothstep(0.5, 0.45, dist);
    gl_FragColor = vec4(u_color.rgb, u_color.a * edge);
  }
`;

export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    if (!gl.getExtension('OES_element_index_uint')) {
      console.warn('OES_element_index_uint not supported');
    }
    gl.getExtension('EXT_color_buffer_float');

    this.laneProgram = createProgram(gl, LANE_VERTEX_SHADER, LANE_FRAGMENT_SHADER);
    this.refLineProgram = createProgram(gl, REFERENCE_LINE_VERTEX_SHADER, REFERENCE_LINE_FRAGMENT_SHADER);
    this.gridProgram = createProgram(gl, GRID_VERTEX_SHADER, GRID_FRAGMENT_SHADER);
    this.fillProgram = createProgram(gl, FILL_VERTEX_SHADER, FILL_FRAGMENT_SHADER);
    this.controlPointProgram = createProgram(gl, CONTROL_POINT_SHADER_VS, CONTROL_POINT_SHADER_FS);

    this.viewMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.zoom = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.pixelRatio = window.devicePixelRatio || 1;

    this.laneMeshes = [];
    this.refLineMeshes = [];
    this.fillMeshes = [];
    this.gridMesh = null;
    this.controlPointMesh = null;

    this.controlPoints = [];
    this.controlPointColors = [];

    this.stats = {
      vertexCount: 0,
      triangleCount: 0,
      laneCount: 0
    };

    this._perfCounter = {
      frames: 0,
      lastTime: performance.now(),
      fps: 60,
      bufferSubDataCalls: 0,
      fullRebuildCount: 0,
      lastUpdateType: 'idle'
    };

    this._initGrid();
    this._initControlPointMesh();
    this.resize();
  }

  resize() {
    const { canvas, gl, pixelRatio } = this;
    const dpr = pixelRatio;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  _initGrid() {
    const { gl } = this;
    const size = 10000;
    const positions = [-size, -size, size, -size, size, size, -size, size];
    const indices = [0, 1, 2, 0, 2, 3];
    this.gridMesh = {
      positionBuffer: createBuffer(gl, positions, gl.STATIC_DRAW),
      indexBuffer: createIndexBuffer(gl, indices, gl.STATIC_DRAW),
      indexCount: indices.length
    };
  }

  _initControlPointMesh() {
    const { gl } = this;
    this.controlPointMesh = {
      positionBuffer: createBuffer(gl, [], gl.DYNAMIC_DRAW),
      colorBuffer: createBuffer(gl, [], gl.DYNAMIC_DRAW),
      count: 0
    };
  }

  setView(zoom, offsetX, offsetY) {
    this.zoom = zoom;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const aspect = w / h;
    const sx = (2 * zoom) / w;
    const sy = (2 * zoom) / (h * aspect);
    this.viewMatrix = [sx, 0, 0, 0, -sy, 0, -offsetX * sx, offsetY * sy, 1];
  }

  screenToWorld(sx, sy) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const aspect = w / h;
    const x = (sx / w - 0.5) * (w / this.zoom) + this.offsetX;
    const y = (0.5 - sy / h) * (h / (this.zoom * aspect)) + this.offsetY;
    return { x, y };
  }

  worldToScreen(wx, wy) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const aspect = w / h;
    const sx = ((wx - this.offsetX) * this.zoom / w + 0.5) * w;
    const sy = (0.5 - (wy - this.offsetY) * this.zoom / (h * aspect)) * h;
    return { x: sx, y: sy };
  }

  clear() {
    const { gl } = this;
    gl.clearColor(0.05, 0.07, 0.09, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  _disposeMesh(mesh) {
    const { gl } = this;
    if (!mesh) return;
    if (mesh.positionBuffer) gl.deleteBuffer(mesh.positionBuffer);
    if (mesh.normalBuffer) gl.deleteBuffer(mesh.normalBuffer);
    if (mesh.sideBuffer) gl.deleteBuffer(mesh.sideBuffer);
    if (mesh.distanceBuffer) gl.deleteBuffer(mesh.distanceBuffer);
    if (mesh.indexBuffer) gl.deleteBuffer(mesh.indexBuffer);
  }

  buildLaneMesh(leftBoundary, rightBoundary, laneType = 'driving', laneIdx) {
    if (!leftBoundary || leftBoundary.length < 2) return null;
    if (!rightBoundary || rightBoundary.length < 2) rightBoundary = leftBoundary;

    const positions = new Float32Array(leftBoundary.length * 4);
    const normals = new Float32Array(leftBoundary.length * 4);
    const sides = new Float32Array(leftBoundary.length * 2);
    const distances = new Float32Array(leftBoundary.length * 2);
    const indices = [];

    const n = Math.min(leftBoundary.length, rightBoundary.length);
    const posArr = [];

    for (let i = 0; i < n; i++) {
      const left = leftBoundary[i];
      const right = rightBoundary[i];
      posArr.push({ left, right });

      const dirX = right.x - left.x;
      const dirY = right.y - left.y;
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      const nx = dirX / len;
      const ny = dirY / len;

      const base = i * 4;
      positions[base] = left.x;
      positions[base + 1] = left.y;
      positions[base + 2] = right.x;
      positions[base + 3] = right.y;

      normals[base] = -ny;
      normals[base + 1] = nx;
      normals[base + 2] = -ny;
      normals[base + 3] = nx;

      const sBase = i * 2;
      sides[sBase] = -1;
      sides[sBase + 1] = 1;

      const dist = i / (n - 1);
      distances[sBase] = dist;
      distances[sBase + 1] = dist;
    }

    for (let i = 0; i < n - 1; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }

    const { gl } = this;
    const usage = gl.DYNAMIC_DRAW;
    return {
      positionBuffer: createBuffer(gl, positions, usage),
      normalBuffer: createBuffer(gl, normals, usage),
      sideBuffer: createBuffer(gl, sides, gl.STATIC_DRAW),
      distanceBuffer: createBuffer(gl, distances, gl.STATIC_DRAW),
      indexBuffer: createIndexBuffer(gl, indices, gl.STATIC_DRAW),
      positions,
      normals,
      posArr,
      indexCount: indices.length,
      vertexCount: n * 2,
      laneType,
      colorIndex: laneIdx % LANE_COLORS.length
    };
  }

  updateLaneBoundaryPoint(laneIndex, boundaryType, pointIndex, x, y) {
    const mesh = this.laneMeshes[laneIndex];
    if (!mesh) return false;

    const { gl } = this;
    const floatSize = 4;

    this._perfCounter.bufferSubDataCalls++;
    this._perfCounter.lastUpdateType = 'bufferSubData';

    if (boundaryType === 'left') {
      const base = pointIndex * 4;
      mesh.positions[base] = x;
      mesh.positions[base + 1] = y;

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, base * floatSize, new Float32Array([x, y]));
    } else if (boundaryType === 'right') {
      const base = pointIndex * 4 + 2;
      mesh.positions[base] = x;
      mesh.positions[base + 1] = y;

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, base * floatSize, new Float32Array([x, y]));
    }

    this._updateNeighborNormals(mesh, pointIndex);

    return true;
  }

  _updateNeighborNormals(mesh, pointIndex) {
    const { gl } = this;
    const floatSize = 4;
    const n = mesh.vertexCount / 2;

    const updateNormal = (i) => {
      if (i < 0 || i >= n) return;

      const left = mesh.posArr[i].left;
      const right = mesh.posArr[i].right;
      const dirX = right.x - left.x;
      const dirY = right.y - left.y;
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      const nx = dirX / len;
      const ny = dirY / len;

      const base = i * 4;
      mesh.normals[base] = -ny;
      mesh.normals[base + 1] = nx;
      mesh.normals[base + 2] = -ny;
      mesh.normals[base + 3] = nx;

      this._perfCounter.bufferSubDataCalls++;

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, base * floatSize, new Float32Array([-ny, nx, -ny, nx]));
    };

    updateNormal(pointIndex - 1);
    updateNormal(pointIndex);
    updateNormal(pointIndex + 1);
  }

  updateFillMeshPoint(laneIndex, boundaryType, pointIndex, x, y) {
    const mesh = this.fillMeshes[laneIndex];
    if (!mesh) return false;

    const { gl } = this;
    const floatSize = 4;

    this._perfCounter.bufferSubDataCalls++;

    if (boundaryType === 'left') {
      const base = pointIndex * 4;
      mesh.positions[base] = x;
      mesh.positions[base + 1] = y;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, base * floatSize, new Float32Array([x, y]));
    } else if (boundaryType === 'right') {
      const base = pointIndex * 4 + 2;
      mesh.positions[base] = x;
      mesh.positions[base + 1] = y;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, base * floatSize, new Float32Array([x, y]));
    }
    return true;
  }

  buildRefLineMesh(samples) {
    if (!samples || samples.length < 2) return null;

    const positions = new Float32Array(samples.length * 4);
    const normals = new Float32Array(samples.length * 4);
    const sides = new Float32Array(samples.length * 2);
    const indices = [];

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const nx = -Math.sin(s.hdg);
      const ny = Math.cos(s.hdg);

      const base = i * 4;
      positions[base] = s.x;
      positions[base + 1] = s.y;
      positions[base + 2] = s.x;
      positions[base + 3] = s.y;

      normals[base] = nx;
      normals[base + 1] = ny;
      normals[base + 2] = nx;
      normals[base + 3] = ny;

      const sBase = i * 2;
      sides[sBase] = -1;
      sides[sBase + 1] = 1;
    }

    for (let i = 0; i < samples.length - 1; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }

    const { gl } = this;
    return {
      positionBuffer: createBuffer(gl, positions, gl.DYNAMIC_DRAW),
      normalBuffer: createBuffer(gl, normals, gl.DYNAMIC_DRAW),
      sideBuffer: createBuffer(gl, sides, gl.STATIC_DRAW),
      indexBuffer: createIndexBuffer(gl, indices, gl.STATIC_DRAW),
      positions,
      normals,
      indexCount: indices.length,
      vertexCount: samples.length * 2
    };
  }

  buildFillMesh(leftBoundary, rightBoundary, color, laneIdx) {
    if (!leftBoundary || leftBoundary.length < 2) return null;
    if (!rightBoundary || rightBoundary.length < 2) rightBoundary = leftBoundary;

    const n = Math.min(leftBoundary.length, rightBoundary.length);
    const positions = new Float32Array(n * 4);
    const indices = [];

    for (let i = 0; i < n; i++) {
      const base = i * 4;
      positions[base] = leftBoundary[i].x;
      positions[base + 1] = leftBoundary[i].y;
      positions[base + 2] = rightBoundary[i].x;
      positions[base + 3] = rightBoundary[i].y;
    }

    for (let i = 0; i < n - 1; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }

    const { gl } = this;
    return {
      positionBuffer: createBuffer(gl, positions, gl.DYNAMIC_DRAW),
      indexBuffer: createIndexBuffer(gl, indices, gl.STATIC_DRAW),
      positions,
      indexCount: indices.length,
      vertexCount: n * 2,
      color
    };
  }

  setMapData(roads, laneDataMap) {
    this.laneMeshes.forEach(this._disposeMesh.bind(this));
    this.refLineMeshes.forEach(this._disposeMesh.bind(this));
    this.fillMeshes.forEach(this._disposeMesh.bind(this));
    this.laneMeshes = [];
    this.refLineMeshes = [];
    this.fillMeshes = [];

    let totalVerts = 0;
    let totalTris = 0;
    let totalLanes = 0;
    let laneIdx = 0;

    for (const road of roads) {
      const roadLanes = laneDataMap[road.id];
      if (!roadLanes) continue;

      for (const lane of roadLanes) {
        const laneColor = LANE_COLORS[laneIdx % LANE_COLORS.length];
        const fillColor = [...laneColor.slice(0, 3), 0.08];

        const fillMesh = this.buildFillMesh(lane.leftBoundary, lane.rightBoundary, fillColor, laneIdx);
        if (fillMesh) {
          this.fillMeshes.push(fillMesh);
          totalVerts += fillMesh.vertexCount;
          totalTris += fillMesh.indexCount / 3;
        }

        const laneMesh = this.buildLaneMesh(lane.leftBoundary, lane.rightBoundary, lane.laneType, laneIdx);
        if (laneMesh) {
          this.laneMeshes.push(laneMesh);
          totalVerts += laneMesh.vertexCount;
          totalTris += laneMesh.indexCount / 3;
          totalLanes++;
          laneIdx++;
        }
      }

      if (roadLanes.length > 0 && roadLanes[0].refLinePoints) {
        const refMesh = this.buildRefLineMesh(roadLanes[0].refLinePoints);
        if (refMesh) {
          this.refLineMeshes.push(refMesh);
          totalVerts += refMesh.vertexCount;
          totalTris += refMesh.indexCount / 3;
        }
      }
    }

    this.stats = {
      vertexCount: totalVerts,
      triangleCount: totalTris,
      laneCount: totalLanes
    };
  }

  updateControlPoints(points, colors) {
    const { gl } = this;
    this.controlPoints = points;
    this.controlPointColors = colors;

    const positions = new Float32Array(points.length * 2);
    const colorData = new Float32Array(points.length * 4);

    for (let i = 0; i < points.length; i++) {
      positions[i * 2] = points[i].x;
      positions[i * 2 + 1] = points[i].y;
      const c = colors[i] || [1, 1, 1, 1];
      colorData[i * 4] = c[0];
      colorData[i * 4 + 1] = c[1];
      colorData[i * 4 + 2] = c[2];
      colorData[i * 4 + 3] = c[3];
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointMesh.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointMesh.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.DYNAMIC_DRAW);

    this.controlPointMesh.count = points.length;
  }

  updateSingleControlPoint(index, x, y) {
    const { gl } = this;
    if (index < 0 || index >= this.controlPoints.length) return;

    this.controlPoints[index].x = x;
    this.controlPoints[index].y = y;

    this._perfCounter.bufferSubDataCalls++;

    const floatSize = 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointMesh.positionBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, index * 2 * floatSize, new Float32Array([x, y]));
  }

  hitTestControlPoints(screenX, screenY, tolerance = 8) {
    const world = this.screenToWorld(screenX, screenY);
    const toleranceWorld = tolerance / this.zoom;
    const tolSq = toleranceWorld * toleranceWorld;

    for (let i = this.controlPoints.length - 1; i >= 0; i--) {
      const p = this.controlPoints[i];
      const dx = p.x - world.x;
      const dy = p.y - world.y;
      if (dx * dx + dy * dy < tolSq) {
        return { index: i, point: p };
      }
    }
    return null;
  }

  render() {
    const { gl } = this;
    this.clear();
    this._renderGrid();
    this._renderFills();
    this._renderRefLines();
    this._renderLanes();
    this._renderControlPoints();
    this._updateFPS();
  }

  _updateFPS() {
    this._perfCounter.frames++;
    const now = performance.now();
    if (now - this._perfCounter.lastTime >= 1000) {
      this._perfCounter.fps = this._perfCounter.frames;
      this._perfCounter.frames = 0;
      this._perfCounter.lastTime = now;
    }
  }

  getFPS() {
    return this._perfCounter.fps;
  }

  _renderGrid() {
    const { gl, gridProgram, gridMesh, viewMatrix, pixelRatio, zoom } = this;
    if (!gridMesh) return;

    gl.useProgram(gridProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const aPosition = gl.getAttribLocation(gridProgram, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, gridMesh.positionBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix3fv(gl.getUniformLocation(gridProgram, 'u_viewMatrix'), false, viewMatrix);
    gl.uniform1f(gl.getUniformLocation(gridProgram, 'u_zoom'), zoom * pixelRatio);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gridMesh.indexBuffer);
    gl.drawElements(gl.TRIANGLES, gridMesh.indexCount, gl.UNSIGNED_INT, 0);
  }

  _renderFills() {
    const { gl, fillProgram, fillMeshes, viewMatrix } = this;
    if (fillMeshes.length === 0) return;

    gl.useProgram(fillProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const aPosition = gl.getAttribLocation(fillProgram, 'a_position');
    const uViewMatrix = gl.getUniformLocation(fillProgram, 'u_viewMatrix');
    const uColor = gl.getUniformLocation(fillProgram, 'u_color');
    gl.uniformMatrix3fv(uViewMatrix, false, viewMatrix);

    for (const mesh of fillMeshes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
      gl.uniform4fv(uColor, mesh.color);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    }
  }

  _renderRefLines() {
    const { gl, refLineProgram, refLineMeshes, viewMatrix, pixelRatio } = this;
    if (refLineMeshes.length === 0) return;

    gl.useProgram(refLineProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const aPosition = gl.getAttribLocation(refLineProgram, 'a_position');
    const aNormal = gl.getAttribLocation(refLineProgram, 'a_normal');
    const aSide = gl.getAttribLocation(refLineProgram, 'a_side');
    const uViewMatrix = gl.getUniformLocation(refLineProgram, 'u_viewMatrix');
    const uPixelRatio = gl.getUniformLocation(refLineProgram, 'u_pixelRatio');
    const uLineWidth = gl.getUniformLocation(refLineProgram, 'u_lineWidth');
    const uColor = gl.getUniformLocation(refLineProgram, 'u_color');

    gl.uniformMatrix3fv(uViewMatrix, false, viewMatrix);
    gl.uniform1f(uPixelRatio, pixelRatio);
    gl.uniform1f(uLineWidth, 2.0);
    gl.uniform4f(uColor, 0.8, 0.3, 0.3, 0.6);

    for (const mesh of refLineMeshes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
      gl.enableVertexAttribArray(aNormal);
      gl.vertexAttribPointer(aNormal, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.sideBuffer);
      gl.enableVertexAttribArray(aSide);
      gl.vertexAttribPointer(aSide, 1, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    }
  }

  _renderLanes() {
    const { gl, laneProgram, laneMeshes, viewMatrix, pixelRatio } = this;
    if (laneMeshes.length === 0) return;

    gl.useProgram(laneProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const aPosition = gl.getAttribLocation(laneProgram, 'a_position');
    const aNormal = gl.getAttribLocation(laneProgram, 'a_normal');
    const aSide = gl.getAttribLocation(laneProgram, 'a_side');
    const aDistance = gl.getAttribLocation(laneProgram, 'a_distance');
    const uViewMatrix = gl.getUniformLocation(laneProgram, 'u_viewMatrix');
    const uPixelRatio = gl.getUniformLocation(laneProgram, 'u_pixelRatio');
    const uLineWidth = gl.getUniformLocation(laneProgram, 'u_lineWidth');
    const uColor = gl.getUniformLocation(laneProgram, 'u_color');
    const uAntialias = gl.getUniformLocation(laneProgram, 'u_antialias');

    gl.uniformMatrix3fv(uViewMatrix, false, viewMatrix);
    gl.uniform1f(uPixelRatio, pixelRatio);
    gl.uniform1f(uLineWidth, 3.0);
    gl.uniform1f(uAntialias, 1.5);

    for (const mesh of laneMeshes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
      gl.enableVertexAttribArray(aNormal);
      gl.vertexAttribPointer(aNormal, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.sideBuffer);
      gl.enableVertexAttribArray(aSide);
      gl.vertexAttribPointer(aSide, 1, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.distanceBuffer);
      gl.enableVertexAttribArray(aDistance);
      gl.vertexAttribPointer(aDistance, 1, gl.FLOAT, false, 0, 0);

      const color = LANE_COLORS[mesh.colorIndex];
      gl.uniform4fv(uColor, color);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    }
  }

  _renderControlPoints() {
    const { gl, controlPointProgram, controlPointMesh, viewMatrix, pixelRatio } = this;
    if (!controlPointMesh || controlPointMesh.count === 0) return;

    gl.useProgram(controlPointProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const aPosition = gl.getAttribLocation(controlPointProgram, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, controlPointMesh.positionBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix3fv(gl.getUniformLocation(controlPointProgram, 'u_viewMatrix'), false, viewMatrix);
    gl.uniform1f(gl.getUniformLocation(controlPointProgram, 'u_pixelRatio'), pixelRatio);
    gl.uniform1f(gl.getUniformLocation(controlPointProgram, 'u_pointSize'), 12);
    gl.uniform4f(gl.getUniformLocation(controlPointProgram, 'u_color'), 0.0, 0.9, 1.0, 1.0);

    gl.drawArrays(gl.POINTS, 0, controlPointMesh.count);
  }

  dispose() {
    const { gl } = this;
    this.laneMeshes.forEach(this._disposeMesh.bind(this));
    this.refLineMeshes.forEach(this._disposeMesh.bind(this));
    this.fillMeshes.forEach(this._disposeMesh.bind(this));
    this._disposeMesh(this.gridMesh);
    if (this.controlPointMesh) {
      if (this.controlPointMesh.positionBuffer) gl.deleteBuffer(this.controlPointMesh.positionBuffer);
      if (this.controlPointMesh.colorBuffer) gl.deleteBuffer(this.controlPointMesh.colorBuffer);
    }
    if (this.laneProgram) gl.deleteProgram(this.laneProgram);
    if (this.refLineProgram) gl.deleteProgram(this.refLineProgram);
    if (this.gridProgram) gl.deleteProgram(this.gridProgram);
    if (this.fillProgram) gl.deleteProgram(this.fillProgram);
    if (this.controlPointProgram) gl.deleteProgram(this.controlPointProgram);
  }
}
