import React, { useEffect, useRef, useCallback } from 'react';
import { WebGLRenderer } from './gl/WebGLRenderer.js';
import { adaptiveSampleRoad, buildLaneBoundarySamples } from './math/adaptiveSampling.js';
import { listMaps, sampleAllRoads, parseMap } from './services/api.js';
import { useMapStore, useUIStore, useViewStore, useEditorStore } from './store';
import Sidebar from './components/Sidebar.jsx';
import HUD from './components/HUD.jsx';
import ZoomControls from './components/ZoomControls.jsx';
import PerformanceMonitor from './components/PerformanceMonitor.jsx';

export default function App() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const animationIdRef = useRef(null);

  const selectedMap = useMapStore((state) => state.selectedMap);
  const setMaps = useMapStore((state) => state.setMaps);
  const setMapData = useMapStore((state) => state.setMapData);
  const roads = useMapStore((state) => state.roads);

  const laneDataMapRef = useRef({});

  const setLoading = useUIStore((state) => state.setLoading);
  const setStats = useUIStore((state) => state.setStats);
  const setCursor = useUIStore((state) => state.setCursor);
  const setZoom = useUIStore((state) => state.setZoom);
  const loading = useUIStore((state) => state.loading);

  const isPanning = useViewStore((state) => state.isPanning);
  const zoom = useViewStore((state) => state.zoom);
  const offsetX = useViewStore((state) => state.offsetX);
  const offsetY = useViewStore((state) => state.offsetY);
  const startPanning = useViewStore((state) => state.startPanning);
  const updatePan = useViewStore((state) => state.updatePan);
  const endPanning = useViewStore((state) => state.endPanning);
  const zoomAt = useViewStore((state) => state.zoomAt);
  const setView = useViewStore((state) => state.setView);

  const selectedControlPoint = useEditorStore((state) => state.selectedControlPoint);
  const isDragging = useEditorStore((state) => state.isDragging);
  const selectControlPoint = useEditorStore((state) => state.selectControlPoint);
  const startDragging = useEditorStore((state) => state.startDragging);
  const updateDragPosition = useEditorStore((state) => state.updateDragPosition);
  const endDragging = useEditorStore((state) => state.endDragging);
  const clearSelection = useEditorStore((state) => state.clearSelection);

  const controlPointDataRef = useRef({
    controlPoints: [],
    pointToLaneMap: []
  });

  useEffect(() => {
    listMaps().then(setMaps).catch(console.error);
  }, [setMaps]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        clearSelection();
        updateControlPointsDisplay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  const updateControlPointsDisplay = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const { controlPoints, pointToLaneMap } = controlPointDataRef.current;
    const selectedIdx = selectedControlPoint?.globalIndex ?? -1;

    const colors = controlPoints.map((_, i) => {
      if (i === selectedIdx) {
        return [1.0, 0.4, 0.4, 1.0];
      }
      return [0.0, 0.9, 1.0, 0.85];
    });

    renderer.updateControlPoints(controlPoints, colors);
  }, [selectedControlPoint]);

  useEffect(() => {
    updateControlPointsDisplay();
  }, [selectedControlPoint, updateControlPointsDisplay]);

  useEffect(() => {
    if (!canvasRef.current) return;

    let renderer;
    try {
      renderer = new WebGLRenderer(canvasRef.current);
      rendererRef.current = renderer;
      window.__renderer = renderer;
    } catch (e) {
      console.error('Failed to initialize WebGL:', e);
      return;
    }

    const handleResize = () => {
      renderer.resize();
      renderer.setView(zoom, offsetX, offsetY);
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const animate = () => {
      renderer.render();
      animationIdRef.current = requestAnimationFrame(animate);

      if (renderer._perfCounter.frames % 30 === 0) {
        const fps = renderer.getFPS();
        setStats({ fps });
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animationIdRef.current);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setView(zoom, offsetX, offsetY);
  }, [zoom, offsetX, offsetY]);

  const generateControlPoints = useCallback((laneDataMap) => {
    const controlPoints = [];
    const pointToLaneMap = [];
    let globalIndex = 0;

    const roadIds = Object.keys(laneDataMap);
    for (const roadId of roadIds) {
      const roadLanes = laneDataMap[roadId];
      for (let laneIdx = 0; laneIdx < roadLanes.length; laneIdx++) {
        const lane = roadLanes[laneIdx];

        const step = Math.max(1, Math.floor(lane.leftBoundary.length / 30));
        for (let i = 0; i < lane.leftBoundary.length; i += step) {
          const point = lane.leftBoundary[i];
          controlPoints.push({
            x: point.x,
            y: point.y,
            s: point.s,
            roadId,
            laneIdx,
            boundaryType: 'left',
            pointIndex: i,
            globalIndex
          });
          pointToLaneMap.push({ roadId, laneIdx, boundaryType: 'left', pointIndex: i });
          globalIndex++;

          if (i < lane.rightBoundary.length) {
            const rPoint = lane.rightBoundary[i];
            controlPoints.push({
              x: rPoint.x,
              y: rPoint.y,
              s: rPoint.s,
              roadId,
              laneIdx,
              boundaryType: 'right',
              pointIndex: i,
              globalIndex
            });
            pointToLaneMap.push({ roadId, laneIdx, boundaryType: 'right', pointIndex: i });
            globalIndex++;
          }
        }
      }
    }

    return { controlPoints, pointToLaneMap };
  }, []);

  useEffect(() => {
    if (!selectedMap || !rendererRef.current) return;

    const load = async () => {
      setLoading(true);
      try {
        const parsed = await parseMap(selectedMap.name);
        const sampled = await sampleAllRoads(selectedMap.name);

        const laneDataMap = {};
        let totalLanes = 0;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        for (let i = 0; i < parsed.roads.length; i++) {
          const road = parsed.roads[i];
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

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const rangeX = maxX - minX;
        const rangeY = maxY - minY;
        const canvas = canvasRef.current;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const aspect = w / h;
        const baseZoom = Math.min(w / (rangeX * 1.4), (h * aspect) / (rangeY * 1.4));

        setMapData({
          roads: parsed.roads,
          laneDataMap,
          bounds: { minX, maxX, minY, maxY },
          sampledData: sampled
        });

        laneDataMapRef.current = laneDataMap;

        setView(baseZoom, centerX, centerY);

        rendererRef.current.setMapData(parsed.roads, laneDataMap);

        const cpData = generateControlPoints(laneDataMap);
        controlPointDataRef.current = cpData;

        const colors = cpData.controlPoints.map(() => [0.0, 0.9, 1.0, 0.85]);
        rendererRef.current.updateControlPoints(cpData.controlPoints, colors);

        setStats({
          roads: parsed.roads.length,
          lanes: totalLanes,
          vertices: rendererRef.current.stats.vertexCount,
          triangles: rendererRef.current.stats.triangleCount,
          zoom: baseZoom
        });

        clearSelection();
      } catch (e) {
        console.error('Load failed:', e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [selectedMap, setLoading, setMapData, setView, setStats, generateControlPoints, clearSelection]);

  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const renderer = rendererRef.current;
    if (!renderer) return;

    const hit = renderer.hitTestControlPoints(sx, sy, 10);
    if (hit) {
      const { controlPoints, pointToLaneMap } = controlPointDataRef.current;
      const pointData = { ...controlPoints[hit.index], globalIndex: hit.index };
      selectControlPoint(pointData);
      startDragging(e.clientX, e.clientY);
      renderer.updateSingleControlPoint(hit.index, hit.point.x, hit.point.y);
      return;
    }

    clearSelection();
    updateControlPointsDisplay();
    startPanning(e.clientX, e.clientY);
  }, [selectControlPoint, startDragging, clearSelection, startPanning, updateControlPointsDisplay]);

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const renderer = rendererRef.current;
    if (!renderer) return;

    const world = renderer.screenToWorld(sx, sy);
    setCursor(world.x, world.y);

    if (isDragging && selectedControlPoint) {
      const newPoint = updateDragPosition(world.x, world.y);
      if (newPoint) {
        const { laneIdx, boundaryType, pointIndex, globalIndex } = selectedControlPoint;

        controlPointDataRef.current.controlPoints[globalIndex].x = world.x;
        controlPointDataRef.current.controlPoints[globalIndex].y = world.y;

        renderer.updateLaneBoundaryPoint(laneIdx, boundaryType, pointIndex, world.x, world.y);
        renderer.updateFillMeshPoint(laneIdx, boundaryType, pointIndex, world.x, world.y);
        renderer.updateSingleControlPoint(globalIndex, world.x, world.y);

        const roadId = selectedControlPoint.roadId;
        const laneMap = laneDataMapRef.current;
        if (laneMap[roadId] && laneMap[roadId][laneIdx]) {
          const boundary = boundaryType === 'left'
            ? laneMap[roadId][laneIdx].leftBoundary
            : laneMap[roadId][laneIdx].rightBoundary;
          if (boundary[pointIndex]) {
            boundary[pointIndex].x = world.x;
            boundary[pointIndex].y = world.y;
          }
        }
      }
      return;
    }

    if (isPanning) {
      const w = canvasRef.current.clientWidth;
      const h = canvasRef.current.clientHeight;
      const result = updatePan(e.clientX, e.clientY, w, h);
      if (result) {
        setZoom(zoom);
      }
    }
  }, [isDragging, isPanning, selectedControlPoint, zoom, updateDragPosition, updatePan, setCursor, setZoom]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      endDragging();
    }
    if (isPanning) {
      endPanning();
    }
  }, [isDragging, isPanning, endDragging, endPanning]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const w = canvasRef.current.clientWidth;
    const h = canvasRef.current.clientHeight;

    const result = zoomAt(sx, sy, delta, w, h);
    if (result) {
      setZoom(result.zoom);
    }
  }, [zoomAt, setZoom]);

  return (
    <div className="app">
      <Sidebar />
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{
            cursor: isDragging ? 'grabbing' : (selectedControlPoint ? 'pointer' : 'grab'),
            width: '100%',
            height: '100%'
          }}
        />
        <HUD />
        <PerformanceMonitor />
        <ZoomControls />
        {loading && <div className="loading">正在加载地图数据...</div>}
        {!selectedMap && !loading && (
          <div className="empty-state">
            <h3>请选择地图文件</h3>
            <p>从左侧列表选择一个 .xodr 文件开始标注</p>
            <p style={{ marginTop: 10, fontSize: 11, opacity: 0.6 }}>
              鼠标拖拽平移 · 滚轮缩放 · 点击控制点选中编辑
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
