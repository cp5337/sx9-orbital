# SX9-TAURI-UI FRONTEND IMPLEMENTATION

## Design Tokens (CSS Variables)

```css
/* src/styles/tokens.css */
:root {
  /* Backgrounds */
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-tertiary: #1a1a24;
  --bg-hover: #22222e;
  --bg-active: #2a2a38;
  
  /* Foreground */
  --fg-primary: #e4e4e7;
  --fg-secondary: #a1a1aa;
  --fg-muted: #71717a;
  --fg-inverse: #0a0a0f;
  
  /* Accent */
  --accent-blue: #3b82f6;
  --accent-green: #22c55e;
  --accent-yellow: #eab308;
  --accent-red: #ef4444;
  --accent-purple: #a855f7;
  --accent-cyan: #06b6d4;
  --accent-orange: #f97316;
  
  /* Phase Colors */
  --phase-plan: #a855f7;
  --phase-design: #3b82f6;
  --phase-build: #eab308;
  --phase-test: #f97316;
  --phase-release: #ef4444;
  --phase-deploy: #22c55e;
  --phase-operate: #6b7280;
  --phase-monitor: #1f2937;
  
  /* Zone Colors */
  --zone-a: #ef4444;
  --zone-b: #f97316;
  --zone-c: #eab308;
  --zone-d: #22c55e;
  
  /* Status */
  --status-healthy: #22c55e;
  --status-degraded: #eab308;
  --status-down: #ef4444;
  --status-unknown: #6b7280;
  
  /* Typography */
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  
  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  
  /* Layout */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --touch-min: 44px;
  
  /* Borders */
  --border-subtle: 1px solid #22222e;
  --border-default: 1px solid #2a2a38;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
}
```

---

## Component: Dashboard

```tsx
// src/components/Dashboard/Dashboard.tsx
import { useState, useEffect } from 'react';
import { SystemHealth } from './SystemHealth';
import { RepoGrid } from './RepoGrid';
import { AlertFeed } from './AlertFeed';
import { QuickActions } from './QuickActions';
import { invoke } from '@tauri-apps/api/core';
import './Dashboard.css';

interface DashboardProps {
  onNavigate: (view: string, params?: Record<string, string>) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [healthData, repoData] = await Promise.all([
          invoke<SystemHealth>('get_system_health'),
          invoke<RepoInfo[]>('get_repos'),
        ]);
        setHealth(healthData);
        setRepos(repoData);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">SX9 Factory</h1>
        <QuickActions onAction={handleAction} />
      </header>
      
      <div className="dashboard-grid">
        <section className="dashboard-health">
          <SystemHealth data={health} />
        </section>
        
        <section className="dashboard-repos">
          <h2 className="section-title">Registered Repos</h2>
          <RepoGrid 
            repos={repos} 
            onSelect={(repo) => onNavigate('repo-detail', { name: repo.name })} 
          />
        </section>
        
        <aside className="dashboard-alerts">
          <h2 className="section-title">Alerts</h2>
          <AlertFeed alerts={alerts} />
        </aside>
      </div>
    </div>
  );
}
```

```css
/* src/components/Dashboard/Dashboard.css */
.dashboard {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--fg-primary);
  font-family: var(--font-sans);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-6);
  background: var(--bg-secondary);
  border-bottom: var(--border-subtle);
}

.dashboard-title {
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--fg-primary);
  margin: 0;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 300px;
  grid-template-rows: auto 1fr;
  gap: var(--space-4);
  padding: var(--space-4);
  flex: 1;
  overflow: hidden;
}

.dashboard-health {
  grid-column: 1 / -1;
}

.dashboard-repos {
  overflow-y: auto;
}

.dashboard-alerts {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  overflow-y: auto;
}

.section-title {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 var(--space-4) 0;
}
```

---

## Component: System Health

