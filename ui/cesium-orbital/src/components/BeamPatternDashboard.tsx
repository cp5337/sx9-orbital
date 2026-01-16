import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Activity,
  Zap,
  Target,
  Gauge,
  AlertTriangle,
  Wifi,
  Radio,
  Satellite
} from 'lucide-react';
import CesiumBeamVisualization from './CesiumBeamVisualization';

// Beam pattern data interfaces
interface BeamPattern {
  id: string;
  sourceId: string;
  targetId: string;
  wavelength: number; // nm
  apertureDiameter: number; // meters
  divergenceAngle: number; // radians
  powerOutput: number; // watts
  linkQuality: number; // 0-100%
  atmosphericLoss: number; // dB
  timestamp: Date;
  type: 'inter-satellite' | 'ground-to-satellite' | 'satellite-to-ground';
}

interface SwapMetrics {
  powerConsumption: number; // watts
  weight: number; // kg
  volume: number; // cubic meters
  efficiency: number; // %
  thermalOutput: number; // watts
}

// Real-time beam pattern dashboard
const BeamPatternDashboard: React.FC = () => {
  const [beamPatterns, setBeamPatterns] = useState<BeamPattern[]>([]);
  const [selectedBeam, setSelectedBeam] = useState<BeamPattern | null>(null);
  const [swapMetrics, setSwapMetrics] = useState<SwapMetrics>({
    powerConsumption: 850,
    weight: 12.5,
    volume: 0.08,
    efficiency: 94.2,
    thermalOutput: 65
  });
  const [atmosphericFilter, setAtmosphericFilter] = useState(0.5);
  const [powerThreshold, setPowerThreshold] = useState(10);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Simulate real-time beam pattern data
  useEffect(() => {
    const generateBeamPattern = (): BeamPattern => {
      const types: BeamPattern['type'][] = ['inter-satellite', 'ground-to-satellite', 'satellite-to-ground'];
      const wavelengths = [850, 1550]; // nm

      const type = types[Math.floor(Math.random() * types.length)];
      const wavelength = type === 'inter-satellite' ? 850 : 1550;
      const aperture = wavelength === 850 ? 0.15 : 0.25; // meters

      // Calculate beam divergence using diffraction limit
      const divergenceAngle = 2.44 * (wavelength * 1e-9) / aperture;

      return {
        id: `beam-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sourceId: `SAT-${Math.floor(Math.random() * 12) + 1}`,
        targetId: type === 'inter-satellite'
          ? `SAT-${Math.floor(Math.random() * 12) + 1}`
          : `GS-${Math.floor(Math.random() * 257) + 1}`,
        wavelength,
        apertureDiameter: aperture,
        divergenceAngle,
        powerOutput: Math.random() * 50 + 10,
        linkQuality: Math.random() * 40 + 60,
        atmosphericLoss: type === 'inter-satellite' ? 0 : Math.random() * 3 + 0.5,
        timestamp: new Date(),
        type
      };
    };

    const interval = setInterval(() => {
      setBeamPatterns(prev => {
        const newPattern = generateBeamPattern();
        const updated = [...prev, newPattern].slice(-50); // Keep last 50 patterns
        return updated;
      });
    }, 2000);

    // Initialize with some data
    const initialPatterns = Array.from({ length: 15 }, generateBeamPattern);
    setBeamPatterns(initialPatterns);

    return () => clearInterval(interval);
  }, []);

  // Draw beam pattern visualization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawBeamPattern = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 20; i++) {
        const x = (i / 20) * canvas.width;
        const y = (i / 20) * canvas.height;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw beam patterns
      beamPatterns.forEach((beam, index) => {
        const x = (index % 10) * (canvas.width / 10) + (canvas.width / 20);
        const y = Math.floor(index / 10) * (canvas.height / 5) + (canvas.height / 10);

        // Beam intensity based on power and quality
        const intensity = (beam.powerOutput / 60) * (beam.linkQuality / 100);
        const radius = Math.max(5, intensity * 20);

        // Color based on wavelength
        const color = beam.wavelength === 850
          ? `rgba(255, 100, 100, ${intensity})`  // Red for 850nm
          : `rgba(100, 255, 100, ${intensity})`; // Green for 1550nm

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();

        // Draw divergence cone
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const coneWidth = beam.divergenceAngle * 10000; // Scale for visibility
        ctx.moveTo(x, y);
        ctx.lineTo(x - coneWidth, y + 30);
        ctx.moveTo(x, y);
        ctx.lineTo(x + coneWidth, y + 30);
        ctx.stroke();

        // Highlight selected beam
        if (selectedBeam && selectedBeam.id === beam.id) {
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, radius + 5, 0, 2 * Math.PI);
          ctx.stroke();
        }
      });
    };

    drawBeamPattern();
  }, [beamPatterns, selectedBeam]);

  // Calculate aggregate metrics
  const aggregateMetrics = {
    totalBeams: beamPatterns.length,
    averageQuality: beamPatterns.reduce((sum, beam) => sum + beam.linkQuality, 0) / beamPatterns.length || 0,
    totalPower: beamPatterns.reduce((sum, beam) => sum + beam.powerOutput, 0),
    interSatelliteLinks: beamPatterns.filter(beam => beam.type === 'inter-satellite').length,
    groundLinks: beamPatterns.filter(beam => beam.type !== 'inter-satellite').length,
    averageAtmosphericLoss: beamPatterns
      .filter(beam => beam.type !== 'inter-satellite')
      .reduce((sum, beam) => sum + beam.atmosphericLoss, 0) /
      beamPatterns.filter(beam => beam.type !== 'inter-satellite').length || 0
  };

  return (
    <div className="w-full p-6 space-y-6 bg-gray-900 text-white min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Radio className="h-8 w-8 text-blue-400" />
          CTAS-7 Beam Pattern Dashboard
        </h1>
        <Badge variant="outline" className="text-green-400 border-green-400">
          Real-time Active
        </Badge>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Active Beams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{aggregateMetrics.totalBeams}</div>
            <div className="text-xs text-gray-500">
              {aggregateMetrics.interSatelliteLinks} inter-sat | {aggregateMetrics.groundLinks} ground
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Avg Link Quality
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">
              {aggregateMetrics.averageQuality.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">
              {aggregateMetrics.averageAtmosphericLoss.toFixed(2)} dB avg loss
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Total Power
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400">
              {aggregateMetrics.totalPower.toFixed(1)}W
            </div>
            <div className="text-xs text-gray-500">
              {swapMetrics.efficiency.toFixed(1)}% efficiency
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">Optimal</div>
            <div className="text-xs text-gray-500">
              {beamPatterns.filter(b => b.linkQuality > 80).length} high-quality links
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Beam Pattern Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-blue-400" />
              3D Cesium Beam Visualization
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[800px] w-full" style={{ height: '800px', width: '100%' }}>
              <CesiumBeamVisualization
                onBeamClick={(beam) => {
                  // Convert beam data for compatibility
                  setSelectedBeam({
                    id: beam.id,
                    sourceId: `Source-${beam.id}`,
                    targetId: `Target-${beam.id}`,
                    wavelength: beam.wavelengthNm,
                    apertureDiameter: 0.25, // Default aperture
                    divergenceAngle: beam.divergenceUrad * 1e-6,
                    powerOutput: beam.powerWatts,
                    linkQuality: beam.linkQuality * 100,
                    atmosphericLoss: beam.atmosphericLoss,
                    timestamp: new Date(),
                    type: beam.beamType
                  });
                }}
                showAtmosphericEffects={true}
                showBeamDivergence={true}
                animationSpeed={1.0}
              />
            </div>
          </CardContent>
        </Card>

        {/* Selected Beam Details */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-400" />
              Beam Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedBeam ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-400">Source → Target</div>
                    <div className="font-mono text-blue-400">
                      {selectedBeam.sourceId} → {selectedBeam.targetId}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Link Type</div>
                    <Badge variant="outline" className="text-purple-400 border-purple-400">
                      {selectedBeam.type}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-400">Wavelength</div>
                    <div className="font-bold text-orange-400">{selectedBeam.wavelength}nm</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Power Output</div>
                    <div className="font-bold text-yellow-400">{selectedBeam.powerOutput.toFixed(1)}W</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-400">Beam Divergence</div>
                    <div className="font-bold text-cyan-400">
                      {(selectedBeam.divergenceAngle * 1e6).toFixed(1)}µrad
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Link Quality</div>
                    <div className="font-bold text-green-400">{selectedBeam.linkQuality.toFixed(1)}%</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-400">Aperture Diameter</div>
                    <div className="font-bold text-indigo-400">{selectedBeam.apertureDiameter}m</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Atmospheric Loss</div>
                    <div className="font-bold text-red-400">{selectedBeam.atmosphericLoss.toFixed(2)}dB</div>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="text-sm text-gray-400">Last Updated</div>
                  <div className="font-mono text-gray-300">
                    {selectedBeam.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Click on a beam pattern to view detailed analysis</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Control Panel */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Satellite className="h-5 w-5 text-blue-400" />
            Beam Control & Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  Atmospheric Filter Threshold
                </label>
                <Slider
                  value={[atmosphericFilter]}
                  onValueChange={(value) => setAtmosphericFilter(value[0])}
                  max={5}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Current: {atmosphericFilter.toFixed(1)} dB
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  Minimum Power Threshold
                </label>
                <Slider
                  value={[powerThreshold]}
                  onValueChange={(value) => setPowerThreshold(value[0])}
                  max={60}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Current: {powerThreshold}W
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="border-blue-600 text-blue-400">
                  Export Beam Data
                </Button>
                <Button variant="outline" size="sm" className="border-green-600 text-green-400">
                  Optimize Patterns
                </Button>
              </div>

              <div className="p-3 bg-gray-900 rounded border border-gray-600">
                <div className="text-sm text-gray-400 mb-2">System Alerts</div>
                {aggregateMetrics.averageQuality < 70 && (
                  <div className="flex items-center gap-2 text-yellow-400 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    Low average link quality detected
                  </div>
                )}
                {aggregateMetrics.totalPower > 1000 && (
                  <div className="flex items-center gap-2 text-orange-400 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    High power consumption
                  </div>
                )}
                {aggregateMetrics.totalBeams < 10 && (
                  <div className="flex items-center gap-2 text-blue-400 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    Limited beam connectivity
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BeamPatternDashboard;