# Orbital Component Library

Blueprint v6 + Tauri Component Catalog for Orbital UI

## Core Dependencies

```json
{
  "@blueprintjs/core": "^6.1.0",
  "@blueprintjs/datetime": "^6.0.1",
  "@blueprintjs/icons": "^6.0.0",
  "@blueprintjs/select": "^6.0.0",
  "@blueprintjs/table": "^6.0.1",
  "@tauri-apps/api": "^2.0.0"
}
```

---

## Layout Components

### App Shell
```tsx
import { Classes } from "@blueprintjs/core";
import clsx from "clsx";

<div className={clsx("orbital-app", { [Classes.DARK]: true })}>
  <ActivityBar />      {/* Left icon strip */}
  <SideBar />          {/* Collapsible tree nav */}
  <MainContent />      {/* Cesium globe / views */}
  <Panel />            {/* Right properties panel */}
  <StatusBar />        {/* Bottom status */}
</div>
```

### Activity Bar (VS Code style)
| Icon | View | Blueprint Component |
|------|------|---------------------|
| 🌍 | Globe View | `Button` with `icon="globe"` |
| 📊 | Dashboard | `Button` with `icon="dashboard"` |
| 🛰️ | Satellites | `Button` with `icon="satellite"` |
| 📡 | Ground Stations | `Button` with `icon="antenna"` |
| ⚙️ | Settings | `Button` with `icon="cog"` |

---

## Navigation Components

### Tree (Constellation Hierarchy)
```tsx
import { Tree, TreeNodeInfo } from "@blueprintjs/core";

const constellationTree: TreeNodeInfo[] = [
  {
    id: "views",
    label: "Views",
    icon: "folder-open",
    isExpanded: true,
    childNodes: [
      { id: "3d", label: "3D Globe", icon: "globe" },
      { id: "map", label: "Flat Map", icon: "map" },
      { id: "graph", label: "Network Graph", icon: "graph" },
      { id: "data", label: "Data Tables", icon: "th" },
    ],
  },
  {
    id: "constellation",
    label: "Constellation",
    icon: "folder-open",
    childNodes: [
      { id: "satellites", label: "Satellites (12)", icon: "satellite" },
      { id: "ground", label: "Ground Stations (257)", icon: "antenna" },
      { id: "links", label: "FSO Links", icon: "link" },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: "folder-close",
    childNodes: [
      { id: "diagnostics", label: "Diagnostics", icon: "diagnosis" },
      { id: "telemetry", label: "Telemetry", icon: "pulse" },
      { id: "settings", label: "Settings", icon: "cog" },
    ],
  },
];
```

### Navbar (Top Bar)
```tsx
import { Navbar, NavbarGroup, NavbarHeading, NavbarDivider, Button, Alignment } from "@blueprintjs/core";

<Navbar className={Classes.DARK}>
  <NavbarGroup align={Alignment.LEFT}>
    <NavbarHeading>
      <img src={orbitalLogo} width={24} />
      <span>Orbital</span>
      <span className="version">v1.0</span>
    </NavbarHeading>
  </NavbarGroup>
  <NavbarGroup align={Alignment.RIGHT}>
    <Button icon="time" text="Now" minimal />
    <NavbarDivider />
    <Button icon="play" intent="success" />
    <Button icon="stop" intent="danger" />
    <NavbarDivider />
    <Button icon="cog" minimal />
  </NavbarGroup>
</Navbar>
```

---

## Data Display Components

### Table (@blueprintjs/table)
```tsx
import { Table2, Column, Cell } from "@blueprintjs/table";

// Satellite data table
<Table2 numRows={satellites.length}>
  <Column name="ID" cellRenderer={(i) => <Cell>{satellites[i].id}</Cell>} />
  <Column name="Name" cellRenderer={(i) => <Cell>{satellites[i].name}</Cell>} />
  <Column name="Altitude" cellRenderer={(i) => <Cell>{satellites[i].altitude} km</Cell>} />
  <Column name="Status" cellRenderer={(i) => (
    <Cell>
      <Tag intent={satellites[i].active ? "success" : "danger"}>
        {satellites[i].status}
      </Tag>
    </Cell>
  )} />
</Table2>
```

