export interface BeamQualityFactors {
  optical: number;
  atmospheric: number;
  geometric: number;
  radiation: number;
  stability: number;
}

export interface BeamMetrics {
  snr?: number;
  pointingError?: number;
  beamDivergence?: number;
  opticalPower?: number;
  attenuation?: number;
  scintillationIndex?: number;
  cloudOpacity?: number;
  elevation?: number;
  dopplerShift?: number;
  maxDoppler?: number;
  distance?: number;
  radiationFlux?: number;
  criticalFlux?: number;
  seuProbability?: number;
  jitter?: number;
  uptimeFraction?: number;
  qber?: number;
  weatherTrend?: number;
}

export interface QualityWeights {
  optical: number;
  atmospheric: number;
  geometric: number;
  radiation: number;
  stability: number;
}

const DEFAULT_WEIGHTS: QualityWeights = {
  optical: 0.3,
  atmospheric: 0.25,
  geometric: 0.2,
  radiation: 0.15,
  stability: 0.1
};

export function calculateOpticalQuality(metrics: BeamMetrics): number {
  const snr = metrics.snr ?? 20;
  const snrFactor = Math.min(snr / 30, 1.0);

  const pointingError = metrics.pointingError ?? 10;
  const pointingFactor = Math.exp(-pointingError / 20);

  const beamDivergence = metrics.beamDivergence ?? 10;
  const divergenceFactor = Math.exp(-beamDivergence / 15);

  const opticalPower = metrics.opticalPower ?? -10;
  const minPower = -30;
  const maxPower = 0;
  const powerFactor = Math.max(0, Math.min(1, (opticalPower - minPower) / (maxPower - minPower)));

  const opticalQuality = (
    snrFactor * 0.4 +
    pointingFactor * 0.3 +
    divergenceFactor * 0.2 +
    powerFactor * 0.1
  );

  return Math.max(0, Math.min(1, opticalQuality));
}

export function calculateAtmosphericQuality(metrics: BeamMetrics): number {
  const attenuation = metrics.attenuation ?? 0;
  const attenuationFactor = Math.exp(-attenuation / 3);

  const scintillation = metrics.scintillationIndex ?? 0;
  const scintillationFactor = 1 - Math.min(scintillation, 1);

  const cloudOpacity = metrics.cloudOpacity ?? 0;
  const cloudFactor = 1 - (cloudOpacity / 100);

  const atmosphericQuality = attenuationFactor * scintillationFactor * cloudFactor;

  const weatherTrend = metrics.weatherTrend ?? 1.0;
  const trendAdjustment = Math.max(0.7, weatherTrend);

  return Math.max(0, Math.min(1, atmosphericQuality * trendAdjustment));
}

export function calculateGeometricQuality(metrics: BeamMetrics): number {
  const elevation = metrics.elevation ?? 45;
  const elevationRad = elevation * Math.PI / 180;
  const zenithAngle = Math.PI / 2 - elevationRad;
  const elevationFactor = Math.cos(zenithAngle);

  const dopplerShift = metrics.dopplerShift ?? 0;
  const maxDoppler = metrics.maxDoppler ?? 10;
  const dopplerFactor = 1 - Math.min(Math.abs(dopplerShift) / maxDoppler, 1);

  const distance = metrics.distance ?? 2000;
  const optimalDistance = 1500;
  const maxDistance = 4000;
  const rangeFactor = distance <= optimalDistance
    ? 1.0
    : Math.max(0, 1 - (distance - optimalDistance) / (maxDistance - optimalDistance));

  const geometricQuality = (
    elevationFactor * 0.5 +
    dopplerFactor * 0.3 +
    rangeFactor * 0.2
  );

  return Math.max(0, Math.min(1, geometricQuality));
}

export function calculateRadiationQuality(metrics: BeamMetrics): number {
  const radiationFlux = metrics.radiationFlux ?? 0;
  const criticalFlux = metrics.criticalFlux ?? 1e8;
  const fluxFactor = 1 - Math.min(radiationFlux / criticalFlux, 1);

  const seuProbability = metrics.seuProbability ?? 0;
  const seuFactor = 1 - seuProbability;

  const radiationQuality = fluxFactor * 0.6 + seuFactor * 0.4;

  return Math.max(0, Math.min(1, radiationQuality));
}

