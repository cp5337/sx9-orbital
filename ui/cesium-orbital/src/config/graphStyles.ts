// config/graphStyles.ts - Orbital HUD/ACOG Aesthetic
// Tactical visualization for satellite constellation topology

// Cytoscape stylesheet type - using any[] for flexibility with dynamic styles
type CytoscapeStylesheet = Array<{ selector: string; style: Record<string, any> }>;

// ============================================
// ORBITAL NODE COLORS - High Contrast Neon HUD
// ============================================
export const NODE_COLORS: Record<string, string> = {
  // Primary orbital entities
  Satellite: "#9d4edd",      // Deep Purple - orbital assets
  GroundStation: "#00f0ff",  // Cyan - ground infrastructure
  Gateway: "#ffd700",        // Gold - key relay points

  // Link types (for edge styling reference)
  ISL: "#00ff9f",            // Neon Green - inter-satellite links
  GroundLink: "#ff2a6d",     // Neon Pink - downlinks

  // Status colors
  Active: "#00ff00",         // Green - operational
  Degraded: "#ffd700",       // Yellow - marginal
  Critical: "#ff2a6d",       // Red - failing
  Offline: "#444444",        // Gray - inactive

  // Orbital plane identifiers
  Plane0: "#ef4444",         // Red
  Plane1: "#f97316",         // Orange
  Plane2: "#eab308",         // Yellow
  Plane3: "#22c55e",         // Green
  Plane4: "#06b6d4",         // Cyan
  Plane5: "#3b82f6",         // Blue
  Plane6: "#8b5cf6",         // Purple
  Plane7: "#ec4899",         // Pink
};

// Link quality gradient colors
export const LINK_QUALITY_COLORS = {
  excellent: "#00ff9f",      // >6dB margin - Neon Green
  good: "#39ff14",           // 3-6dB - Lime
  marginal: "#ffd700",       // 0-3dB - Gold
  weak: "#ff9100",           // <0dB - Orange
  failing: "#ff2a6d",        // Disconnecting - Red
};

// ============================================
// NODE SHAPES - Military/Tactical
// ============================================
export const NODE_SHAPES: Record<string, string> = {
  Satellite: "diamond",        // Diamond for orbital assets
  GroundStation: "hexagon",    // Hexagon for ground sites
  Gateway: "octagon",          // Octagon for major relay
  Relay: "triangle",           // Triangle for relay nodes
};

export const DEFAULT_COLOR = "#9d4edd";
export const DEFAULT_SHAPE = "diamond";

// ============================================
// HELPER FUNCTIONS
// ============================================
export function getNodeColor(nodeType: string): string {
  return NODE_COLORS[nodeType] || DEFAULT_COLOR;
}

export function getNodeShape(nodeType: string): string {
  return NODE_SHAPES[nodeType] || DEFAULT_SHAPE;
}

export function getPlaneColor(planeIndex: number): string {
  const colors = [
    NODE_COLORS.Plane0,
    NODE_COLORS.Plane1,
    NODE_COLORS.Plane2,
    NODE_COLORS.Plane3,
    NODE_COLORS.Plane4,
    NODE_COLORS.Plane5,
    NODE_COLORS.Plane6,
    NODE_COLORS.Plane7,
  ];
  return colors[planeIndex % colors.length];
}

export function getLinkQualityColor(marginDb: number): string {
  if (marginDb >= 6) return LINK_QUALITY_COLORS.excellent;
  if (marginDb >= 3) return LINK_QUALITY_COLORS.good;
  if (marginDb >= 0) return LINK_QUALITY_COLORS.marginal;
  if (marginDb >= -3) return LINK_QUALITY_COLORS.weak;
  return LINK_QUALITY_COLORS.failing;
}

// ============================================
// BASE NODE STYLE - ACOG / HUD Aesthetic
// Dark fill, thin crisp borders, monospace text
// ============================================
const baseNodeStyle = {
  // Dark semi-transparent fill
  "background-color": "#0a0a0a",
  "background-opacity": 0.85,

  // Metrics
  width: 36,
  height: 36,

  // Border (The Reticle Ring)
  "border-width": 1.5,
  "border-style": "solid",
  "border-color": (ele: any) =>
    ele.data("color") || getNodeColor(ele.data("nodeType")),
  "border-opacity": 0.95,

  // Label (HUD Text - Tactical Readout)
  label: (ele: any) => ele.data("label") || ele.data("id") || "",
  color: (ele: any) => ele.data("color") || getNodeColor(ele.data("nodeType")),
  "font-family": "Menlo, Monaco, Consolas, 'Courier New', monospace",
  "font-size": 9,
  "font-weight": 600,
  "text-transform": "uppercase",
  "text-valign": "bottom",
  "text-halign": "center",
  "text-margin-y": 8,

  // Text legibility against dark backgrounds
  "text-outline-color": "#000",
  "text-outline-width": 2.5,
  "text-background-color": "#000",
  "text-background-opacity": 0.7,
  "text-background-padding": 3,
  "text-background-shape": "round-rectangle",
};

