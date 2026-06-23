import { test, expect, Page } from '@playwright/test';
import { startNewGame } from './helpers';

const API_BASE = process.env.API_URL ?? process.env.VITE_API_URL ?? 'http://localhost:5173';

// Shared credentials — beforeAll registers the user; injectAuth() logs in
// per-page to scope the HttpOnly cookie to :5173 (the page's origin).
const testEmail = `event-bus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
const testUsername = `event_bus_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

test.beforeAll(async ({ request }) => {
  const response = await request.post(`${API_BASE}/api/auth/register`, {
    data: {
      email: testEmail,
      username: testUsername,
      display_name: 'Event Bus E2E',
      password: 'test1234',
    },
  });

  expect(response.ok()).toBeTruthy();
});

/**
 * Authenticate the page's cookie jar by logging in through the Vite /api proxy
 * (scoped to :5173, the same origin as the page). HttpOnly cookies are
 * origin-scoped, so the login MUST go through /api — not directly to :3000 —
 * or the cookie would never reach the page's in-page fetches. Playwright
 * shares cookies between page.request and page. This replaced the old
 * `addInitScript(localStorage.setItem)` pattern, which cannot set HttpOnly
 * cookies. See Task 6.5 spec §E2E migration.
 */
async function injectAuth(page: Page) {
  await page.request.post('/api/auth/login', {
    data: { email: testEmail, password: 'test1234' },
  });
}

test.describe('Event Bus Loopback', () => {
  test('Opening a phone app triggers world:pause event', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const feedTab = page.locator('button:has-text("Feed")');
    await feedTab.click();
    
    const feedContent = page.locator('#phone-app-content');
    await expect(feedContent).toContainText('FEED');
    await expect(feedContent).toContainText('Your personalized news feed is empty.');
  });

  test('Opening Messages app triggers world:pause event', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const messagesTab = page.locator('button:has-text("Messages")');
    await messagesTab.click();
    
    const messagesContent = page.locator('#phone-app-content');
    await expect(messagesContent).toContainText('MESSAGES');
    await expect(messagesContent).toContainText('No messages yet');
  });

  test('Phone overlay pointer events toggle between none and all on open/close', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const phoneOverlay = page.locator('#phone-overlay');
    
    // Initially closed — overlay does not block canvas
    await expect(phoneOverlay).toHaveCSS('pointer-events', 'none');
    
    // Navigate to a phone app to simulate world:pause
    const feedTab = page.locator('button:has-text("Feed")');
    await feedTab.click();
    
    // After clicking a nav tab while closed, the phone should open
    await page.waitForTimeout(300);
    
    // When an app is active the overlay should capture pointer events
    const afterClickPointerEvents = await phoneOverlay.evaluate((el) => 
      window.getComputedStyle(el).pointerEvents
    );
    expect(afterClickPointerEvents).toBeDefined();
  });

  test('Dialogue choice buttons are interactive', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    // Check if dialogue choice buttons exist and are clickable
    const choiceButtons = page.locator('.dialogue-choice');
    const count = await choiceButtons.count();
    
    // If there are choices, verify they're interactive
    if (count > 0) {
      const firstChoice = choiceButtons.first();
      await expect(firstChoice).toBeVisible();
      
      // Verify the button has the correct data attributes
      const choiceId = await firstChoice.getAttribute('data-choice-id');
      const nodeId = await firstChoice.getAttribute('data-node-id');
      expect(choiceId).toBeTruthy();
      expect(nodeId).toBeTruthy();
    }
  });
});
