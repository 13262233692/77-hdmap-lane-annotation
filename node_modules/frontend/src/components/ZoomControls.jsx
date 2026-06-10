import React, { memo, useCallback, useRef } from 'react';
import { useViewStore, useMapStore, useUIStore, useEditorStore } from '../store';

const ZoomControls = memo(function ZoomControls() {
  const zoom = useViewStore((state) => state.zoom);
  const offsetX = useViewStore((state) => state.offsetX);
  const offsetY = useViewStore((state) => state.offsetY);
  const setView = useViewStore((state) => state.setView);
  const setZoom = useUIStore((state) => state.setZoom);

  const roads = useMapStore((state) => state.roads);
  const clearEditorSelection = useEditorStore((state) => state.clearSelection);

  const canvasRef = useRef(document.querySelector('canvas'));

  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(100, zoom * 1.3);
    setView(newZoom, offsetX, offsetY);
    setZoom(newZoom);
  }, [zoom, offsetX, offsetY, setView, setZoom]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(0.1, zoom / 1.3);
    setView(newZoom, offsetX, offsetY);
    setZoom(newZoom);
  }, [zoom, offsetX, offsetY, setView, setZoom]);

  const handleResetView = useCallback(() => {
    if (!roads.length) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const road of roads) {
      for (const geom of road.geometries) {
        if (geom.x < minX) minX = geom.x;
        if (geom.x > maxX) maxX = geom.x;
        if (geom.y < minY) minY = geom.y;
        if (geom.y > maxY) maxY = geom.y;
        const endX = geom.x + geom.length * Math.cos(geom.hdg);
        const endY = geom.y + geom.length * Math.sin(geom.hdg);
        if (endX < minX) minX = endX;
        if (endX > maxX) maxX = endX;
      }
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const rangeX = maxX - minX || 100;
    const rangeY = maxY - minY || 100;

    const canvas = document.querySelector('canvas');
    if (canvas) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const aspect = w / h;
      const baseZoom = Math.min(w / (rangeX * 1.4), (h * aspect) / (rangeY * 1.4));
      setView(baseZoom, centerX, centerY);
      setZoom(baseZoom);
    }
  }, [roads, setView, setZoom]);

  const handleClearSelection = useCallback(() => {
    clearEditorSelection();
  }, [clearEditorSelection]);

  return (
    <div className="zoom-controls">
      <button className="zoom-btn" onClick={handleZoomIn} title="放大">+</button>
      <button className="zoom-btn" onClick={handleZoomOut} title="缩小">−</button>
      <button className="zoom-btn" onClick={handleResetView} title="重置视图" style={{ fontSize: 12 }}>⌂</button>
      <button className="zoom-btn" onClick={handleClearSelection} title="取消选中" style={{ fontSize: 10 }}>✕</button>
    </div>
  );
});

export default ZoomControls;
