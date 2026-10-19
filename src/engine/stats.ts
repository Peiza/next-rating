/** Arithmetic mean. NaN for an empty list. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Population standard deviation (divides by n, not n - 1). NaN for an empty list. */
export function populationStdDev(values: readonly number[]): number {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

/** Weighted mean. NaN when the weights sum to zero. */
export function weightedMean(values: readonly number[], weights: readonly number[]): number {
  if (values.length !== weights.length) throw new RangeError('values and weights differ in length');
  let weightedSum = 0;
  let totalWeight = 0;
  values.forEach((value, i) => {
    const weight = weights[i] ?? 0;
    weightedSum += value * weight;
    totalWeight += weight;
  });
  return totalWeight > 0 ? weightedSum / totalWeight : NaN;
}
