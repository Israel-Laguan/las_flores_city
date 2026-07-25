import { Page } from '@playwright/test';

/**
 * Navigate to a location route so the app boots the game world and Phaser
 * canvas. The page's cookie jar must already contain a valid session cookie
 * (set via page.request.post('/api/auth/login') or dev-login beforehand).
 *
 * Uses "The Apartment" scene ID which triggers Phaser to start via the
 * /city/loc/:id route handler. Navigates to /city as a fallback so tests
 * that only check CityNav (e.g. phone overlay presence) still work.
 */
export async function startNewGame(page: Page, locationId = '1efcf23b-04b1-404c-bf8d-1aa15d11d213'): Promise<void> {
  await page.goto(`/city/loc/${locationId}`);
}
