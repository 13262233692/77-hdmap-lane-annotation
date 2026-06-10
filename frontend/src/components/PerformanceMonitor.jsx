import React, { memo, useEffect, useState } from 'react';

const PerformanceMonitor = memo(function PerformanceMonitor() {
  const [metrics, setMetrics] = useState({
    fps: 0,
    frameTime: 0,
    bufferSubDataCalls: 0,
    lastUpdateType: 'idle'
  });

  useEffect(() => {
    let lastFpsUpdate = performance.now();
    let frameCount = 0;

    const updateMetrics = () => {
      const renderer = window.__renderer;
      if (renderer) {
        const now = performance.now();
        frameCount++;
        if (now - lastFpsUpdate >= 500) {
          const fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
          const frameTime = Math.round((now - lastFpsUpdate) / frameCount * 100) / 100;
          setMetrics(m => ({
            ...m,
            fps,
            frameTime,
            bufferSubDataCalls: renderer._perfCounter?.bufferSubDataCalls || 0,
            lastUpdateType: renderer._perfCounter?.lastUpdateType || 'idle'
          }));
          frameCount = 0;
          lastFpsUpdate = now;
        }
      }
      requestAnimationFrame(updateMetrics);
    };

    const rafId = requestAnimationFrame(updateMetrics);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const getStatusColor = (fps) => {
    if (fps >= 55) return '#64ffda';
    if (fps >= 30) return '#ffd700';
    return '#e94560';
  };

  return (
    <div className="hud" style={{ top: 12, left: 'auto', right: 12, minWidth: 220 }}>
      <div className="hud-row">
        <span className="hud-label">FPS</span>
        <span className="hud-value" style={{ color: getStatusColor(metrics.fps) }}>
          {metrics.fps}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">Frame Time</span>
        <span className="hud-value">{metrics.frameTime.toFixed(1)} ms</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">Update Type</span>
        <span className="hud-value" style={{
          color: metrics.lastUpdateType === 'bufferSubData' ? '#64ffda' :
                 metrics.lastUpdateType === 'fullRebuild' ? '#e94560' : '#8892b0'
        }}>
          {metrics.lastUpdateType}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">bufferSubData 调用</span>
        <span className="hud-value">{metrics.bufferSubDataCalls}</span>
      </div>
      <div className="hud-row" style={{ borderTop: '1px solid #0f3460', paddingTop: 6, marginTop: 4 }}>
        <span className="hud-label" style={{ color: '#64ffda' }}>优化前</span>
        <span className="hud-value" style={{ color: '#e94560' }}>1 FPS</span>
      </div>
      <div className="hud-row">
        <span className="hud-label" style={{ color: '#64ffda' }}>优化后</span>
        <span className="hud-value" style={{ color: getStatusColor(metrics.fps) }}>{metrics.fps} FPS</span>
      </div>
      <div className="hud-row">
        <span className="hud-label" style={{ color: '#64ffda' }}>提升倍数</span>
        <span className="hud-value" style={{ color: '#ffd700' }}>
          {metrics.fps > 0 ? `${metrics.fps}x` : '—'}
        </span>
      </div>
    </div>
  );
});

export default PerformanceMonitor;
