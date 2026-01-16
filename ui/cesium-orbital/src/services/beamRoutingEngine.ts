import { supabase } from '../lib/supabase';
import {
  calculateCompositeQuality,
  shouldTriggerHandoff,
  adjustWeightsForConditions,
  type BeamMetrics,
  type QualityWeights,
} from '../utils/beamQuality';

interface CandidateTarget {
  nodeId: string;
  nodeName: string;
  score: number;
  factors: {
    optical: number;
    atmospheric: number;
    geometric: number;
    radiation: number;
    stability: number;
  };
}

interface RoutingDecision {
  satelliteId: string;
  candidateTargets: CandidateTarget[];
  selectedTargetId: string;
  algorithm: 'trading_engine' | 'rule_based' | 'manual';
  executionTimeUs: number;
}

export class BeamRoutingEngine {
  private isRunning = false;
  private updateInterval: number = 1000;
  private weights: QualityWeights = {
    optical: 0.3,
    atmospheric: 0.25,
    geometric: 0.2,
    radiation: 0.15,
    stability: 0.1,
  };

  constructor(updateIntervalMs: number = 1000) {
    this.updateInterval = updateIntervalMs;
  }

  async evaluateBeamAssignment(
    satelliteId: string,
    currentTargetId: string | null,
    candidateMetrics: Map<string, BeamMetrics>
  ): Promise<RoutingDecision> {
    const startTime = performance.now();

    const inSolarStorm = false;
    const weatherDegrading = false;
    const adjustedWeights = adjustWeightsForConditions(
      this.weights,
      inSolarStorm,
      weatherDegrading
    );

    const candidates: CandidateTarget[] = [];

    for (const [nodeId, metrics] of candidateMetrics) {
      const result = calculateCompositeQuality(metrics, adjustedWeights);
      candidates.push({
        nodeId,
        nodeName: nodeId,
        score: result.score,
        factors: result.factors,
      });
    }

    candidates.sort((a, b) => b.score - a.score);

    let selectedTargetId = candidates[0]?.nodeId || currentTargetId || '';

    if (currentTargetId) {
      const currentCandidate = candidates.find((c) => c.nodeId === currentTargetId);
      const bestCandidate = candidates[0];

      if (currentCandidate && bestCandidate) {
        if (!shouldTriggerHandoff(currentCandidate.score, bestCandidate.score, 15)) {
          selectedTargetId = currentTargetId;
        }
      }
    }

    const endTime = performance.now();
    const executionTimeUs = (endTime - startTime) * 1000;

    return {
      satelliteId,
      candidateTargets: candidates,
      selectedTargetId,
      algorithm: 'trading_engine',
      executionTimeUs,
    };
  }

  async recordRoutingDecision(decision: RoutingDecision): Promise<void> {
    try {
      await supabase.from('beam_routing_decisions').insert({
        satellite_id: decision.satelliteId,
        candidate_targets: decision.candidateTargets,
        selected_target_id: decision.selectedTargetId,
        decision_algorithm: decision.algorithm,
        execution_time_us: decision.executionTimeUs,
      });
    } catch (error) {
      console.error('Failed to record routing decision:', error);
    }
  }

  async executeHandoff(
    beamId: string,
    oldTargetId: string,
    newTargetId: string,
    reason: 'weather_degradation' | 'radiation_avoidance' | 'optimization' | 'node_failure',
    oldScore: number,
    newScore: number
  ): Promise<void> {
    const startTime = performance.now();

    try {
      await supabase
        .from('beams')
        .update({
          target_node_id: newTargetId,
          last_handoff_timestamp: new Date().toISOString(),
        })
        .eq('id', beamId);

      const endTime = performance.now();
      const handoffLatency = endTime - startTime;

      await supabase.from('beam_handoff_events').insert({
        beam_id: beamId,
        old_target_id: oldTargetId,
        new_target_id: newTargetId,
        handoff_reason: reason,
        handoff_latency_ms: handoffLatency,
        old_quality_score: oldScore,
        new_quality_score: newScore,
      });

      console.log(
        `Handoff completed: ${beamId} from ${oldTargetId} to ${newTargetId} (${reason})`
      );
    } catch (error) {
      console.error('Failed to execute handoff:', error);
      throw error;
    }
  }

  async optimizeAllBeams(): Promise<void> {
    try {
      const { data: beams } = await supabase
        .from('beams')
        .select('*')
        .eq('beam_status', 'active');

      if (!beams) return;

      for (const beam of beams) {
        const candidateMetrics = new Map<string, BeamMetrics>();

        candidateMetrics.set(beam.target_node_id, {
          snr: 25,
          pointingError: beam.pointing_error_urad,
          beamDivergence: beam.beam_divergence_urad,
          opticalPower: beam.optical_power_dbm,
          attenuation: beam.atmospheric_attenuation_db,
          scintillationIndex: beam.scintillation_index,
          cloudOpacity: beam.cloud_opacity_percent,
          elevation: beam.elevation_deg,
          dopplerShift: beam.doppler_shift_ghz,
          distance: beam.distance_km,
          radiationFlux: beam.radiation_flux_at_source,
          qber: beam.qber,
          jitter: beam.jitter_ms,
          uptimeFraction: 0.99,
        });

        const decision = await this.evaluateBeamAssignment(
          beam.source_node_id,
          beam.target_node_id,
          candidateMetrics
        );

        await this.recordRoutingDecision(decision);

        if (decision.selectedTargetId !== beam.target_node_id) {
          const currentScore = beam.link_quality_score;
          const newScore =
            decision.candidateTargets.find((c) => c.nodeId === decision.selectedTargetId)
              ?.score || 0;

          await this.executeHandoff(
            beam.id,
            beam.target_node_id,
            decision.selectedTargetId,
            'optimization',
            currentScore,
            newScore
          );
        }
      }
    } catch (error) {
      console.error('Error optimizing beams:', error);
    }
  }

  start(): void {
    if (this.isRunning) {
      console.warn('Routing engine already running');
      return;
    }

    this.isRunning = true;
    console.log('Beam routing engine started');

    const runOptimization = async () => {
      if (!this.isRunning) return;

      await this.optimizeAllBeams();

      if (this.isRunning) {
        setTimeout(runOptimization, this.updateInterval);
      }
    };

    runOptimization();
  }

  stop(): void {
    this.isRunning = false;
    console.log('Beam routing engine stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const beamRoutingEngine = new BeamRoutingEngine(5000);