### Card (Info Panels)
```tsx
import { Card, Elevation, H5, Tag, ProgressBar } from "@blueprintjs/core";

<Card elevation={Elevation.TWO} className="satellite-card">
  <H5>
    <Icon icon="satellite" />
    MEO-C7
  </H5>
  <div className="stats">
    <Tag minimal>Altitude: 7,378 km</Tag>
    <Tag minimal intent="success">Active</Tag>
  </div>
  <H6>Link Margin</H6>
  <ProgressBar value={0.72} intent="success" />
</Card>
```

---

## Input Components

### Slider (Time Control)
```tsx
import { Slider, RangeSlider } from "@blueprintjs/core";

// Playback speed
<Slider
  min={0.1}
  max={100}
  stepSize={0.1}
  labelStepSize={20}
  value={timeSpeed}
  onChange={setTimeSpeed}
  labelRenderer={(val) => `${val}x`}
/>

// Time range selection
<RangeSlider
  min={0}
  max={86400}
  stepSize={3600}
  value={[startTime, endTime]}
  onChange={([start, end]) => setTimeRange(start, end)}
  labelRenderer={(secs) => formatTime(secs)}
/>
```

### Select (@blueprintjs/select)
```tsx
import { Select, ItemRenderer } from "@blueprintjs/select";

const SatelliteSelect = Select.ofType<Satellite>();

const renderSatellite: ItemRenderer<Satellite> = (sat, { handleClick, modifiers }) => (
  <MenuItem
    key={sat.id}
    text={sat.name}
    label={sat.status}
    active={modifiers.active}
    onClick={handleClick}
    icon={sat.active ? "tick" : "circle"}
  />
);

<SatelliteSelect
  items={satellites}
  itemRenderer={renderSatellite}
  onItemSelect={setSelectedSatellite}
  filterable={true}
  itemPredicate={(query, sat) => sat.name.toLowerCase().includes(query.toLowerCase())}
>
  <Button text={selectedSatellite?.name ?? "Select satellite"} rightIcon="caret-down" />
</SatelliteSelect>
```

### DatePicker (@blueprintjs/datetime)
```tsx
import { DatePicker, TimePicker, DateRangePicker } from "@blueprintjs/datetime";

// Mission epoch
<DatePicker
  value={missionEpoch}
  onChange={setMissionEpoch}
  highlightCurrentDay={true}
/>

// Pass window
<DateRangePicker
  value={[passStart, passEnd]}
  onChange={([start, end]) => setPassWindow(start, end)}
  shortcuts={true}
/>
```

---

## Feedback Components

### Toast (Notifications)
```tsx
import { Toaster, Position, Intent } from "@blueprintjs/core";

const toaster = Toaster.create({ position: Position.BOTTOM_RIGHT });

// Usage
toaster.show({
  message: "Satellite MEO-C7 acquired",
  intent: Intent.SUCCESS,
  icon: "satellite",
});

toaster.show({
  message: "Link margin critical: 2.1 dB",
  intent: Intent.WARNING,
  icon: "warning-sign",
  timeout: 0, // Persist until dismissed
});
```

### Dialog (Modals)
```tsx
import { Dialog, DialogBody, DialogFooter, Button } from "@blueprintjs/core";

<Dialog
  isOpen={showSatelliteDetails}
  onClose={() => setShowSatelliteDetails(false)}
  title="Satellite Details"
  icon="satellite"
>
  <DialogBody>
    <SatelliteInfoPanel satellite={selectedSatellite} />
  </DialogBody>
  <DialogFooter
    actions={
      <>
        <Button text="Close" onClick={() => setShowSatelliteDetails(false)} />
        <Button intent="primary" text="Track" icon="locate" />
      </>
    }
  />
</Dialog>
```

