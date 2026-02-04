/**
 * Fleet Financial Dashboard — Transparent unit economics from real constellation data
 *
 * Every number derives from real data:
 *   - Satellite count, plane/slot, status from gateway
 *   - Link throughputs (ISL 10 Gbps, ground ~1 Gbps × weather) from constellation store
 *   - Ground station count, tier, demand from strategic stations
 *
 * All unit prices are editable. The math is:
 *   Revenue = throughput × $/Gbps/day + QKD_keys × $/key + emergency × rate
 *   Expense = stations × $/station/day + satellites × $/sat/day + network overhead
 */

import { useState, useMemo } from 'react';
import {
  Line,
  LineChart,
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Slider } from '@/components/ui/slider';
import { Satellite as SatIcon, Radio, TrendingUp, Activity, Download, Zap } from 'lucide-react';
import type { Satellite as SatelliteType, GroundNode, FsoLink } from '@/types';

interface FinancialDashboardProps {
  satellites: SatelliteType[];
  groundStations: GroundNode[];
  fsoLinks: FsoLink[];
}

export default function FinancialDashboard({ satellites, groundStations, fsoLinks }: FinancialDashboardProps) {
  // ── Editable Unit Prices (simple round numbers for gut-checking) ──
  const [bandwidthPrice, setBandwidthPrice] = useState(100);     // $/Gbps/day
  const [qkdPrice, setQkdPrice] = useState(5);                   // $/QKD key
  const [qkdKeysPerSatDay, setQkdKeysPerSatDay] = useState(100); // keys generated per satellite per day
  const [emergencyRate, setEmergencyRate] = useState(50);         // $/day per emergency link
  const [opexPerStation, setOpexPerStation] = useState(10);       // $/station/day
  const [opexPerSat, setOpexPerSat] = useState(20);               // $/satellite/day
  const [networkOverhead, setNetworkOverhead] = useState(50);      // $/day flat

  // ── Derive real metrics from constellation data ──
  const metrics = useMemo(() => {
    const activeSats = satellites.filter(s => s.status === 'active');
    const activeStations = groundStations.filter(g => g.status === 'active');
    const activeLinks = fsoLinks.filter(l => l.active);
    const islLinks = activeLinks.filter(l => l.link_type === 'sat-sat');
    const groundLinks = activeLinks.filter(l => l.link_type === 'sat-ground');

    const totalIslThroughput = islLinks.reduce((sum, l) => sum + l.throughput_gbps, 0);
    const totalGroundThroughput = groundLinks.reduce((sum, l) => sum + l.throughput_gbps, 0);
    const totalThroughput = totalIslThroughput + totalGroundThroughput;

    return {
      activeSats,
      activeStations,
      activeLinks,
      islLinks,
      groundLinks,
      totalIslThroughput,
      totalGroundThroughput,
      totalThroughput,
    };
  }, [satellites, groundStations, fsoLinks]);

  // ── Revenue Calculation (transparent) ──
  const revenue = useMemo(() => {
    const bandwidth = metrics.totalThroughput * bandwidthPrice;
    const qkd = metrics.activeSats.length * qkdKeysPerSatDay * qkdPrice;
    const emergency = metrics.groundLinks.filter(l => l.margin_db < 3).length * emergencyRate;
    const total = bandwidth + qkd + emergency;
    return { bandwidth, qkd, emergency, total };
  }, [metrics, bandwidthPrice, qkdPrice, qkdKeysPerSatDay, emergencyRate]);

  // ── Expense Calculation (transparent) ──
  const expense = useMemo(() => {
    const stations = metrics.activeStations.length * opexPerStation;
    const sats = metrics.activeSats.length * opexPerSat;
    const overhead = networkOverhead;
    const total = stations + sats + overhead;
    return { stations, sats, overhead, total };
  }, [metrics, opexPerStation, opexPerSat, networkOverhead]);

  const profit = revenue.total - expense.total;
  const margin = revenue.total > 0 ? (profit / revenue.total) * 100 : 0;

  // ── Per-satellite breakdown ──
  const satBreakdown = useMemo(() => {
    return satellites.map(sat => {
      const satIsl = fsoLinks.filter(l => l.active && l.link_type === 'sat-sat' && (l.source_id === sat.id || l.target_id === sat.id));
      const satGround = fsoLinks.filter(l => l.active && l.link_type === 'sat-ground' && l.source_id === sat.id);
      const islGbps = satIsl.reduce((sum, l) => sum + l.throughput_gbps, 0);
      const groundGbps = satGround.reduce((sum, l) => sum + l.throughput_gbps, 0);
      const totalGbps = islGbps + groundGbps;

      const bwRev = totalGbps * bandwidthPrice;
      const qkdRev = sat.status === 'active' ? qkdKeysPerSatDay * qkdPrice : 0;
      const totalRev = bwRev + qkdRev;

      const groundTarget = satGround.length > 0
        ? groundStations.find(g => g.id === satGround[0].target_id)
        : null;

      return {
        id: sat.id,
        name: sat.name,
        plane: sat.plane,
        slot: sat.slot,
        status: sat.status,
        altitude: sat.altitude,
        islCount: satIsl.length,
        groundCount: satGround.length,
        islGbps,
        groundGbps,
        totalGbps,
        bwRev,
        qkdRev,
        totalRev,
        qber: sat.qber,
        groundTarget: groundTarget?.name ?? 'none',
        groundSource: groundTarget?.source ?? 'Unknown',
        groundWeather: groundTarget?.weather_score ?? 0,
        groundMargin: satGround.length > 0 ? satGround[0].margin_db : 0,
      };
    });
  }, [satellites, groundStations, fsoLinks, bandwidthPrice, qkdPrice, qkdKeysPerSatDay]);

  // ── Chart: revenue by satellite ──
  const satChartData = useMemo(() => {
    return satBreakdown.map(s => ({
      name: s.name,
      bandwidth: s.bwRev,
      qkd: s.qkdRev,
      total: s.totalRev,
    }));
  }, [satBreakdown]);

  // ── CSV Export ──
  const exportCsv = () => {
    const rows = [
      ['SX9 Fleet Financial Export'],
      [''],
      ['Unit Prices'],
      ['Bandwidth $/Gbps/day', String(bandwidthPrice)],
      ['QKD $/key', String(qkdPrice)],
      ['QKD keys/sat/day', String(qkdKeysPerSatDay)],
      ['Emergency $/day', String(emergencyRate)],
      ['OpEx $/station/day', String(opexPerStation)],
      ['OpEx $/satellite/day', String(opexPerSat)],
      ['Network overhead $/day', String(networkOverhead)],
      [''],
      ['Daily Summary'],
      ['Bandwidth Revenue', `$${revenue.bandwidth.toFixed(0)}`],
      ['QKD Revenue', `$${revenue.qkd.toFixed(0)}`],
      ['Emergency Revenue', `$${revenue.emergency.toFixed(0)}`],
      ['Total Revenue', `$${revenue.total.toFixed(0)}`],
      ['Total Expenses', `$${expense.total.toFixed(0)}`],
      ['Profit', `$${profit.toFixed(0)}`],
      ['Margin', `${margin.toFixed(1)}%`],
      [''],
      ['Satellite Breakdown'],
      ['Name', 'Plane', 'Slot', 'Status', 'ISL Links', 'Ground Links', 'ISL Gbps', 'Ground Gbps', 'BW Rev', 'QKD Rev', 'Total Rev', 'QBER', 'Ground Target'],
      ...satBreakdown.map(s => [
        s.name, String(s.plane), String(s.slot), s.status,
        String(s.islCount), String(s.groundCount),
        s.islGbps.toFixed(1), s.groundGbps.toFixed(2),
        `$${s.bwRev.toFixed(0)}`, `$${s.qkdRev.toFixed(0)}`, `$${s.totalRev.toFixed(0)}`,
        s.qber.toFixed(4), s.groundTarget,
      ]),
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sx9-fleet-financial.csv';
    a.click();
  };

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="p-4 md:p-5">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">SX9 Fleet Finance</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Real constellation data &middot; {satellites.length} satellites &middot; {groundStations.length} stations &middot; {fsoLinks.filter(l => l.active).length} active links
            </p>
          </div>
          <button
            onClick={exportCsv}
            className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-xs flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

        {/* KPI Bar — all derived from real data */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Daily Revenue</span>
            </div>
            <div className="font-mono text-xl font-bold text-emerald-400">{fmt(revenue.total)}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              BW: {fmt(revenue.bandwidth)} + QKD: {fmt(revenue.qkd)} + Emerg: {fmt(revenue.emergency)}
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Daily Profit</span>
            </div>
            <div className={`font-mono text-xl font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmt(profit)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Margin: {margin.toFixed(1)}% &middot; Annual: {fmt(profit * 365)}
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Total Throughput</span>
            </div>
            <div className="font-mono text-xl font-bold text-slate-100">{metrics.totalThroughput.toFixed(1)} Gbps</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              ISL: {metrics.totalIslThroughput.toFixed(0)} + GND: {metrics.totalGroundThroughput.toFixed(1)}
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Radio className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Daily Expenses</span>
            </div>
            <div className="font-mono text-xl font-bold text-red-400">{fmt(expense.total)}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Stn: {fmt(expense.stations)} + Sat: {fmt(expense.sats)} + Net: {fmt(expense.overhead)}
            </div>
          </div>
        </div>

        {/* Editable Unit Prices — the knobs */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold text-slate-100 mb-3">Unit Economics (edit to model scenarios)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <PriceSlider label="Bandwidth" unit="$/Gbps/day" value={bandwidthPrice} onChange={setBandwidthPrice} min={1} max={1000} step={1} color="text-cyan-400" />
            <PriceSlider label="QKD Key Price" unit="$/key" value={qkdPrice} onChange={setQkdPrice} min={1} max={100} step={1} color="text-green-400" />
            <PriceSlider label="QKD Keys/Sat/Day" unit="keys" value={qkdKeysPerSatDay} onChange={setQkdKeysPerSatDay} min={10} max={10000} step={10} color="text-green-400" />
            <PriceSlider label="Emergency Rate" unit="$/day/link" value={emergencyRate} onChange={setEmergencyRate} min={1} max={500} step={1} color="text-amber-400" />
            <PriceSlider label="Station OpEx" unit="$/station/day" value={opexPerStation} onChange={setOpexPerStation} min={1} max={500} step={1} color="text-red-400" />
            <PriceSlider label="Satellite OpEx" unit="$/sat/day" value={opexPerSat} onChange={setOpexPerSat} min={1} max={1000} step={1} color="text-red-400" />
            <PriceSlider label="Network Overhead" unit="$/day flat" value={networkOverhead} onChange={setNetworkOverhead} min={0} max={1000} step={10} color="text-red-400" />
          </div>

          {/* The math, spelled out */}
          <div className="mt-3 pt-3 border-t border-slate-700 text-[11px] font-mono text-slate-500 space-y-0.5">
            <div>Revenue = {metrics.totalThroughput.toFixed(1)} Gbps × ${bandwidthPrice}/Gbps + {metrics.activeSats.length} sats × {qkdKeysPerSatDay} keys × ${qkdPrice}/key + {metrics.groundLinks.filter(l => l.margin_db < 3).length} emerg × ${emergencyRate} = <span className="text-emerald-400">{fmt(revenue.total)}/day</span></div>
            <div>Expense = {metrics.activeStations.length} stations × ${opexPerStation} + {metrics.activeSats.length} sats × ${opexPerSat} + ${networkOverhead} overhead = <span className="text-red-400">{fmt(expense.total)}/day</span></div>
            <div>Profit = {fmt(revenue.total)} - {fmt(expense.total)} = <span className={profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmt(profit)}/day → {fmt(profit * 365)}/year</span></div>
          </div>
        </div>

        {/* Per-Satellite Cards */}
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-100 mb-2">Per-Satellite Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {satBreakdown.map(sat => (
              <div key={sat.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3 hover:border-slate-600 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <SatIcon className="h-4 w-4 text-cyan-400" />
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{sat.name}</div>
                      <div className="text-[10px] text-slate-500">Plane {sat.plane} · Slot {sat.slot} · {Math.round(sat.altitude)} km</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium ${sat.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {sat.status}
                  </span>
                </div>

                {/* Revenue breakdown */}
                <div className="text-xs mb-2">
                  <div className="flex justify-between text-slate-400">
                    <span>BW: {sat.totalGbps.toFixed(1)} Gbps × ${bandwidthPrice}</span>
                    <span className="text-emerald-400 font-mono">{fmt(sat.bwRev)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>QKD: {qkdKeysPerSatDay} keys × ${qkdPrice}</span>
                    <span className="text-green-400 font-mono">{fmt(sat.qkdRev)}</span>
                  </div>
                  <div className="flex justify-between text-slate-200 font-medium border-t border-slate-700 mt-1 pt-1">
                    <span>Daily Total</span>
                    <span className="font-mono">{fmt(sat.totalRev)}</span>
                  </div>
                </div>

                {/* Link stats */}
                <div className="grid grid-cols-5 gap-1 pt-1.5 border-t border-slate-700 text-[10px]">
                  <div>
                    <div className="text-slate-500">ISL</div>
                    <div className="font-mono text-slate-300">{sat.islCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">GND</div>
                    <div className="font-mono text-slate-300">{sat.groundCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Wx</div>
                    <div className={`font-mono ${sat.groundWeather >= 0.8 ? 'text-emerald-400' : sat.groundWeather >= 0.6 ? 'text-amber-400' : 'text-red-400'}`}>
                      {(sat.groundWeather * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Margin</div>
                    <div className={`font-mono ${sat.groundMargin >= 6 ? 'text-emerald-400' : sat.groundMargin >= 3 ? 'text-cyan-400' : 'text-amber-400'}`}>
                      {sat.groundMargin.toFixed(1)} dB
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">QBER</div>
                    <div className={`font-mono ${sat.qber < 0.05 ? 'text-emerald-400' : sat.qber < 0.1 ? 'text-amber-400' : 'text-red-400'}`}>
                      {(sat.qber * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[9px] text-slate-600 mt-1">
                  <span className="truncate">→ {sat.groundTarget}</span>
                  <span className={`px-1 rounded ${
                    sat.groundSource === 'LaserLight' ? 'bg-cyan-900/40 text-cyan-400'
                    : sat.groundSource === 'Equinix' ? 'bg-purple-900/40 text-purple-400'
                    : sat.groundSource === 'CableLanding' ? 'bg-amber-900/40 text-amber-400'
                    : 'bg-slate-800 text-slate-500'
                  }`}>{sat.groundSource}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue by Satellite */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-slate-100 mb-2">Revenue by Satellite ($/day)</h2>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={satChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85)" />
                  <XAxis dataKey="name" stroke="rgb(148 163 184)" fontSize={10} angle={-45} textAnchor="end" height={60} />
                  <YAxis stroke="rgb(148 163 184)" fontSize={10} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgb(30 41 59)', border: '1px solid rgb(51 65 85)', borderRadius: '8px', color: 'rgb(241 245 249)' }}
                    formatter={(value: number, name: string) => [`$${value.toFixed(0)}`, name]}
                  />
                  <Legend />
                  <Bar dataKey="bandwidth" fill="#22d3ee" name="Bandwidth" stackId="a" />
                  <Bar dataKey="qkd" fill="#10b981" name="QKD" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue vs Expense trend (simulated time) */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-slate-100 mb-2">Annualized Projection</h2>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[
                  { period: 'Day', revenue: revenue.total, expense: expense.total, profit },
                  { period: 'Week', revenue: revenue.total * 7, expense: expense.total * 7, profit: profit * 7 },
                  { period: 'Month', revenue: revenue.total * 30, expense: expense.total * 30, profit: profit * 30 },
                  { period: 'Quarter', revenue: revenue.total * 90, expense: expense.total * 90, profit: profit * 90 },
                  { period: 'Year', revenue: revenue.total * 365, expense: expense.total * 365, profit: profit * 365 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85)" />
                  <XAxis dataKey="period" stroke="rgb(148 163 184)" fontSize={11} />
                  <YAxis stroke="rgb(148 163 184)" fontSize={10} tickFormatter={(v) => fmt(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgb(30 41 59)', border: '1px solid rgb(51 65 85)', borderRadius: '8px', color: 'rgb(241 245 249)' }}
                    formatter={(value: number, name: string) => [fmt(value), name]}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#22d3ee" strokeWidth={2} name="Revenue" />
                  <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} name="Expense" />
                  <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} name="Profit" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reusable price slider with label + value display
function PriceSlider({ label, unit, value, onChange, min, max, step, color }: {
  label: string; unit: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; color: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={`font-mono font-semibold ${color}`}>{value} <span className="text-slate-500 text-[10px]">{unit}</span></span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
    </div>
  );
}
