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
export async function startNewGame(page: Page, locationId = 'c3d4e5f6-a7b8-9012-cdef-123456789012'): Promise<void> {
  await page.goto(`/city/loc/${locationId}`);
}
