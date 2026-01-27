import { useState, useMemo } from 'react';
import SpaceWorldDemo from './components/SpaceWorldDemo';
import { FlatMapView } from './components/FlatMapView';
import { BeamDashboard } from './components/BeamDashboard';
import { CollapsibleNav } from './components/CollapsibleNav';
import { ConstellationGraphView } from './components/ConstellationGraphView';
import { DataTableView, type FsoLink } from './components/DataTableView';
import { useBeamSelectionStore } from './store/beamSelectionStore';
import { useSatellites, useGroundNodes } from './hooks/useSupabaseData';
import { useMockSatellites, useMockGroundNodes } from './hooks/useMockData';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';
import { DiagnosticPanel } from './components/DiagnosticPanel';
import './App.css';

function App() {
  const { currentView, setCurrentView, selectBeamAndNavigate } = useBeamSelectionStore();
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const diagnosticChecks: any[] = [];

  // Fetch data from Supabase (falls back to empty if not available)
  const { satellites: supabaseSats } = useSatellites();
  const { nodes: supabaseNodes } = useGroundNodes();

  // Fetch mock data as backup
  const { satellites: mockSats } = useMockSatellites();
  const { nodes: mockNodes } = useMockGroundNodes();

  // Use Supabase data if available, otherwise mock data
  const satellites = supabaseSats.length > 0 ? supabaseSats : mockSats;
  const groundStations = supabaseNodes.length > 0 ? supabaseNodes : mockNodes;

  // Generate FSO links from satellites (Walker Delta constellation links)
  const fsoLinks = useMemo<FsoLink[]>(() => {
    const links: FsoLink[] = [];

    // ISL links between satellites in same plane (adjacent)
    for (let i = 0; i < satellites.length; i++) {
      const sat = satellites[i];
      const nextIdx = (i + 1) % satellites.length;
      const nextSat = satellites[nextIdx];

      // Only link satellites that are close in orbital position
      const latDiff = Math.abs(sat.latitude - nextSat.latitude);
      const lonDiff = Math.abs(sat.longitude - nextSat.longitude);

      if (latDiff < 60 && lonDiff < 90) {
        links.push({
          id: `isl-${sat.id}-${nextSat.id}`,
          source_id: sat.id,
          target_id: nextSat.id,
          link_type: 'sat-sat',
          margin_db: 6.0 + Math.random() * 3,
          throughput_gbps: 10.0,
          active: sat.status === 'active' && nextSat.status === 'active',
          weather_score: 1.0, // ISL not affected by weather
        });
      }
    }

    // Sat-to-ground links
    for (const sat of satellites) {
      for (const gs of groundStations) {
        // Simple visibility check - within 60 degrees latitude of ground station
        const latDiff = Math.abs(sat.latitude - gs.latitude);
        if (latDiff < 60) {
          links.push({
            id: `sg-${sat.id}-${gs.id}`,
            source_id: sat.id,
            target_id: gs.id,
            link_type: 'sat-ground',
            margin_db: 3.0 + gs.weather_score * 5,
            throughput_gbps: 1.0 * gs.weather_score,
            active: sat.status === 'active' && gs.status === 'active',
            weather_score: gs.weather_score,
          });
        }
      }
    }

    return links;
  }, [satellites, groundStations]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <CollapsibleNav
        currentView={currentView}
        onViewChange={setCurrentView}
        onDiagnosticsOpen={() => setDiagnosticsOpen(true)}
      />

      <main className="ml-36 transition-all duration-300">
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

        {currentView === 'graph' && (
          <div className="h-screen p-4">
            <ConstellationGraphView
              satellites={satellites.map(s => ({
                id: s.id,
                name: s.name,
                latitude: s.latitude,
                longitude: s.longitude,
                altitude: s.altitude,
                planeIndex: Math.floor(satellites.indexOf(s) / 4), // Estimate plane from position
              }))}
              groundStations={groundStations.map(gs => ({
                id: gs.id,
                name: gs.name,
                latitude: gs.latitude,
                longitude: gs.longitude,
                tier: gs.tier,
                weather_score: gs.weather_score,
              }))}
              fsoLinks={fsoLinks.map(link => ({
                id: link.id,
                sourceId: link.source_id,
                targetId: link.target_id,
                type: link.link_type,
                marginDb: link.margin_db,
                active: link.active,
              }))}
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
