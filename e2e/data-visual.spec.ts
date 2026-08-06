import { expect, test } from '@playwright/test';

const backups = [
  { name: 'latest.sagnex.json', modifiedAt: '2026-08-06T10:32:00.000Z', size: 84231, isLatest: true },
  { name: '20260806T093000Z-阶段一完成.sagnex.json', modifiedAt: '2026-08-06T09:30:00.000Z', size: 80122, isLatest: false },
  { name: '20260805T211000Z-修改方案前.sagnex.json', modifiedAt: '2026-08-05T21:10:00.000Z', size: 79240, isLatest: false },
  { name: '20260804T140000Z-建立数学规划.sagnex.json', modifiedAt: '2026-08-04T14:00:00.000Z', size: 76100, isLatest: false },
  { name: '20260803T080000Z-初始版本.sagnex.json', modifiedAt: '2026-08-03T08:00:00.000Z', size: 73550, isLatest: false }
];

test('keeps the data page dense across desktop and mobile', async ({ page }) => {
  await page.route('**/api/webdav/config', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ endpoint: 'https://dav.example.test/dav', username: 'user@example.test', remotePath: 'Sagnex', passwordSet: true })
  }));
  await page.route('**/api/webdav/backups', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(backups) }));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/data');
  await expect(page.locator('.backup-tile')).toHaveCount(5);
  const namedTiles = page.locator('.backup-grid .backup-tile');
  await expect(namedTiles).toHaveCount(4);
  const firstBox = await namedTiles.nth(0).boundingBox();
  const secondBox = await namedTiles.nth(1).boundingBox();
  const thirdBox = await namedTiles.nth(2).boundingBox();
  expect(firstBox?.y).toBe(secondBox?.y);
  expect(firstBox?.y).toBe(thirdBox?.y);
  await page.screenshot({ path: 'test-results/data-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/data');
  await expect(page.locator('.backup-tile')).toHaveCount(5);
  await page.screenshot({ path: 'test-results/data-mobile.png', fullPage: true });
});

test('keeps both backup modules visible when the remote directory is empty', async ({ page }) => {
  await page.route('**/api/webdav/config', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ endpoint: 'https://dav.example.test/dav', username: 'user@example.test', remotePath: 'Sagnex', passwordSet: true })
  }));
  await page.route('**/api/webdav/backups', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));

  await page.goto('/data');
  await expect(page.getByRole('heading', { name: '最新备份' })).toBeVisible();
  await expect(page.getByText('还没有最新备份')).toBeVisible();
  await expect(page.getByRole('heading', { name: '版本备份' })).toBeVisible();
  await expect(page.getByText('还没有版本备份')).toBeVisible();
});
