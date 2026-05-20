import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
	test('shows the hero, connection form, and accessible room actions', async ({ page }) => {
		await page.goto('/');

		await expect(page).toHaveTitle(/大富豪 Online/);
		await expect(page.getByRole('heading', { name: '大富豪' })).toBeVisible();
		await expect(page.getByLabel('名前')).toBeVisible();
		await expect(page.getByRole('button', { name: '新しい卓' })).toBeEnabled();
		await expect(page.getByRole('button', { name: '入る' })).toBeDisabled();
	});

	test('fits on a phone viewport without horizontal page overflow', async ({ page, isMobile }) => {
		test.skip(!isMobile, 'mobile-only layout assertion');

		await page.goto('/');

		const metrics = await page.evaluate(() => ({
			clientWidth: document.documentElement.clientWidth,
			scrollWidth: document.documentElement.scrollWidth,
			bodyScrollWidth: document.body.scrollWidth,
		}));

		expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
		expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
		await expect(page.getByRole('button', { name: '新しい卓' })).toHaveCSS('min-height', '48px');
	});
});
