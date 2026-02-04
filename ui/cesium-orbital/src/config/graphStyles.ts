// config/graphStyles.ts - Neo4j-inspired clean graph visualization
// Professional, scientific aesthetic for constellation topology

type CytoscapeStylesheet = Array<{ selector: string; style: Record<string, any> }>;

// ============================================
// COLOR PALETTE - Muted, Professional
// ============================================
export const NODE_COLORS: Record<string, string> = {
  // Node types
  Satellite: "#4C8BF5",      // Soft blue
  GroundStation: "#34A853",  // Soft green
  Gateway: "#9334E6",        // Soft purple

  // Status colors
  Active: "#4C8BF5",         // Blue
  Degraded: "#FF9800",       // Orange (was amber/yellow)
  Critical: "#EA4335",       // Red
  Offline: "#9AA0A6",        // Gray

  // Orbital planes - subtle variations
  Plane0: "#4C8BF5",         // Blue
  Plane1: "#34A853",         // Green
  Plane2: "#EA4335",         // Red
  Plane3: "#9334E6",         // Purple
  Plane4: "#00ACC1",         // Cyan
  Plane5: "#FB8C00",         // Orange
  Plane6: "#7CB342",         // Light green
  Plane7: "#F06292",         // Pink
};

// Link colors based on quality
export const LINK_QUALITY_COLORS = {
  excellent: "#34A853",      // Green - healthy
  good: "#4C8BF5",           // Blue - normal
  marginal: "#FF9800",       // Orange - warning
  weak: "#EA4335",           // Red - degraded
  failing: "#9AA0A6",        // Gray - failing
};

// Edge colors
const EDGE_COLOR = "#5F6368";        // Gray for edges
const EDGE_COLOR_LIGHT = "#80868B";  // Lighter gray

export const DEFAULT_COLOR = "#4C8BF5";

// ============================================
// HELPER FUNCTIONS
// ============================================
export function getNodeColor(nodeType: string): string {
  return NODE_COLORS[nodeType] || DEFAULT_COLOR;
}

