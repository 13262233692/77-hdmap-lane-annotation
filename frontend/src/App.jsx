import React, { useEffect, useRef, useState, useCallback } from 'react';
import { WebGLRenderer } from './gl/WebGLRenderer.js';
import { adaptiveSampleRoad, buildLaneBoundarySamples } from './math/adaptiveSampling.js';
import { listMaps, sampleAllRoads, parseMap, uploadMap } from './services/api.js';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function App() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const containerRef = useRef(null);

  const [maps, setMaps] = useState([]);
  const [selectedMap, setSelectedMap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    roads: 0,
    lanes: 0,
    vertices: 0,
    triangles: 0,
    zoom: 1,
    cursorX: 0,
    cursorY: 0
  });

  const viewRef = useRef({
    zoom: 5,
    offsetX: 100,
    offsetY: 50,
    isDragging: false,
    lastX: 0,
    lastY: 0
  });

  const roadDataRef = useRef({ roads: [], laneDataMap: {} });

  useEffect(() => {
    listMaps().then(setMaps).catch(console.error);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    let renderer;
    try {
      renderer = new WebGLRenderer(canvasRef.current);
      rendererRef.current = renderer;
    } catch (e) {
      console.error('Failed to initialize WebGL:', e);
      return;
    }

    const handleResize = () => {
      renderer.resize();
      renderer.setView(viewRef.current.zoom, viewRef.current.offsetX, viewRef.current.offsetY);
      renderer.render();
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    let rafId;
    const animate = () => {
      renderer.render();
      rafId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!selectedMap || !rendererRef.current) return;

    const load = async () => {
      setLoading(true);
      try {
        const parsed = await parseMap(selectedMap.name);
        const sampled = await sampleAllRoads(selectedMap.name);

        const roadDataMap = {};
        const laneDataMap = {};
        let totalLanes = 0;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        for (let i = 0; i < parsed.roads.length; i++) {
          const road = parsed.roads[i];
          const sampledRoad = sampled.roads[i];
          roadDataMap[road.id] = road;

          const samples = adaptiveSampleRoad(road);
          const laneBoundaries = [];

          for (const section of road.laneSections) {
            const allLanes = [];
            for (const l of section.left) allLanes.push(l);
            if (section.center) allLanes.push(section.center);
            for (const l of section.right) allLanes.push(l);

            for (const lane of allLanes) {
              if (lane.type === 'none') continue;
              const boundaries = buildLaneBoundarySamples(road, lane, section, samples);
              if (boundaries.leftBoundary.length > 0) {
                laneBoundaries.push({
                  laneId: lane.id,
                  laneType: lane.type,
                  side: lane.side,
                  leftBoundary: boundaries.leftBoundary,
                  rightBoundary: boundaries.rightBoundary,
                  refLinePoints: samples
                });
                totalLanes++;

                for (const pt of boundaries.leftBoundary) {
                  if (pt.x < minX) minX = pt.x;
                  if (pt.x > maxX) maxX = pt.x;
                  if (pt.y < minY) minY = pt.y;
                  if (pt.y > maxY) maxY = pt.y;
                }
              }
            }
          }

          laneDataMap[road.id] = laneBoundaries;
        }

        roadDataRef.current = { roads: parsed.roads, laneDataMap };

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const rangeX = maxX - minX;
        const rangeY = maxY - minY;
        const canvas = canvasRef.current;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const aspect = w / h;
        const baseZoom = Math.min(w / (rangeX * 1.4), (h * aspect) / (rangeY * 1.4));

        viewRef.current = {
          zoom: baseZoom,
          offsetX: centerX,
          offsetY: centerY,
          isDragging: false,
          lastX: 0,
          lastY: 0
        };

        rendererRef.current.setView(baseZoom, centerX, centerY);
        rendererRef.current.setMapData(parsed.roads, laneDataMap);

        setStats(s => ({
          ...s,
          roads: parsed.roads.length,
          lanes: totalLanes,
          vertices: rendererRef.current.stats.vertexCount,
          triangles: rendererRef.current.stats.triangleCount,
          zoom: baseZoom
        }));
      } catch (e) {
        console.error('Load failed:', e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [selectedMap]);

  const handleMouseDown = useCallback((e) => {
    viewRef.current.isDragging = true;
    viewRef.current.lastX = e.clientX;
    viewRef.current.lastY = e.clientY;
  }, []);

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (rendererRef.current) {
      const world = rendererRef.current.screenToWorld(sx, sy);
      setStats(s => ({ ...s, cursorX: world.x, cursorY: world.y }));
    }

    if (!viewRef.current.isDragging) return;

    const dx = e.clientX - viewRef.current.lastX;
    const dy = e.clientY - viewRef.current.lastY;
    viewRef.current.lastX = e.clientX;
    viewRef.current.lastY = e.clientY;

    const w = canvasRef.current.clientWidth;
    const h = canvasRef.current.clientHeight;
    const aspect = w / h;

    viewRef.current.offsetX -= dx / viewRef.current.zoom;
    viewRef.current.offsetY += dy / (viewRef.current.zoom * aspect);

    if (rendererRef.current) {
      rendererRef.current.setView(viewRef.current.zoom, viewRef.current.offsetX, viewRef.current.offsetY);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    viewRef.current.isDragging = false;
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(100, viewRef.current.zoom * delta));
    viewRef.current.zoom = newZoom;

    if (rendererRef.current) {
      rendererRef.current.setView(newZoom, viewRef.current.offsetX, viewRef.current.offsetY);
    }
    setStats(s => ({ ...s, zoom: newZoom }));
  }, []);

  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(100, viewRef.current.zoom * 1.3);
    viewRef.current.zoom = newZoom;
    if (rendererRef.current) {
      rendererRef.current.setView(newZoom, viewRef.current.offsetX, viewRef.current.offsetY);
    }
    setStats(s => ({ ...s, zoom: newZoom }));
  }, []);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(0.1, viewRef.current.zoom / 1.3);
    viewRef.current.zoom = newZoom;
    if (rendererRef.current) {
      rendererRef.current.setView(newZoom, viewRef.current.offsetX, viewRef.current.offsetY);
    }
    setStats(s => ({ ...s, zoom: newZoom }));
  }, []);

  const handleResetView = useCallback(() => {
    if (!roadDataRef.current.roads.length || !rendererRef.current) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const road of roadDataRef.current.roads) {
      for (const geom of road.geometries) {
        if (geom.x < minX) minX = geom.x;
        if (geom.x > maxX) maxX = geom.x;
        if (geom.y < minY) minY = geom.y;
        if (geom.y > maxY) maxY = geom.y;
        if (geom.x + geom.length * Math.cos(geom.hdg) < minX) minX = geom.x + geom.length * Math.cos(geom.hdg);
        if (geom.x + geom.length * Math.cos(geom.hdg) > maxX) maxX = geom.x + geom.length * Math.cos(geom.hdg);
      }
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const rangeX = maxX - minX || 100;
    const rangeY = maxY - minY || 100;
    const canvas = canvasRef.current;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const aspect = w / h;
    const baseZoom = Math.min(w / (rangeX * 1.4), (h * aspect) / (rangeY * 1.4));

    viewRef.current = {
      ...viewRef.current,
      zoom: baseZoom,
      offsetX: centerX,
      offsetY: centerY
    };
    rendererRef.current.setView(baseZoom, centerX, centerY);
    setStats(s => ({ ...s, zoom: baseZoom }));
  }, []);

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadMap(file);
      const updated = await listMaps();
      setMaps(updated);
    } catch (err) {
      console.error('Upload failed:', err);
    }
  }, []);

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>HDMap Lane Annotation</h1>
          <p>高精车道矢量标注平台</p>
        </div>

        <div className="sidebar-section">
          <h2>地图文件</h2>
          <label className="upload-btn" style={{ display: 'block', marginBottom: 10, textAlign: 'center' }}>
            + 上传 .xodr 文件
            <input type="file" accept=".xodr,.xml" onChange={handleFileUpload} />
          </label>
          <ul className="map-list">
            {maps.map(m => (
              <li
                key={m.name}
                className={selectedMap?.name === m.name ? 'active' : ''}
                onClick={() => setSelectedMap(m)}
              >
                <span>{m.name}</span>
                <span className="size">{formatSize(m.size)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-section">
          <h2>统计信息</h2>
          <div className="stats-row">
            <span className="label">道路数</span>
            <span className="value">{stats.roads}</span>
          </div>
          <div className="stats-row">
            <span className="label">车道数</span>
            <span className="value">{stats.lanes}</span>
          </div>
          <div className="stats-row">
            <span className="label">顶点数</span>
            <span className="value">{stats.vertices.toLocaleString()}</span>
          </div>
          <div className="stats-row">
            <span className="label">三角面</span>
            <span className="value">{stats.triangles.toLocaleString()}</span>
          </div>
        </div>

        <div className="sidebar-section">
          <h2>图例</h2>
          <div className="legend-item">
            <span className="legend-color" style={{ background: 'rgba(255,204,51,0.9)' }} />
            <span>车道线 (抗锯齿渲染)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: 'rgba(204,51,51,0.6)' }} />
            <span>参考线 (Reference Line)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: 'rgba(80,120,160,0.5)' }} />
            <span>网格背景</span>
          </div>
        </div>
      </div>

      <div className="canvas-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ cursor: 'grab', width: '100%', height: '100%' }}
        />

        <div className="hud">
          <div className="hud-row">
            <span className="hud-label">缩放</span>
            <span className="hud-value">{stats.zoom.toFixed(2)}x</span>
          </div>
          <div className="hud-row">
            <span className="hud-label">X 坐标</span>
            <span className="hud-value">{stats.cursorX.toFixed(3)}</span>
          </div>
          <div className="hud-row">
            <span className="hud-label">Y 坐标</span>
            <span className="hud-value">{stats.cursorY.toFixed(3)}</span>
          </div>
        </div>

        <div className="zoom-controls">
          <button className="zoom-btn" onClick={handleZoomIn} title="放大">+</button>
          <button className="zoom-btn" onClick={handleZoomOut} title="缩小">−</button>
          <button className="zoom-btn" onClick={handleResetView} title="重置视图" style={{ fontSize: 12 }}>⌂</button>
        </div>

        {loading && <div className="loading">正在加载地图数据...</div>}
        {!selectedMap && !loading && (
          <div className="empty-state">
            <h3>请选择地图文件</h3>
            <p>从左侧列表选择一个 .xodr 文件开始标注</p>
            <p style={{ marginTop: 10, fontSize: 11, opacity: 0.6 }}>
              鼠标拖拽平移 · 滚轮缩放
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
