/*
 * The pages that open over the current tab (the bookmarklet setup, How it
 * works and the full-screen chart) and the players panel on phones. Each one
 * opened adds a history entry with the same address, so the phone's back
 * gesture closes it instead of leaving the app. The entry's state says which
 * of them it shows.
 */

export type OverlayView = 'setup' | 'guide' | 'chart';

export interface Layers {
  overlay: OverlayView | null;
  menu: boolean;
  /**
   * How many entries above this one's first entry without layers belong to
   * the app, so closing can go back instead of adding an entry. 0 on an entry
   * the app did not add.
   */
  depth: number;
}

export const NO_LAYERS: Layers = { overlay: null, menu: false, depth: 0 };

/** Entries far beyond what anyone opens are not trusted as the app's. */
const MAX_DEPTH = 100;

/** The history state for some layers. */
export function layersState(layers: Layers): { nextRating: 1 } & Layers {
  return { nextRating: 1, ...layers };
}

/**
 * The layers an entry's state shows. Anything else at this address, or no
 * state, shows none.
 */
export function readLayers(state: unknown): Layers {
  if (typeof state !== 'object' || state === null) return NO_LAYERS;
  const { nextRating, overlay, menu, depth } = state as Record<string, unknown>;
  if (nextRating !== 1 || !Number.isInteger(depth) || (depth as number) < 1 || (depth as number) > MAX_DEPTH) return NO_LAYERS;
  return {
    overlay: overlay === 'setup' || overlay === 'guide' || overlay === 'chart' ? overlay : null,
    menu: menu === true,
    depth: depth as number,
  };
}

export function sameLayers(a: Layers, b: Layers): boolean {
  return a.overlay === b.overlay && a.menu === b.menu;
}
