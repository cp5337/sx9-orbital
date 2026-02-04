import { useState } from 'react';
import OrbitalView from './components/OrbitalView';
import { FlatMapView } from './components/FlatMapView';
import { BeamDashboard } from './components/BeamDashboard';
import { CollapsibleNav } from './components/CollapsibleNav';
import { ConstellationGraphView } from './components/ConstellationGraphView';
import { DataTableView } from './components/DataTableView';
import FinancialDashboard from './components/FinancialDashboard';
import { FinancialMonitoringPanel } from './components/FinancialMonitoringPanel';
import { useBeamSelectionStore } from './store/beamSelectionStore';
import { useConstellationStore } from './store/constellationStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';
import { DiagnosticPanel } from './components/DiagnosticPanel';
import './App.css';

function App() {
  const { currentView, setCurrentView, selectBeamAndNavigate } = useBeamSelectionStore();
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const diagnosticChecks: any[] = [];

  const { satellites, groundStations, fsoLinks, loading, error } = useConstellationStore();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-lg font-semibold text-slate-200">Loading constellation data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold text-red-400">Failed to load constellation data</p>
          <p className="text-sm text-slate-400">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <CollapsibleNav
        currentView={currentView}
        onViewChange={setCurrentView}
        onDiagnosticsOpen={() => setDiagnosticsOpen(true)}
        onCollapseChange={setNavCollapsed}
      />

      <main className={`${navCollapsed ? 'ml-12' : 'ml-48'} transition-all duration-300`}>
        {currentView === '3d' && (
          <div className="h-screen">
            <OrbitalView
              satellites={satellites}
              groundStations={groundStations}
              fsoLinks={fsoLinks}
            />
          </div>
        )}

        {currentView === 'map' && (
          <div className="h-screen">
            <FlatMapView
              satellites={satellites}
              groundStations={groundStations}
              fsoLinks={fsoLinks}
              onNodeSelect={(nodeId, nodeType) => {
                console.log(`Selected ${nodeType}: ${nodeId}`);
              }}
            />
          </div>
        )}

        {currentView === 'dashboard' && (
          <div className="p-6">
            <BeamDashboard
              onBeamSelect={(beamId) => selectBeamAndNavigate(beamId, 'map')}
            />
          </div>
        )}

        {currentView === 'graph' && (
          <div className="h-screen p-4">
            <ConstellationGraphView
              satellites={satellites}
              groundStations={groundStations}
              fsoLinks={fsoLinks}
              initialLayout="concentric"
              onNodeSelect={(nodeId, nodeType) => {
                console.log(`Selected ${nodeType}: ${nodeId}`);
              }}
              onLinkSelect={(linkId) => {
                console.log(`Selected link: ${linkId}`);
              }}
            />
          </div>
        )}

        {currentView === 'data' && (
          <div className="h-screen p-4">
            <DataTableView
              groundStations={groundStations}
              satellites={satellites}
              fsoLinks={fsoLinks}
              onRowSelect={(type, id) => {
                console.log(`Selected ${type}: ${id}`);
              }}
            />
          </div>
        )}

        {currentView === 'financial' && (
          <div className="h-screen overflow-y-auto">
            <FinancialDashboard
              satellites={satellites}
              groundStations={groundStations}
              fsoLinks={fsoLinks}
            />
          </div>
        )}

        {currentView === 'monitoring' && (
          <div className="h-screen overflow-y-auto">
            <FinancialMonitoringPanel
              satellites={satellites}
              groundStations={groundStations}
              fsoLinks={fsoLinks}
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
