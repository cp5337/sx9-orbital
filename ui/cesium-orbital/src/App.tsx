import { useState } from 'react';
import SpaceWorldDemo from './components/SpaceWorldDemo';
import { FlatMapView } from './components/FlatMapView';
import { BeamDashboard } from './components/BeamDashboard';
import { CollapsibleNav } from './components/CollapsibleNav';
import { useBeamSelectionStore } from './store/beamSelectionStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';
import { DiagnosticPanel } from './components/DiagnosticPanel';
import './App.css';

function App() {
  const { currentView, setCurrentView, selectBeamAndNavigate } = useBeamSelectionStore();
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const diagnosticChecks: any[] = [];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <CollapsibleNav
        currentView={currentView}
        onViewChange={setCurrentView}
        onDiagnosticsOpen={() => setDiagnosticsOpen(true)}
      />

      <main className="ml-12 mr-12 transition-all duration-300">
        {currentView === '3d' && (
          <div className="h-screen">
            <SpaceWorldDemo />
          </div>
        )}

        {currentView === 'map' && (
          <div className="h-screen">
            <FlatMapView />
          </div>
        )}

        {currentView === 'dashboard' && (
          <div className="p-6">
            <BeamDashboard
              onBeamSelect={(beamId) => selectBeamAndNavigate(beamId, 'map')}
            />
          </div>
        )}
      </main>

      <Dialog open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
        <DialogContent className="sm:max-w-[800px] bg-gray-800 border-gray-700 max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">System Diagnostics</DialogTitle>
            <DialogDescription className="text-gray-400">
              System health check and configuration validation
            </DialogDescription>
          </DialogHeader>
          {diagnosticChecks.length > 0 ? (
            <DiagnosticPanel checks={diagnosticChecks} />
          ) : (
            <div className="text-center py-8 text-gray-400">
              No diagnostics data available
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
