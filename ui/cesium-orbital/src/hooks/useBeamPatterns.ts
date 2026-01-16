// React hook for beam pattern operations
// Hook: useBeamPatterns.ts | Lines: ~140 | Tier: Simple (<200)

import { useState, useEffect, useCallback } from 'react';
import { beamEngine } from '@/wasm/beamPatternEngine';
import { beamPatternService } from '@/services/beamPatternService';
import { DeclinationConfig, LinkBudgetResult, BeamType } from '@/wasm/types';

export function useBeamPatterns(stationId?: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<DeclinationConfig | null>(null);
  const [linkBudgets, setLinkBudgets] = useState<LinkBudgetResult[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    initializeWasm();
  }, []);

  useEffect(() => {
    if (stationId) {
      loadConfig();
    }
  }, [stationId]);

  const initializeWasm = async () => {
    try {
      await beamEngine.initialize();
      setInitialized(true);
    } catch (err) {
      setError('Failed to initialize WASM module');
      console.error(err);
    }
  };

  const loadConfig = useCallback(async () => {
    if (!stationId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await beamPatternService.getDeclinationConfig(stationId);
      setConfig(data);
    } catch (err) {
      setError('Failed to load configuration');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  const saveConfig = useCallback(async (newConfig: DeclinationConfig) => {
    setLoading(true);
    setError(null);

    try {
      await beamPatternService.saveDeclinationConfig(newConfig);
      setConfig(newConfig);
    } catch (err) {
      setError('Failed to save configuration');
      console.error(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const calculateBudgets = useCallback(async () => {
    if (!stationId || !initialized) return;

    setLoading(true);
    setError(null);

    try {
      const budgets = await beamEngine.calculateLinkBudgets(stationId);
      setLinkBudgets(budgets);
      return budgets;
    } catch (err) {
      setError('Failed to calculate link budgets');
      console.error(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [stationId, initialized]);

  const generatePattern = useCallback(async (
    beamType: BeamType,
    wavelengthNm: number,
    waistRadiusMm: number,
    powerWatts: number,
    cn2Turbulence: number,
    width: number = 800,
    height: number = 800
  ) => {
    if (!initialized) {
      throw new Error('WASM not initialized');
    }

    setLoading(true);
    setError(null);

    try {
      const pattern = await beamEngine.generateBeamPattern(
        beamType,
        wavelengthNm,
        waistRadiusMm,
        powerWatts,
        cn2Turbulence,
        width,
        height
      );
      return pattern;
    } catch (err) {
      setError('Failed to generate beam pattern');
      console.error(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [initialized]);

  const recordPerformance = useCallback(async (
    budgets: LinkBudgetResult[],
    weatherConditions?: Record<string, any>
  ) => {
    if (!stationId) return;

    try {
      await beamPatternService.recordLinkPerformance(
        stationId,
        budgets,
        weatherConditions
      );
    } catch (err) {
      console.error('Failed to record performance:', err);
    }
  }, [stationId]);

  return {
    loading,
    error,
    config,
    linkBudgets,
    initialized,
    loadConfig,
    saveConfig,
    calculateBudgets,
    generatePattern,
    recordPerformance,
  };
}
