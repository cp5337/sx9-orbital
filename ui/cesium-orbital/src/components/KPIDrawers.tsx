import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Network,
  Gauge,
  Lock,
  Activity,
  Satellite,
  ShieldCheck,
  Cpu,
  TrendingUp,
  Zap,
  Radio,
  BarChart3,
  ChevronRight,
} from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts';

interface KPIDrawersProps {
  telemetry: {
    routeEfficiency: number;
    latency: number;
    qber: number;
    entropy: number;
  };
  satelliteCount: number;
}

export function KPIDrawers({ telemetry, satelliteCount }: KPIDrawersProps) {
  const [openDrawer, setOpenDrawer] = useState<string | null>(null);

  const kpiCards = [
    {
      id: 'routing',
      label: 'Route Efficiency',
      value: `${telemetry.routeEfficiency.toFixed(1)}%`,
      icon: Network,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
    },
    {
      id: 'latency',
      label: 'Latency',
      value: `${telemetry.latency.toFixed(0)} ms`,
      icon: Gauge,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
    },
    {
      id: 'qkd',
      label: 'QBER',
      value: `${telemetry.qber.toFixed(1)}%`,
      icon: Lock,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
    },
    {
      id: 'entropy',
      label: 'Entropy Rate',
      value: `${telemetry.entropy.toFixed(1)} kbps`,
      icon: Activity,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/30',
    },
  ];

  return (
    <div className="space-y-3">
      {kpiCards.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <Drawer key={kpi.id} open={openDrawer === kpi.id} onOpenChange={(open) => setOpenDrawer(open ? kpi.id : null)}>
            <DrawerTrigger asChild>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="cursor-pointer"
              >
                <Card className={`${kpi.bgColor} border ${kpi.borderColor} hover:shadow-lg transition-all duration-300`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${kpi.bgColor} border ${kpi.borderColor}`}>
                          <Icon className={`w-5 h-5 ${kpi.color}`} />
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">{kpi.label}</div>
                          <div className="text-xl font-bold">{kpi.value}</div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-500" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </DrawerTrigger>
            <DrawerContent className="max-h-[85vh] bg-slate-900/98 backdrop-blur-xl border-slate-700">
              {kpi.id === 'routing' && <RoutingDrawerContent telemetry={telemetry} />}
              {kpi.id === 'latency' && <LatencyDrawerContent telemetry={telemetry} />}
              {kpi.id === 'qkd' && <QKDDrawerContent telemetry={telemetry} />}
              {kpi.id === 'entropy' && <EntropyDrawerContent telemetry={telemetry} />}
            </DrawerContent>
          </Drawer>
        );
      })}

      <Drawer open={openDrawer === 'overview'} onOpenChange={(open) => setOpenDrawer(open ? 'overview' : null)}>
        <DrawerTrigger asChild>
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              variant="outline"
              className="w-full bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-blue-500/50 transition-all"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              View All Metrics
            </Button>
          </motion.div>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh] bg-slate-900/98 backdrop-blur-xl border-slate-700">
          <OverviewDrawerContent telemetry={telemetry} satelliteCount={satelliteCount} />
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function RoutingDrawerContent({ telemetry }: { telemetry: any }) {
  const routingData = Array.from({ length: 60 }, (_, i) => ({
    t: i,
    efficiency: 88 + Math.sin(i / 8) * 6 + Math.random() * 3,
    pathCount: Math.floor(2000 + Math.random() * 500),
  }));

  return (
    <div className="overflow-y-auto max-h-[75vh]">
      <DrawerHeader>
        <DrawerTitle className="flex items-center gap-3 text-2xl">
          <Network className="w-7 h-7 text-emerald-400" />
          Network Routing Efficiency
        </DrawerTitle>
        <DrawerDescription>
          Multi-objective A* routing with weather-adaptive path optimization
        </DrawerDescription>
      </DrawerHeader>

      <div className="px-6 pb-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Current Efficiency" value={`${telemetry.routeEfficiency.toFixed(1)}%`} icon={TrendingUp} color="text-emerald-400" />
          <MetricCard label="Active Routes" value="2,134" icon={Radio} color="text-blue-400" />
          <MetricCard label="Avg Hops" value="3.2" icon={Zap} color="text-yellow-400" />
        </div>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">Efficiency Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={routingData}>
                <defs>
                  <linearGradient id="efficiencyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="t" tick={{ fill: '#94a3b8' }} />
                <YAxis domain={[80, 100]} tick={{ fill: '#94a3b8' }} />
                <RTooltip
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="efficiency"
                  stroke="#10b981"
                  fill="url(#efficiencyGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">Routing Algorithm Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Algorithm</span>
              <Badge variant="secondary">Multi-objective A*</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Weather Integration</span>
              <Badge variant="secondary">Real-time</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">PAT Jitter Compensation</span>
              <span className="font-mono text-sm">0.7 μrad</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">FEC Scheme</span>
              <span className="font-mono text-sm">RS(255,223)</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LatencyDrawerContent({ telemetry }: { telemetry: any }) {
  const latencyData = Array.from({ length: 60 }, (_, i) => ({
    t: i,
    latency: 22 + Math.sin(i / 7) * 4 + Math.random() * 2,
  }));

  return (
    <div className="overflow-y-auto max-h-[75vh]">
      <DrawerHeader>
        <DrawerTitle className="flex items-center gap-3 text-2xl">
          <Gauge className="w-7 h-7 text-blue-400" />
          Network Latency
        </DrawerTitle>
        <DrawerDescription>
          End-to-end latency including propagation, processing, and routing delays
        </DrawerDescription>
      </DrawerHeader>

      <div className="px-6 pb-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Current Latency" value={`${telemetry.latency.toFixed(0)} ms`} icon={Gauge} color="text-blue-400" />
          <MetricCard label="Min Latency" value="18 ms" icon={TrendingUp} color="text-green-400" />
          <MetricCard label="Jitter" value="2.3 ms" icon={Activity} color="text-yellow-400" />
        </div>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">Latency Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={latencyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="t" tick={{ fill: '#94a3b8' }} />
                <YAxis tick={{ fill: '#94a3b8' }} />
                <RTooltip
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                  }}
                />
                <Line type="monotone" dataKey="latency" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">Latency Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <LatencyBreakdownBar label="Propagation Delay" value={45} color="bg-blue-500" />
            <LatencyBreakdownBar label="Processing Time" value={25} color="bg-cyan-500" />
            <LatencyBreakdownBar label="Routing Overhead" value={20} color="bg-purple-500" />
            <LatencyBreakdownBar label="Queue Time" value={10} color="bg-yellow-500" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QKDDrawerContent({ telemetry }: { telemetry: any }) {
  const qberData = Array.from({ length: 60 }, (_, i) => ({
    t: i,
    qber: 2 + 6 * Math.abs(Math.sin(i / 12)) + Math.random(),
  }));

  return (
    <div className="overflow-y-auto max-h-[75vh]">
      <DrawerHeader>
        <DrawerTitle className="flex items-center gap-3 text-2xl">
          <ShieldCheck className="w-7 h-7 text-purple-400" />
          Quantum Key Distribution
        </DrawerTitle>
        <DrawerDescription>
          BB84 protocol with privacy amplification and error correction
        </DrawerDescription>
      </DrawerHeader>

      <div className="px-6 pb-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="QBER" value={`${telemetry.qber.toFixed(1)}%`} icon={ShieldCheck} color="text-purple-400" />
          <MetricCard label="Key Rate" value="8.2 kbps" icon={Lock} color="text-cyan-400" />
          <MetricCard label="Sifted Bits" value="2,048" icon={Activity} color="text-emerald-400" />
        </div>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">QBER Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={qberData}>
                <defs>
                  <linearGradient id="qberGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="t" tick={{ fill: '#94a3b8' }} />
                <YAxis domain={[0, 12]} tick={{ fill: '#94a3b8' }} />
                <RTooltip
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="qber"
                  stroke="#a855f7"
                  fill="url(#qberGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">Protocol Parameters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Protocol</span>
              <Badge variant="secondary">BB84</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Privacy Amplification</span>
              <span className="font-mono text-sm">0.72 ratio</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Authentication Tag</span>
              <span className="font-mono text-sm">16 bytes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">USIM Header</span>
              <span className="font-mono text-sm">48 bytes</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EntropyDrawerContent({ telemetry }: { telemetry: any }) {
  const entropyData = Array.from({ length: 60 }, (_, i) => ({
    t: i,
    rate: 6 + 4 * Math.sin(i / 8) + Math.random() * 1.5,
  }));

  return (
    <div className="overflow-y-auto max-h-[75vh]">
      <DrawerHeader>
        <DrawerTitle className="flex items-center gap-3 text-2xl">
          <Activity className="w-7 h-7 text-cyan-400" />
          Entropy Generation Rate
        </DrawerTitle>
        <DrawerDescription>
          Quantum entropy source for cryptographic key material
        </DrawerDescription>
      </DrawerHeader>

      <div className="px-6 pb-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Generation Rate" value={`${telemetry.entropy.toFixed(1)} kbps`} icon={Activity} color="text-cyan-400" />
          <MetricCard label="Pool Size" value="128 KB" icon={Cpu} color="text-purple-400" />
          <MetricCard label="Quality Score" value="99.2%" icon={ShieldCheck} color="text-emerald-400" />
        </div>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">Entropy Rate Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={entropyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="t" tick={{ fill: '#94a3b8' }} />
                <YAxis tick={{ fill: '#94a3b8' }} />
                <RTooltip
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                  }}
                />
                <Line type="monotone" dataKey="rate" stroke="#06b6d4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">Entropy Source Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Source Type</span>
              <Badge variant="secondary">Quantum Photonic</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Min-Entropy</span>
              <span className="font-mono text-sm">0.998 bits/bit</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Health Tests</span>
              <Badge className="bg-green-500/20 text-green-400">Passing</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Extraction Function</span>
              <span className="font-mono text-sm">SHA3-512</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OverviewDrawerContent({ telemetry, satelliteCount }: { telemetry: any; satelliteCount: number }) {
  return (
    <div className="overflow-y-auto max-h-[75vh]">
      <DrawerHeader>
        <DrawerTitle className="flex items-center gap-3 text-2xl">
          <BarChart3 className="w-7 h-7 text-blue-400" />
          System Overview
        </DrawerTitle>
        <DrawerDescription>
          Comprehensive view of all network metrics and status indicators
        </DrawerDescription>
      </DrawerHeader>

      <div className="px-6 pb-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Route Efficiency" value={`${telemetry.routeEfficiency.toFixed(1)}%`} icon={Network} color="text-emerald-400" />
          <MetricCard label="Latency" value={`${telemetry.latency.toFixed(0)} ms`} icon={Gauge} color="text-blue-400" />
          <MetricCard label="QBER" value={`${telemetry.qber.toFixed(1)}%`} icon={Lock} color="text-purple-400" />
          <MetricCard label="Entropy" value={`${telemetry.entropy.toFixed(1)} kbps`} icon={Activity} color="text-cyan-400" />
        </div>

        <Separator className="bg-slate-700" />

        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-400">Active Satellites</div>
                  <div className="text-3xl font-bold">{satelliteCount}</div>
                </div>
                <Satellite className="w-10 h-10 text-blue-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-400">Active Links</div>
                  <div className="text-3xl font-bold">2,134</div>
                </div>
                <Radio className="w-10 h-10 text-cyan-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-400">Throughput</div>
                  <div className="text-3xl font-bold">48.2</div>
                  <div className="text-xs text-slate-500">Gbps</div>
                </div>
                <Zap className="w-10 h-10 text-yellow-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <HealthIndicator label="Network Core" status="operational" />
            <HealthIndicator label="Quantum Systems" status="operational" />
            <HealthIndicator label="Ground Stations" status="operational" />
            <HealthIndicator label="Weather Integration" status="degraded" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, color }: any) {
  return (
    <Card className="bg-slate-800/30 border-slate-700">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <div className="text-xs text-slate-400">{label}</div>
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function LatencyBreakdownBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono">{value}%</span>
      </div>
      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full ${color}`}
        />
      </div>
    </div>
  );
}

function HealthIndicator({ label, status }: { label: string; status: 'operational' | 'degraded' | 'offline' }) {
  const statusConfig = {
    operational: { color: 'bg-green-400', text: 'Operational', textColor: 'text-green-400' },
    degraded: { color: 'bg-yellow-400', text: 'Degraded', textColor: 'text-yellow-400' },
    offline: { color: 'bg-red-400', text: 'Offline', textColor: 'text-red-400' },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${config.color} ${status === 'operational' ? 'animate-pulse' : ''}`} />
        <span className={`text-sm font-semibold ${config.textColor}`}>{config.text}</span>
      </div>
    </div>
  );
}
