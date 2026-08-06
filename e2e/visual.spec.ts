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

  await page.setViewportSize({ width: 2560, height: 1080 });
  await page.goto('/');
  await expect(page.getByText(eventTitle)).toBeVisible();
  await expect(page.getByText(/尚未完成的事件/)).toHaveCount(0);
  await expect(page.locator('.event-card').filter({ hasText: eventTitle }).locator('.graph-edges path')).toHaveCount(4);
  const mainBox = await page.locator('.main-content').boundingBox();
  const actionsBox = await page.locator('.active-page-head .head-actions').boundingBox();
  expect(mainBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(Math.abs(mainBox!.x + mainBox!.width - actionsBox!.x - actionsBox!.width - 36)).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/active-desktop.png', fullPage: true });
  const activeDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出快照' }).click();
  const activeDownload = await activeDownloadPromise;
  await activeDownload.saveAs('test-results/active-export.png');
  expect((await stat('test-results/active-export.png')).size).toBeGreaterThan(5_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/events/${event.id}?task=${third.id}`);
  await expect(page.locator('.inspector input').first()).toHaveValue('封面确认');
  await expect(page.locator('.canvas-minimap')).toBeVisible();
  await page.waitForTimeout(400);
  const minimapSvg = page.locator('.canvas-minimap-svg');
  const minimapNode = page.locator('.canvas-minimap-node').first();
  expect((await minimapSvg.boundingBox())!.width).toBeGreaterThan(180);
  expect((await minimapNode.boundingBox())!.width).toBeGreaterThan(10);
  const initialMinimapBox = (await minimapSvg.boundingBox())!;
  const initialFrameBox = (await page.getByTestId('minimap-viewport').boundingBox())!;
  expect(initialFrameBox.width / initialMinimapBox.width).toBeLessThan(0.65);
  expect(initialFrameBox.height / initialMinimapBox.height).toBeLessThan(0.65);
  const readMinimapViewport = async () => {
    const viewport = page.getByTestId('minimap-viewport');
    return {
      x: Number(await viewport.getAttribute('data-world-x')),
      y: Number(await viewport.getAttribute('data-world-y')),
      width: Number(await viewport.getAttribute('data-world-width')),
      height: Number(await viewport.getAttribute('data-world-height'))
    };
  };
  const viewportBeforePan = await readMinimapViewport();
  const paneBox = await page.locator('.react-flow__pane').boundingBox();
  expect(paneBox).not.toBeNull();
  await page.mouse.move(paneBox!.x + 70, paneBox!.y + paneBox!.height - 100);
  await page.mouse.down();
  await page.mouse.move(paneBox!.x + 180, paneBox!.y + paneBox!.height - 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await readMinimapViewport()).x).not.toBe(viewportBeforePan.x);
  const viewportAfterPan = await readMinimapViewport();
  expect(viewportAfterPan.width).toBeCloseTo(viewportBeforePan.width, 5);
  expect(viewportAfterPan.height).toBeCloseTo(viewportBeforePan.height, 5);
  const frameAfterPan = (await page.getByTestId('minimap-viewport').boundingBox())!;
  expect(frameAfterPan.width).toBeCloseTo(initialFrameBox.width, 1);
  expect(frameAfterPan.height).toBeCloseTo(initialFrameBox.height, 1);

  const dragDistance = 24;
  await page.mouse.move(frameAfterPan.x + frameAfterPan.width / 2, frameAfterPan.y + frameAfterPan.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameAfterPan.x + frameAfterPan.width / 2 + dragDistance, frameAfterPan.y + frameAfterPan.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await page.getByTestId('minimap-viewport').boundingBox())!.x).toBeGreaterThan(frameAfterPan.x + 15);
  const frameAfterDrag = (await page.getByTestId('minimap-viewport').boundingBox())!;
  expect(frameAfterDrag.x - frameAfterPan.x).toBeCloseTo(dragDistance, 0);
  expect(frameAfterDrag.width).toBeCloseTo(frameAfterPan.width, 1);
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
  await expect(page.locator('.canvas-minimap')).not.toBeVisible();
  await page.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true });

  await request.post(`/api/events/${event.id}/archive`);
  await request.delete(`/api/events/${event.id}`);
});
