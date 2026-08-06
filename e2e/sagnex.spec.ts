import { expect, test } from '@playwright/test';
import { stat } from 'node:fs/promises';

test('completes the local event workflow', async ({ page, request }) => {
  const suffix = Date.now().toString().slice(-6);
  const labelName = `测试-${suffix}`;
  const eventTitle = `发布计划-${suffix}`;

  await page.goto('/labels');
  await page.getByRole('button', { name: '新建标签' }).first().click();
  await page.getByLabel('名称').fill(labelName);
  await page.getByLabel('自定义颜色').fill('#4b62a8');
  await page.getByRole('tab', { name: 'SVG' }).click();
  await page.getByLabel('SVG 标签').fill('<!-- tags: [test] --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z" /></svg>');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(labelName)).toBeVisible();
  await expect(page.locator('.label-row').filter({ hasText: labelName }).locator('.label-name > i')).toHaveCount(0);

  await page.getByRole('link', { name: '事件' }).click();
  await page.getByRole('button', { name: '新建事件' }).first().click();
  await page.getByLabel('标题').fill(eventTitle);
  await page.getByLabel('简介').fill('验证并行依赖和状态历史');
  await page.getByRole('button', { name: '选择标签' }).click();
  await page.getByRole('option', { name: labelName }).click();
  await page.getByRole('button', { name: '创建并规划' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+$/);
  const eventId = page.url().split('/events/')[1]!;

  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByPlaceholder('任务名称').fill('前置任务');
  await page.getByRole('button', { name: '添加到画布' }).click();
  await expect(page.locator('.inspector input').first()).toHaveValue('前置任务');

  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByPlaceholder('任务名称').fill('后续任务');
  await page.getByRole('button', { name: '添加到画布' }).click();
  await expect(page.locator('.inspector input').first()).toHaveValue('后续任务');

  const graphResponse = await request.get(`/api/events/${eventId}`);
  const graph = await graphResponse.json();
  const source = graph.tasks.find((task: { title: string }) => task.title === '前置任务');
  const target = graph.tasks.find((task: { title: string }) => task.title === '后续任务');
  await request.post(`/api/events/${eventId}/dependencies`, { data: { sourceTaskId: source.id, targetTaskId: target.id } });
  await page.reload();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '开始' }).click();
  await expect(page.getByText('未开始 → 进行中')).toBeVisible();
  await expect(page.locator('.canvas-minimap')).toBeVisible();

  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByPlaceholder('任务名称').fill('待删除任务');
  await page.getByRole('button', { name: '添加到画布' }).click();
  const disposableGraph = await (await request.get(`/api/events/${eventId}`)).json();
  const disposable = disposableGraph.tasks.find((task: { title: string }) => task.title === '待删除任务');
  await page.getByRole('button', { name: '开始' }).click();
  await expect(page.getByText('未开始 → 进行中')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除任务' }).click();
  await expect(page.locator('.task-node').filter({ hasText: '待删除任务' })).toHaveCount(0);
  expect((await request.get(`/api/tasks/${disposable.id}/history`)).status()).toBe(404);

  const canvasDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出' }).click();
  await page.getByRole('button', { name: '画布 PNG' }).click();
  const canvasDownload = await canvasDownloadPromise;
  const canvasDownloadPath = await canvasDownload.path();
  expect(canvasDownloadPath).not.toBeNull();
  expect((await stat(canvasDownloadPath!)).size).toBeGreaterThan(1000);

  await page.getByRole('link', { name: '活跃' }).click();
  await expect(page.getByText(eventTitle)).toBeVisible();
  const activeCard = page.getByRole('article').filter({ hasText: eventTitle });
  await expect(activeCard.locator('.event-tag-row .label-tag-icon')).toBeVisible();
  await expect(activeCard.locator('.label-tag > i')).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出快照' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect((await stat(downloadPath!)).size).toBeGreaterThan(1000);

  await activeCard.getByRole('button', { name: '后续任务，进行中' }).click();
  await expect(page).toHaveURL(new RegExp(`task=${target.id}`));
  await expect(page.locator('.inspector input').first()).toHaveValue('后续任务');
  const archiveResponse = page.waitForResponse((response) => response.url().endsWith(`/api/events/${eventId}/archive`));
  await page.getByRole('button', { name: '归档事件' }).click();
  const archived = await archiveResponse;
  expect(archived.status(), await archived.text()).toBe(200);
  await expect(page.getByText('该事件已归档，恢复后才能编辑。')).toBeVisible();

  await page.getByRole('link', { name: '事件' }).click();
  await page.getByRole('button', { name: '已归档' }).click();
  const tile = page.locator('.event-tile').filter({ hasText: eventTitle });
  await tile.getByRole('button', { name: '事件操作' }).click();
  await tile.getByRole('button', { name: '永久删除' }).click();
  await page.getByRole('button', { name: '永久删除', exact: true }).last().click();
  await expect(tile).toHaveCount(0);

  await page.getByRole('link', { name: '标签' }).click();
  const labelRow = page.locator('.label-row').filter({ hasText: labelName });
  await labelRow.getByRole('button', { name: `删除${labelName}` }).click();
  await page.getByRole('button', { name: '删除标签', exact: true }).click();
  await expect(labelRow).toHaveCount(0);
});
