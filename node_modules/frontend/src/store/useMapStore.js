import { create } from 'zustand';

export const useMapStore = create((set, get) => ({
  maps: [],
  selectedMap: null,
  roads: [],
  laneDataMap: {},
  sampledData: null,
  bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },

  setMaps: (maps) => set({ maps }),
  setSelectedMap: (selectedMap) => set({ selectedMap }),

  setMapData: (data) => {
    const { roads, laneDataMap, bounds, sampledData } = data;
    set({
      roads,
      laneDataMap,
      bounds,
      sampledData
    });
  },

  getLaneBoundary: (roadId, laneIndex) => {
    const { laneDataMap } = get();
    const roadLanes = laneDataMap[roadId];
    if (!roadLanes || !roadLanes[laneIndex]) return null;
    return roadLanes[laneIndex];
  }
}));
