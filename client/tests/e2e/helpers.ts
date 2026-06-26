import { Page } from '@playwright/test';

/**
 * Navigate to the city route so the app boots the game world.
 * The page's cookie jar must already contain a valid session cookie
 * (set via page.request.post('/api/auth/login') or dev-login beforehand).
 */
export async function startNewGame(page: Page): Promise<void> {
  await page.goto('/city');
}
