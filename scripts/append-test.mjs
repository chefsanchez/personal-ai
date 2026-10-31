import fs from 'node:fs';

const testCode = `
test('D1: Projekte und Aufgaben anlegen, lesen, abhaken und löschen', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/terms/accept', { method: 'POST', body: { version: TERMS_VERSION } })).status, 200);

  // 1. Create project
  const p1 = await f.call('/api/projects', { method: 'POST', body: { title: 'Business MVP', color: '#9cbaff' } });
  assert.equal(p1.status, 201);
  const p1Data = await p1.json();
  assert.equal(p1Data.project.title, 'Business MVP');

  // 2. Create tasks
  const t1 = await f.call('/api/tasks', { method: 'POST', body: { title: 'Mahnungen prüfen', project_id: p1Data.project.id, priority: 'high' } });
  assert.equal(t1.status, 201);
  const t1Data = await t1.json();
  assert.equal(t1Data.task.title, 'Mahnungen prüfen');
  assert.equal(t1Data.task.done, false);

  // 3. List
  const list = await f.call('/api/projects');
  assert.equal(list.status, 200);
  const listData = await list.json();
  assert.equal(listData.projects.length, 1);
  assert.equal(listData.tasks.length, 1);

  // 4. Patch task (mark done)
  const patch = await f.call('/api/tasks?id=' + t1Data.task.id, { method: 'PATCH', body: { done: true } });
  assert.equal(patch.status, 200);

  const listAfterPatch = await (await f.call('/api/projects')).json();
  assert.equal(listAfterPatch.tasks[0].done, true);

  // 5. Delete project
  const del = await f.call('/api/projects?id=' + p1Data.project.id, { method: 'DELETE' });
  assert.equal(del.status, 200);

  const listAfterDel = await (await f.call('/api/projects')).json();
  assert.equal(listAfterDel.projects.length, 0);
  assert.equal(listAfterDel.tasks.length, 0);
});
`;

let content = fs.readFileSync('test/worker.test.js', 'utf8');
if (!content.includes('D1: Projekte und Aufgaben anlegen')) {
  content += testCode;
  fs.writeFileSync('test/worker.test.js', content, 'utf8');
  console.log('✓ Added test to test/worker.test.js');
}
