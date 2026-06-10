import React, { memo } from 'react';
import { useUIStore } from '../store';

const HUD = memo(function HUD() {
  const stats = useUIStore((state) => state.stats);

  return (
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
  );
});

export default HUD;
