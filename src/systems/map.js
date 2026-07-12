/**
 * Shared world scale — terrain, play clamp, borders, fog.
 * Units are world meters (XZ plane).
 */

/** Full ground plane edge length */
export const MAP_SIZE = 720;

/** Player / horse hard clamp (half-extent from origin) */
export const PLAY_HALF = 200;

/** Dense forest belt (radius from origin) */
export const FOREST_INNER = 175;
export const FOREST_OUTER = 265;

/** Cliff ring outside the forest */
export const CLIFF_INNER = 250;
export const CLIFF_OUTER = 330;
