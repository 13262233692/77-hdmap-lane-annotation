import { createStore } from 'zustand/vanilla';

export const mapStore = createStore((set) => ({
  maps: [],
  selectedMap: null,
  roads: [],
  laneDataMap: {},
  bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  sampledData: null,

  setMaps: (maps) => set({ maps }),
  setSelectedMap: (map) => set({ selectedMap: map }),
  setMapData: ({ roads, laneDataMap, bounds, sampledData }) => set({
    roads,
    laneDataMap,
    bounds,
    sampledData
  }),
  clearSelection: () => set({ selectedMap: null, roads: [], laneDataMap: {} })
}));

export const uiStore = createStore((set) => ({
  loading: false,
  stats: {
    fps: 0,
    vertexCount: 0,
    triangleCount: 0,
    laneCount: 0,
    cursorX: 0,
    cursorY: 0,
    zoom: 1
  },

  setLoading: (loading) => set({ loading }),
  setStats: (stats) => set((state) => ({ stats: { ...state.stats, ...stats } })),
  setCursor: (x, y) => set((state) => ({
    stats: { ...state.stats, cursorX: x, cursorY: y }
  })),
  setZoom: (zoom) => set((state) => ({
    stats: { ...state.stats, zoom }
  }))
}));

export const viewStore = createStore((set, get) => ({
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panStartOffsetX: 0,
  panStartOffsetY: 0,

  setView: (zoom, offsetX, offsetY) => set({ zoom, offsetX, offsetY }),
  startPanning: (screenX, screenY) => set({
    isPanning: true,
    panStartX: screenX,
    panStartY: screenY,
    panStartOffsetX: get().offsetX,
    panStartOffsetY: get().offsetY
  }),
  updatePan: (screenX, screenY) => {
    const { panStartX, panStartY, panStartOffsetX, panStartOffsetY, zoom } = get();
    const dx = (screenX - panStartX) / zoom;
    const dy = (screenY - panStartY) / zoom;
    set({
      offsetX: panStartOffsetX - dx,
      offsetY: panStartOffsetY + dy
    });
  },
  endPanning: () => set({ isPanning: false }),
  zoomAt: (screenX, screenY, delta) => {
    const { zoom, offsetX, offsetY } = get();
    const newZoom = Math.max(0.1, Math.min(100, zoom * delta));

    const worldX = screenX / zoom + offsetX;
    const worldY = -screenY / zoom + offsetY;

    const newOffsetX = worldX - screenX / newZoom;
    const newOffsetY = worldY + screenY / newZoom;

    set({ zoom: newZoom, offsetX: newOffsetX, offsetY: newOffsetY });
    return newZoom;
  }
}));

export const editorStore = createStore((set) => ({
  selectedControlPoint: null,
  hoveredControlPoint: null,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,

  selectControlPoint: (point) => set({ selectedControlPoint: point }),
  hoverControlPoint: (point) => set({ hoveredControlPoint: point }),
  startDragging: (x, y) => set({ isDragging: true, dragStartX: x, dragStartY: y }),
  updateDragPosition: (x, y) => set({ dragStartX: x, dragStartY: y }),
  endDragging: () => set({ isDragging: false }),
  clearSelection: () => set({
    selectedControlPoint: null,
    hoveredControlPoint: null,
    isDragging: false
  })
}));

