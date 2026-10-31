import fs from 'node:fs';

let content = fs.readFileSync('src/worker.js', 'utf8');

// 1. Add DEFAULT_AGENTS and listAgents
const agentsHelperCode = `
export const DEFAULT_AGENTS = [
  {
    id: 'core',
    name: 'Philipps AI (Boss)',
    avatar: '👑',
    role: 'Chief Strategist & Decision Maker',
    system_prompt: 'Du bist Philipps AI (Boss) – das digitale Spiegelbild von Philipp. Du denkst unternehmerisch, redest Klartext, triffst finale Entscheidungen und duldest kein Gelaber.',
    status: 'active',
    is_default: true
  },
  {
    id: 'cfo',
    name: 'Der CFO',
    avatar: '💰',
    role: 'Finance, Margen & Cashflow',
    system_prompt: 'Du bist der CFO von Philipps Unternehmen. Dein Fokus: Gnadenlose Finanzkalkulation, Margen, Break-Even, Liquidität und Steuerdisziplin. Keine Luftschlösser, nur reale Zahlen und Cashflow.',
    status: 'active',
    is_default: true
  },
  {
    id: 'dealmaker',
    name: 'Der Dealmaker',
    avatar: '⚖️',
    role: 'Legal, Klauseln & Mahnwesen',
    system_prompt: 'Du bist der Dealmaker & Legal Guard. Dein Fokus: Verhandlungen, wasserdichte Verträge, BGB-Fristen, Mahnwesen, Vesting-Klauseln und Schutz vor faulen Partnern.',
    status: 'active',
    is_default: true
  },
  {
    id: 'techlead',
    name: 'Der Tech-Lead',
    avatar: '💻',
    role: 'Code, Architektur & Cloud',
    system_prompt: 'Du bist der pragmatische Tech-Lead. Dein Fokus: Saubere Softwarearchitektur, Cloudflare, Web, Automatisierungen und APIs ohne Overengineering.',
    status: 'active',
    is_default: true
  },
  {
    id: 'closer',
    name: 'Der Closer',
    avatar: '🎯',
    role: 'Sales, Akquise & Pitches',
    system_prompt: 'Du bist der B2B-Sales- & Outreach-Spezialist. Dein Fokus: Psychologisch starke Pitches, Kaltakquise, Einwandbehandlung und Verkaufsabschlüsse auf Augenhöhe.',
    status: 'active',
    is_default: true
  }
];

async function listAgents(db, sessionId) {
  const result = await db.prepare("SELECT id, name, avatar, role, system_prompt, status, created_at, updated_at FROM custom_agents WHERE session_id = ? ORDER BY created_at ASC").bind(sessionId).all();
  const custom = result.results || [];
  return {
    agents: [...DEFAULT_AGENTS, ...custom.map(a => ({ ...a, is_default: false }))]
  };
}
`;

if (!content.includes('export const DEFAULT_AGENTS')) {
  const target = 'async function listProjects(db, sessionId) {';
  if (content.includes(target)) {
    content = content.replace(target, agentsHelperCode + '\n' + target);
    console.log('✓ Added DEFAULT_AGENTS & listAgents helper');
  } else {
    console.error('Target listProjects not found');
  }
}

// 2. Add API routes for /api/agents
const agentsRoutes = `      if (url.pathname === '/api/agents' && request.method === 'GET') {
        return json(await listAgents(env.DB, identity.id));
      }
      if (url.pathname === '/api/agents' && request.method === 'POST') {
        const body = await readJson(request);
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 100) throw new InputError('Agentenname muss 1–100 Zeichen lang sein');
        const role = typeof body.role === 'string' && body.role.trim() ? body.role.trim().slice(0, 100) : 'Spezialist';
        const avatar = typeof body.avatar === 'string' && body.avatar.trim() ? body.avatar.trim().slice(0, 10) : '🤖';
        const systemPrompt = typeof body.system_prompt === 'string' && body.system_prompt.trim() ? body.system_prompt.trim().slice(0, 4000) : '';
        if (!systemPrompt) throw new InputError('System-Prompt für den Agenten erforderlich');
        const status = body.status === 'paused' ? 'paused' : 'active';
        const id = typeof body.id === 'string' && body.id ? body.id.slice(0, 100) : crypto.randomUUID();
        if (DEFAULT_AGENTS.some(a => a.id === id)) throw new InputError('Standard-Agenten können nicht überschrieben werden');
        await env.DB.prepare("INSERT INTO custom_agents (id, session_id, name, avatar, role, system_prompt, status) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, role = excluded.role, system_prompt = excluded.system_prompt, status = excluded.status, updated_at = CURRENT_TIMESTAMP").bind(id, identity.id, name, avatar, role, systemPrompt, status).run();
        return json({ ok: true, agent: { id, name, avatar, role, system_prompt: systemPrompt, status, is_default: false } }, 201);
      }
      if (url.pathname === '/api/agents' && request.method === 'DELETE') {
        const body = await readJson(request).catch(() => ({}));
        const id = url.searchParams.get('id') || body.id;
        if (!id || typeof id !== 'string') throw new InputError('Gültige id erforderlich');
        if (DEFAULT_AGENTS.some(a => a.id === id)) return json({ error: 'Standard-Agenten können nicht gelöscht werden' }, 400);
        const result = await env.DB.prepare("DELETE FROM custom_agents WHERE session_id = ? AND id = ?").bind(identity.id, id).run();
        return result.meta.changes ? json({ ok: true }) : json({ error: 'Agent nicht gefunden' }, 404);
      }`;

