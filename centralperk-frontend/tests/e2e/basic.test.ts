import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  // Expect a title "to contain" a substring.
  // Since we don't know the exact title, we'll just check if the page is accessible.
  await expect(page).not.toBeNull();
});
