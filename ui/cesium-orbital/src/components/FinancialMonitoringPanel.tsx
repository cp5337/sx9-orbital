/**
 * SX9 Financial Monitoring Panel — Network-wide station economics
 *
 * Derives from real constellation data:
 *   - Real ground station count, tiers, weather scores
 *   - Real FSO link throughputs and margins
 *   - All unit prices editable with transparent math
 *
 * Revenue model per station:
 *   Rev1 = demand_gbps × $/Gbps/day (ULL TaaS bandwidth)
 *   Rev2 = QKD sessions/day × $/session (QKD key distribution)
 *   Rev3 = emergency links × premium rate
 *
 * Expense model per station:
 *   Exp1 = base OpEx × tier multiplier (operations)
 *   Exp2 = equipment depreciation rate/day (infrastructure)
 *   Exp3 = active links × $/link/day (network)
 */

import { useState, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Settings,
  Satellite,
  Network,
  Zap,
  Eye,
  Settings2 as SliderIcon,
  Shield,
  Download,
} from 'lucide-react';
import type { Satellite as SatelliteType, GroundNode, FsoLink } from '@/types';

interface FinancialMonitoringPanelProps {
  satellites: SatelliteType[];
  groundStations: GroundNode[];
  fsoLinks: FsoLink[];
}

