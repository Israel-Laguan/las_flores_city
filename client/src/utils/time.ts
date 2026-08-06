/**
 * Shared in-game clock math. Day starts at 08:00 (TB=48); each spent TB adds
 * 30 minutes, so a full 24h cycle is exactly 48 blocks. Kept in one place so
 * the status-bar clock and the VN background-environment hint stay in sync.
 */
function getClockHourAndMinutes(timeBlocks: number): { hour: number; minutes: number } {
  const totalMinutes = (8 * 60) + (48 - timeBlocks) * 30;
  return { hour: Math.floor(totalMinutes / 60) % 24, minutes: totalMinutes % 60 };
}

/**
 * Calculates the in-game time from remaining time blocks.
 * Day starts at 08:00 AM (TB=48). Each spent TB adds 30 minutes.
 * Formula: MinutesSinceMidnight = 480 + (48 - timeBlocks) * 30
 */
export function calculateInGameTime(timeBlocks: number): string {
  const { hour: rawHour, minutes } = getClockHourAndMinutes(timeBlocks);

  const displayHour = rawHour % 12 === 0 ? 12 : rawHour % 12;
  const ampm = rawHour >= 12 ? 'PM' : 'AM';

  return `${displayHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Broad time-of-day band derived from the real in-game clock
 * (`phoneStore.timeBlocks`). Used by the VN viewport as a *game-driven*
 * background-environment hint (see docs/ASSET_EXPRESSION_VOCABULARY.md).
 *
 * Day cycle bands:
 *   - `day`   08:00–17:59
 *   - `sunset`/dusk 18:00–19:59
 *   - `night` 20:00–07:59
 */
export type TimeOfDay = 'day' | 'dusk' | 'night';

export function getTimeOfDay(timeBlocks: number): TimeOfDay {
  const { hour } = getClockHourAndMinutes(timeBlocks);
  if (hour >= 20 || hour < 8) return 'night';
  if (hour >= 18) return 'dusk';
  return 'day';
}
