/**
 * Calculates the in-game time from remaining time blocks.
 * Day starts at 08:00 AM (TB=48). Each spent TB adds 30 minutes.
 * Formula: MinutesSinceMidnight = 480 + (48 - timeBlocks) * 30
 */
export function calculateInGameTime(timeBlocks: number): string {
  const totalMinutes = (8 * 60) + (48 - timeBlocks) * 30;
  const rawHour = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  const displayHour = rawHour % 12 === 0 ? 12 : rawHour % 12;
  const ampm = rawHour >= 12 ? 'PM' : 'AM';

  return `${displayHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}