```tsx
// src/components/Dashboard/SystemHealth.tsx
import './SystemHealth.css';

interface SystemHealthProps {
  data: {
    gateway: 'healthy' | 'degraded' | 'down';
    nats: 'healthy' | 'degraded' | 'down';
    agents: { total: number; active: number; status: 'healthy' | 'degraded' | 'down' };
    factory: 'healthy' | 'degraded' | 'down';
  } | null;
}

export function SystemHealth({ data }: SystemHealthProps) {
  if (!data) return null;

  const services = [
    { name: 'Gateway', status: data.gateway, icon: '⚡' },
    { name: 'NATS', status: data.nats, icon: '📡' },
    { name: 'Factory', status: data.factory, icon: '🏭' },
    { 
      name: 'Agents', 
      status: data.agents.status, 
      icon: '🤖',
      detail: `${data.agents.active}/${data.agents.total}`
    },
  ];

  return (
    <div className="system-health">
      <div className="health-grid">
        {services.map((service) => (
          <div key={service.name} className="health-card">
            <span className="health-icon">{service.icon}</span>
            <div className="health-info">
              <span className="health-name">{service.name}</span>
              {service.detail && (
                <span className="health-detail">{service.detail}</span>
              )}
            </div>
            <StatusDot status={service.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: 'healthy' | 'degraded' | 'down' }) {
  return (
    <div className={`status-dot status-${status}`}>
      <div className="status-dot-inner" />
    </div>
  );
}
```

```css
/* src/components/Dashboard/SystemHealth.css */
.system-health {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.health-grid {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.health-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--bg-tertiary);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  min-width: 160px;
}

.health-icon {
  font-size: var(--text-lg);
}

.health-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.health-name {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-primary);
}

.health-detail {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg-muted);
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-dot-inner {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-healthy {
  background: rgba(34, 197, 94, 0.2);
}
.status-healthy .status-dot-inner {
  background: var(--status-healthy);
  box-shadow: 0 0 8px var(--status-healthy);
}

.status-degraded {
  background: rgba(234, 179, 8, 0.2);
}
.status-degraded .status-dot-inner {
  background: var(--status-degraded);
  box-shadow: 0 0 8px var(--status-degraded);
}

.status-down {
  background: rgba(239, 68, 68, 0.2);
}
.status-down .status-dot-inner {
  background: var(--status-down);
  box-shadow: 0 0 8px var(--status-down);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

---

## Component: Repo Grid

```tsx
// src/components/Dashboard/RepoGrid.tsx
import './RepoGrid.css';

interface RepoInfo {
  name: string;
  description: string;
  phase: 'plan' | 'design' | 'build' | 'test' | 'release' | 'deploy' | 'operate' | 'monitor';
  zone: 'A' | 'B' | 'C' | 'D';
  health: 'healthy' | 'degraded' | 'blocked';
  lastActivity: string;
}

interface RepoGridProps {
  repos: RepoInfo[];
  onSelect: (repo: RepoInfo) => void;
}

export function RepoGrid({ repos, onSelect }: RepoGridProps) {
  return (
    <div className="repo-grid">
      {repos.map((repo) => (
        <RepoCard key={repo.name} repo={repo} onClick={() => onSelect(repo)} />
      ))}
    </div>
  );
}

function RepoCard({ repo, onClick }: { repo: RepoInfo; onClick: () => void }) {
  return (
    <button className="repo-card" onClick={onClick}>
      <div className="repo-header">
        <span className="repo-name">{repo.name}</span>
        <ZoneBadge zone={repo.zone} />
      </div>
      
      <p className="repo-description">{repo.description}</p>
      
      <div className="repo-footer">
        <PhaseBadge phase={repo.phase} />
        <span className="repo-activity">{repo.lastActivity}</span>
      </div>
      
      {repo.health !== 'healthy' && (
        <div className={`repo-health-indicator health-${repo.health}`} />
      )}
    </button>
  );
}

function PhaseBadge({ phase }: { phase: RepoInfo['phase'] }) {
  return (
    <span className={`phase-badge phase-${phase}`}>
      {phase.toUpperCase()}
    </span>
  );
}

function ZoneBadge({ zone }: { zone: RepoInfo['zone'] }) {
  return (
    <span className={`zone-badge zone-${zone.toLowerCase()}`}>
      {zone}
    </span>
  );
}
```

```css
/* src/components/Dashboard/RepoGrid.css */
.repo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}

.repo-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border: var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: var(--touch-min);
}

.repo-card:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-blue);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.repo-card:active {
  transform: translateY(0);
}

.repo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.repo-name {
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg-primary);
}

.repo-description {
  font-size: var(--text-sm);
  color: var(--fg-secondary);
  margin: 0 0 var(--space-3) 0;
  flex: 1;
  line-height: 1.4;
}

.repo-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.repo-activity {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg-muted);
}

