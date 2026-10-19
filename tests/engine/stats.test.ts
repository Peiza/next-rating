import { describe, expect, it } from 'vitest';
import { mean, populationStdDev, weightedMean } from '../../src/engine/stats';

describe('stats', () => {
  it('computes the mean', () => {
    expect(mean([900, 1000, 1100])).toBe(1000);
    expect(mean([])).toBeNaN();
  });

  it('computes the population standard deviation', () => {
    expect(populationStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(populationStdDev([950])).toBe(0);
  });

  it('computes a weighted mean', () => {
    expect(weightedMean([1000, 900], [2, 1])).toBeCloseTo(966.667, 3);
    expect(weightedMean([1000], [0])).toBeNaN();
    expect(() => weightedMean([1], [1, 2])).toThrow(RangeError);
  });
});
