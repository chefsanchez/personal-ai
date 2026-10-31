import fs from 'node:fs';

let content = fs.readFileSync('src/worker.js', 'utf8');

const listConversationsDef = `async function listConversations(db, sessionId) {
  const result = await db.prepare(\`SELECT conversation_id AS id, COUNT(*) AS message_count,
    MAX(id) AS latest_id, MAX(created_at) AS updated_at,
    COALESCE((SELECT substr(intro.content, 1, 80) FROM chat_messages AS intro
      WHERE intro.session_id = conversation.session_id AND intro.conversation_id = conversation.conversation_id
        AND intro.role = 'user' ORDER BY intro.id LIMIT 1), 'Neuer Chat') AS title
    FROM chat_messages AS conversation WHERE session_id = ? GROUP BY conversation_id
    ORDER BY latest_id DESC LIMIT 30\`).bind(sessionId).all();
  return { conversations: (result.results || []).map(({ latest_id, ...conversation }) => conversation) };
}`;

const listProjectsDef = `
async function listProjects(db, sessionId) {
  const [projectsRes, tasksRes] = await Promise.all([
    db.prepare("SELECT id, title, color, status, created_at, updated_at FROM user_projects WHERE session_id = ? ORDER BY updated_at DESC LIMIT 100").bind(sessionId).all(),
    db.prepare("SELECT id, project_id, title, done, priority, due_date, created_at, updated_at FROM user_tasks WHERE session_id = ? ORDER BY done ASC, updated_at DESC LIMIT 500").bind(sessionId).all()
  ]);
  return {
    projects: projectsRes.results || [],
    tasks: (tasksRes.results || []).map(t => ({ ...t, done: Boolean(t.done) }))
  };
}`;

if (!content.includes('async function listProjects')) {
  // Normalize newlines for search
  const normalized = content.replace(/\r\n/g, '\n');
  const target = listConversationsDef.replace(/\r\n/g, '\n');
  if (normalized.includes(target)) {
    const replacement = target + listProjectsDef;
    content = normalized.replace(target, replacement);
    console.log('✓ Added listProjects helper');
  } else {
    console.error('Target listConversationsDef not found in normalized content');
  }
}

const routesTarget = `      if (url.pathname === '/api/conversations' && request.method === 'GET') {
        return json(await listConversations(env.DB, identity.id));
      }`;

const projectsRoutes = `      if (url.pathname === '/api/projects' && request.method === 'GET') {
        return json(await listProjects(env.DB, identity.id));
      }
      if (url.pathname === '/api/projects' && request.method === 'POST') {
        const body = await readJson(request);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title || title.length > 200) throw new InputError('Projekttitel muss 1–200 Zeichen lang sein');
        const id = typeof body.id === 'string' && body.id ? body.id.slice(0, 100) : crypto.randomUUID();
        const color = typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : '#9cbaff';
        await env.DB.prepare("INSERT INTO user_projects (id, session_id, title, color) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, color = excluded.color, updated_at = CURRENT_TIMESTAMP").bind(id, identity.id, title, color).run();
        return json({ ok: true, project: { id, title, color } }, 201);
      }
      if (url.pathname === '/api/projects' && request.method === 'DELETE') {
        const body = await readJson(request).catch(() => ({}));
        const id = url.searchParams.get('id') || body.id;
        if (!id || typeof id !== 'string') throw new InputError('Gültige id erforderlich');
        await env.DB.prepare("DELETE FROM user_tasks WHERE session_id = ? AND project_id = ?").bind(identity.id, id).run();
        const result = await env.DB.prepare("DELETE FROM user_projects WHERE session_id = ? AND id = ?").bind(identity.id, id).run();
        return result.meta.changes ? json({ ok: true }) : json({ error: 'Projekt nicht gefunden' }, 404);
      }
      if (url.pathname === '/api/tasks' && request.method === 'POST') {
        const body = await readJson(request);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title || title.length > 500) throw new InputError('Aufgabentitel muss 1–500 Zeichen lang sein');
        const id = typeof body.id === 'string' && body.id ? body.id.slice(0, 100) : crypto.randomUUID();
        const projectId = typeof body.project_id === 'string' && body.project_id ? body.project_id.slice(0, 100) : null;
        const priority = ['low', 'normal', 'high'].includes(body.priority) ? body.priority : 'normal';
        const dueDate = typeof body.due_date === 'string' ? body.due_date.slice(0, 50) : null;
        await env.DB.prepare("INSERT INTO user_tasks (id, session_id, project_id, title, done, priority, due_date) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, done = excluded.done, priority = excluded.priority, due_date = excluded.due_date, updated_at = CURRENT_TIMESTAMP").bind(id, identity.id, projectId, title, body.done ? 1 : 0, priority, dueDate).run();
        return json({ ok: true, task: { id, project_id: projectId, title, done: Boolean(body.done), priority, due_date: dueDate } }, 201);
      }
      if (url.pathname === '/api/tasks' && request.method === 'PATCH') {
        const body = await readJson(request);
        const id = url.searchParams.get('id') || body.id;
        if (!id || typeof id !== 'string') throw new InputError('Gültige id erforderlich');
        const done = body.done === undefined ? null : (body.done ? 1 : 0);
        const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null;
        if (done === null && title === null) throw new InputError('Keine Änderungen übergeben');
        if (done !== null && title !== null) {
          await env.DB.prepare("UPDATE user_tasks SET done = ?, title = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND id = ?").bind(done, title, identity.id, id).run();
        } else if (done !== null) {
          await env.DB.prepare("UPDATE user_tasks SET done = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND id = ?").bind(done, identity.id, id).run();
        } else {
          await env.DB.prepare("UPDATE user_tasks SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND id = ?").bind(title, identity.id, id).run();
        }
        return json({ ok: true });
      }
      if (url.pathname === '/api/tasks' && request.method === 'DELETE') {
        const body = await readJson(request).catch(() => ({}));
        const id = url.searchParams.get('id') || body.id;
        if (!id || typeof id !== 'string') throw new InputError('Gültige id erforderlich');
        const result = await env.DB.prepare("DELETE FROM user_tasks WHERE session_id = ? AND id = ?").bind(identity.id, id).run();
        return result.meta.changes ? json({ ok: true }) : json({ error: 'Aufgabe nicht gefunden' }, 404);
      }`;

if (!content.includes("url.pathname === '/api/projects'")) {
  const normalized = content.replace(/\r\n/g, '\n');
  const target = routesTarget.replace(/\r\n/g, '\n');
  if (normalized.includes(target)) {
    const replacement = target + '\n' + projectsRoutes;
    content = normalized.replace(target, replacement);
    console.log('✓ Added projects and tasks API routes');
  } else {
    console.error('Target routesTarget not found in normalized content');
  }
}

fs.writeFileSync('src/worker.js', content, 'utf8');
console.log('src/worker.js updated successfully');
