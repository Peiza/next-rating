import { describe, expect, it } from 'vitest';
import { layersState, NO_LAYERS, readLayers, sameLayers } from '../../src/app/layers';

describe('readLayers', () => {
  it('reads the state the app stores', () => {
    const layers = { overlay: 'guide' as const, menu: true, depth: 2 };
    expect(readLayers(layersState(layers))).toEqual(layers);
    expect(readLayers(structuredClone(layersState({ overlay: null, menu: true, depth: 1 })))).toEqual({
      overlay: null,
      menu: true,
      depth: 1,
    });
  });

  it('shows no layers for a state that is not the app’s', () => {
    for (const state of [
      null,
      undefined,
      'guide',
      {},
      { overlay: 'guide', menu: false, depth: 1 },
      { nextRating: 2, overlay: 'guide', menu: false, depth: 1 },
      { nextRating: 1, overlay: 'guide', menu: false, depth: 0 },
      { nextRating: 1, overlay: 'guide', menu: false, depth: 1.5 },
      { nextRating: 1, overlay: 'guide', menu: false, depth: '1' },
      { nextRating: 1, overlay: 'guide', menu: false, depth: 101 },
    ]) {
      expect(readLayers(state)).toEqual(NO_LAYERS);
    }
  });

  it('reads each overlay: the setup, How it works and the full-screen chart', () => {
    for (const overlay of ['setup', 'guide', 'chart'] as const) {
      expect(readLayers(layersState({ overlay, menu: false, depth: 1 })).overlay).toBe(overlay);
    }
  });

  it('ignores unknown layer values', () => {
    expect(readLayers({ nextRating: 1, overlay: 'settings', menu: 'yes', depth: 1 })).toEqual({
      overlay: null,
      menu: false,
      depth: 1,
    });
  });
});

describe('sameLayers', () => {
  it('compares what is shown, not the depth', () => {
    expect(sameLayers({ overlay: 'setup', menu: false, depth: 1 }, { overlay: 'setup', menu: false, depth: 3 })).toBe(true);
    expect(sameLayers({ overlay: 'setup', menu: false, depth: 1 }, { overlay: 'setup', menu: true, depth: 2 })).toBe(false);
    expect(sameLayers(NO_LAYERS, { overlay: 'guide', menu: false, depth: 1 })).toBe(false);
  });
});