export function calculateStabilityQuality(metrics: BeamMetrics): number {
  const jitter = metrics.jitter ?? 1;
  const jitterVariance = jitter * jitter;
  const jitterFactor = 1 / (1 + jitterVariance / 10);

  const uptimeFraction = metrics.uptimeFraction ?? 0.99;
  const uptimeFactor = uptimeFraction;

  const stabilityQuality = jitterFactor * 0.4 + uptimeFactor * 0.6;

  return Math.max(0, Math.min(1, stabilityQuality));
}

export function calculateQBERPenalty(qber: number): number {
  const qberThreshold = 5.0;
  if (qber <= qberThreshold) return 1.0;

  const excessQBER = qber - qberThreshold;
  const penalty = Math.exp(-excessQBER / 3);

  return Math.max(0.1, penalty);
}

export function adjustWeightsForConditions(
  baseWeights: QualityWeights,
  inSolarStorm: boolean,
  weatherDegrading: boolean
): QualityWeights {
  const adjusted = { ...baseWeights };

  if (inSolarStorm) {
    adjusted.radiation = Math.min(adjusted.radiation * 1.5, 0.4);
    const reduction = adjusted.radiation - baseWeights.radiation;
    const others = ['optical', 'atmospheric', 'geometric', 'stability'] as const;
    others.forEach(key => {
      adjusted[key] = Math.max(0.05, adjusted[key] - reduction / others.length);
    });
  }

  if (weatherDegrading) {
    adjusted.atmospheric = Math.min(adjusted.atmospheric * 1.4, 0.4);
    const reduction = adjusted.atmospheric - baseWeights.atmospheric;
    const others = ['optical', 'geometric', 'radiation', 'stability'] as const;
    others.forEach(key => {
      adjusted[key] = Math.max(0.05, adjusted[key] - reduction / others.length);
    });
  }

  const sum = Object.values(adjusted).reduce((a, b) => a + b, 0);
  Object.keys(adjusted).forEach(key => {
    adjusted[key as keyof QualityWeights] /= sum;
  });

  return adjusted;
}

export function calculateCompositeQuality(
  metrics: BeamMetrics,
  weights: QualityWeights = DEFAULT_WEIGHTS,
  currentTargetScore?: number
): { score: number; factors: BeamQualityFactors } {
  const factors: BeamQualityFactors = {
    optical: calculateOpticalQuality(metrics),
    atmospheric: calculateAtmosphericQuality(metrics),
    geometric: calculateGeometricQuality(metrics),
    radiation: calculateRadiationQuality(metrics),
    stability: calculateStabilityQuality(metrics)
  };

  let compositeScore =
    factors.optical * weights.optical +
    factors.atmospheric * weights.atmospheric +
    factors.geometric * weights.geometric +
    factors.radiation * weights.radiation +
    factors.stability * weights.stability;

  const qber = metrics.qber ?? 0;
  if (qber > 0) {
    const qberPenalty = calculateQBERPenalty(qber);
    compositeScore *= qberPenalty;
  }

  if (currentTargetScore !== undefined) {
    const hysteresisThreshold = 0.15;
    if (compositeScore < currentTargetScore + hysteresisThreshold) {
      compositeScore *= 0.95;
    }
  }

  return {
    score: Math.max(0, Math.min(1, compositeScore)),
    factors
  };
}

export function shouldTriggerHandoff(
  currentScore: number,
  candidateScore: number,
  hysteresisPercent: number = 15
): boolean {
  const threshold = hysteresisPercent / 100;
  return candidateScore > currentScore * (1 + threshold);
}

export function rankCandidates(
  candidates: Array<{ id: string; metrics: BeamMetrics }>,
  weights: QualityWeights = DEFAULT_WEIGHTS
): Array<{ id: string; score: number; factors: BeamQualityFactors }> {
  const scored = candidates.map(candidate => {
    const result = calculateCompositeQuality(candidate.metrics, weights);
    return {
      id: candidate.id,
      score: result.score,
      factors: result.factors
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

export function predictQualityTrend(
  historicalScores: number[],
  timeWindowMinutes: number = 5
): number {
  if (historicalScores.length < 2) return 1.0;

  const recentScores = historicalScores.slice(-timeWindowMinutes);
  if (recentScores.length < 2) return 1.0;

  let sumDelta = 0;
  for (let i = 1; i < recentScores.length; i++) {
    sumDelta += recentScores[i] - recentScores[i - 1];
  }

  const avgDelta = sumDelta / (recentScores.length - 1);

  const trend = 1 + avgDelta * 10;

  return Math.max(0.5, Math.min(1.5, trend));
}
