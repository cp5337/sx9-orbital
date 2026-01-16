// Radiation Belt Information Panel Component
// Component: RadiationBeltInfo.tsx | Lines: ~175 | Tier: Simple (<200)

import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { AlertTriangle, Shield, Activity, Zap } from 'lucide-react';
import { RADIATION_BELTS } from '@/utils/radiationBeltRenderer';

interface RadiationStats {
  satellitesInBelts: number;
  totalSatellites: number;
  avgRadiationFlux: number;
  highRiskCount: number;
}

interface RadiationBeltInfoProps {
  stats?: RadiationStats;
}

export function RadiationBeltInfo({ stats }: RadiationBeltInfoProps) {
  const defaultStats: RadiationStats = {
    satellitesInBelts: 0,
    totalSatellites: 0,
    avgRadiationFlux: 0,
    highRiskCount: 0,
  };

  const currentStats = stats || defaultStats;
  const percentageInBelts = currentStats.totalSatellites > 0
    ? ((currentStats.satellitesInBelts / currentStats.totalSatellites) * 100).toFixed(1)
    : '0.0';

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-5 h-5 text-amber-400" />
            Radiation Environment
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Van Allen Belts
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-3">
          {RADIATION_BELTS.map((belt) => (
            <div
              key={belt.type}
              className="p-3 rounded-md border"
              style={{
                borderColor: belt.color + '40',
                backgroundColor: belt.color + '10',
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className="w-4 h-4"
                    style={{ color: belt.color }}
                  />
                  <span className="font-semibold text-sm">{belt.name}</span>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={{ borderColor: belt.color, color: belt.color }}
                >
                  {belt.type.toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400">Altitude:</span>
                  <div className="font-mono">
                    {belt.innerRadiusKm.toFixed(0)} - {belt.outerRadiusKm.toFixed(0)} km
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">Peak Flux:</span>
                  <div className="font-mono">
                    {formatFlux(belt.peakFluxProtons)} p/cm²/s
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">Particles:</span>
                  <div className="text-slate-300">
                    {belt.type === 'inner' ? 'High-energy protons' : 'Relativistic electrons'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-700 pt-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Satellites in Belts:
            </span>
            <span className="font-mono font-semibold">
              {currentStats.satellitesInBelts} / {currentStats.totalSatellites}
              <span className="text-slate-400 ml-2">({percentageInBelts}%)</span>
            </span>
          </div>

          {currentStats.highRiskCount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-amber-400 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                High Radiation:
              </span>
              <span className="font-mono font-semibold text-amber-400">
                {currentStats.highRiskCount} satellites
              </span>
            </div>
          )}
        </div>

        <div className="bg-slate-900 rounded-md p-3 space-y-2 text-xs">
          <div className="font-semibold text-slate-300 mb-2">Impact on Operations:</div>
          <ul className="space-y-1.5 text-slate-400 list-disc list-inside">
            <li>Increased optical sensor noise (QBER)</li>
            <li>Potential link degradation during passes</li>
            <li>Enhanced atmospheric scintillation effects</li>
            <li>Solar panel and electronics degradation</li>
          </ul>
        </div>

        <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-slate-300">
            <strong className="text-amber-400">Note:</strong> MEO satellites regularly transit
            through the outer Van Allen belt. Monitor radiation dose and adjust beam routing
            during high-flux periods.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatFlux(flux: number): string {
  if (flux >= 1e9) return `${(flux / 1e9).toFixed(1)}B`;
  if (flux >= 1e6) return `${(flux / 1e6).toFixed(1)}M`;
  if (flux >= 1e3) return `${(flux / 1e3).toFixed(1)}K`;
  return flux.toFixed(0);
}

export function useRadiationStats(satellites: any[]): RadiationStats {
  const satellitesInBelts = satellites.filter(s => s.in_radiation_belt).length;
  const highRiskCount = satellites.filter(s =>
    s.radiation_flux_at_source && s.radiation_flux_at_source > 1e8
  ).length;

  const avgFlux = satellites.reduce((sum, s) =>
    sum + (s.radiation_flux_at_source || 0), 0
  ) / (satellites.length || 1);

  return {
    satellitesInBelts,
    totalSatellites: satellites.length,
    avgRadiationFlux: avgFlux,
    highRiskCount,
  };
}
