import { create } from 'zustand';

export const useEditorStore = create((set, get) => ({
  isEditing: false,
  selectedControlPoint: null,
  isDragging: false,
  dragStartPos: null,
  hoveredControlPoint: null,
  editMode: 'select',

  controlPointSize: 6,

  setEditMode: (editMode) => set({ editMode }),

  setIsEditing: (isEditing) => set({ isEditing }),

  selectControlPoint: (selection) => {
    if (!selection) {
      set({ selectedControlPoint: null, isDragging: false });
      return;
    }
    set({
      selectedControlPoint: { ...selection },
      isDragging: false
    });
  },

  startDragging: (screenX, screenY) => {
    const { selectedControlPoint } = get();
    if (!selectedControlPoint) return;
    set({
      isDragging: true,
      dragStartPos: { x: screenX, y: screenY }
    });
  },

  updateDragPosition: (worldX, worldY) => {
    const { selectedControlPoint, isDragging } = get();
    if (!isDragging || !selectedControlPoint) return null;

    return {
      ...selectedControlPoint,
      x: worldX,
      y: worldY
    };
  },

  endDragging: () => {
    set({
      isDragging: false,
      dragStartPos: null
    });
  },

  clearSelection: () => {
    set({
      selectedControlPoint: null,
      isDragging: false,
      hoveredControlPoint: null
    });
  },

  setHoveredControlPoint: (point) => set({ hoveredControlPoint: point })
}));
