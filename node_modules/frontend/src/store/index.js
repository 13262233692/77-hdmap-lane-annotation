import { useState, useEffect } from 'react';
import { mapStore, uiStore, viewStore, editorStore } from './useVanillaStore.js';

export { mapStore, uiStore, viewStore, editorStore };

export function useStore(store, selector) {
  const [value, setValue] = useState(() => selector(store.getState()));

  useEffect(() => {
    const unsubscribe = store.subscribe((state, prevState) => {
      const newValue = selector(state);
      const prevValue = selector(prevState);
      if (newValue !== prevValue) {
        setValue(newValue);
      }
    });
    return unsubscribe;
  }, [store, selector]);

  return value;
}

export function useMapStore(selector) {
  return useStore(mapStore, selector);
}

export function useUIStore(selector) {
  return useStore(uiStore, selector);
}

export function useViewStore(selector) {
  return useStore(viewStore, selector);
}

export function useEditorStore(selector) {
  return useStore(editorStore, selector);
}