/* Phase Badges */
.phase-badge {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.phase-plan { background: rgba(168, 85, 247, 0.2); color: var(--phase-plan); }
.phase-design { background: rgba(59, 130, 246, 0.2); color: var(--phase-design); }
.phase-build { background: rgba(234, 179, 8, 0.2); color: var(--phase-build); }
.phase-test { background: rgba(249, 115, 22, 0.2); color: var(--phase-test); }
.phase-release { background: rgba(239, 68, 68, 0.2); color: var(--phase-release); }
.phase-deploy { background: rgba(34, 197, 94, 0.2); color: var(--phase-deploy); }
.phase-operate { background: rgba(107, 114, 128, 0.2); color: var(--phase-operate); }
.phase-monitor { background: rgba(31, 41, 55, 0.4); color: var(--fg-secondary); }

/* Zone Badges */
.zone-badge {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 700;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
}

.zone-a { background: rgba(239, 68, 68, 0.2); color: var(--zone-a); }
.zone-b { background: rgba(249, 115, 22, 0.2); color: var(--zone-b); }
.zone-c { background: rgba(234, 179, 8, 0.2); color: var(--zone-c); }
.zone-d { background: rgba(34, 197, 94, 0.2); color: var(--zone-d); }

/* Health Indicator */
.repo-health-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.health-degraded {
  background: var(--status-degraded);
}

.health-blocked {
  background: var(--status-down);
}
```

---

## Component: Factory Console

```tsx
// src/components/FactoryConsole/FactoryConsole.tsx
import { useState } from 'react';
import { PhaseTimeline } from './PhaseTimeline';
import { GateStatus } from './GateStatus';
import { AuditLog } from './AuditLog';
import { invoke } from '@tauri-apps/api/core';
import './FactoryConsole.css';

const PHASES = ['plan', 'design', 'build', 'test', 'release', 'deploy', 'operate', 'monitor'] as const;

interface FactoryConsoleProps {
  repoName: string;
}

export function FactoryConsole({ repoName }: FactoryConsoleProps) {
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [gateResults, setGateResults] = useState<GateResult[] | null>(null);

  async function handleAdvancePhase() {
    setAdvancing(true);
    try {
      const result = await invoke<PhaseResult>('advance_phase', { repo: repoName });
      if (result.success) {
        // Refresh repo data
        const updated = await invoke<RepoDetail>('get_repo_detail', { name: repoName });
        setRepo(updated);
      }
      setGateResults(result.gates);
    } catch (err) {
      console.error('Failed to advance phase:', err);
    } finally {
      setAdvancing(false);
    }
  }

  async function handleRunGates() {
    try {
      const result = await invoke<GateResult>('run_gate_check', { repo: repoName });
      setGateResults([result]);
    } catch (err) {
      console.error('Failed to run gates:', err);
    }
  }

  return (
    <div className="factory-console">
      <header className="console-header">
        <div className="console-title">
          <h1>{repoName}</h1>
          <ZoneBadge zone={repo?.zone || 'C'} />
        </div>
        <div className="console-actions">
          <button 
            className="btn btn-secondary"
            onClick={handleRunGates}
          >
            Run Gates
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleAdvancePhase}
            disabled={advancing}
          >
            {advancing ? 'Checking...' : 'Advance Phase'}
          </button>
        </div>
      </header>

      <div className="console-grid">
        <section className="console-timeline">
          <h2 className="section-title">Phase Lifecycle</h2>
          <PhaseTimeline 
            phases={PHASES} 
            currentPhase={repo?.phase || 'plan'} 
          />
        </section>

        <section className="console-gates">
          <h2 className="section-title">Gate Status</h2>
          <GateStatus results={gateResults} />
        </section>

        <section className="console-audit">
          <h2 className="section-title">Audit Log</h2>
          <AuditLog repoName={repoName} />
        </section>
      </div>
    </div>
  );
}
```

```css
/* src/components/FactoryConsole/FactoryConsole.css */
.factory-console {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-6);
  background: var(--bg-secondary);
  border-bottom: var(--border-subtle);
}

.console-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.console-title h1 {
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-weight: 600;
  margin: 0;
}

.console-actions {
  display: flex;
  gap: var(--space-3);
}