// ============================================
// HIGH FIDELITY NODE STYLE
// With glows and animations for demo mode
// ============================================
export function getNodeStyle(isHighFidelity: boolean): any {
  if (isHighFidelity) {
    return {
      ...baseNodeStyle,

      // Tactical Glow Effect
      "shadow-blur": 18,
      "shadow-color": (ele: any) =>
        ele.data("color") || getNodeColor(ele.data("nodeType")),
      "shadow-opacity": 0.5,
      "shadow-offset-x": 0,
      "shadow-offset-y": 0,

      // Smooth transitions for state changes
      "transition-property":
        "background-color, border-color, width, height, border-width, shadow-blur, shadow-opacity",
      "transition-duration": "0.25s",
      "transition-timing-function": "ease-out",
    };
  }
  return {
    ...baseNodeStyle,
    // Performance mode: no shadows
    "shadow-opacity": 0,
    "border-width": 1,
  };
}

// ============================================
// EDGE STYLES - ISL and Ground Links
// ============================================
export const EDGE_STYLE_ISL: any = {
  width: 2,
  "line-color": "#00ff9f",
  "line-style": "solid",
  "line-opacity": 0.8,

  // Sharp arrow for directionality
  "target-arrow-color": "#00ff9f",
  "target-arrow-shape": "triangle",
  "arrow-scale": 0.8,

  "curve-style": "bezier",
  "control-point-step-size": 50,

  // Edge label
  label: "data(linkType)",
  "font-size": 7,
  "font-family": "Menlo, monospace",
  color: "#00ff9f",
  "text-rotation": "autorotate",
  "text-margin-y": -8,

  "text-background-color": "#000",
  "text-background-opacity": 0.8,
  "text-background-padding": 2,
};

export const EDGE_STYLE_GROUND: any = {
  width: 1.5,
  "line-color": "#00f0ff",
  "line-style": "dashed",
  "line-opacity": 0.7,
  "line-dash-pattern": [6, 4],

  "target-arrow-color": "#00f0ff",
  "target-arrow-shape": "vee",
  "arrow-scale": 0.7,

  "curve-style": "bezier",

  label: "",
  "font-size": 6,
  "font-family": "Menlo, monospace",
  color: "#00f0ff",
};

// Generic edge style with quality-based coloring
export const EDGE_STYLE: any = {
  width: (ele: any) => {
    const margin = ele.data("marginDb") || 3;
    return margin >= 3 ? 2.5 : 1.5;
  },
  "line-color": (ele: any) => {
    const margin = ele.data("marginDb") || 3;
    return getLinkQualityColor(margin);
  },
  "line-style": (ele: any) =>
    ele.data("linkType") === "sat-ground" ? "dashed" : "solid",
  "line-opacity": 0.75,

  "target-arrow-color": (ele: any) => {
    const margin = ele.data("marginDb") || 3;
    return getLinkQualityColor(margin);
  },
  "target-arrow-shape": "triangle",
  "arrow-scale": 0.7,

  "curve-style": "bezier",
  "control-point-step-size": 45,

  "font-size": 7,
  "font-family": "Menlo, monospace",
  "text-rotation": "autorotate",

  "text-background-color": "#000",
  "text-background-opacity": 0.85,
  "text-background-padding": 2,
};

// ============================================
// SELECTED STATE - "TARGET LOCK"
// White-hot border with intense glow
// ============================================
export const SELECTED_STYLE: any = {
  // Double border for reticle effect
  "border-width": 3,
  "border-style": "double",
  "border-color": "#ffffff",

  // Intense outer glow
  "shadow-blur": 30,
  "shadow-color": (ele: any) =>
    ele.data("color") || getNodeColor(ele.data("nodeType")),
  "shadow-opacity": 0.9,

  // High z-index to render on top
  "z-index": 999,
};

export const SELECTED_EDGE_STYLE: any = {
  "line-color": "#ffffff",
  "target-arrow-color": "#ffffff",
  width: 4,
  "line-opacity": 1,
  "z-index": 999,
};

// ============================================
// HOVER STATE - "ACQUISITION"
// Subtle glow increase on mouse over
// ============================================
export const HOVER_STYLE: any = {
  "border-width": 2.5,
  "shadow-blur": 22,
  "shadow-opacity": 0.7,
  "z-index": 500,
};

// ============================================
// ACTIVE/PINNED STATE
// Persistent highlight for tracked nodes
// ============================================
export const ACTIVE_STYLE: any = {
  "border-width": 3,
  "border-style": "solid",
  "overlay-color": "#ffffff",
  "overlay-opacity": 0.15,
};

