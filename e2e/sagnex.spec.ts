import { expect, test } from '@playwright/test';
import { stat } from 'node:fs/promises';

test('creates a deep event copy from the event actions menu', async ({ page, request }) => {
  const suffix = Date.now().toString().slice(-6);
  const sourceTitle = `复制来源-${suffix}`;
  const copiedTitle = `拆分副本-${suffix}`;
  const created = await request.post('/api/events', { data: { title: sourceTitle, description: '复制简介', labelIds: [] } });
  const source = await created.json();
  const taskResponse = await request.post(`/api/events/${source.id}/tasks`, { data: { title: '保留进度', description: '', positionX: 40, positionY: 80 } });
  const task = await taskResponse.json();
  await request.post(`/api/tasks/${task.id}/transition`, { data: { toStatus: 'in_progress', confirmSoftDependencies: false, comment: '深拷贝状态备注' } });
  await request.post(`/api/tasks/${task.id}/comments`, { data: { content: '深拷贝任务评论' } });

  await page.goto(`/events/${source.id}`);
  await page.getByRole('button', { name: '事件操作' }).click();
  await page.getByRole('button', { name: '复制事件' }).click();
  await page.getByLabel('副本标题').fill(copiedTitle);
  await page.getByRole('radio', { name: /深拷贝/ }).check();
  const copyResponse = page.waitForResponse((response) => response.url().endsWith(`/api/events/${source.id}/copy`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: '创建副本' }).click();
  const copiedFromResponse = await (await copyResponse).json();
  const copiedId = copiedFromResponse.id as string;
  expect(copiedId).not.toBe(source.id);
  await expect(page).toHaveURL(new RegExp(`/events/${copiedId}$`));
  const copied = await (await request.get(`/api/events/${copiedId}`)).json();
  expect(copied).toMatchObject({ title: copiedTitle, description: '复制简介', archivedAt: null });
  expect(copied.tasks).toHaveLength(1);
  expect(copied.tasks[0]).toMatchObject({ title: '保留进度', status: 'in_progress', positionX: 40, positionY: 80 });
  expect(await (await request.get(`/api/tasks/${copied.tasks[0].id}/history`)).json()).toEqual([
    expect.objectContaining({ comment: '深拷贝状态备注' })
  ]);
  expect(await (await request.get(`/api/tasks/${copied.tasks[0].id}/comments`)).json()).toEqual([
    expect.objectContaining({ content: '深拷贝任务评论' })
  ]);
});

test('uses one confirmed and recoverable task deletion flow', async ({ page, request }) => {
  const suffix = Date.now().toString().slice(-6);
  const created = await request.post('/api/events', { data: { title: `删除流程-${suffix}`, description: '', labelIds: [] } });
  const event = await created.json();
  const first = await (await request.post(`/api/events/${event.id}/tasks`, { data: { title: '键盘删除任务', description: '', positionX: 40, positionY: 80 } })).json();
  const remaining = await (await request.post(`/api/events/${event.id}/tasks`, { data: { title: '保留任务', description: '', positionX: 1800, positionY: 900 } })).json();
  await request.post(`/api/events/${event.id}/dependencies`, { data: { sourceTaskId: first.id, targetTaskId: remaining.id } });

  await page.goto(`/events/${event.id}?task=${first.id}`);
  await expect(page.locator('.inspector input').first()).toHaveValue('键盘删除任务');
  let cancelledDialogMessage = '';
  page.once('dialog', async (dialog) => {
    cancelledDialogMessage = dialog.message();
    await dialog.dismiss();
  });
  await page.keyboard.press('Delete');
  expect(cancelledDialogMessage).toContain('永久删除这个任务');
  await expect(page.locator('.task-node').filter({ hasText: '键盘删除任务' })).toHaveCount(1);
  const graphAfterCancel = await (await request.get(`/api/events/${event.id}`)).json();
  expect(graphAfterCancel.tasks).toHaveLength(2);
  expect(graphAfterCancel.dependencies).toHaveLength(1);

  let releaseKeyboardDelete!: () => void;
  const keyboardDeleteGate = new Promise<void>((resolve) => { releaseKeyboardDelete = resolve; });
  await page.route(`**/api/tasks/${first.id}`, async (route) => {
    if (route.request().method() === 'DELETE') await keyboardDeleteGate;
    await route.continue();
  });
  const keyboardDeleteResponse = page.waitForResponse((response) => response.url().endsWith(`/api/tasks/${first.id}`) && response.request().method() === 'DELETE');
  page.once('dialog', (confirmation) => confirmation.accept());
  await page.keyboard.press('Delete');
  await expect(page.locator('.task-node').filter({ hasText: '键盘删除任务' })).toHaveCount(0);
  await expect.poll(async () => {
    const node = await page.locator('.task-node').filter({ hasText: '保留任务' }).boundingBox();
    const canvas = await page.locator('.flow-canvas').boundingBox();
    return Boolean(node && canvas && node.x >= canvas.x && node.y >= canvas.y && node.x + node.width <= canvas.x + canvas.width && node.y + node.height <= canvas.y + canvas.height);
  }).toBe(true);
  releaseKeyboardDelete();
  expect((await keyboardDeleteResponse).status()).toBe(204);
  await page.unroute(`**/api/tasks/${first.id}`);

  const failing = await (await request.post(`/api/events/${event.id}/tasks`, { data: { title: '失败回滚任务', description: '', positionX: 2600, positionY: 1400 } })).json();
  await page.goto(`/events/${event.id}?task=${failing.id}`);
  await expect(page.locator('.inspector input').first()).toHaveValue('失败回滚任务');
  let releaseFailedDelete!: () => void;
  const failedDeleteGate = new Promise<void>((resolve) => { releaseFailedDelete = resolve; });
  await page.route(`**/api/tasks/${failing.id}`, async (route) => {
    await failedDeleteGate;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: '模拟删除失败' }) });
  });
  page.once('dialog', (confirmation) => confirmation.accept());
  await page.getByRole('button', { name: '删除任务' }).click();
  await expect(page.locator('.task-node').filter({ hasText: '失败回滚任务' })).toHaveCount(0);
  releaseFailedDelete();
  await expect(page.getByText('模拟删除失败')).toBeVisible();
  await expect(page.locator('.task-node').filter({ hasText: '失败回滚任务' })).toHaveCount(1);
  await expect(page.locator('.inspector input').first()).toHaveValue('失败回滚任务');
});