### ContextMenu (Right-click)
```tsx
import { ContextMenu, Menu, MenuItem, MenuDivider } from "@blueprintjs/core";

<ContextMenu
  content={
    <Menu>
      <MenuItem icon="locate" text="Track satellite" />
      <MenuItem icon="info-sign" text="Show details" />
      <MenuDivider />
      <MenuItem icon="graph" text="View telemetry" />
      <MenuItem icon="link" text="Show links" />
      <MenuDivider />
      <MenuItem icon="power" text="Command..." intent="warning" />
    </Menu>
  }
>
  <SatelliteMarker satellite={sat} />
</ContextMenu>
```

---

## Tauri Integration

### IPC Commands
```tsx
import { invoke } from "@tauri-apps/api/core";

// Satellite position from Rust SGP4
const position = await invoke<Position>("get_satellite_position", {
  satelliteId: "MEO-C7",
  epoch: Date.now(),
});

// Memory store/recall via sx9-tcache
await invoke("memory_store", {
  key: "last_view",
  value: JSON.stringify({ view: "3d", camera: cameraState }),
});

const recalled = await invoke<string>("memory_recall", { key: "last_view" });
```

### Window Management
```tsx
import { Window } from "@tauri-apps/api/window";

// Maximize on double-click title bar
const appWindow = Window.getCurrent();
await appWindow.toggleMaximize();

// System tray
import { TrayIcon } from "@tauri-apps/api/tray";
const tray = await TrayIcon.new({ icon: "icons/orbital.png" });
```

---

## Theme Configuration

### Blueprint Dark Theme
```scss
@use "@blueprintjs/core/lib/scss/variables.scss" as bp;

// Orbital color overrides
$orbital-bg: #0d1117;        // GitHub dark
$orbital-sidebar: #161b22;
$orbital-border: #30363d;
$orbital-accent: #58a6ff;    // Blue accent

.orbital-app.#{bp.$ns}-dark {
  background: $orbital-bg;

  .sidebar {
    background: $orbital-sidebar;
    border-right: 1px solid $orbital-border;
  }

  .#{bp.$ns}-tree-node-selected {
    background: rgba($orbital-accent, 0.2);
  }
}
```

---

## Component Migration Map

| Current (shadcn/Tailwind) | Blueprint Replacement |
|---------------------------|----------------------|
| `CollapsibleNav` | `Tree` + `Collapse` |
| `RightPanel` | `Card` + `Collapse` |
| `SatelliteControlPanel` | `Drawer` + `FormGroup` |
| `DataTableView` | `Table2` |
| `BeamDashboard` | `Card` grid |
| `DiagnosticPanel` | `Callout` + `ProgressBar` |
| Custom sliders | `Slider` / `RangeSlider` |
| Radix Dialog | Blueprint `Dialog` |

---

## File Structure (Proposed)

```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── ActivityBar.tsx
│   │   ├── SideBar.tsx
│   │   ├── StatusBar.tsx
│   │   └── Panel.tsx
│   ├── navigation/
│   │   ├── ConstellationTree.tsx
│   │   └── TopNavbar.tsx
│   ├── data/
│   │   ├── SatelliteTable.tsx
│   │   ├── GroundStationTable.tsx
│   │   └── LinkTable.tsx
│   ├── controls/
│   │   ├── TimeControl.tsx
│   │   ├── LayerControl.tsx
│   │   └── SatelliteSelect.tsx
│   └── cesium/
│       ├── GlobeView.tsx
│       ├── FlatMapView.tsx
│       └── markers/
├── hooks/
│   ├── useTauriCommand.ts
│   └── useOrbitalData.ts
├── styles/
│   └── orbital-theme.scss
└── tauri/
    └── commands.ts
```
