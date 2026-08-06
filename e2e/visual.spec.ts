import { expect, test } from '@playwright/test';
import { stat } from 'node:fs/promises';

test('renders active cards and editor across desktop and mobile', async ({ page, request }) => {
  const eventTitle = `秋季版本发布-${Date.now().toString().slice(-6)}`;
  const eventResponse = await request.post('/api/events', { data: { title: eventTitle, description: '完成发布内容、渠道和上线检查', labelIds: [] } });
  const event = await eventResponse.json();
  const firstResponse = await request.post(`/api/events/${event.id}/tasks`, { data: { title: '需求确认', description: '', positionX: 60, positionY: 150 } });
  const first = await firstResponse.json();
  const secondResponse = await request.post(`/api/events/${event.id}/tasks`, { data: { title: '内容校对', description: '检查正文、链接与发布渠道中的文案', positionX: 300, positionY: 80 } });
  const second = await secondResponse.json();
  const thirdResponse = await request.post(`/api/events/${event.id}/tasks`, { data: { title: '封面确认', description: '', positionX: 300, positionY: 230 } });
  const third = await thirdResponse.json();
  const fourthResponse = await request.post(`/api/events/${event.id}/tasks`, { data: { title: '正式发布', description: '', positionX: 550, positionY: 150 } });
  const fourth = await fourthResponse.json();
  await request.post(`/api/events/${event.id}/dependencies`, { data: { sourceTaskId: first.id, targetTaskId: second.id } });
  await request.post(`/api/events/${event.id}/dependencies`, { data: { sourceTaskId: first.id, targetTaskId: third.id } });
  await request.post(`/api/events/${event.id}/dependencies`, { data: { sourceTaskId: second.id, targetTaskId: fourth.id } });
  await request.post(`/api/events/${event.id}/dependencies`, { data: { sourceTaskId: third.id, targetTaskId: fourth.id } });
  await request.post(`/api/tasks/${first.id}/transition`, { data: { toStatus: 'in_progress', confirmSoftDependencies: false } });
  await request.post(`/api/tasks/${first.id}/transition`, { data: { toStatus: 'completed', confirmSoftDependencies: false } });
  await request.post(`/api/tasks/${third.id}/transition`, { data: { toStatus: 'in_progress', confirmSoftDependencies: false } });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByText(eventTitle)).toBeVisible();
  await expect(page.getByText(/尚未完成的事件/)).toHaveCount(0);
  await expect(page.locator('.event-card').filter({ hasText: eventTitle }).locator('.graph-edges path')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/active-desktop.png', fullPage: true });
  const activeDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出快照' }).click();
  const activeDownload = await activeDownloadPromise;
  await activeDownload.saveAs('test-results/active-export.png');
  expect((await stat('test-results/active-export.png')).size).toBeGreaterThan(5_000);
  await page.goto(`/events/${event.id}?task=${third.id}`);
  await expect(page.locator('.inspector input').first()).toHaveValue('封面确认');
  await expect(page.locator('.canvas-minimap')).toBeVisible();
  await page.waitForTimeout(400);
  const minimapViewport = page.getByTestId('minimap-viewport');
  const viewportBeforePan = {
    x: await minimapViewport.getAttribute('x'),
    width: await minimapViewport.getAttribute('width'),
    height: await minimapViewport.getAttribute('height')
  };
  const paneBox = await page.locator('.react-flow__pane').boundingBox();
  expect(paneBox).not.toBeNull();
  await page.mouse.move(paneBox!.x + 70, paneBox!.y + paneBox!.height - 100);
  await page.mouse.down();
  await page.mouse.move(paneBox!.x + 180, paneBox!.y + paneBox!.height - 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => minimapViewport.getAttribute('x')).not.toBe(viewportBeforePan.x);
  expect(await minimapViewport.getAttribute('width')).toBe(viewportBeforePan.width);
  expect(await minimapViewport.getAttribute('height')).toBe(viewportBeforePan.height);
  await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
  const canvasDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await page.getByRole('button', { name: '画布 PNG' }).click();
  const canvasDownload = await canvasDownloadPromise;
  await canvasDownload.saveAs('test-results/event-canvas-export.png');
  expect((await stat('test-results/event-canvas-export.png')).size).toBeGreaterThan(5_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/active-mobile.png', fullPage: true });
  await page.goto(`/events/${event.id}?task=${third.id}`);
  await expect(page.locator('.canvas-minimap')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true });

  await request.post(`/api/events/${event.id}/archive`);
  await request.delete(`/api/events/${event.id}`);
});