test('completes the local event workflow', async ({ page, request }) => {
  const suffix = Date.now().toString().slice(-6);
  const labelName = `测试-${suffix}`;
  const eventTitle = `发布计划-${suffix}`;

  await page.goto('/labels');
  await page.getByRole('button', { name: '新建标签' }).first().click();
  await page.getByLabel('名称').fill(labelName);
  await page.getByRole('tab', { name: 'SVG 图标' }).click();
  await page.getByRole('button', { name: '自定义 SVG' }).click();
  await page.getByLabel('SVG 标签').fill('<!-- tags: [test] --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z" /></svg>');
  await page.getByLabel('自定义颜色').fill('#4b62a8');
  await expect(page.locator('.preview-tag')).toContainText(labelName);
  await expect(page.locator('.preview-tag svg')).toHaveAttribute('fill', 'currentColor');
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
  const eventListRefresh = page.waitForResponse((response) => response.url().includes('/api/events?preview=full') && response.request().method() === 'GET');
  await page.getByRole('button', { name: '返回事件列表' }).click();
  await eventListRefresh;
  await expect(page).toHaveURL(/\/events$/);
  await page.locator('.event-tile').filter({ hasText: eventTitle }).click();

  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByPlaceholder('任务名称').fill('前置任务');
  await page.getByRole('button', { name: '添加到画布' }).click();
  await expect(page.locator('.inspector input').first()).toHaveValue('前置任务');

  const sourceNode = page.locator('.task-node').filter({ hasText: '前置任务' });
  await sourceNode.click();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('heading', { name: '新建后继任务' })).toBeVisible();
  await page.getByPlaceholder('任务名称').fill('后续任务');
  const successorResponse = page.waitForResponse((response) => response.url().endsWith('/successors') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '创建后继任务' }).click();
  expect((await successorResponse).status()).toBe(201);
  await expect(page.locator('.inspector input').first()).toHaveValue('后续任务');

  const inspectorTitle = page.locator('.inspector input').first();
  await inspectorTitle.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('heading', { name: '新建后继任务' })).toHaveCount(0);
  await expect(page.locator('.inspector textarea').first()).toBeFocused();

  const graphResponse = await request.get(`/api/events/${eventId}`);
  const graph = await graphResponse.json();
  const source = graph.tasks.find((task: { title: string }) => task.title === '前置任务');
  const target = graph.tasks.find((task: { title: string }) => task.title === '后续任务');
  expect(graph.dependencies).toEqual(expect.arrayContaining([expect.objectContaining({ sourceTaskId: source.id, targetTaskId: target.id })]));

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('本次状态备注（可选）').fill('开始处理后续任务');
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await expect(page.getByText('未开始 → 进行中')).toBeVisible();
  await expect(page.getByText('开始处理后续任务')).toBeVisible();
  await page.getByLabel('任务评论').fill('这是一条独立评论');
  await page.getByRole('button', { name: '提交评论' }).click();
  await expect(page.getByText('这是一条独立评论')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除评论' }).click();
  await expect(page.getByText('这是一条独立评论')).toHaveCount(0);
  await expect(page.locator('.canvas-minimap')).toBeVisible();

  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByPlaceholder('任务名称').fill('待删除任务');
  await page.getByRole('button', { name: '添加到画布' }).click();
  const disposableGraph = await (await request.get(`/api/events/${eventId}`)).json();
  const disposable = disposableGraph.tasks.find((task: { title: string }) => task.title === '待删除任务');
  await page.getByRole('button', { name: '开始', exact: true }).click();
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
  const activeListRefresh = page.waitForResponse((response) => response.url().includes('/api/events?active=true') && response.request().method() === 'GET');
  await page.goBack();
  await activeListRefresh;
  await expect(page).toHaveURL(/\/$/);
  await activeCard.getByRole('button', { name: '后续任务，进行中' }).click();
  const archiveResponse = page.waitForResponse((response) => response.url().endsWith(`/api/events/${eventId}/archive`));
  await page.getByRole('button', { name: '事件操作' }).click();
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
  await labelRow.getByRole('button', { name: `编辑${labelName}` }).click();
  await page.getByRole('tab', { name: 'Emoji' }).click();
  await page.getByRole('button', { name: '选择 Emoji 学习' }).click();
  await expect(page.locator('.preview-tag')).toContainText(labelName);
  await page.getByRole('button', { name: '保存' }).click();
  await labelRow.getByRole('button', { name: `删除${labelName}` }).click();
  await page.getByRole('button', { name: '删除标签', exact: true }).click();
  await expect(labelRow).toHaveCount(0);
});
