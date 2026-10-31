import fs from 'node:fs';

let content = fs.readFileSync('src/worker.js', 'utf8');

const oldChunk = `        const result = await env.DB.prepare("DELETE FROM user_tasks WHERE session_id = ? AND id = ?").bind(identity.id, id).run();
        return result.meta.changes ? json({ ok: true }) : json({ error: 'Aufgabe nicht gefunden' }, 404);
      if (url.pathname === '/api/agents' && request.method === 'GET') {`;

const newChunk = `        const result = await env.DB.prepare("DELETE FROM user_tasks WHERE session_id = ? AND id = ?").bind(identity.id, id).run();
        return result.meta.changes ? json({ ok: true }) : json({ error: 'Aufgabe nicht gefunden' }, 404);
      }
      if (url.pathname === '/api/agents' && request.method === 'GET') {`;

content = content.replace(oldChunk, newChunk);

const oldEnd = `        return result.meta.changes ? json({ ok: true }) : json({ error: 'Agent nicht gefunden' }, 404);
      }
      }
      if (url.pathname === '/api/chat' && request.method === 'POST') {`;

const newEnd = `        return result.meta.changes ? json({ ok: true }) : json({ error: 'Agent nicht gefunden' }, 404);
      }
      if (url.pathname === '/api/chat' && request.method === 'POST') {`;

content = content.replace(oldEnd, newEnd);

fs.writeFileSync('src/worker.js', content, 'utf8');
console.log('Fixed brace nesting in src/worker.js');
