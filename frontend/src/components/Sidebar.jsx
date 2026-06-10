import React, { memo, useCallback } from 'react';
import { useMapStore, useUIStore } from '../store';
import { listMaps, uploadMap } from '../services/api.js';

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const Sidebar = memo(function Sidebar() {
  const maps = useMapStore((state) => state.maps);
  const selectedMap = useMapStore((state) => state.selectedMap);
  const setSelectedMap = useMapStore((state) => state.setSelectedMap);
  const setMaps = useMapStore((state) => state.setMaps);

  const stats = useUIStore((state) => state.stats);

  const handleSelectMap = useCallback((m) => {
    setSelectedMap(m);
  }, [setSelectedMap]);

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
  }, [setMaps]);

  return (
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
              onClick={() => handleSelectMap(m)}
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
        <div className="stats-row">
          <span className="label">FPS</span>
          <span className="value" style={{ color: stats.fps < 30 ? '#e94560' : '#64ffda' }}>
            {stats.fps.toFixed(0)}
          </span>
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
          <span className="legend-color" style={{ background: 'rgba(0,150,255,0.9)' }} />
          <span>控制点 (可编辑)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: 'rgba(80,120,160,0.5)' }} />
          <span>网格背景</span>
        </div>
      </div>

      <div className="sidebar-section">
        <h2>操作说明</h2>
        <div className="legend-item" style={{ fontSize: 11 }}>
          <span>• 拖拽空白处平移视图</span>
        </div>
        <div className="legend-item" style={{ fontSize: 11 }}>
          <span>• 滚轮缩放视图</span>
        </div>
        <div className="legend-item" style={{ fontSize: 11 }}>
          <span>• 点击控制点选中</span>
        </div>
        <div className="legend-item" style={{ fontSize: 11 }}>
          <span>• 拖拽控制点微调</span>
        </div>
        <div className="legend-item" style={{ fontSize: 11 }}>
          <span>• 按 ESC 取消选中</span>
        </div>
      </div>
    </div>
  );
});

export default Sidebar;
