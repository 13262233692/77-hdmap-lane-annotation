import { create } from 'zustand';

export const useUIStore = create((set) => ({
  loading: false,
  stats: {
    roads: 0,
    lanes: 0,
    vertices: 0,
    triangles: 0,
    zoom: 1,
    cursorX: 0,
    cursorY: 0,
    fps: 60
  },

  setLoading: (loading) => set({ loading }),

  setStats: (stats) => set((state) => ({
    stats: { ...state.stats, ...stats }
  })),

  setCursor: (cursorX, cursorY) => set((state) => ({
    stats: { ...state.stats, cursorX, cursorY }
  })),

  setZoom: (zoom) => set((state) => ({
    stats: { ...state.stats, zoom }
  }))
}));