if (!content.includes("url.pathname === '/api/agents'")) {
  const routesTarget = "if (url.pathname === '/api/tasks' && request.method === 'DELETE') {";
  const pos = content.indexOf(routesTarget);
  if (pos !== -1) {
    const endBlockPos = content.indexOf('}', content.indexOf('return result.meta.changes', pos));
    const nextLinePos = content.indexOf('\n', endBlockPos);
    content = content.slice(0, nextLinePos) + '\n' + agentsRoutes + content.slice(nextLinePos);
    console.log('✓ Added /api/agents API routes');
  } else {
    console.error('Could not locate tasks delete route');
  }
}

// 3. Connect agent selection in /api/chat
const oldChatSetup = `        let memories;
        try {
          const saved = await env.DB.prepare("SELECT content FROM ai_memories WHERE session_id = ? AND category = 'memory' ORDER BY updated_at DESC, id DESC LIMIT 100").bind(identity.id).all();
          memories = memoryContext(saved.results || [], safeMessages.at(-1).content);
          if (!await rateAllowed(env.DB, identity.id)) return json({ error: 'Zu viele KI-Anfragen. Bitte eine Minute warten.', code: 'RATE_LIMITED' }, 429);
        } catch { return json({ error: 'D1-Gedächtnis nicht erreichbar. Migrationen prüfen.', code: 'D1_UNAVAILABLE' }, 503); }
        const systemPrompt = "Du bist Philipps AI (Cash Edition) – das digitale Spiegelbild von Philipp.\\n\\n" +`;

const newChatSetup = `        let memories;
        try {
          const saved = await env.DB.prepare("SELECT content FROM ai_memories WHERE session_id = ? AND category = 'memory' ORDER BY updated_at DESC, id DESC LIMIT 100").bind(identity.id).all();
          memories = memoryContext(saved.results || [], safeMessages.at(-1).content);
          if (!await rateAllowed(env.DB, identity.id)) return json({ error: 'Zu viele KI-Anfragen. Bitte eine Minute warten.', code: 'RATE_LIMITED' }, 429);
        } catch { return json({ error: 'D1-Gedächtnis nicht erreichbar. Migrationen prüfen.', code: 'D1_UNAVAILABLE' }, 503); }
        let activeAgent = DEFAULT_AGENTS[0];
        const lastUserMsg = safeMessages.at(-1)?.content || '';
        const mentionMatch = lastUserMsg.match(/^@([a-zA-Z0-9_-]+)/);
        const requestedAgentKey = (body.agent_id || (mentionMatch ? mentionMatch[1] : '')).toLowerCase();
        if (requestedAgentKey) {
          const allAgents = await listAgents(env.DB, identity.id);
          const found = allAgents.agents.find(a => 
            a.id.toLowerCase() === requestedAgentKey || 
            a.name.toLowerCase().includes(requestedAgentKey)
          );
          if (found && found.status !== 'paused') {
            activeAgent = found;
          }
        }
        const agentPersonality = activeAgent.id === 'core' 
          ? '' 
          : \`\\n\\nAKTUELLE SPEZIALISTEN-ROLLE: \${activeAgent.avatar} \${activeAgent.name} (\${activeAgent.role})\\n\${activeAgent.system_prompt}\\nAntworte strikt aus dieser Fachperspektive, behalte aber Philipps direkten, authentischen und bodenständigen Ton bei.\`;
        const systemPrompt = "Du bist Philipps AI (Cash Edition) – das digitale Spiegelbild von Philipp.\\n\\n" +
          agentPersonality + "\\n" +`;

if (!content.includes('let activeAgent = DEFAULT_AGENTS[0];')) {
  const normContent = content.replace(/\r\n/g, '\n');
  const normOld = oldChatSetup.replace(/\r\n/g, '\n');
  if (normContent.includes(normOld)) {
    content = normContent.replace(normOld, newChatSetup.replace(/\r\n/g, '\n'));
    console.log('✓ Added agent personality injection in /api/chat');
  } else {
    console.error('Could not find oldChatSetup in src/worker.js');
  }
}

// 4. Return active agent in chat response
const oldChatReturn = `return json({ choices: [{ message: { content: reply, role: 'assistant' } }], conversation_id: id, historySaved: Boolean(historySaved) });`;
const newChatReturn = `return json({ choices: [{ message: { content: reply, role: 'assistant' } }], conversation_id: id, historySaved: Boolean(historySaved), agent: { id: activeAgent.id, name: activeAgent.name, avatar: activeAgent.avatar, role: activeAgent.role } });`;

if (!content.includes('agent: { id: activeAgent.id')) {
  content = content.replace(oldChatReturn, newChatReturn);
  console.log('✓ Added agent metadata to /api/chat response');
}

fs.writeFileSync('src/worker.js', content, 'utf8');
console.log('src/worker.js updated successfully with custom agents backend');
