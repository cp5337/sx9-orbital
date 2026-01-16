import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Globe, Activity, Satellite, Radio } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';

type WorldType = 'production' | 'staging' | 'sandbox' | 'fusion';

interface LeftPanelProps {
  currentWorld: WorldType;
  onWorldChange: (world: WorldType) => void;
  stats: {
    groundStations: number;
    satellites: number;
    activeLinks: number;
  };
}

export function LeftPanel({ currentWorld, onWorldChange, stats }: LeftPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const worlds: { id: WorldType; label: string; color: string; icon: typeof Globe }[] = [
    { id: 'production', label: 'Production', color: 'text-green-400 border-green-400/50', icon: Globe },
    { id: 'staging', label: 'Staging', color: 'text-blue-400 border-blue-400/50', icon: Globe },
    { id: 'sandbox', label: 'Sandbox', color: 'text-yellow-400 border-yellow-400/50', icon: Globe },
    { id: 'fusion', label: 'Fusion View', color: 'text-purple-400 border-purple-400/50', icon: Globe },
  ];

  if (isCollapsed) {
    return (
      <motion.div
        initial={false}
        animate={{ width: 64 }}
        className="fixed left-0 top-0 h-screen bg-slate-900/95 backdrop-blur-xl border-r border-slate-700/50 z-40 flex flex-col items-center py-4"
      >
        <button
          onClick={() => setIsCollapsed(false)}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 w-6 h-24 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-600/50 hover:border-cyan-400/50 rounded-r-lg shadow-lg transition-all duration-200 flex items-center justify-center group touch-manipulation"
          aria-label="Expand panel"
        >
          <div className="flex flex-col gap-1">
            <div className="w-0.5 h-3 bg-slate-500 group-hover:bg-cyan-400 rounded transition-colors" />
            <div className="w-0.5 h-3 bg-slate-500 group-hover:bg-cyan-400 rounded transition-colors" />
            <div className="w-0.5 h-3 bg-slate-500 group-hover:bg-cyan-400 rounded transition-colors" />
          </div>
        </button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="mb-4 hover:bg-slate-800"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        <div className="flex flex-col gap-2">
          {worlds.map((world) => {
            const Icon = world.icon;
            const isActive = currentWorld === world.id;
            return (
              <button
                key={world.id}
                onClick={() => onWorldChange(world.id)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                  isActive
                    ? `bg-slate-800 border ${world.color}`
                    : 'bg-slate-800/50 border border-transparent hover:border-slate-600'
                }`}
                title={world.label}
              >
                <Icon className={`w-5 h-5 ${isActive ? world.color.split(' ')[0] : 'text-slate-400'}`} />
              </button>
            );
          })}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={false}
      animate={{ width: 280 }}
      className="fixed left-0 top-0 h-screen bg-slate-900/95 backdrop-blur-xl border-r border-slate-700/50 z-40 overflow-y-auto"
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            <h2 className="font-bold text-lg">SpaceWorld</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(true)}
            className="hover:bg-slate-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>

        <Separator className="bg-slate-700/50" />

        <div>
          <h3 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">World Selection</h3>
          <div className="space-y-2">
            {worlds.map((world) => {
              const Icon = world.icon;
              const isActive = currentWorld === world.id;
              return (
                <Button
                  key={world.id}
                  variant={isActive ? 'default' : 'ghost'}
                  className={`w-full justify-start ${
                    isActive
                      ? `bg-slate-800 border ${world.color} hover:bg-slate-800/80`
                      : 'hover:bg-slate-800'
                  }`}
                  onClick={() => onWorldChange(world.id)}
                >
                  <Icon className={`w-4 h-4 mr-2 ${isActive ? world.color.split(' ')[0] : 'text-slate-400'}`} />
                  {world.label}
                </Button>
              );
            })}
          </div>
        </div>

        <Separator className="bg-slate-700/50" />

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-300">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-400" />
                <span className="text-xs text-slate-400">Ground Stations</span>
              </div>
              <span className="font-bold text-green-400">{stats.groundStations}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Satellite className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-400">Satellites</span>
              </div>
              <span className="font-bold text-blue-400">{stats.satellites}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-slate-400">Active Links</span>
              </div>
              <span className="font-bold text-cyan-400">{stats.activeLinks}</span>
            </div>
          </CardContent>
        </Card>

        <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">Current World</div>
          <div className="font-semibold">{worlds.find(w => w.id === currentWorld)?.label}</div>
        </div>
      </div>
    </motion.div>
  );
}
