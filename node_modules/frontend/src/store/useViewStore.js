import { create } from 'zustand';

export const useViewStore = create((set, get) => ({
  zoom: 5,
  offsetX: 100,
  offsetY: 50,
  isPanning: false,
  lastPanX: 0,
  lastPanY: 0,

  setView: (zoom, offsetX, offsetY) => set({ zoom, offsetX, offsetY }),

  setZoom: (zoom) => set({ zoom }),

  startPanning: (screenX, screenY) => set({
    isPanning: true,
    lastPanX: screenX,
    lastPanY: screenY
  }),

  updatePan: (screenX, screenY, canvasWidth, canvasHeight) => {
    const { isPanning, zoom, offsetX, offsetY } = get();
    if (!isPanning) return;

    const aspect = canvasWidth / canvasHeight;
    const dx = screenX - get().lastPanX;
    const dy = screenY - get().lastPanY;

    const newOffsetX = offsetX - dx / zoom;
    const newOffsetY = offsetY + dy / (zoom * aspect);

    set({
      offsetX: newOffsetX,
      offsetY: newOffsetY,
      lastPanX: screenX,
      lastPanY: screenY
    });

    return { offsetX: newOffsetX, offsetY: newOffsetY };
  },

  endPanning: () => set({
    isPanning: false,
    lastPanX: 0,
    lastPanY: 0
  }),

  zoomAt: (screenX, screenY, delta, canvasWidth, canvasHeight) => {
    const { zoom, offsetX, offsetY } = get();
    const newZoom = Math.max(0.1, Math.min(100, zoom * delta));

    const aspect = canvasWidth / canvasHeight;
    const worldX = (screenX / canvasWidth - 0.5) * (canvasWidth / zoom) + offsetX;
    const worldY = (0.5 - screenY / canvasHeight) * (canvasHeight / (zoom * aspect)) + offsetY;

    const newOffsetX = worldX - (screenX / canvasWidth - 0.5) * (canvasWidth / newZoom);
    const newOffsetY = worldY - (0.5 - screenY / canvasHeight) * (canvasHeight / (newZoom * aspect));

    set({
      zoom: newZoom,
      offsetX: newOffsetX,
      offsetY: newOffsetY
    });

    return { zoom: newZoom, offsetX: newOffsetX, offsetY: newOffsetY };
  }
}));