.console-grid {
  display: grid;
  grid-template-columns: 1fr 300px;
  grid-template-rows: auto 1fr;
  gap: var(--space-4);
  padding: var(--space-4);
  flex: 1;
  overflow: hidden;
}

.console-timeline {
  grid-column: 1 / -1;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.console-gates {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  overflow-y: auto;
}

.console-audit {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  overflow-y: auto;
}

/* Buttons */
.btn {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 500;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  min-height: var(--touch-min);
  transition: all 0.15s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-blue);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--fg-primary);
  border: var(--border-default);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
}
```

---

## Component: Phase Timeline

```tsx
// src/components/FactoryConsole/PhaseTimeline.tsx
import './PhaseTimeline.css';

interface PhaseTimelineProps {
  phases: readonly string[];
  currentPhase: string;
}

export function PhaseTimeline({ phases, currentPhase }: PhaseTimelineProps) {
  const currentIndex = phases.indexOf(currentPhase);

  return (
    <div className="phase-timeline">
      {phases.map((phase, index) => {
        const status = index < currentIndex ? 'complete' 
                     : index === currentIndex ? 'current' 
                     : 'pending';
        
        return (
          <div key={phase} className={`timeline-node status-${status}`}>
            <div className="node-connector" />
            <div className="node-dot">
              {status === 'complete' && <CheckIcon />}
              {status === 'current' && <div className="node-pulse" />}
            </div>
            <span className="node-label">{phase.toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}
```

```css
/* src/components/FactoryConsole/PhaseTimeline.css */
.phase-timeline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) 0;
}

.timeline-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  flex: 1;
}

.timeline-node:not(:last-child) .node-connector {
  content: '';
  position: absolute;
  top: 16px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: var(--bg-tertiary);
  z-index: 0;
}

.timeline-node.status-complete:not(:last-child) .node-connector {
  background: var(--accent-green);
}

.node-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  transition: all 0.2s ease;
}

.status-pending .node-dot {
  background: var(--bg-tertiary);
  border: 2px solid var(--fg-muted);
}

.status-current .node-dot {
  background: var(--accent-blue);
  border: 2px solid var(--accent-blue);
  box-shadow: 0 0 12px var(--accent-blue);
}

.status-complete .node-dot {
  background: var(--accent-green);
  border: 2px solid var(--accent-green);
  color: white;
}

.node-pulse {
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

.node-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--fg-muted);
  margin-top: var(--space-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-current .node-label {
  color: var(--accent-blue);
  font-weight: 600;
}

.status-complete .node-label {
  color: var(--accent-green);
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.7; }
}
```

---

## Component: Gate Status

```tsx
// src/components/FactoryConsole/GateStatus.tsx
import './GateStatus.css';

interface GateResult {
  name: string;
  passed: boolean;
  actual: string | number;
  threshold: string | number;
  message?: string;
}

interface GateStatusProps {
  results: GateResult[] | null;
}

export function GateStatus({ results }: GateStatusProps) {
  if (!results) {
    return (
      <div className="gate-status-empty">
        <p>Run gate checks to see results</p>
      </div>
    );
  }

  const allPassed = results.every(g => g.passed);

  return (
    <div className="gate-status">
      <div className={`gate-summary ${allPassed ? 'passed' : 'failed'}`}>
        {allPassed ? '✓ All gates passed' : '✗ Some gates failed'}
      </div>
      
      <div className="gate-list">
        {results.map((gate) => (
          <div key={gate.name} className={`gate-item ${gate.passed ? 'passed' : 'failed'}`}>
            <div className="gate-icon">
              {gate.passed ? '✓' : '✗'}
            </div>
            <div className="gate-info">
              <span className="gate-name">{gate.name}</span>
              <span className="gate-value">
                {gate.actual} / {gate.threshold}
              </span>
            </div>
            {gate.message && (
              <p className="gate-message">{gate.message}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

```css
/* src/components/FactoryConsole/GateStatus.css */
.gate-status-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  color: var(--fg-muted);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.gate-summary {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 600;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
}

.gate-summary.passed {
  background: rgba(34, 197, 94, 0.2);
  color: var(--accent-green);
}

.gate-summary.failed {
  background: rgba(239, 68, 68, 0.2);
  color: var(--accent-red);
}

.gate-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.gate-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}

.gate-icon {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 700;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
}

.gate-item.passed .gate-icon {
  background: rgba(34, 197, 94, 0.2);
  color: var(--accent-green);
}

.gate-item.failed .gate-icon {
  background: rgba(239, 68, 68, 0.2);
  color: var(--accent-red);
}

.gate-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.gate-name {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-primary);
}

.gate-value {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg-muted);
}

.gate-message {
  font-size: var(--text-xs);
  color: var(--fg-secondary);
  margin: var(--space-2) 0 0 0;
  grid-column: 1 / -1;
}
```

---

## Component: Agent Chat

```tsx
// src/components/AgentChat/AgentChat.tsx
import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './AgentChat.css';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  agentName?: string;
}

interface AgentChatProps {
  agentId?: string;
}

export function AgentChat({ agentId = 'factory-agent' }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || sending) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const response = await invoke<{ content: string }>('send_agent_message', {
        agent: agentId,
        message: input,
      });

      const agentMessage: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: response.content,
        timestamp: new Date(),
        agentName: agentId,
      };

      setMessages(prev => [...prev, agentMessage]);
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="agent-chat">
      <header className="chat-header">
        <div className="chat-agent-info">
          <span className="chat-agent-icon">🤖</span>
          <span className="chat-agent-name">{agentId}</span>
          <StatusDot status="healthy" />
        </div>
      </header>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>Start a conversation with the agent</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              <div className="message-content">{msg.content}</div>
              <div className="message-meta">
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <input
          type="text"
          className="chat-input"
          placeholder="Ask the agent..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={sending}
        />
        <button 
          className="chat-send-btn"
          onClick={handleSend}
          disabled={sending || !input.trim()}
        >
          {sending ? '...' : '→'}
        </button>
      </div>
    </div>
  );
}
```

```css
/* src/components/AgentChat/AgentChat.css */
.agent-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.chat-header {
  display: flex;
  align-items: center;
  padding: var(--space-4);
  background: var(--bg-secondary);
  border-bottom: var(--border-subtle);
}

.chat-agent-info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.chat-agent-icon {
  font-size: var(--text-lg);
}

.chat-agent-name {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-primary);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.chat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--fg-muted);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.chat-message {
  max-width: 80%;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
}

.chat-message.user {
  align-self: flex-end;
  background: var(--accent-blue);
  color: white;
}

.chat-message.agent {
  align-self: flex-start;
  background: var(--bg-secondary);
  color: var(--fg-primary);
}

.message-content {
  font-size: var(--text-sm);
  line-height: 1.5;
  white-space: pre-wrap;
}

.message-meta {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg-muted);
  margin-top: var(--space-1);
  opacity: 0.7;
}

.chat-input-container {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--bg-secondary);
  border-top: var(--border-subtle);
}

.chat-input {
  flex: 1;
  background: var(--bg-tertiary);
  border: var(--border-default);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--fg-primary);
  min-height: var(--touch-min);
}

.chat-input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.chat-input::placeholder {
  color: var(--fg-muted);
}

.chat-send-btn {
  width: var(--touch-min);
  height: var(--touch-min);
  background: var(--accent-blue);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-size: var(--text-lg);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.chat-send-btn:hover:not(:disabled) {
  background: #2563eb;
}

.chat-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

## Tauri Backend Commands

```rust
// src-tauri/src/commands.rs
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemHealth {
    pub gateway: String,
    pub nats: String,
    pub factory: String,
    pub agents: AgentHealth,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentHealth {
    pub total: u32,
    pub active: u32,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoInfo {
    pub name: String,
    pub description: String,
    pub phase: String,
    pub zone: String,
    pub health: String,
    pub last_activity: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoDetail {
    pub name: String,
    pub description: String,
    pub phase: String,
    pub zone: String,
    pub owner: String,
    pub crates: Vec<String>,
    pub gates: GateConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GateConfig {
    pub complexity_max: u32,
    pub coverage_min: u32,
    pub sbom_required: bool,
    pub cato_required: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GateResult {
    pub name: String,
    pub passed: bool,
    pub actual: String,
    pub threshold: String,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PhaseResult {
    pub success: bool,
    pub from_phase: String,
    pub to_phase: Option<String>,
    pub gates: Vec<GateResult>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentResponse {
    pub content: String,
}

// Commands

#[tauri::command]
pub async fn get_system_health() -> Result<SystemHealth, String> {
    // TODO: Implement NATS health check
    Ok(SystemHealth {
        gateway: "healthy".into(),
        nats: "healthy".into(),
        factory: "healthy".into(),
        agents: AgentHealth {
            total: 3,
            active: 3,
            status: "healthy".into(),
        },
    })
}

#[tauri::command]
pub async fn get_repos() -> Result<Vec<RepoInfo>, String> {
    // TODO: Fetch from factory worker API
    Ok(vec![
        RepoInfo {
            name: "sx9-orbital".into(),
            description: "Satellite constellation platform".into(),
            phase: "build".into(),
            zone: "B".into(),
            health: "healthy".into(),
            last_activity: "2 hours ago".into(),
        },
        RepoInfo {
            name: "sx9-development-center".into(),
            description: "Software factory orchestration".into(),
            phase: "test".into(),
            zone: "C".into(),
            health: "healthy".into(),
            last_activity: "30 min ago".into(),
        },
        RepoInfo {
            name: "sx9-ctas-core".into(),
            description: "Threat analysis engine".into(),
            phase: "operate".into(),
            zone: "C".into(),
            health: "degraded".into(),
            last_activity: "1 day ago".into(),
        },
    ])
}

#[tauri::command]
pub async fn get_repo_detail(name: String) -> Result<RepoDetail, String> {
    // TODO: Fetch from factory worker API
    Ok(RepoDetail {
        name,
        description: "Repository description".into(),
        phase: "build".into(),
        zone: "C".into(),
        owner: "charles".into(),
        crates: vec!["core".into(), "api".into(), "cli".into()],
        gates: GateConfig {
            complexity_max: 15,
            coverage_min: 80,
            sbom_required: true,
            cato_required: false,
        },
    })
}

#[tauri::command]
pub async fn advance_phase(repo: String) -> Result<PhaseResult, String> {
    // TODO: Call factory worker API
    Ok(PhaseResult {
        success: false,
        from_phase: "build".into(),
        to_phase: None,
        gates: vec![
            GateResult {
                name: "complexity".into(),
                passed: true,
                actual: "12".into(),
                threshold: "15".into(),
                message: None,
            },
            GateResult {
                name: "coverage".into(),
                passed: false,
                actual: "72%".into(),
                threshold: "80%".into(),
                message: Some("Add tests to beam-routing crate".into()),
            },
        ],
        message: "Gate check failed: coverage".into(),
    })
}

#[tauri::command]
pub async fn run_gate_check(repo: String) -> Result<GateResult, String> {
    // TODO: Call factory worker API
    Ok(GateResult {
        name: "all".into(),
        passed: true,
        actual: "4/4".into(),
        threshold: "4/4".into(),
        message: None,
    })
}

#[tauri::command]
pub async fn send_agent_message(agent: String, message: String) -> Result<AgentResponse, String> {
    // TODO: Route to agent via NATS
    Ok(AgentResponse {
        content: format!("Agent {} received: {}", agent, message),
    })
}
```

---

## File Structure Summary

```
sx9-tauri-ui/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── commands.rs          ← IPC commands
│       ├── nats_bridge.rs       ← NATS connection
│       └── lib.rs
├── src/
│   ├── components/
│   │   ├── Dashboard/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Dashboard.css
│   │   │   ├── SystemHealth.tsx
│   │   │   ├── SystemHealth.css
│   │   │   ├── RepoGrid.tsx
│   │   │   ├── RepoGrid.css
│   │   │   ├── AlertFeed.tsx
│   │   │   └── QuickActions.tsx
│   │   ├── FactoryConsole/
│   │   │   ├── FactoryConsole.tsx
│   │   │   ├── FactoryConsole.css
│   │   │   ├── PhaseTimeline.tsx
│   │   │   ├── PhaseTimeline.css
│   │   │   ├── GateStatus.tsx
│   │   │   ├── GateStatus.css
│   │   │   └── AuditLog.tsx
│   │   ├── AgentChat/
│   │   │   ├── AgentChat.tsx
│   │   │   └── AgentChat.css
│   │   └── shared/
│   │       ├── StatusDot.tsx
│   │       ├── PhaseBadge.tsx
│   │       └── ZoneBadge.tsx
│   ├── styles/
│   │   └── tokens.css           ← Design tokens
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── sx9-factory.toml
```

---

*End of SX9-TAURI-UI Frontend Implementation v1.0*
