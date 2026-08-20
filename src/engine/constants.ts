/**
 * Engine constants shared with the UI. This module must stay dependency-free:
 * importing anything from adapter.ts would pull @paulirish/trace_engine into
 * the main browser bundle, whose only legitimate home is the parse worker.
 */

/** Lanes columnarized per trace; the track picker chooses visibility. */
export const MAX_LANES = 24;

/** Lanes visible by default before the user opens the track picker. */
export const DEFAULT_VISIBLE_LANES = 12;
