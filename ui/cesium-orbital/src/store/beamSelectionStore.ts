import { useState, useEffect } from 'react';

type BeamSelectionListener = (state: BeamSelectionState) => void;

// All available views in the application
export type ViewType = 'map' | 'dashboard' | '3d' | 'graph' | 'data';

interface BeamSelectionState {
  selectedBeamId: string | null;
  highlightedBeamId: string | null;
  currentView: ViewType;
}

class BeamSelectionStore {
  private state: BeamSelectionState = {
    selectedBeamId: null,
    highlightedBeamId: null,
    currentView: '3d',
  };

  private listeners: Set<BeamSelectionListener> = new Set();

  getState(): BeamSelectionState {
    return this.state;
  }

  setState(partial: Partial<BeamSelectionState>) {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  subscribe(listener: BeamSelectionListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach(listener => listener(this.state));
  }

  setSelectedBeam(beamId: string | null) {
    this.setState({ selectedBeamId: beamId });
  }

  setHighlightedBeam(beamId: string | null) {
    this.setState({ highlightedBeamId: beamId });
  }

  setCurrentView(view: ViewType) {
    this.setState({ currentView: view });
  }

  selectBeamAndNavigate(beamId: string, targetView: ViewType) {
    this.setState({
      selectedBeamId: beamId,
      currentView: targetView
    });
  }
}

export const beamSelectionStore = new BeamSelectionStore();

export function useBeamSelectionStore(): BeamSelectionState & {
  setSelectedBeam: (beamId: string | null) => void;
  setHighlightedBeam: (beamId: string | null) => void;
  setCurrentView: (view: ViewType) => void;
  selectBeamAndNavigate: (beamId: string, targetView: ViewType) => void;
} {
  const [state, setState] = useState(beamSelectionStore.getState());

  useEffect(() => {
    const unsubscribe = beamSelectionStore.subscribe(setState);
    return () => {
      unsubscribe();
    };
  }, []);

  return {
    ...state,
    setSelectedBeam: (beamId) => beamSelectionStore.setSelectedBeam(beamId),
    setHighlightedBeam: (beamId) => beamSelectionStore.setHighlightedBeam(beamId),
    setCurrentView: (view) => beamSelectionStore.setCurrentView(view),
    selectBeamAndNavigate: (beamId, targetView) =>
      beamSelectionStore.selectBeamAndNavigate(beamId, targetView),
  };
}
