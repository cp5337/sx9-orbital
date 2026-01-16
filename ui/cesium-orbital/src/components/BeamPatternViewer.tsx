// Beam Pattern Visualization Component
// Component: BeamPatternViewer | Lines: ~330 | Tier: Module (<350)

import { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Zap, Download, RefreshCw } from 'lucide-react';
import { beamEngine } from '@/wasm/beamPatternEngine';
import { BeamType } from '@/wasm/types';

interface BeamParams {
  wavelengthNm: number;
  waistRadiusMm: number;
  powerWatts: number;
  cn2Turbulence: number;
}

export function BeamPatternViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [beamType, setBeamType] = useState<BeamType>('gaussian');
  const [params, setParams] = useState<BeamParams>({
    wavelengthNm: 1550,
    waistRadiusMm: 10,
    powerWatts: 1.0,
    cn2Turbulence: 1e-15,
  });
  const [loading, setLoading] = useState(false);
  const [patternData, setPatternData] = useState<Uint8Array | null>(null);

  useEffect(() => {
    if (patternData && canvasRef.current) {
      renderPattern();
    }
  }, [patternData]);

  const generatePattern = async () => {
    setLoading(true);
    try {
      await beamEngine.initialize();

      const pattern = await beamEngine.generateBeamPattern(
        beamType,
        params.wavelengthNm,
        params.waistRadiusMm,
        params.powerWatts,
        params.cn2Turbulence,
        800,
        800
      );

      setPatternData(pattern);
    } catch (error) {
      console.error('Failed to generate pattern:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderPattern = () => {
    if (!canvasRef.current || !patternData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = new ImageData(
      new Uint8ClampedArray(patternData),
      800,
      800
    );

    ctx.putImageData(imageData, 0, 0);
  };

  const downloadPattern = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `beam-pattern-${beamType}-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  };

  const updateParam = <K extends keyof BeamParams>(
    key: K,
    value: BeamParams[K]
  ) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-400" />
            <CardTitle>Beam Pattern Simulator</CardTitle>
          </div>
          {patternData && (
            <Button
              size="sm"
              variant="outline"
              onClick={downloadPattern}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Beam Type</Label>
              <Select
                value={beamType}
                onValueChange={(val) => setBeamType(val as BeamType)}
              >
                <SelectTrigger className="bg-slate-900 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gaussian">Gaussian (TEM00)</SelectItem>
                  <SelectItem value="bessel">Bessel (Non-diffracting)</SelectItem>
                  <SelectItem value="airy">Airy (Self-accelerating)</SelectItem>
                  <SelectItem value="lg">Laguerre-Gaussian (OAM)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Wavelength (nm)</Label>
                <span className="text-xs text-slate-400">{params.wavelengthNm}</span>
              </div>
              <Slider
                value={[params.wavelengthNm]}
                onValueChange={([val]) => updateParam('wavelengthNm', val)}
                min={850}
                max={1650}
                step={10}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Waist Radius (mm)</Label>
                <span className="text-xs text-slate-400">{params.waistRadiusMm.toFixed(1)}</span>
              </div>
              <Slider
                value={[params.waistRadiusMm]}
                onValueChange={([val]) => updateParam('waistRadiusMm', val)}
                min={0.1}
                max={50}
                step={0.1}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Optical Power (W)</Label>
                <span className="text-xs text-slate-400">{params.powerWatts.toFixed(2)}</span>
              </div>
              <Slider
                value={[params.powerWatts]}
                onValueChange={([val]) => updateParam('powerWatts', val)}
                min={0.01}
                max={10}
                step={0.01}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Turbulence Cn²</Label>
                <span className="text-xs text-slate-400">
                  {params.cn2Turbulence.toExponential(1)}
                </span>
              </div>
              <Slider
                value={[Math.log10(params.cn2Turbulence)]}
                onValueChange={([val]) => updateParam('cn2Turbulence', Math.pow(10, val))}
                min={-17}
                max={-13}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>Weak</span>
                <span>Strong</span>
              </div>
            </div>

            <Button
              onClick={generatePattern}
              disabled={loading}
              className="w-full"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Generating...' : 'Generate Pattern'}
            </Button>

            <div className="p-3 bg-slate-900 rounded-md space-y-1">
              <div className="text-xs font-mono">
                <span className="text-slate-400">Type:</span> {beamType.toUpperCase()}
              </div>
              <div className="text-xs font-mono">
                <span className="text-slate-400">λ:</span> {params.wavelengthNm}nm
              </div>
              <div className="text-xs font-mono">
                <span className="text-slate-400">w₀:</span> {params.waistRadiusMm.toFixed(1)}mm
              </div>
              <div className="text-xs font-mono">
                <span className="text-slate-400">P:</span> {params.powerWatts.toFixed(2)}W
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="border border-slate-700 rounded-lg overflow-hidden bg-black">
              <canvas
                ref={canvasRef}
                width={800}
                height={800}
                className="w-full h-auto"
              />
              {!patternData && (
                <div className="aspect-square flex items-center justify-center text-slate-500">
                  <div className="text-center">
                    <Zap className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>Generate a beam pattern to visualize</p>
                  </div>
                </div>
              )}
            </div>

            {patternData && (
              <div className="mt-4 p-3 bg-slate-900 rounded-md">
                <p className="text-xs text-slate-400">
                  Pattern rendered at 800×800 resolution. The visualization shows the
                  beam intensity distribution with atmospheric turbulence effects applied.
                  Brighter regions indicate higher optical power density.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-700 pt-4">
          <div className="text-xs text-slate-400 space-y-1">
            <p><strong>Gaussian:</strong> Standard TEM00 mode with fundamental Gaussian profile</p>
            <p><strong>Bessel:</strong> Non-diffracting beam maintaining profile over long distances</p>
            <p><strong>Airy:</strong> Self-accelerating beam following curved trajectory</p>
            <p><strong>Laguerre-Gaussian:</strong> OAM beam carrying orbital angular momentum</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
