// Beam Pattern Tab for BeamDashboard integration
// Component: BeamPatternTab.tsx | Lines: ~120 | Tier: Simple (<200)

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Zap, Settings } from 'lucide-react';
import { GroundStationConfig } from './GroundStationConfig';
import { BeamPatternViewer } from './BeamPatternViewer';

interface BeamPatternTabProps {
  selectedBeamId?: string;
  sourceNodeId?: string;
  targetNodeId?: string;
}

export function BeamPatternTab({
  selectedBeamId,
  sourceNodeId,
  targetNodeId
}: BeamPatternTabProps) {
  const [activeTab, setActiveTab] = useState('config');

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-400" />
              Beam Pattern Analysis
            </CardTitle>
            {selectedBeamId && (
              <span className="text-sm text-slate-400">
                Beam: {selectedBeamId.slice(0, 8)}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 bg-slate-800">
              <TabsTrigger value="config" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Station Configuration
              </TabsTrigger>
              <TabsTrigger value="patterns" className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Pattern Simulator
              </TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="mt-6">
              <div className="space-y-4">
                <div className="text-sm text-slate-400">
                  Configure declination angles and calculate link budgets for ground stations
                  in your optical network. Each station can have 3-20 custom elevation angles
                  optimized for atmospheric conditions.
                </div>
                <GroundStationConfig />
              </div>
            </TabsContent>

            <TabsContent value="patterns" className="mt-6">
              <div className="space-y-4">
                <div className="text-sm text-slate-400">
                  Generate and visualize laser beam patterns with atmospheric turbulence effects.
                  Supports Gaussian, Bessel, Airy, and Laguerre-Gaussian (OAM) beam modes for
                  optical satellite communications.
                </div>
                <BeamPatternViewer />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {sourceNodeId && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-sm">Source Node Context</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-slate-400">Source:</span>{' '}
                <span className="font-mono">{sourceNodeId}</span>
              </div>
              {targetNodeId && (
                <div>
                  <span className="text-slate-400">Target:</span>{' '}
                  <span className="font-mono">{targetNodeId}</span>
                </div>
              )}
              <div className="text-xs text-slate-500 mt-3">
                Pattern configurations affect beam quality and link budget for this connection.
                Adjust declination angles based on typical satellite pass geometries.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
