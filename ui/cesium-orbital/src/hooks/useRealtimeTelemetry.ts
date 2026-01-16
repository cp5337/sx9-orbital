import { useEffect, useState } from 'react';
import { getTelemetryBridge } from '@/services/telemetryBridge';
import type { TelemetryStream } from '@/types';

export function useRealtimeTelemetry(): TelemetryStream {
  const [telemetry, setTelemetry] = useState<TelemetryStream>({
    routeEfficiency: 92.1,
    latency: 47.0,
    qber: 3.2,
    entropy: 12.4,
  });

  useEffect(() => {
    const bridge = getTelemetryBridge();

    const interval = setInterval(() => {
      setTelemetry(bridge.getTelemetry());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return telemetry;
}
