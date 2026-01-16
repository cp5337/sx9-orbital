import type { TelemetryStream } from '@/types';

export class TelemetryBridge {
  private sab: SharedArrayBuffer;
  private view: Float64Array;
  private worker: Worker | null = null;
  private updateInterval: number | null = null;

  constructor() {
    this.sab = new SharedArrayBuffer(Float64Array.BYTES_PER_ELEMENT * 8);
    this.view = new Float64Array(this.sab);

    this.view[0] = 92.1;
    this.view[1] = 47.0;
    this.view[2] = 3.2;
    this.view[3] = 12.4;
  }

  start(): void {
    if (this.updateInterval) return;

    this.updateInterval = window.setInterval(() => {
      this.view[0] = 90 + Math.random() * 10;
      this.view[1] = 40 + Math.random() * 20;
      this.view[2] = 2 + Math.random() * 6;
      this.view[3] = 10 + Math.random() * 10;
    }, 1200);
  }

  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  getTelemetry(): TelemetryStream {
    return {
      routeEfficiency: this.view[0],
      latency: this.view[1],
      qber: this.view[2],
      entropy: this.view[3],
    };
  }

  getSharedArrayBuffer(): SharedArrayBuffer {
    return this.sab;
  }

  destroy(): void {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

let bridgeInstance: TelemetryBridge | null = null;

export function getTelemetryBridge(): TelemetryBridge {
  if (!bridgeInstance) {
    bridgeInstance = new TelemetryBridge();
    bridgeInstance.start();
  }
  return bridgeInstance;
}
