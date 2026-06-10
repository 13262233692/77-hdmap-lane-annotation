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

function createBuffer(gl, data, usage = gl.STATIC_DRAW) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), usage);
  return buffer;
}

function createIndexBuffer(gl, data, usage = gl.STATIC_DRAW) {
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

export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    this.gl = gl;

    if (!gl.getExtension('OES_element_index_uint')) {
      console.warn('OES_element_index_uint not supported');
    }

    gl.getExtension('EXT_color_buffer_float');

    this.laneProgram = createProgram(gl, LANE_VERTEX_SHADER, LANE_FRAGMENT_SHADER);
    this.refLineProgram = createProgram(gl, REFERENCE_LINE_VERTEX_SHADER, REFERENCE_LINE_FRAGMENT_SHADER);
    this.gridProgram = createProgram(gl, GRID_VERTEX_SHADER, GRID_FRAGMENT_SHADER);
    this.fillProgram = createProgram(gl, FILL_VERTEX_SHADER, FILL_FRAGMENT_SHADER);

    this.viewMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.zoom = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.pixelRatio = window.devicePixelRatio || 1;

    this.laneMeshes = [];
    this.refLineMeshes = [];
    this.fillMeshes = [];
    this.gridMesh = null;

    this.stats = {
      vertexCount: 0,
      triangleCount: 0,
      laneCount: 0
    };

    this._initGrid();
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
    const positions = [
      -size, -size,
       size, -size,
       size,  size,
      -size,  size
    ];
    const indices = [0, 1, 2, 0, 2, 3];

    this.gridMesh = {
      positionBuffer: createBuffer(gl, positions),
      indexBuffer: createIndexBuffer(gl, indices),
      indexCount: indices.length
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

    this.viewMatrix = [
      sx, 0, 0,
      0, -sy, 0,
      -offsetX * sx, offsetY * sy, 1
    ];
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

  buildLaneMesh(leftBoundary, rightBoundary, laneType = 'driving') {
    if (!leftBoundary || leftBoundary.length < 2) return null;
    if (!rightBoundary || rightBoundary.length < 2) rightBoundary = leftBoundary;

    const positions = [];
    const normals = [];
    const sides = [];
    const distances = [];
    const indices = [];

    const n = Math.min(leftBoundary.length, rightBoundary.length);

    for (let i = 0; i < n; i++) {
      const left = leftBoundary[i];
      const right = rightBoundary[i];

      const midX = (left.x + right.x) / 2;
      const midY = (left.y + right.y) / 2;
      const dirX = right.x - left.x;
      const dirY = right.y - left.y;
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      const nx = dirX / len;
      const ny = dirY / len;

      positions.push(left.x, left.y);
      positions.push(right.x, right.y);

      normals.push(-ny, nx);
      normals.push(-ny, nx);

      sides.push(-1, 1);

      const dist = i / (n - 1);
      distances.push(dist, dist);
    }

    for (let i = 0; i < n - 1; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }

    const { gl } = this;
    return {
      positionBuffer: createBuffer(gl, positions),
      normalBuffer: createBuffer(gl, normals),
      sideBuffer: createBuffer(gl, sides),
      distanceBuffer: createBuffer(gl, distances),
      indexBuffer: createIndexBuffer(gl, indices),
      indexCount: indices.length,
      vertexCount: positions.length / 2,
      laneType,
      colorIndex: this.laneMeshes.length % LANE_COLORS.length
    };
  }

  buildRefLineMesh(samples) {
    if (!samples || samples.length < 2) return null;

    const positions = [];
    const normals = [];
    const sides = [];
    const indices = [];

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const nx = -Math.sin(s.hdg);
      const ny = Math.cos(s.hdg);

      positions.push(s.x, s.y);
      positions.push(s.x, s.y);

      normals.push(nx, ny);
      normals.push(nx, ny);

      sides.push(-1, 1);
    }

    for (let i = 0; i < samples.length - 1; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }

    const { gl } = this;
    return {
      positionBuffer: createBuffer(gl, positions),
      normalBuffer: createBuffer(gl, normals),
      sideBuffer: createBuffer(gl, sides),
      indexBuffer: createIndexBuffer(gl, indices),
      indexCount: indices.length,
      vertexCount: positions.length / 2
    };
  }

  buildFillMesh(leftBoundary, rightBoundary, color) {
    if (!leftBoundary || leftBoundary.length < 2) return null;
    if (!rightBoundary || rightBoundary.length < 2) rightBoundary = leftBoundary;

    const positions = [];
    const indices = [];
    const n = Math.min(leftBoundary.length, rightBoundary.length);

    for (let i = 0; i < n; i++) {
      positions.push(leftBoundary[i].x, leftBoundary[i].y);
      positions.push(rightBoundary[i].x, rightBoundary[i].y);
    }

    for (let i = 0; i < n - 1; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }

    const { gl } = this;
    return {
      positionBuffer: createBuffer(gl, positions),
      indexBuffer: createIndexBuffer(gl, indices),
      indexCount: indices.length,
      vertexCount: positions.length / 2,
      color
    };
  }

  setMapData(roads, laneDataMap) {
    this.laneMeshes = [];
    this.refLineMeshes = [];
    this.fillMeshes = [];

    let totalVerts = 0;
    let totalTris = 0;
    let totalLanes = 0;

    for (const road of roads) {
      const roadLanes = laneDataMap[road.id];
      if (!roadLanes) continue;

      for (const lane of roadLanes) {
        const laneColor = LANE_COLORS[this.laneMeshes.length % LANE_COLORS.length];
        const fillColor = [...laneColor.slice(0, 3), 0.08];

        const fillMesh = this.buildFillMesh(lane.leftBoundary, lane.rightBoundary, fillColor);
        if (fillMesh) {
          this.fillMeshes.push(fillMesh);
          totalVerts += fillMesh.vertexCount;
          totalTris += fillMesh.indexCount / 3;
        }

        const laneMesh = this.buildLaneMesh(lane.leftBoundary, lane.rightBoundary, lane.laneType);
        if (laneMesh) {
          this.laneMeshes.push(laneMesh);
          totalVerts += laneMesh.vertexCount;
          totalTris += laneMesh.indexCount / 3;
          totalLanes++;
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

  render() {
    const { gl } = this;
    this.clear();

    this._renderGrid();
    this._renderFills();
    this._renderRefLines();
    this._renderLanes();
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

  dispose() {
    const { gl } = this;
    const deleteMesh = (m) => {
      if (!m) return;
      if (m.positionBuffer) gl.deleteBuffer(m.positionBuffer);
      if (m.normalBuffer) gl.deleteBuffer(m.normalBuffer);
      if (m.sideBuffer) gl.deleteBuffer(m.sideBuffer);
      if (m.distanceBuffer) gl.deleteBuffer(m.distanceBuffer);
      if (m.indexBuffer) gl.deleteBuffer(m.indexBuffer);
    };
    this.laneMeshes.forEach(deleteMesh);
    this.refLineMeshes.forEach(deleteMesh);
    this.fillMeshes.forEach(deleteMesh);
    deleteMesh(this.gridMesh);
    if (this.laneProgram) gl.deleteProgram(this.laneProgram);
    if (this.refLineProgram) gl.deleteProgram(this.refLineProgram);
    if (this.gridProgram) gl.deleteProgram(this.gridProgram);
    if (this.fillProgram) gl.deleteProgram(this.fillProgram);
  }
}