export function getPlaneColor(planeIndex: number): string {
  const colors = [
    NODE_COLORS.Plane0, NODE_COLORS.Plane1, NODE_COLORS.Plane2,
    NODE_COLORS.Plane3, NODE_COLORS.Plane4, NODE_COLORS.Plane5,
    NODE_COLORS.Plane6, NODE_COLORS.Plane7,
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
// LAYOUT CONFIGURATIONS
// ============================================
export const LAYOUT_CONFIGS = {
  cose: {
    name: "cose",
    idealEdgeLength: 120,
    nodeOverlap: 20,
    refresh: 20,
    fit: true,
    padding: 40,
    randomize: false,
    componentSpacing: 100,
    nodeRepulsion: () => 800000,
    edgeElasticity: () => 80,
    nestingFactor: 5,
    gravity: 30,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0,
    animate: true,
    animationDuration: 500,
  },

  dagre: {
    name: "dagre",
    rankDir: "TB",
    nodeSep: 60,
    rankSep: 80,
    padding: 40,
    animate: true,
    animationDuration: 400,
  },

  circle: {
    name: "circle",
    padding: 40,
    animate: true,
    animationDuration: 300,
    avoidOverlap: true,
    spacingFactor: 1.2,
  },

  concentric: {
    name: "concentric",
    padding: 40,
    animate: true,
    animationDuration: 400,
    avoidOverlap: true,
    minNodeSpacing: 40,
    concentric: (node: any) => {
      return node.data("nodeType") === "Satellite" ? 2 : 1;
    },
    levelWidth: () => 1,
  },

  grid: {
    name: "grid",
    padding: 40,
    animate: true,
    animationDuration: 300,
    avoidOverlap: true,
    condense: true,
  },

  breadthfirst: {
    name: "breadthfirst",
    directed: false,
    padding: 40,
    spacingFactor: 1.5,
    animate: true,
    animationDuration: 400,
  },
};

export type LayoutType = keyof typeof LAYOUT_CONFIGS;

export function getLayoutConfig(layoutType: LayoutType): any {
  return LAYOUT_CONFIGS[layoutType] || LAYOUT_CONFIGS.cose;
}

// ============================================
// PERFORMANCE THRESHOLDS
// ============================================
export const HIGH_FIDELITY_THRESHOLD = 200;
export const ANIMATION_THRESHOLD = 500;

// Unused but kept for API compatibility
export function getNodeStyle(_isHighFidelity: boolean): any {
  return {};
}

// ============================================
// STYLESHEET - Neo4j-inspired clean design
// ============================================
export function generateStylesheet(_isHighFidelity: boolean): CytoscapeStylesheet {
  return [
    // Base node style - clean circles
    {
      selector: "node",
      style: {
        shape: "ellipse",
        width: 40,
        height: 40,
        "background-color": (ele: any) => ele.data("color") || getNodeColor(ele.data("nodeType")),
        "background-opacity": 1,
        "border-width": 2,
        "border-color": "#1F1F1F",
        "border-opacity": 1,

        // Clean label
        label: (ele: any) => ele.data("label") || ele.data("id") || "",
        color: "#E8EAED",
        "font-family": "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        "font-size": 11,
        "font-weight": 500,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 6,
        "text-wrap": "ellipsis",
        "text-max-width": 80,
      },
    },

    // Satellite nodes - slightly smaller
    {
      selector: 'node[nodeType="Satellite"]',
      style: {
        width: 36,
        height: 36,
        "background-color": (ele: any) => ele.data("color") || NODE_COLORS.Satellite,
      },
    },

    // Ground station nodes - slightly larger
    {
      selector: 'node[nodeType="GroundStation"]',
      style: {
        width: 44,
        height: 44,
        "background-color": (ele: any) => ele.data("color") || NODE_COLORS.GroundStation,
      },
    },

    // Gateway nodes
    {
      selector: 'node[nodeType="Gateway"]',
      style: {
        width: 50,
        height: 50,
        "background-color": NODE_COLORS.Gateway,
      },
    },

    // Base edge style - thin, clean lines
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": EDGE_COLOR,
        "line-opacity": 0.6,
        "curve-style": "bezier",
        "target-arrow-shape": "none",
      },
    },

    // ISL edges - solid
    {
      selector: 'edge[linkType="sat-sat"]',
      style: {
        width: 1,
        "line-style": "solid",
        "line-color": EDGE_COLOR,
      },
    },

    // Ground link edges - slightly different
    {
      selector: 'edge[linkType="sat-ground"]',
      style: {
        width: 1,
        "line-style": "solid",
        "line-color": EDGE_COLOR_LIGHT,
      },
    },

    // Selected node
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": "#FFFFFF",
        "z-index": 999,
      },
    },

    // Selected edge
    {
      selector: "edge:selected",
      style: {
        width: 2,
        "line-color": "#FFFFFF",
        "line-opacity": 1,
        "z-index": 999,
      },
    },

    // Hover state
    {
      selector: "node.hover",
      style: {
        "border-width": 3,
        "border-color": "#FFFFFF",
      },
    },

    // Highlighted path
    {
      selector: ".highlighted",
      style: {
        "border-color": "#FF9800",
        "line-color": "#FF9800",
        "line-opacity": 1,
        width: 2,
        "z-index": 800,
      },
    },

    // Faded elements
    {
      selector: ".faded",
      style: {
        opacity: 0.15,
      },
    },

    // Status: Critical
    {
      selector: ".critical",
      style: {
        "background-color": NODE_COLORS.Critical,
      },
    },

    // Status: Degraded
    {
      selector: ".degraded",
      style: {
        "background-color": NODE_COLORS.Degraded,
      },
    },

    // Status: Offline
    {
      selector: ".offline",
      style: {
        "background-color": NODE_COLORS.Offline,
        opacity: 0.5,
      },
    },
  ];
}