// ============================================
// LAYOUT CONFIGURATIONS
// ============================================
export const LAYOUT_CONFIGS = {
  dagre: {
    name: "dagre",
    rankDir: "TB",
    nodeSep: 80,
    rankSep: 100,
    padding: 50,
    animate: true,
    animationDuration: 500,
  },

  cose: {
    name: "cose",
    idealEdgeLength: 100,
    nodeOverlap: 25,
    refresh: 20,
    fit: true,
    padding: 50,
    randomize: false,
    componentSpacing: 150,
    nodeRepulsion: () => 1200000,
    edgeElasticity: () => 100,
    nestingFactor: 5,
    gravity: 40,
    numIter: 1000,
    initialTemp: 250,
    coolingFactor: 0.95,
    minTemp: 1.0,
    animate: true,
    animationDuration: 700,
    animationEasing: "ease-out-cubic" as const,
  },

  circle: {
    name: "circle",
    padding: 60,
    animate: true,
    animationDuration: 400,
    avoidOverlap: true,
    spacingFactor: 1.5,
  },

  concentric: {
    name: "concentric",
    padding: 60,
    animate: true,
    animationDuration: 500,
    avoidOverlap: true,
    minNodeSpacing: 50,
    concentric: (node: any) => {
      // Satellites in inner ring, ground stations outer
      return node.data("nodeType") === "Satellite" ? 2 : 1;
    },
    levelWidth: () => 1,
  },

  grid: {
    name: "grid",
    padding: 50,
    animate: true,
    animationDuration: 400,
    avoidOverlap: true,
    condense: true,
    rows: undefined,
    cols: undefined,
  },

  breadthfirst: {
    name: "breadthfirst",
    directed: false,
    padding: 50,
    spacingFactor: 1.75,
    animate: true,
    animationDuration: 500,
  },
};

export type LayoutType = keyof typeof LAYOUT_CONFIGS;

export function getLayoutConfig(layoutType: LayoutType): any {
  return LAYOUT_CONFIGS[layoutType] || LAYOUT_CONFIGS.cose;
}

// ============================================
// PERFORMANCE THRESHOLDS
// ============================================
export const HIGH_FIDELITY_THRESHOLD = 200; // Disable effects above this node count
export const ANIMATION_THRESHOLD = 500;     // Disable animations above this

// ============================================
// COMPLETE STYLESHEET GENERATOR
// Returns Cytoscape-compatible stylesheet array
// ============================================
export function generateStylesheet(isHighFidelity: boolean): CytoscapeStylesheet {
  const nodeStyle = getNodeStyle(isHighFidelity);

  return [
    // Base node style
    {
      selector: "node",
      style: nodeStyle,
    },

    // Satellite nodes - Diamond shape
    {
      selector: 'node[nodeType="Satellite"]',
      style: {
        shape: "diamond",
        width: 32,
        height: 32,
        "background-color": "#0a0a0a",
        "border-color": (ele: any) => ele.data("color") || NODE_COLORS.Satellite,
      },
    },

    // Ground station nodes - Hexagon shape
    {
      selector: 'node[nodeType="GroundStation"]',
      style: {
        shape: "hexagon",
        width: 28,
        height: 28,
        "background-color": "#050505",
        "border-color": (ele: any) => ele.data("color") || NODE_COLORS.GroundStation,
      },
    },

    // Gateway nodes - Octagon shape
    {
      selector: 'node[nodeType="Gateway"]',
      style: {
        shape: "octagon",
        width: 36,
        height: 36,
        "border-width": 2,
        "border-color": NODE_COLORS.Gateway,
      },
    },

    // Base edge style
    {
      selector: "edge",
      style: EDGE_STYLE,
    },

    // ISL (Inter-Satellite Link) edges
    {
      selector: 'edge[linkType="sat-sat"]',
      style: {
        "line-style": "solid",
        width: 2.5,
      },
    },

    // Ground link edges
    {
      selector: 'edge[linkType="sat-ground"]',
      style: {
        "line-style": "dashed",
        width: 2,
        "line-dash-pattern": [8, 4],
      },
    },

    // Selected state - "TARGET LOCK"
    {
      selector: ":selected",
      style: SELECTED_STYLE,
    },

    {
      selector: "edge:selected",
      style: SELECTED_EDGE_STYLE,
    },

    // Highlighted path
    {
      selector: ".highlighted",
      style: {
        "border-color": "#ffd700",
        "background-color": "#1a1a00",
        "line-color": "#ffd700",
        "target-arrow-color": "#ffd700",
        "shadow-color": "#ffd700",
        "shadow-opacity": 0.8,
        "transition-property": "background-color, line-color, border-color",
        "transition-duration": "0.3s",
        "z-index": 800,
      },
    },

    // Faded state for non-path elements
    {
      selector: ".faded",
      style: {
        opacity: 0.15,
      },
    },

    // Critical status
    {
      selector: ".critical",
      style: {
        "border-color": NODE_COLORS.Critical,
        "shadow-color": NODE_COLORS.Critical,
        "shadow-opacity": 0.9,
        "shadow-blur": 25,
      },
    },

    // Degraded status
    {
      selector: ".degraded",
      style: {
        "border-color": NODE_COLORS.Degraded,
        "shadow-color": NODE_COLORS.Degraded,
        "shadow-opacity": 0.6,
      },
    },

    // Offline status
    {
      selector: ".offline",
      style: {
        "border-color": NODE_COLORS.Offline,
        "background-opacity": 0.4,
        opacity: 0.5,
      },
    },
  ];
}