export function FinancialMonitoringPanel({
  satellites,
  groundStations,
  fsoLinks,
}: FinancialMonitoringPanelProps) {
  const [selectedMetricView, setSelectedMetricView] = useState<'overview' | 'revenue' | 'expenses' | 'sources' | 'gaap' | 'performance'>('overview');

  // ── Editable Unit Prices ──
  const [bwPricePerGbps, setBwPricePerGbps] = useState(100);      // $/Gbps/day ULL TaaS
  const [qkdSessionPrice, setQkdSessionPrice] = useState(10);      // $/QKD session
  const [qkdSessionsPerStation, setQkdSessionsPerStation] = useState(50); // sessions/station/day
  const [emergencyPremium, setEmergencyPremium] = useState(100);    // $/day per emergency event
  const [baseOpexPerStation, setBaseOpexPerStation] = useState(20); // $/station/day base
  const [equipmentRate, setEquipmentRate] = useState(5);            // $/station/day depreciation
  const [linkCost, setLinkCost] = useState(2);                      // $/active link/day

  // ── CapEx Assumptions (Balance Sheet) ──
  const [satCapexM, setSatCapexM] = useState(50);                   // $M per satellite
  const [stationCapexM, setStationCapexM] = useState(5);            // $M per T1 station (T2=40%, T3=10%)
  const [fsoTerminalCapexM, setFsoTerminalCapexM] = useState(10);   // $M per FSO terminal
  const [depreciationYears, setDepreciationYears] = useState(10);   // straight-line years

  // ── Derive real per-station financials from live data ──
  const stationFinancials = useMemo(() => {
    return groundStations.map(gs => {
      // Links connected to this station
      const stationLinks = fsoLinks.filter(l => l.active && l.target_id === gs.id);
      const totalLinkThroughput = stationLinks.reduce((sum, l) => sum + l.throughput_gbps, 0);
      const avgMargin = stationLinks.length > 0
        ? stationLinks.reduce((sum, l) => sum + l.margin_db, 0) / stationLinks.length
        : 0;
      const emergencyLinks = stationLinks.filter(l => l.margin_db < 3).length;

      // Tier multiplier: T1 = 1.5x, T2 = 1.0x, T3 = 0.7x
      const tierMultiplier = gs.tier === 1 ? 1.5 : gs.tier === 2 ? 1.0 : 0.7;

      // Revenue
      const rev1 = (gs.demand_gbps + totalLinkThroughput) * bwPricePerGbps;
      const rev2 = qkdSessionsPerStation * qkdSessionPrice * tierMultiplier;
      const rev3 = emergencyLinks * emergencyPremium;
      const totalRevenue = rev1 + rev2 + rev3;

      // Expenses
      const exp1 = baseOpexPerStation * tierMultiplier;
      const exp2 = equipmentRate * tierMultiplier;
      const exp3 = stationLinks.length * linkCost;
      const totalExpenses = exp1 + exp2 + exp3;

      const profit = totalRevenue - totalExpenses;
      const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

      return {
        id: gs.id,
        name: gs.name,
        code: gs.station_code,
        tier: gs.tier,
        zone: gs.zone,
        source: gs.source || 'Unknown',
        weatherScore: gs.weather_score,
        demandGbps: gs.demand_gbps,
        linkCount: stationLinks.length,
        linkThroughput: totalLinkThroughput,
        avgMargin,
        rev1, rev2, rev3, totalRevenue,
        exp1, exp2, exp3, totalExpenses,
        profit, margin,
      };
    });
  }, [groundStations, fsoLinks, bwPricePerGbps, qkdSessionPrice, qkdSessionsPerStation, emergencyPremium, baseOpexPerStation, equipmentRate, linkCost]);

  // ── Network summary ──
  const network = useMemo(() => {
    const totalRev = stationFinancials.reduce((sum, s) => sum + s.totalRevenue, 0);
    const totalExp = stationFinancials.reduce((sum, s) => sum + s.totalExpenses, 0);
    const totalProfit = totalRev - totalExp;
    const avgMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;

    const totalRev1 = stationFinancials.reduce((sum, s) => sum + s.rev1, 0);
    const totalRev2 = stationFinancials.reduce((sum, s) => sum + s.rev2, 0);
    const totalRev3 = stationFinancials.reduce((sum, s) => sum + s.rev3, 0);
    const totalExp1 = stationFinancials.reduce((sum, s) => sum + s.exp1, 0);
    const totalExp2 = stationFinancials.reduce((sum, s) => sum + s.exp2, 0);
    const totalExp3 = stationFinancials.reduce((sum, s) => sum + s.exp3, 0);

    const byTier = [1, 2, 3].map(tier => {
      const tierStations = stationFinancials.filter(s => s.tier === tier);
      return {
        tier,
        count: tierStations.length,
        revenue: tierStations.reduce((sum, s) => sum + s.totalRevenue, 0),
        expense: tierStations.reduce((sum, s) => sum + s.totalExpenses, 0),
      };
    });

    // Group by infrastructure source type — commodities view
    const sourceNames = [...new Set(stationFinancials.map(s => s.source))].sort();
    const bySource = sourceNames.map(source => {
      const sourceStations = stationFinancials.filter(s => s.source === source);
      const revenue = sourceStations.reduce((sum, s) => sum + s.totalRevenue, 0);
      const expense = sourceStations.reduce((sum, s) => sum + s.totalExpenses, 0);
      const throughput = sourceStations.reduce((sum, s) => sum + s.linkThroughput, 0);
      const avgWeather = sourceStations.reduce((sum, s) => sum + s.weatherScore, 0) / (sourceStations.length || 1);
      // Weather sensitivity: FSO/LaserLight = high, fiber = low
      const sensitivity = source === 'LaserLight' ? 1.0
        : source === 'GroundNode' ? 0.8
        : source === 'CableLanding' ? 0.3
        : source === 'Equinix' ? 0.1
        : source === 'FinancialInfra' ? 0.2
        : 0.5;
      return { source, count: sourceStations.length, revenue, expense, throughput, avgWeather, sensitivity };
    });

    // Arbitrage: when weather-sensitive sources (FSO) degrade, fiber sources gain routing value
    const fsoSources = bySource.filter(s => s.sensitivity >= 0.7);
    const fiberSources = bySource.filter(s => s.sensitivity <= 0.3);
    const avgFsoWeather = fsoSources.length > 0
      ? fsoSources.reduce((sum, s) => sum + s.avgWeather * s.count, 0) / fsoSources.reduce((sum, s) => sum + s.count, 0)
      : 1;
    const fiberCapacity = fiberSources.reduce((sum, s) => sum + s.throughput, 0);
    // Arbitrage value: weather-driven premium on fiber when FSO degrades
    const arbitrageValue = avgFsoWeather < 0.85
      ? (1 - avgFsoWeather) * fiberCapacity * bwPricePerGbps * 0.3
      : 0;

    // GAAP: Cost of Revenue (COGS)
    const weatherCapacityLoss = stationFinancials.reduce((sum, s) => {
      if (s.weatherScore > 0 && s.linkThroughput > 0) {
        const maxThroughput = s.linkThroughput / s.weatherScore;
        return sum + (maxThroughput - s.linkThroughput) * bwPricePerGbps;
      }
      return sum;
    }, 0);
    const totalCogs = totalExp3 + weatherCapacityLoss;
    const grossProfit = totalRev - totalCogs;
    const grossMargin = totalRev > 0 ? (grossProfit / totalRev) * 100 : 0;
    const totalOpex = totalExp1 + totalExp2;
    const operatingIncome = grossProfit - totalOpex;
    const operatingMargin = totalRev > 0 ? (operatingIncome / totalRev) * 100 : 0;

    // ── Balance Sheet / CapEx ──
    const totalSatCapex = satellites.length * satCapexM * 1_000_000;
    const stationCapex = stationFinancials.reduce((sum, s) => {
      const tierMult = s.tier === 1 ? 1.0 : s.tier === 2 ? 0.4 : 0.1;
      return sum + stationCapexM * tierMult * 1_000_000;
    }, 0);
    const activeGroundLinks = fsoLinks.filter(l => l.active && l.link_type === 'sat-ground').length;
    const totalFsoTerminalCapex = activeGroundLinks * fsoTerminalCapexM * 1_000_000;
    const totalAssets = totalSatCapex + stationCapex + totalFsoTerminalCapex;
    const annualDepreciation = depreciationYears > 0 ? totalAssets / depreciationYears : 0;
    const dailyDepreciation = annualDepreciation / 365;
    const netBookValue = totalAssets - dailyDepreciation; // day-1 approximation
    const ebitda = operatingIncome + dailyDepreciation;
    const netIncome = operatingIncome - dailyDepreciation;
    const roa = netBookValue > 0 ? ((operatingIncome * 365) / netBookValue) * 100 : 0;

    return { totalRev, totalExp, totalProfit, avgMargin, totalRev1, totalRev2, totalRev3, totalExp1, totalExp2, totalExp3, byTier, bySource, arbitrageValue, avgFsoWeather, weatherCapacityLoss, totalCogs, grossProfit, grossMargin, totalOpex, operatingIncome, operatingMargin, totalSatCapex, stationCapex, totalFsoTerminalCapex, totalAssets, annualDepreciation, dailyDepreciation, netBookValue, ebitda, netIncome, roa };
  }, [stationFinancials, bwPricePerGbps, satellites.length, fsoLinks, satCapexM, stationCapexM, fsoTerminalCapexM, depreciationYears]);

  // ── Chart data ──
  const revenueBreakdown = [
    { name: 'ULL TaaS (Rev 1)', value: network.totalRev1, color: '#3B82F6' },
    { name: 'QKD Sessions (Rev 2)', value: network.totalRev2, color: '#10B981' },
    { name: 'Emergency (Rev 3)', value: network.totalRev3, color: '#F59E0B' },
  ];

  const expenseBreakdown = [
    { name: 'Operations (Exp 1)', value: network.totalExp1, color: '#EF4444' },
    { name: 'Equipment (Exp 2)', value: network.totalExp2, color: '#8B5CF6' },
    { name: 'Network (Exp 3)', value: network.totalExp3, color: '#06B6D4' },
  ];

  const tierChartData = network.byTier.map(t => ({
    name: `Tier ${t.tier}`,
    stations: t.count,
    revenue: t.revenue,
    expense: t.expense,
    profit: t.revenue - t.expense,
  }));

  const sourceChartData = network.bySource.map(s => ({
    name: s.source,
    stations: s.count,
    revenue: s.revenue,
    expense: s.expense,
    profit: s.revenue - s.expense,
    throughput: s.throughput,
    weather: +(s.avgWeather * 100).toFixed(0),
    sensitivity: +(s.sensitivity * 100).toFixed(0),
  }));

  const waterfallData = [
    { name: 'Revenue', value: network.totalRev, fill: '#3B82F6' },
    { name: 'COGS', value: -network.totalCogs, fill: '#EF4444' },
    { name: 'Gross Profit', value: network.grossProfit, fill: '#10B981' },
    { name: 'OpEx', value: -network.totalOpex, fill: '#F59E0B' },
    { name: 'Op. Income', value: network.operatingIncome, fill: '#8B5CF6' },
    { name: 'Depreciation', value: -network.dailyDepreciation, fill: '#EC4899' },
    { name: 'Net Income', value: network.netIncome, fill: network.netIncome >= 0 ? '#10B981' : '#EF4444' },
  ];

  const SOURCE_COLORS: Record<string, string> = {
    Equinix: '#8B5CF6',
    LaserLight: '#06B6D4',
    CableLanding: '#F59E0B',
    FinancialInfra: '#10B981',
    GroundNode: '#3B82F6',
    Research: '#EC4899',
    Unknown: '#6B7280',
  };

  // Top/bottom performing stations
  const topStations = [...stationFinancials].sort((a, b) => b.profit - a.profit).slice(0, 10);

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  const exportCsv = () => {
    const rows: string[][] = [
      ['SX9 Financial Report', new Date().toISOString()],
      [],
      ['=== INCOME STATEMENT (Daily) ==='],
      ['Line Item', 'Amount ($)'],
      ['ULL TaaS Revenue (Rev 1)', network.totalRev1.toFixed(2)],
      ['QKD Revenue (Rev 2)', network.totalRev2.toFixed(2)],
      ['Emergency Revenue (Rev 3)', network.totalRev3.toFixed(2)],
      ['Total Revenue', network.totalRev.toFixed(2)],
      [],
      ['Network Costs (COGS - Exp 3)', (-network.totalExp3).toFixed(2)],
      ['Weather Capacity Loss', (-network.weatherCapacityLoss).toFixed(2)],
      ['Total COGS', (-network.totalCogs).toFixed(2)],
      ['Gross Profit', network.grossProfit.toFixed(2)],
      ['Gross Margin %', network.grossMargin.toFixed(2)],
      [],
      ['Operations (Exp 1)', (-network.totalExp1).toFixed(2)],
      ['Equipment (Exp 2)', (-network.totalExp2).toFixed(2)],
      ['Total OpEx', (-network.totalOpex).toFixed(2)],
      ['Operating Income', network.operatingIncome.toFixed(2)],
      ['Operating Margin %', network.operatingMargin.toFixed(2)],
      [],
      ['Depreciation (daily)', (-network.dailyDepreciation).toFixed(2)],
      ['Net Income', network.netIncome.toFixed(2)],
      ['EBITDA', network.ebitda.toFixed(2)],
      [],
      ['=== BALANCE SHEET ==='],
      ['Asset', 'Amount ($)'],
      ['Satellite CapEx', network.totalSatCapex.toFixed(2)],
      ['Station CapEx', network.stationCapex.toFixed(2)],
      ['FSO Terminal CapEx', network.totalFsoTerminalCapex.toFixed(2)],
      ['Total Assets', network.totalAssets.toFixed(2)],
      ['Annual Depreciation', network.annualDepreciation.toFixed(2)],
      ['Daily Depreciation', network.dailyDepreciation.toFixed(2)],
      ['Net Book Value', network.netBookValue.toFixed(2)],
      ['ROA %', network.roa.toFixed(2)],
      [],
      ['=== PER-STATION BREAKDOWN ==='],
      ['Station', 'Code', 'Tier', 'Rev1', 'Rev2', 'Rev3', 'Total Revenue', 'Exp1', 'Exp2', 'Exp3', 'Total Expenses', 'Profit', 'Margin %'],
      ...stationFinancials.map(s => [
        s.name, s.code, String(s.tier),
        s.rev1.toFixed(2), s.rev2.toFixed(2), s.rev3.toFixed(2), s.totalRevenue.toFixed(2),
        s.exp1.toFixed(2), s.exp2.toFixed(2), s.exp3.toFixed(2), s.totalExpenses.toFixed(2),
        s.profit.toFixed(2), s.margin.toFixed(2),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sx9-financial-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-5 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-slate-100">
            <DollarSign className="h-7 w-7 text-green-400" />
            SX9 Financial Monitor
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real station economics &middot; {groundStations.length} stations &middot; {satellites.length} satellites &middot; {fsoLinks.filter(l => l.active).length} active links
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-slate-600 text-slate-300">
            All numbers from live constellation data
          </Badge>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-600 rounded-md hover:bg-slate-700 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Daily Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">{fmt(network.totalRev)}</div>
            <p className="text-xs text-slate-500">Annual: {fmt(network.totalRev * 365)}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Gross Margin</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{network.grossMargin.toFixed(1)}%</div>
            <p className="text-xs text-slate-500">Gross Profit: {fmt(network.grossProfit)}/day</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Stations</CardTitle>
            <Satellite className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">{groundStations.length}</div>
            <p className="text-xs text-slate-500">T1: {network.byTier[0].count} · T2: {network.byTier[1].count} · T3: {network.byTier[2].count}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Active Links</CardTitle>
            <Network className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-400">{fsoLinks.filter(l => l.active).length}</div>
            <p className="text-xs text-slate-500">
              ISL: {fsoLinks.filter(l => l.active && l.link_type === 'sat-sat').length} · GND: {fsoLinks.filter(l => l.active && l.link_type === 'sat-ground').length}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Operating Margin</CardTitle>
            <Zap className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${network.operatingMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{network.operatingMargin.toFixed(1)}%</div>
            <p className="text-xs text-slate-500">OpInc: {fmt(network.operatingIncome)}/day</p>
          </CardContent>
        </Card>
      </div>

      {/* Adjustable Unit Prices */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Settings className="h-5 w-5" />
            Unit Economics
            <Badge variant="outline" className="border-slate-600 text-slate-400">Edit to model scenarios</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Revenue knobs */}
            <div className="space-y-4">
              <h4 className="font-semibold text-green-400 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Revenue Inputs
              </h4>
              <div className="space-y-3">
                <KnobSlider label="Rev 1: Bandwidth $/Gbps/day" value={bwPricePerGbps} onChange={setBwPricePerGbps} min={1} max={500} step={1} color="text-blue-400" />
                <KnobSlider label="Rev 2: QKD $/session" value={qkdSessionPrice} onChange={setQkdSessionPrice} min={1} max={100} step={1} color="text-green-400" />
                <KnobSlider label="Rev 2: Sessions/stn/day" value={qkdSessionsPerStation} onChange={setQkdSessionsPerStation} min={1} max={500} step={1} color="text-green-400" />
                <KnobSlider label="Rev 3: Emergency $/event/day" value={emergencyPremium} onChange={setEmergencyPremium} min={1} max={1000} step={1} color="text-amber-400" />
              </div>
            </div>

            {/* Expense knobs */}
            <div className="space-y-4">
              <h4 className="font-semibold text-red-400 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Expense Inputs
              </h4>
              <div className="space-y-3">
                <KnobSlider label="Exp 1: Base OpEx $/stn/day" value={baseOpexPerStation} onChange={setBaseOpexPerStation} min={1} max={200} step={1} color="text-red-400" />
                <KnobSlider label="Exp 2: Equipment $/stn/day" value={equipmentRate} onChange={setEquipmentRate} min={1} max={100} step={1} color="text-purple-400" />
                <KnobSlider label="Exp 3: Link cost $/link/day" value={linkCost} onChange={setLinkCost} min={1} max={50} step={1} color="text-cyan-400" />
              </div>
            </div>

            {/* Impact summary */}
            <div className="space-y-4">
              <h4 className="font-semibold text-blue-400 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Real-time Impact
              </h4>
              <div className="space-y-3">
                <div className="p-3 bg-green-950/40 border border-green-900/50 rounded-lg">
                  <div className="text-sm text-green-400 font-medium">Daily Revenue</div>
                  <div className="text-lg font-bold text-green-300">{fmt(network.totalRev)}</div>
                </div>
                <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-lg">
                  <div className="text-sm text-red-400 font-medium">Daily Expenses</div>
                  <div className="text-lg font-bold text-red-300">{fmt(network.totalExp)}</div>
                </div>
                <div className="p-3 bg-blue-950/40 border border-blue-900/50 rounded-lg">
                  <div className="text-sm text-blue-400 font-medium">Net Margin</div>
                  <div className="text-lg font-bold text-blue-300">{network.avgMargin.toFixed(1)}%</div>
                </div>
                <div className="p-3 bg-purple-950/40 border border-purple-900/50 rounded-lg">
                  <div className="text-sm text-purple-400 font-medium">Annual Projection</div>
                  <div className="text-lg font-bold text-purple-300">{fmt(network.totalRev * 365)}</div>
                </div>
              </div>
            </div>

            {/* CapEx knobs */}
            <div className="space-y-4">
              <h4 className="font-semibold text-orange-400 flex items-center gap-2">
                <Satellite className="h-4 w-4" />
                CapEx Assumptions
              </h4>
              <div className="space-y-3">
                <KnobSlider label="Satellite CapEx ($M/sat)" value={satCapexM} onChange={setSatCapexM} min={1} max={200} step={1} color="text-orange-400" />
                <KnobSlider label="Station CapEx ($M/T1)" value={stationCapexM} onChange={setStationCapexM} min={1} max={50} step={1} color="text-orange-400" />
                <KnobSlider label="FSO Terminal ($M/unit)" value={fsoTerminalCapexM} onChange={setFsoTerminalCapexM} min={1} max={50} step={1} color="text-orange-400" />
                <KnobSlider label="Depreciation (years)" value={depreciationYears} onChange={setDepreciationYears} min={1} max={30} step={1} color="text-orange-400" />
              </div>
            </div>
          </div>

          {/* Spelled-out math */}
          <div className="mt-3 pt-3 border-t border-slate-700 text-[11px] font-mono text-slate-500 space-y-0.5">
            <div>Rev1 = Σ(station demand_gbps + link throughput) × ${bwPricePerGbps}/Gbps = <span className="text-blue-400">{fmt(network.totalRev1)}</span></div>
            <div>Rev2 = {groundStations.length} stations × {qkdSessionsPerStation} sessions × ${qkdSessionPrice} × tier_mult = <span className="text-green-400">{fmt(network.totalRev2)}</span></div>
            <div>Rev3 = emergency_links × ${emergencyPremium} = <span className="text-amber-400">{fmt(network.totalRev3)}</span></div>
            <div>Exp = {groundStations.length} stations × (${baseOpexPerStation} + ${equipmentRate}) × tier_mult + links × ${linkCost} = <span className="text-red-400">{fmt(network.totalExp)}</span></div>
            <div>SatCapEx = {satellites.length} sats × ${satCapexM}M = <span className="text-orange-400">{fmt(network.totalSatCapex)}</span></div>
            <div>StnCapEx = Σ(station × ${stationCapexM}M × tier_mult) = <span className="text-orange-400">{fmt(network.stationCapex)}</span></div>
            <div>FSOCapEx = {fsoLinks.filter(l => l.active && l.link_type === 'sat-ground').length} terminals × ${fsoTerminalCapexM}M = <span className="text-orange-400">{fmt(network.totalFsoTerminalCapex)}</span></div>
            <div>Depr = {fmt(network.totalAssets)} / {depreciationYears}yr / 365 = <span className="text-orange-400">{fmt(network.dailyDepreciation)}/day</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <Tabs value={selectedMetricView} onValueChange={(v: string) => setSelectedMetricView(v as typeof selectedMetricView)}>
        <TabsList className="grid w-full grid-cols-6 bg-slate-800">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="gaap">GAAP</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader><CardTitle className="text-slate-100">Revenue Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={revenueBreakdown} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}>
                      {revenueBreakdown.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v as number)}
                      contentStyle={{ backgroundColor: 'rgb(30 41 59)', border: '1px solid rgb(51 65 85)', borderRadius: '8px', color: 'rgb(241 245 249)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-slate-800 border-slate-700">
              <CardHeader><CardTitle className="text-slate-100">Expense Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={expenseBreakdown} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}>
                      {expenseBreakdown.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v as number)}
                      contentStyle={{ backgroundColor: 'rgb(30 41 59)', border: '1px solid rgb(51 65 85)', borderRadius: '8px', color: 'rgb(241 245 249)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader><CardTitle className="text-slate-100">Revenue by Tier</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={tierChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85)" />
                  <XAxis dataKey="name" stroke="rgb(148 163 184)" fontSize={11} />
                  <YAxis stroke="rgb(148 163 184)" fontSize={10} tickFormatter={(v) => fmt(v)} />
                  <Tooltip formatter={(v) => fmt(v as number)}
                    contentStyle={{ backgroundColor: 'rgb(30 41 59)', border: '1px solid rgb(51 65 85)', borderRadius: '8px', color: 'rgb(241 245 249)' }} />
                  <Legend />
                  <Bar dataKey="revenue" fill="#3B82F6" name="Revenue" />
                  <Bar dataKey="expense" fill="#EF4444" name="Expense" />
                  <Bar dataKey="profit" fill="#10B981" name="Profit" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader><CardTitle className="text-sm text-slate-200">Operations (Exp 1)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-400">{fmt(network.totalExp1)}</div>
                <div className="text-sm text-slate-400">${baseOpexPerStation} × tier_mult × {groundStations.length} stations</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader><CardTitle className="text-sm text-slate-200">Equipment (Exp 2)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-400">{fmt(network.totalExp2)}</div>
                <div className="text-sm text-slate-400">${equipmentRate} × tier_mult × {groundStations.length} stations</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader><CardTitle className="text-sm text-slate-200">Network (Exp 3)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-cyan-400">{fmt(network.totalExp3)}</div>
                <div className="text-sm text-slate-400">${linkCost} × {fsoLinks.filter(l => l.active && l.link_type === 'sat-ground').length} active ground links</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue by Source */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader><CardTitle className="text-slate-100">Revenue by Infrastructure Source</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={sourceChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85)" />
                    <XAxis dataKey="name" stroke="rgb(148 163 184)" fontSize={10} />
                    <YAxis stroke="rgb(148 163 184)" fontSize={10} tickFormatter={(v) => fmt(v)} />
                    <Tooltip formatter={(v) => fmt(v as number)}
                      contentStyle={{ backgroundColor: 'rgb(30 41 59)', border: '1px solid rgb(51 65 85)', borderRadius: '8px', color: 'rgb(241 245 249)' }} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue">
                      {sourceChartData.map((s, i) => <Cell key={i} fill={SOURCE_COLORS[s.name] || '#6B7280'} />)}
                    </Bar>
                    <Bar dataKey="expense" fill="#EF4444" name="Expense" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Weather Sensitivity & Arbitrage */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader><CardTitle className="text-slate-100">Weather Sensitivity &amp; Arbitrage</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {network.bySource.map(s => {
                    const color = SOURCE_COLORS[s.source] || '#6B7280';
                    const weatherPct = (s.avgWeather * 100).toFixed(0);
                    const sensLabel = s.sensitivity >= 0.7 ? 'HIGH' : s.sensitivity >= 0.3 ? 'MED' : 'LOW';
                    const sensColor = s.sensitivity >= 0.7 ? 'text-red-400' : s.sensitivity >= 0.3 ? 'text-amber-400' : 'text-green-400';
                    return (
                      <div key={s.source} className="flex items-center gap-2 p-2 bg-slate-900/50 rounded text-xs">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <div className="w-28 font-medium text-slate-200 truncate">{s.source}</div>
                        <div className="w-12 text-right text-slate-400">{s.count} stn</div>
                        <div className="flex-1">
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${weatherPct}%`, backgroundColor: color }} />
                          </div>
                        </div>
                        <div className="w-14 text-right font-mono text-slate-300">{weatherPct}% wx</div>
                        <div className={`w-10 text-right font-mono ${sensColor}`}>{sensLabel}</div>
                        <div className="w-16 text-right font-mono text-slate-300">{fmt(s.revenue)}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Arbitrage Signal */}
                <div className={`mt-4 p-3 rounded-lg border ${network.arbitrageValue > 0 ? 'bg-amber-950/30 border-amber-900/50' : 'bg-slate-900/50 border-slate-700'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-200">Weather Arbitrage Signal</span>
                    <span className={`text-xs font-mono ${network.arbitrageValue > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                      {network.arbitrageValue > 0 ? 'ACTIVE' : 'NEUTRAL'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-0.5">
                    <div>FSO avg weather: <span className="font-mono text-cyan-400">{(network.avgFsoWeather * 100).toFixed(0)}%</span> — trigger at &lt;85%</div>
                    {network.arbitrageValue > 0 && (
                      <div>Fiber routing premium: <span className="font-mono text-amber-400">{fmt(network.arbitrageValue)}/day</span></div>
                    )}
                    <div className="text-slate-500 mt-1">When weather degrades FSO links, fiber-based sources (Equinix, CableLanding) carry premium routing value</div>
                  </div>
                </div>

                {/* Spelled-out arbitrage math */}
                <div className="mt-2 text-[10px] font-mono text-slate-600">
                  Arb = (1 - fso_weather) × fiber_capacity_gbps × ${bwPricePerGbps}/Gbps × 0.3 premium
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="gaap" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Income Statement */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-100">Income Statement <span className="text-xs text-slate-400 font-normal">(Daily)</span></CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <IncomeRow label="ULL TaaS Revenue (Rev 1)" value={network.totalRev1} color="text-blue-400" indent fmt={fmt} />
                <IncomeRow label="QKD Revenue (Rev 2)" value={network.totalRev2} color="text-green-400" indent fmt={fmt} />
                <IncomeRow label="Emergency Revenue (Rev 3)" value={network.totalRev3} color="text-amber-400" indent fmt={fmt} />
                <IncomeRow label="Total Revenue" value={network.totalRev} color="text-blue-300" bold border fmt={fmt} />

                <div className="h-3" />
                <IncomeRow label="Network Costs (Exp 3)" value={-network.totalExp3} color="text-red-400" indent fmt={fmt} />
                <IncomeRow label="Weather Capacity Loss" value={-network.weatherCapacityLoss} color="text-red-400" indent fmt={fmt} />
                <IncomeRow label="Cost of Revenue (COGS)" value={-network.totalCogs} color="text-red-300" bold border fmt={fmt} />

                <div className="h-3" />
                <IncomeRow label="Gross Profit" value={network.grossProfit} color="text-green-300" bold border fmt={fmt} />

                <div className="h-3" />
                <IncomeRow label="Operations (Exp 1)" value={-network.totalExp1} color="text-red-400" indent fmt={fmt} />
                <IncomeRow label="Equipment (Exp 2)" value={-network.totalExp2} color="text-purple-400" indent fmt={fmt} />
                <IncomeRow label="Total OpEx" value={-network.totalOpex} color="text-red-300" bold border fmt={fmt} />

                <div className="h-3" />
                <IncomeRow label="Operating Income" value={network.operatingIncome} color="text-emerald-300" bold border fmt={fmt} />

                <div className="h-3" />
                <IncomeRow label="Depreciation" value={-network.dailyDepreciation} color="text-orange-400" indent fmt={fmt} />
                <IncomeRow label="Net Income" value={network.netIncome} color={network.netIncome >= 0 ? 'text-emerald-300' : 'text-red-300'} bold border fmt={fmt} />

                {/* EBITDA callout */}
                <div className="mt-4 p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-emerald-400">EBITDA</span>
                    <span className="text-lg font-bold font-mono text-emerald-300">{fmt(network.ebitda)}</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    = Operating Income ({fmt(network.operatingIncome)}) + Daily Depreciation ({fmt(network.dailyDepreciation)})
                  </div>
                </div>

                {/* Margin summary */}
                <div className="mt-3 text-[11px] font-mono text-slate-500 space-y-0.5">
                  <div>Gross Margin: <span className="text-blue-400">{network.grossMargin.toFixed(1)}%</span> = Gross Profit / Revenue</div>
                  <div>Operating Margin: <span className="text-emerald-400">{network.operatingMargin.toFixed(1)}%</span> = Op. Income / Revenue</div>
                  <div>Net Margin: <span className={network.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}>{(network.totalRev > 0 ? (network.netIncome / network.totalRev) * 100 : 0).toFixed(1)}%</span> = Net Income / Revenue</div>
                </div>
              </CardContent>
            </Card>

            {/* Balance Sheet + Waterfall */}
            <div className="space-y-4">
              {/* Balance Sheet */}
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-slate-100">Balance Sheet <span className="text-xs text-slate-400 font-normal">(Assets)</span></CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <IncomeRow label={`Satellites (${satellites.length} × $${satCapexM}M)`} value={network.totalSatCapex} color="text-orange-400" indent fmt={fmt} />
                  <IncomeRow label={`Ground Stations (tier-weighted)`} value={network.stationCapex} color="text-orange-400" indent fmt={fmt} />
                  <IncomeRow label={`FSO Terminals (${fsoLinks.filter(l => l.active && l.link_type === 'sat-ground').length} units)`} value={network.totalFsoTerminalCapex} color="text-orange-400" indent fmt={fmt} />
                  <IncomeRow label="Total Assets (Cost Basis)" value={network.totalAssets} color="text-orange-300" bold border fmt={fmt} />

                  <div className="h-3" />
                  <IncomeRow label="Accumulated Depreciation (day 1)" value={-network.dailyDepreciation} color="text-red-400" indent fmt={fmt} />
                  <IncomeRow label="Net Book Value" value={network.netBookValue} color="text-slate-200" bold border fmt={fmt} />

                  {/* ROA callout */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="p-3 bg-blue-950/30 border border-blue-900/50 rounded-lg">
                      <div className="text-xs text-blue-400">Return on Assets</div>
                      <div className="text-lg font-bold font-mono text-blue-300">{network.roa.toFixed(2)}%</div>
                      <div className="text-[10px] text-slate-500">Annualized OpInc / NBV</div>
                    </div>
                    <div className="p-3 bg-orange-950/30 border border-orange-900/50 rounded-lg">
                      <div className="text-xs text-orange-400">Daily Depreciation</div>
                      <div className="text-lg font-bold font-mono text-orange-300">{fmt(network.dailyDepreciation)}</div>
                      <div className="text-[10px] text-slate-500">{depreciationYears}yr straight-line</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Waterfall Chart */}
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader><CardTitle className="text-slate-100">Income Waterfall</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={waterfallData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85)" />
                      <XAxis dataKey="name" stroke="rgb(148 163 184)" fontSize={9} />
                      <YAxis stroke="rgb(148 163 184)" fontSize={10} tickFormatter={(v) => fmt(v)} />
                      <Tooltip formatter={(v) => fmt(v as number)}
                        contentStyle={{ backgroundColor: 'rgb(30 41 59)', border: '1px solid rgb(51 65 85)', borderRadius: '8px', color: 'rgb(241 245 249)' }} />
                      <Bar dataKey="value" name="Amount">
                        {waterfallData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader><CardTitle className="text-slate-100">Top 10 Stations by Profit</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={topStations.map(s => ({ name: s.code.slice(0, 12), revenue: s.totalRevenue, expense: s.totalExpenses, profit: s.profit, margin: s.margin }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85)" />
                  <XAxis dataKey="name" stroke="rgb(148 163 184)" fontSize={9} angle={-45} textAnchor="end" height={60} />
                  <YAxis stroke="rgb(148 163 184)" fontSize={10} tickFormatter={(v) => fmt(v)} />
                  <Tooltip formatter={(v: number, name: string) => [name === 'margin' ? `${v.toFixed(1)}%` : fmt(v), name]}
                    contentStyle={{ backgroundColor: 'rgb(30 41 59)', border: '1px solid rgb(51 65 85)', borderRadius: '8px', color: 'rgb(241 245 249)' }} />
                  <Legend />
                  <Bar dataKey="revenue" fill="#3B82F6" name="Revenue" />
                  <Bar dataKey="expense" fill="#EF4444" name="Expense" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between text-sm text-slate-400">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="flex items-center gap-1 border-slate-600 text-slate-400">
                <Eye className="h-3 w-3" />
                Real Data
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1 border-slate-600 text-slate-400">
                <SliderIcon className="h-3 w-3" />
                Fully Adjustable
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1 border-slate-600 text-slate-400">
                <Shield className="h-3 w-3" />
                SX9 Network
              </Badge>
            </div>
            <div className="text-right text-xs">
              <div className="text-slate-300">SX9 Financial Analytics</div>
              <div>Last updated: {new Date().toLocaleTimeString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Income statement line item
function IncomeRow({ label, value, color = 'text-slate-300', bold = false, border = false, indent = false, fmt: fmtFn }: {
  label: string; value: number; color?: string; bold?: boolean; border?: boolean; indent?: boolean; fmt: (n: number) => string;
}) {
  return (
    <div className={`flex items-center justify-between py-1 ${border ? 'border-t border-slate-600 mt-1 pt-2' : ''} ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold' : ''} ${indent ? 'text-slate-400' : 'text-slate-300'}`}>{label}</span>
      <span className={`text-sm font-mono ${bold ? 'font-semibold' : ''} ${color}`}>{fmtFn(value)}</span>
    </div>
  );
}

// Reusable knob slider
function KnobSlider({ label, value, onChange, min, max, step, color }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; color: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium flex items-center justify-between text-slate-300">
        {label}
        <span className={`font-mono ${color}`}>{value}</span>
      </label>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min} max={max} step={step}
        className="mt-2"
      />
    </div>
  );
}

export default FinancialMonitoringPanel;
