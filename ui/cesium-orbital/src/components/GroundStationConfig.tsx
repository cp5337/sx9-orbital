// Ground Station Declination Configuration Component
// Component: GroundStationConfig | Lines: ~340 | Tier: Module (<350)

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Settings, Plus, Trash2, Save, RotateCcw } from 'lucide-react';
import { beamEngine } from '@/wasm/beamPatternEngine';
import { STANDARD_PRESETS, DeclinationPreset, LinkBudgetResult } from '@/wasm/types';
import { useSupabaseData } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/supabase';

interface GroundNode {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  tier: number;
}

interface DeclinationConfig {
  preset: DeclinationPreset;
  angles: number[];
  custom: boolean;
}

export function GroundStationConfig() {
  const { data: stations } = useSupabaseData<GroundNode>('ground_nodes');
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [config, setConfig] = useState<DeclinationConfig>({
    preset: 'operational',
    angles: [...STANDARD_PRESETS.operational],
    custom: false,
  });
  const [linkBudgets, setLinkBudgets] = useState<LinkBudgetResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedStation) {
      loadStationConfig();
    }
  }, [selectedStation]);

  const loadStationConfig = async () => {
    if (!selectedStation) return;

    try {
      const { data, error } = await supabase
        .from('ground_station_declination_config')
        .select('*')
        .eq('ground_node_id', selectedStation)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig({
          preset: data.preset_type as DeclinationPreset,
          angles: data.angles_deg,
          custom: data.is_custom,
        });
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const handlePresetChange = (preset: DeclinationPreset) => {
    if (preset === 'custom') return;

    setConfig({
      preset,
      angles: [...STANDARD_PRESETS[preset]],
      custom: false,
    });
  };

  const handleAngleChange = (index: number, value: string) => {
    const angle = parseFloat(value);
    if (isNaN(angle) || angle < 5 || angle > 90) return;

    const newAngles = [...config.angles];
    newAngles[index] = angle;
    setConfig({ ...config, angles: newAngles, custom: true, preset: 'custom' });
  };

  const addAngle = () => {
    if (config.angles.length >= 20) return;
    const lastAngle = config.angles[config.angles.length - 1] || 45;
    const newAngle = Math.min(lastAngle + 5, 90);
    setConfig({
      ...config,
      angles: [...config.angles, newAngle],
      custom: true,
      preset: 'custom',
    });
  };

  const removeAngle = (index: number) => {
    if (config.angles.length <= 3) return;
    const newAngles = config.angles.filter((_, i) => i !== index);
    setConfig({ ...config, angles: newAngles, custom: true, preset: 'custom' });
  };

  const calculateLinkBudgets = async () => {
    if (!selectedStation) return;

    setLoading(true);
    try {
      await beamEngine.initialize();

      const station = stations?.find(s => s.id === selectedStation);
      if (!station) return;

      await beamEngine.addGroundStation({
        id: station.id,
        latitude: station.latitude,
        longitude: station.longitude,
        altitude: 0,
        preset: config.preset !== 'custom' ? config.preset : 'operational',
      });

      if (config.custom) {
        await beamEngine.setDeclinationAngles(station.id, config.angles);
      }

      const budgets = await beamEngine.calculateLinkBudgets(station.id);
      setLinkBudgets(budgets);
    } catch (error) {
      console.error('Failed to calculate link budgets:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfiguration = async () => {
    if (!selectedStation) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('ground_station_declination_config')
        .upsert({
          ground_node_id: selectedStation,
          preset_type: config.preset,
          angles_deg: config.angles,
          is_custom: config.custom,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      console.log('Configuration saved successfully');
    } catch (error) {
      console.error('Failed to save configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetToPreset = () => {
    const preset = config.preset === 'custom' ? 'operational' : config.preset;
    setConfig({
      preset,
      angles: [...STANDARD_PRESETS[preset]],
      custom: false,
    });
  };

  const selectedStationData = stations?.find(s => s.id === selectedStation);

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-400" />
              <CardTitle>Ground Station Configuration</CardTitle>
            </div>
            {selectedStationData && (
              <Badge variant="outline" className="text-xs">
                Tier {selectedStationData.tier}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Select Ground Station</Label>
            <Select value={selectedStation} onValueChange={setSelectedStation}>
              <SelectTrigger className="bg-slate-900 border-slate-700">
                <SelectValue placeholder="Choose a station..." />
              </SelectTrigger>
              <SelectContent>
                {stations?.map((station) => (
                  <SelectItem key={station.id} value={station.id}>
                    {station.name} ({station.latitude.toFixed(2)}°, {station.longitude.toFixed(2)}°)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStation && (
            <>
              <div className="space-y-2">
                <Label>Declination Preset</Label>
                <div className="flex gap-2">
                  <Select
                    value={config.preset}
                    onValueChange={(val) => handlePresetChange(val as DeclinationPreset)}
                  >
                    <SelectTrigger className="flex-1 bg-slate-900 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic (5 angles)</SelectItem>
                      <SelectItem value="operational">Operational (8 angles)</SelectItem>
                      <SelectItem value="precision">Precision (15 angles)</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  {config.custom && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={resetToPreset}
                      title="Reset to preset"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Elevation Angles (degrees)</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addAngle}
                    disabled={config.angles.length >= 20}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {config.angles.map((angle, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={angle}
                        onChange={(e) => handleAngleChange(index, e.target.value)}
                        min={5}
                        max={90}
                        step={0.5}
                        className="bg-slate-900 border-slate-700 h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeAngle(index)}
                        disabled={config.angles.length <= 3}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400">
                  {config.angles.length} angles configured (min: 3, max: 20)
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={calculateLinkBudgets}
                  disabled={loading}
                  className="flex-1"
                >
                  Calculate Link Budget
                </Button>
                <Button
                  onClick={saveConfiguration}
                  disabled={loading}
                  variant="outline"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
              </div>

              {linkBudgets.length > 0 && (
                <div className="space-y-2">
                  <Label>Link Budget by Elevation</Label>
                  <div className="max-h-48 overflow-y-auto border border-slate-700 rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-900 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Elevation</th>
                          <th className="p-2 text-right">Atm Loss</th>
                          <th className="p-2 text-right">Turb Penalty</th>
                          <th className="p-2 text-right">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linkBudgets.map((budget, idx) => (
                          <tr key={idx} className="border-t border-slate-700">
                            <td className="p-2">{budget.elevation_deg.toFixed(1)}°</td>
                            <td className="p-2 text-right">{budget.atmospheric_loss_db.toFixed(2)} dB</td>
                            <td className="p-2 text-right">{budget.turbulence_penalty_db.toFixed(2)} dB</td>
                            <td className={`p-2 text-right font-mono ${
                              budget.total_margin_db > 3 ? 'text-green-400' :
                              budget.total_margin_db > 0 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {budget.total_margin_db.toFixed(2)} dB
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
