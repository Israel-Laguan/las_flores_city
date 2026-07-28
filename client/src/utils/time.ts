/**
 * Calculates the in-game time from remaining time blocks.
 * Day starts at 08:00 AM (TB=48). Each spent TB adds 30 minutes.
 * Formula: MinutesSinceMidnight = 480 + (48 - timeBlocks) * 30
 */
export function calculateInGameTime(timeBlocks: number): string {
  const totalMinutes = (8 * 60) + (48 - timeBlocks) * 30;
  const normalizedHour = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  const displayHour = normalizedHour === 0 ? 12 : normalizedHour % 12;
  const ampm = normalizedHour >= 12 ? 'PM' : 'AM';

  return `${displayHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}
