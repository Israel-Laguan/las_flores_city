// api/planning/src/canon/threshold-events.ts
// SC-206: Threshold-crossing sets flag as event (fixture-backed)
// NOT a real stat pipeline. Fixture-backed mechanism only.
// latching: flag stays set after crossing; tracking: flag clears when stat falls below.

import type { FlagDefinition, FlagSemantics } from '@las-flores/api-contracts';

/**
 * A simple stat value for testing threshold crossing.
 * In a real implementation, this would come from player statistics.
 */
export type StatValue = number;

/**
 * Threshold definition for triggering a flag.
 */
export interface Threshold {
  /** The stat name to watch */
  statName: string;
  /** The threshold value */
  value: number;
  /** Direction: 'above' (stat > value) or 'below' (stat < value) or 'at_or_above' (stat >= value) */
  direction: 'above' | 'below' | 'at_or_above';
}

/**
 * Result of applying a threshold crossing.
 * Returns the flag changes that should be applied.
 */
export interface ThresholdResult {
  /** Flags to set (true) or clear (false) */
  flag_set: Record<string, boolean>;
  /** Description of what changed */
  description: string;
}

/**
 * Fixture-backed threshold monitor.
 * Tracks stat values and checks against thresholds.
 * This is NOT a real stat pipeline - it's a fixture for testing.
 */
export class ThresholdMonitor {
  private statValues: Map<string, number> = new Map();
  private thresholds: Map<string, Threshold[]> = new Map();

  /**
   * Set a stat value.
   * Returns true if the value changed from the previous value.
   */
  setStatValue(statName: string, value: number): boolean {
    const previous = this.statValues.get(statName);
    this.statValues.set(statName, value);
    return previous !== value;
  }

  /**
   * Get the current value of a stat.
   */
  getStatValue(statName: string): number | undefined {
    return this.statValues.get(statName);
  }

  /**
   * Add a threshold to monitor for a stat.
   */
  addThreshold(statName: string, threshold: Threshold): void {
    if (!this.thresholds.has(statName)) {
      this.thresholds.set(statName, []);
    }
    this.thresholds.get(statName)!.push(threshold);
  }

  /**
   * Check if a stat crosses a threshold.
   * Returns the threshold result if crossed, undefined otherwise.
   */
  checkThresholdCrossing(
    statName: string,
    oldValue: number,
    newValue: number,
  ): ThresholdResult | undefined {
    const thresholds = this.thresholds.get(statName);
    if (!thresholds) {
      return undefined;
    }

    for (const threshold of thresholds) {
      const wasAbove = this.checkDirection(oldValue, threshold.direction, threshold.value);
      const isAbove = this.checkDirection(newValue, threshold.direction, threshold.value);

      // Crossing detected: was not above, now is above
      if (!wasAbove && isAbove) {
        return {
          flag_set: { [this.thresholdToFlagName(threshold)]: true },
          description: `Threshold crossed: ${statName} ${threshold.direction} ${threshold.value}`,
        };
      }
    }

    return undefined;
  }

  private checkDirection(
    value: number,
    direction: 'above' | 'below' | 'at_or_above',
    threshold: number,
  ): boolean {
    switch (direction) {
      case 'above':
        return value > threshold;
      case 'below':
        return value < threshold;
      case 'at_or_above':
        return value >= threshold;
      default:
        return false;
    }
  }

  /**
   * Generate a flag name from a threshold.
   * In practice, this would be configured in the flag definition.
   */
  private thresholdToFlagName(threshold: Threshold): string {
    return `threshold_${threshold.statName}_${threshold.direction}_${threshold.value}`;
  }
}

/**
 * Apply threshold crossing and return flag changes.
 * This is the main function for SC-206.
 * 
 * @param statName - The stat that changed
 * @param oldValue - The previous value
 * @param newValue - The new value
 * @param threshold - The threshold definition
 * @param flagDef - The flag definition (contains semantics)
 * @returns The flag changes to apply
 */
export function applyThresholdCrossing(
  statName: string,
  oldValue: StatValue,
  newValue: StatValue,
  threshold: Threshold,
  flagDef: FlagDefinition,
): ThresholdResult {
  // Determine if we crossed the threshold
  const wasAbove = checkThreshold(oldValue, threshold);
  const isAbove = checkThreshold(newValue, threshold);

  // If we just crossed above the threshold
  if (!wasAbove && isAbove) {
    // Set the flag
    return {
      flag_set: { [flagDef.slug]: true },
      description: `Threshold crossed: ${statName} crossed ${threshold.direction} ${threshold.value}, setting flag ${flagDef.slug}`,
    };
  }

  // If we just crossed below the threshold
  if (wasAbove && !isAbove) {
    // For tracking semantics, clear the flag
    if (flagDef.semantics === 'tracking') {
      return {
        flag_set: { [flagDef.slug]: false },
        description: `Threshold uncrossed: ${statName} fell below ${threshold.direction} ${threshold.value}, clearing tracking flag ${flagDef.slug}`,
      };
    }
    // For latching semantics, do not clear the flag
    // The flag persists until explicitly cleared by a planning operation
    return {
      flag_set: {},
      description: `Threshold uncrossed: ${statName} fell below ${threshold.direction} ${threshold.value}, but latching flag ${flagDef.slug} persists`,
    };
  }

  // No crossing
  return {
    flag_set: {},
    description: `No threshold crossing for ${statName}`,
  };
}

function checkThreshold(value: number, threshold: Threshold): boolean {
  switch (threshold.direction) {
    case 'above':
      return value > threshold.value;
    case 'below':
      return value < threshold.value;
    case 'at_or_above':
      return value >= threshold.value;
    default:
      return false;
  }
}

/**
 * Simplified version for fixture-backed testing with a plain number.
 * This is the interface specified in SC-206.
 * 
 * @param statName - The stat that changed (for logging/debugging)
 * @param oldValue - The previous value
 * @param newValue - The new value
 * @param thresholdValue - The threshold value to cross
 * @param flagDef - The flag definition (contains semantics and slug)
 * @returns The flag changes to apply
 */
export function applyThresholdCrossingSimple(
  statName: string,
  oldValue: number,
  newValue: number,
  thresholdValue: number,
  flagDef: FlagDefinition,
): ThresholdResult {
  const threshold: Threshold = {
    statName,
    value: thresholdValue,
    direction: 'at_or_above',
  };

  return applyThresholdCrossing(
    statName,
    oldValue,
    newValue,
    threshold,
    flagDef,
  );
}

/**
 * Tracks flag states for testing threshold behavior.
 * This is a fixture for testing the latching vs tracking semantics.
 */
export class FixtureFlagState {
  private flagStates: Map<string, boolean> = new Map();

  /**
   * Apply a threshold crossing result to the flag state.
   */
  apply(result: ThresholdResult): void {
    for (const [flagSlug, value] of Object.entries(result.flag_set)) {
      this.flagStates.set(flagSlug, value);
    }
  }

  /**
   * Get the current state of a flag.
   */
  get(flagSlug: string): boolean {
    return this.flagStates.get(flagSlug) ?? false;
  }

  /**
   * Reset all flag states.
   */
  reset(): void {
    this.flagStates.clear();
  }
}
