import { useState, useMemo } from 'react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Signal, Zap, Activity, AlertTriangle, TrendingUp } from 'lucide-react';

interface Beam {
  id: string;
  beam_type: string;
  source_node_id: string;
  target_node_id: string;
  beam_status: string;
  link_quality_score: number;
  throughput_gbps: number;
  latency_ms: number;
  qber: number;
  optical_power_dbm: number;
  pointing_error_urad: number;
  atmospheric_attenuation_db: number;
  distance_km: number;
  elevation_deg: number;
  weather_score: number;
  radiation_flux_at_source: number;
  in_radiation_belt: boolean;
  assignment_timestamp: string;
}

interface BeamCardProps {
  beam: Beam;
  onShowOnMap: (beamId: string) => void;
}

function BeamCard({ beam, onShowOnMap }: BeamCardProps) {
  const statusColors = {
    active: 'bg-green-500',
    standby: 'bg-blue-500',
    degraded: 'bg-yellow-500',
    offline: 'bg-red-500'
  };

  const qualityColor = beam.link_quality_score > 0.8 ? 'text-green-400' :
                      beam.link_quality_score > 0.6 ? 'text-yellow-400' :
                      beam.link_quality_score > 0.4 ? 'text-orange-400' : 'text-red-400';

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-mono">
              {beam.beam_type === 'space_to_ground' ? 'SG' : 'ISL'}-{beam.id.substring(0, 8)}
            </CardTitle>
            <p className="text-xs text-slate-400">
              Assigned: {new Date(beam.assignment_timestamp).toLocaleTimeString()}
            </p>
          </div>
          <Badge className={statusColors[beam.beam_status as keyof typeof statusColors]}>
            {beam.beam_status.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-slate-400">Quality</p>
            <p className={`text-2xl font-bold ${qualityColor}`}>
              {(beam.link_quality_score * 100).toFixed(0)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400">Throughput</p>
            <p className="text-2xl font-bold text-blue-400">
              {beam.throughput_gbps.toFixed(1)}
              <span className="text-xs text-slate-400 ml-1">Gbps</span>
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400">Latency</p>
            <p className="text-2xl font-bold text-purple-400">
              {beam.latency_ms.toFixed(0)}
              <span className="text-xs text-slate-400 ml-1">ms</span>
            </p>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400 flex items-center gap-1">
              <Signal className="w-4 h-4" />
              Optical Power
            </span>
            <span className="font-mono">{beam.optical_power_dbm.toFixed(1)} dBm</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400 flex items-center gap-1">
              <Activity className="w-4 h-4" />
              QBER
            </span>
            <span className={`font-mono ${beam.qber > 5 ? 'text-red-400' : ''}`}>
              {beam.qber.toFixed(2)}%
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400 flex items-center gap-1">
              <Zap className="w-4 h-4" />
              Pointing Error
            </span>
            <span className="font-mono">{beam.pointing_error_urad.toFixed(1)} μrad</span>
          </div>
        </div>

        {beam.beam_type === 'space_to_ground' && (
          <div className="space-y-2 pt-2 border-t border-slate-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Weather Score</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${beam.weather_score * 100}%` }}
                  />
                </div>
                <span className="font-mono text-xs">{(beam.weather_score * 100).toFixed(0)}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Attenuation</span>
              <span className="font-mono">{beam.atmospheric_attenuation_db.toFixed(2)} dB</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Elevation</span>
              <span className="font-mono">{beam.elevation_deg.toFixed(1)}°</span>
            </div>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-slate-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Distance</span>
            <span className="font-mono">{beam.distance_km.toFixed(0)} km</span>
          </div>

          {beam.in_radiation_belt && (
            <div className="flex items-center gap-2 text-sm text-orange-400">
              <AlertTriangle className="w-4 h-4" />
              <span>In Radiation Belt</span>
              <span className="font-mono text-xs">
                {beam.radiation_flux_at_source.toExponential(1)} p/cm²/s
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onShowOnMap(beam.id)}
          >
            Show on Map
          </Button>
          <Button size="sm" variant="outline" className="flex-1">
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function BeamDashboard({ onBeamSelect }: { onBeamSelect?: (beamId: string) => void }) {
  const { data: beams } = useSupabaseData<Beam>('beams');
  const [sortBy, setSortBy] = useState<'quality' | 'throughput' | 'qber'>('quality');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const spaceToGroundBeams = useMemo(() => {
    if (!beams) return [];
    return beams.filter(b => b.beam_type === 'space_to_ground');
  }, [beams]);

  const satelliteToSatelliteBeams = useMemo(() => {
    if (!beams) return [];
    return beams.filter(b => b.beam_type === 'satellite_to_satellite');
  }, [beams]);

  const sortBeams = (beamList: Beam[]) => {
    let filtered = beamList;
    if (filterStatus !== 'all') {
      filtered = beamList.filter((b: Beam) => b.beam_status === filterStatus);
    }

    return [...filtered].sort((a: Beam, b: Beam) => {
      switch (sortBy) {
        case 'quality':
          return b.link_quality_score - a.link_quality_score;
        case 'throughput':
          return b.throughput_gbps - a.throughput_gbps;
        case 'qber':
          return a.qber - b.qber;
        default:
          return 0;
      }
    });
  };

  const activeBeams = beams?.filter(b => b.beam_status === 'active').length || 0;
  const totalBeams = beams?.length || 0;
  const avgQuality = beams
    ? beams.reduce((sum: number, b: Beam) => sum + b.link_quality_score, 0) / beams.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Beam Management Dashboard</h2>
          <p className="text-slate-400 mt-1">
            Real-time laser communication link monitoring
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Card className="bg-slate-800 border-slate-700 px-4 py-2">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-xs text-slate-400">Active Beams</p>
                <p className="text-lg font-bold">
                  {activeBeams}/{totalBeams}
                </p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-800 border-slate-700 px-4 py-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-xs text-slate-400">Avg Quality</p>
                <p className="text-lg font-bold">{(avgQuality * 100).toFixed(0)}%</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Sort by:</span>
          <Button
            size="sm"
            variant={sortBy === 'quality' ? 'default' : 'outline'}
            onClick={() => setSortBy('quality')}
          >
            Quality
          </Button>
          <Button
            size="sm"
            variant={sortBy === 'throughput' ? 'default' : 'outline'}
            onClick={() => setSortBy('throughput')}
          >
            Throughput
          </Button>
          <Button
            size="sm"
            variant={sortBy === 'qber' ? 'default' : 'outline'}
            onClick={() => setSortBy('qber')}
          >
            QBER
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Filter:</span>
          <Button
            size="sm"
            variant={filterStatus === 'all' ? 'default' : 'outline'}
            onClick={() => setFilterStatus('all')}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={filterStatus === 'active' ? 'default' : 'outline'}
            onClick={() => setFilterStatus('active')}
          >
            Active
          </Button>
          <Button
            size="sm"
            variant={filterStatus === 'degraded' ? 'default' : 'outline'}
            onClick={() => setFilterStatus('degraded')}
          >
            Degraded
          </Button>
        </div>
      </div>

      <Tabs defaultValue="space-to-ground" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="space-to-ground">
            Space-to-Ground ({spaceToGroundBeams.length})
          </TabsTrigger>
          <TabsTrigger value="satellite-to-satellite">
            Inter-Satellite Links ({satelliteToSatelliteBeams.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="space-to-ground" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortBeams(spaceToGroundBeams).map(beam => (
              <BeamCard
                key={beam.id}
                beam={beam}
                onShowOnMap={(beamId) => onBeamSelect?.(beamId)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="satellite-to-satellite" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortBeams(satelliteToSatelliteBeams).map(beam => (
              <BeamCard
                key={beam.id}
                beam={beam}
                onShowOnMap={(beamId) => onBeamSelect?.(beamId)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
