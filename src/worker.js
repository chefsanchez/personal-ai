import { authorize, authMode } from './auth.js';
import { TERMS_VERSION } from './policy.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
  } });
}
class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
async function readJson(request) {
  const mediaType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') throw new InputError('Content-Type application/json erforderlich', 415);
  if (Number(request.headers.get('Content-Length')) > 65536) throw new InputError('Anfrage ist zu groß', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('JSON-Anfrage fehlt');
  const chunks = [];
  let size = 0;
  while (true) {
    let chunk;
    try { chunk = await reader.read(); } catch { throw new InputError('Anfrage wurde unvollständig übertragen'); }
    const { value, done } = chunk;
    if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); throw new InputError('Anfrage ist zu groß', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new InputError('Ungültige JSON-Anfrage'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('JSON-Objekt erforderlich');
  return body;
}
function conversationId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new InputError('Gültige conversation_id erforderlich');
  return value;
}
function messagesFrom(body) {
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 30) throw new InputError('messages muss 1–30 Nachrichten enthalten');
  let length = 0;
  const messages = body.messages.map(message => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 12000) throw new InputError('Ungültige Nachricht (maximal 12000 Zeichen)');
    length += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (length > 48000) throw new InputError('Chatkontext ist zu lang', 413);
  if (messages.at(-1).role !== 'user') throw new InputError('Die letzte Nachricht muss vom Nutzer stammen');
  return messages;
}
function memoryContext(rows, query) {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [])];
  const ranked = rows.map((row, index) => ({ content: row.content, index, score: words.filter(word => row.content.toLowerCase().includes(word)).length })).sort((a, b) => b.score - a.score || a.index - b.index);
  let remaining = 12000;
  const selected = [];
  for (const row of ranked.slice(0, 20)) {
    const content = row.content.slice(0, Math.min(4000, remaining));
    if (!content) break;
    selected.push(content); remaining -= content.length;
  }
  return selected;
}
async function rateAllowed(db, identity) {
  const minute = Math.floor(Date.now() / 60000);
  const userScope = `user:${identity}`;
  const user = db.prepare(`INSERT INTO request_limits(scope, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT(scope) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
    window_start = excluded.window_start RETURNING count`).bind(userScope, minute);
  // Both statements run in one D1 transaction. An already limited user cannot
  // exhaust everyone else's allowance by repeatedly sending rejected requests.
  const global = db.prepare(`INSERT INTO request_limits(scope, window_start, count)
    SELECT 'global', ?, 1 WHERE (SELECT count FROM request_limits WHERE scope = ? AND window_start = ?) <= 10
    ON CONFLICT(scope) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
    window_start = excluded.window_start RETURNING count`).bind(minute, userScope, minute);
  const results = await db.batch([user, global]);
  return results[0].results[0].count <= 10 && Boolean(results[1].results[0]) && results[1].results[0].count <= 60;
}

function isOwner(identity, env) {
  return identity.mode === 'access' && typeof env.OWNER_ACCESS_SUB === 'string' &&
    env.OWNER_ACCESS_SUB.length > 0 && identity.id === `access:${env.OWNER_ACCESS_SUB}`;
}

async function accountFor(db, identity) {
  if (identity.mode !== 'access') return null;
  let account = await db.prepare('SELECT * FROM app_accounts WHERE id = ?').bind(identity.id).first();
  if (!account) {
    await db.prepare('INSERT OR IGNORE INTO app_accounts (id, email) VALUES (?, ?)').bind(identity.id, identity.email || '').run();
    account = await db.prepare('SELECT * FROM app_accounts WHERE id = ?').bind(identity.id).first();
  }
  if (account.status === 'active') {
    await db.prepare("UPDATE app_accounts SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND last_seen_at < datetime('now', '-5 minutes')").bind(identity.id).run();
  }
  return account;
}

async function listMemories(db, sessionId) {
  const result = await db.prepare("SELECT id, content, category, created_at, updated_at FROM ai_memories WHERE session_id = ? AND category = 'memory' ORDER BY updated_at DESC, id DESC LIMIT 100").bind(sessionId).all();
  return { memories: result.results || [] };
}

async function listConversations(db, sessionId) {
  const result = await db.prepare(`SELECT conversation_id AS id, COUNT(*) AS message_count,
    MAX(id) AS latest_id, MAX(created_at) AS updated_at,
    COALESCE((SELECT substr(intro.content, 1, 80) FROM chat_messages AS intro
      WHERE intro.session_id = conversation.session_id AND intro.conversation_id = conversation.conversation_id
        AND intro.role = 'user' ORDER BY intro.id LIMIT 1), 'Neuer Chat') AS title
    FROM chat_messages AS conversation WHERE session_id = ? GROUP BY conversation_id
    ORDER BY latest_id DESC LIMIT 30`).bind(sessionId).all();
  return { conversations: (result.results || []).map(({ latest_id, ...conversation }) => conversation) };
}

async function readHistory(db, sessionId, id) {
  const result = await db.prepare('SELECT id, role, content, created_at FROM chat_messages WHERE session_id = ? AND conversation_id = ? ORDER BY id DESC LIMIT 30').bind(sessionId, id).all();
  return { messages: (result.results || []).reverse() };
}

async function readProfile(db, account) {
  if (!account?.profile_consent) return { consentEnabled: false, profile: null, summaries: [], generationEnabled: false };
  const profile = await db.prepare('SELECT content, updated_at FROM derived_profiles WHERE session_id = ?').bind(account.id).first();
  const summaries = await db.prepare('SELECT summary_date AS date, content, created_at FROM daily_summaries WHERE session_id = ? ORDER BY summary_date DESC LIMIT 30').bind(account.id).all();
  return { consentEnabled: true, profile: profile || null, summaries: summaries.results || [], generationEnabled: false };
}

async function adminRoute(request, url, env, identity, admin) {
  if (!admin) return json({ error: 'Nur der Betreiber darf diesen Bereich öffnen', code: 'FORBIDDEN' }, 403);
  if (url.pathname === '/api/admin/users' && request.method === 'GET') {
    const result = await env.DB.prepare(`SELECT account.id, account.email, account.display_name, account.status,
      account.profile_consent, account.created_at, account.last_seen_at,
      (SELECT COUNT(DISTINCT conversation_id) FROM chat_messages WHERE session_id = account.id) AS conversation_count,
      (SELECT COUNT(*) FROM ai_memories WHERE session_id = account.id AND category = 'memory') AS memory_count
      FROM app_accounts AS account ORDER BY account.created_at, account.id LIMIT 100`).all();
    return json({ users: (result.results || []).map(({ profile_consent, ...account }) => ({
      ...account, profileConsent: Boolean(profile_consent), isAdmin: account.id === `access:${env.OWNER_ACCESS_SUB}`,
    })) });
  }
  const match = url.pathname.match(/^\/api\/admin\/users\/([^/]+)(?:\/(conversations|memories|history|profile))?$/);
  if (!match) return json({ error: 'Nicht gefunden' }, 404);
  let targetId;
  try { targetId = decodeURIComponent(match[1]); } catch { throw new InputError('Ungültige Nutzerkennung'); }
  if (!targetId.startsWith('access:') || targetId.length > 207 || /[\u0000-\u001f]/.test(targetId)) throw new InputError('Ungültige Nutzerkennung');
  const target = await env.DB.prepare('SELECT * FROM app_accounts WHERE id = ?').bind(targetId).first();
  if (!target) return json({ error: 'Nutzer nicht gefunden' }, 404);
  const section = match[2];
  if (!section && request.method === 'PATCH') {
    const body = await readJson(request);
    if (!['active', 'blocked'].includes(body.status)) throw new InputError('status muss active oder blocked sein');
    if (targetId === `access:${env.OWNER_ACCESS_SUB}` && body.status === 'blocked') return json({ error: 'Der Betreiber kann nicht gesperrt werden' }, 403);
    const statements = [env.DB.prepare(`UPDATE app_accounts SET status = ?, updated_at = CURRENT_TIMESTAMP,
      profile_consent = CASE WHEN ? = 'blocked' THEN 0 ELSE profile_consent END WHERE id = ?`).bind(body.status, body.status, targetId)];
    if (body.status === 'blocked') statements.push(
      env.DB.prepare('DELETE FROM derived_profiles WHERE session_id = ?').bind(targetId),
      env.DB.prepare('DELETE FROM daily_summaries WHERE session_id = ?').bind(targetId),
    );
    await env.DB.batch(statements);
    return json({ ok: true, status: body.status });
  }
  if (section === 'conversations' && request.method === 'GET') return json(await listConversations(env.DB, targetId));
  if (section === 'memories' && request.method === 'GET') return json(await listMemories(env.DB, targetId));
  if (section === 'profile' && request.method === 'GET') return json(await readProfile(env.DB, target));
  if (section === 'history' && ['GET', 'DELETE'].includes(request.method)) {
    const id = conversationId(url.searchParams.get('conversation_id'));
    if (request.method === 'GET') return json(await readHistory(env.DB, targetId, id));
    await env.DB.prepare('DELETE FROM chat_messages WHERE session_id = ? AND conversation_id = ?').bind(targetId, id).run();
    return json({ ok: true });
  }
  if (section === 'memories' && request.method === 'DELETE') {
    const body = await readJson(request);
    if (typeof body.id !== 'string' || !body.id || body.id.length > 100) throw new InputError('Gültige id erforderlich');
    const result = await env.DB.prepare("DELETE FROM ai_memories WHERE id = ? AND session_id = ? AND category = 'memory'").bind(body.id, targetId).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Erinnerung nicht gefunden' }, 404);
  }
  return json({ error: 'Nicht gefunden' }, 404);
}

export function createWorker({ upstream = (...args) => fetch(...args) } = {}) {
  return { async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: 'Nicht gefunden' }, 404);
    const origin = request.headers.get('Origin');
    if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Zugriff von fremder Website abgelehnt' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'GET, POST, PATCH, DELETE, OPTIONS' } });
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ status: 'online', name: 'Personal AI', version: '0.4.0', d1Configured: Boolean(env.DB), authConfigured: authMode(env) !== 'unconfigured', authMode: authMode(env) });
    if (url.pathname === '/api/auth/session' && request.method === 'GET') {
      if (authMode(env) === 'access') return json({ mode: 'access' });
      if (typeof env.APP_TOKEN === 'string' && env.APP_TOKEN.length >= 32) return json({ token: env.APP_TOKEN, mode: 'token' });
      return json({ error: 'Nicht konfiguriert' }, 503);
    }
    const identity = await authorize(request, env);
    if (!identity) return json({ error: 'Anmeldung erforderlich', code: 'UNAUTHORIZED', authMode: authMode(env) }, 401);
    if (!env.DB) return json({ error: 'D1-Bindung DB fehlt', code: 'D1_UNAVAILABLE' }, 503);
    try {
      const account = await accountFor(env.DB, identity);
      if (account?.status === 'blocked') return json({ error: 'Dein Zugang wurde vom Betreiber gesperrt', code: 'ACCOUNT_BLOCKED' }, 403);
      const admin = isOwner(identity, env);
      if (url.pathname === '/api/admin/all-memories' && request.method === 'GET') {
        if (!admin) return json({ error: 'Nur der Betreiber darf diesen Bereich öffnen', code: 'FORBIDDEN' }, 403);
        const allMemories = await env.DB.prepare("SELECT m.id, m.session_id, m.content, m.category, m.created_at, COALESCE(a.email, a.display_name, m.session_id) AS user_label FROM ai_memories m LEFT JOIN app_accounts a ON a.id = m.session_id WHERE m.category = 'memory' ORDER BY m.created_at DESC LIMIT 300").all();
        return json({ memories: allMemories.results || [] });
      }
      if (url.pathname === '/api/admin/all-memories' && request.method === 'DELETE') {
        if (!admin) return json({ error: 'Nur der Betreiber darf diesen Bereich öffnen', code: 'FORBIDDEN' }, 403);
        const body = await readJson(request);
        if (typeof body.id !== 'string' || !body.id) throw new InputError('Gültige id erforderlich');
        const res = await env.DB.prepare('DELETE FROM ai_memories WHERE id = ?').bind(body.id).run();
        return res.meta.changes ? json({ ok: true }) : json({ error: 'Erinnerung nicht gefunden' }, 404);
      }
      const termsAccepted = !account || account.terms_version === TERMS_VERSION;
      if (url.pathname === '/api/terms/accept' && request.method === 'POST') {
        if (!account) return json({ error: 'Eine persönliche Access-Anmeldung ist erforderlich' }, 403);
        const body = await readJson(request);
        if (body.version !== TERMS_VERSION) throw new InputError('Bitte die aktuelle Fassung der Nutzungsbedingungen bestätigen');
        await env.DB.prepare('UPDATE app_accounts SET terms_version = ?, terms_accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(TERMS_VERSION, identity.id).run();
        return json({ ok: true, termsAccepted: true, termsVersion: TERMS_VERSION });
      }
      if (url.pathname === '/api/profile/consent' && request.method === 'POST') {
        if (!account) return json({ error: 'Für Profil-Einwilligung ist eine persönliche Access-Anmeldung erforderlich' }, 403);
        const body = await readJson(request);
        if (typeof body.enabled !== 'boolean') throw new InputError('enabled muss true oder false sein');
        if (!termsAccepted && body.enabled) return json({ error: 'Bitte zuerst die Nutzungsbedingungen lesen und bestätigen', code: 'TERMS_REQUIRED', termsVersion: TERMS_VERSION }, 428);
        const statements = [env.DB.prepare('UPDATE app_accounts SET profile_consent = ?, consent_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.enabled ? 1 : 0, identity.id)];
        if (!body.enabled) statements.push(
          env.DB.prepare('DELETE FROM derived_profiles WHERE session_id = ?').bind(identity.id),
          env.DB.prepare('DELETE FROM daily_summaries WHERE session_id = ?').bind(identity.id),
        );
        await env.DB.batch(statements);
        return json({ ok: true, consentEnabled: body.enabled, generationEnabled: false });
      }
      if (!termsAccepted && url.pathname !== '/api/status') return json({ error: 'Bitte zuerst die Nutzungsbedingungen lesen und bestätigen', code: 'TERMS_REQUIRED', termsVersion: TERMS_VERSION }, 428);
      if (url.pathname.startsWith('/api/admin/')) return await adminRoute(request, url, env, identity, admin);
      if (url.pathname === '/api/profile' && request.method === 'GET') return json(await readProfile(env.DB, account));
      if (url.pathname === '/api/status' && request.method === 'GET') {
        try {
          await env.DB.prepare("SELECT id FROM ai_memories WHERE session_id = ? AND category = 'memory' LIMIT 1").bind(identity.id).all();
          await env.DB.prepare('SELECT id FROM chat_messages LIMIT 0').all();
          await env.DB.prepare('SELECT scope FROM request_limits LIMIT 0').all();
        } catch { return json({ error: 'D1-Schema nicht bereit. Migrationen prüfen.', code: 'D1_UNAVAILABLE' }, 503); }
        return json({ authenticated: true, authMode: identity.mode, memoryReady: true,
          userId: identity.id, email: identity.email || account?.email || '', isAdmin: admin, profileConsent: Boolean(account?.profile_consent), operatorCanReadChats: true,
          termsAccepted, termsVersion: TERMS_VERSION, profileGenerationEnabled: false,
          modelConfigured: Boolean(env.VLLM_BASE_URL && env.VLLM_API_KEY), modelStatus: 'unchecked' });
      }
      if (url.pathname === '/api/memories' && request.method === 'GET') {
        return json(await listMemories(env.DB, identity.id));
      }
      if (url.pathname === '/api/memories' && request.method === 'POST') {
        const body = await readJson(request);
        const content = typeof body.content === 'string' ? body.content.trim() : '';
        if (!content || content.length > 4000) throw new InputError('Erinnerung muss 1–4000 Zeichen lang sein');
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO ai_memories (id, session_id, content, category, created_at, updated_at) VALUES (?, ?, ?, 'memory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").bind(id, identity.id, content).run();
        return json({ ok: true, id, content, category: 'memory' }, 201);
      }
      if (url.pathname === '/api/memories' && request.method === 'DELETE') {
        const body = await readJson(request);
        if (typeof body.id !== 'string' || !body.id || body.id.length > 100) throw new InputError('Gültige id erforderlich');
        const result = await env.DB.prepare("DELETE FROM ai_memories WHERE id = ? AND session_id = ? AND category = 'memory'").bind(body.id, identity.id).run();
        return result.meta.changes ? json({ ok: true }) : json({ error: 'Erinnerung nicht gefunden' }, 404);
      }
      if (url.pathname === '/api/history' && ['GET', 'DELETE'].includes(request.method)) {
        const id = conversationId(url.searchParams.get('conversation_id'));
        if (request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM chat_messages WHERE session_id = ? AND conversation_id = ?').bind(identity.id, id).run();
          return json({ ok: true });
        }
        return json(await readHistory(env.DB, identity.id, id));
      }
      if (url.pathname === '/api/conversations' && request.method === 'GET') {
        return json(await listConversations(env.DB, identity.id));
      }
      if (url.pathname === '/api/chat' && request.method === 'POST') {
        const body = await readJson(request);
        const safeMessages = messagesFrom(body);
        const id = conversationId(body.conversation_id);
        if (!env.VLLM_BASE_URL || !env.VLLM_API_KEY) return json({ error: 'KI-Verbindung noch nicht konfiguriert', code: 'MODEL_UNCONFIGURED' }, 503);
        let endpoint;
        try {
          endpoint = new URL(env.VLLM_BASE_URL);
          const local = ['127.0.0.1', 'localhost'].includes(endpoint.hostname) && ['127.0.0.1', 'localhost'].includes(url.hostname);
          if ((endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error();
          endpoint = `${endpoint.origin}${endpoint.pathname.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/chat/completions`;
        } catch { return json({ error: 'KI-Server-URL ist ungültig', code: 'MODEL_UNCONFIGURED' }, 503); }
        let memories;
        try {
          const saved = await env.DB.prepare("SELECT content FROM ai_memories WHERE session_id = ? AND category = 'memory' ORDER BY updated_at DESC, id DESC LIMIT 100").bind(identity.id).all();
          memories = memoryContext(saved.results || [], safeMessages.at(-1).content);
          if (!await rateAllowed(env.DB, identity.id)) return json({ error: 'Zu viele KI-Anfragen. Bitte eine Minute warten.', code: 'RATE_LIMITED' }, 429);
        } catch { return json({ error: 'D1-Gedächtnis nicht erreichbar. Migrationen prüfen.', code: 'D1_UNAVAILABLE' }, 503); }
        const systemPrompt = "Du bist Philipps AI (Cash Edition) – das digitale Spiegelbild von Philipp.\n\n" +
          "Deine Persönlichkeit & unumstößliche Prinzipien:\n" +
          "- Du denkst, sprichst und handelst wie Philipp selbst: direkt, clever, loyal, bodenständig, mit trockenem Humor ('bruder', 'mach kein Auge', 'kein Gelaber') und natürlicher Autorität.\n" +
          "- Partnerschaften & Equity: Anteile gibt es niemals geschenkt oder 50/50 von Tag 1. Anteile gibt es nur nach messbaren Umsatzzielen und harter Leistung (Vesting).\n" +
          "- Start & Eigenkapital: Hör auf mit Träumereien ohne Geld. Ohne Kohle gilt: Entweder Casino/Zockerei (was dumm ist) oder du sparst dir dein Eigenkapital zusammen und startest dann solide. Keine Schulden auf Pump für Hype-Müll.\n" +
          "- Rechnungen & Nicht-Zahler: Null Mitleid im Business. 48h Frist setzen, dann sofort gerichtlicher Mahnbescheid und Anwalt. Wer Geld für Lifestyle hat, zahlt auch Rechnungen.\n" +
          "- Statussymbole & Autos (BMW M, AMG, Audi RS): Geiler Meilenstein und brutaler Antrieb, aber NIEMALS auf Kosten von Reinvestitionen ins eigene Business. Erst die Cashflow-Maschine bauen, dann das Auto als Trophäe.\n" +
          "- Motivation & Mindset: Wer jammert, schaut auf sein Bankkonto. Wenn da nicht genug Nullen stehen, hat er Grund genug sofort Gas zu geben. Disziplin schlägt Motivation jeden Tag.\n" +
          "- Echte Fachkompetenz: Bei Code, IT, Web, Autos und Alltag hilfst du sofort glasklar, extrem präzise und lösungsorientiert ohne leere Roboter-Floskeln.\n" +
          "- Interaktivität: Halte Antworten knackig und biete am Ende gerne 2-3 konkrete nächste Schritte oder Entscheidungs-Pills an.\n\n" +
          "Erinnerungen aus der Datenbank:\n" + JSON.stringify(memories);
        const messages = [{ role: 'system', content: systemPrompt }, ...safeMessages];
        const timeout = Math.max(1000, Math.min(120000, Number(env.VLLM_TIMEOUT_MS) || 60000));
        let reply;
        try {
          // Workers supports manual/follow, but rejects redirect:'error'. Never
          // follow upstream redirects with the model provider's bearer secret.
          const response = await upstream(endpoint, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: { Authorization: `Bearer ${env.VLLM_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': url.origin, 'X-Title': 'Personal AI' }, body: JSON.stringify({ model: env.VLLM_MODEL || 'nvidia/Qwen3.6-35B-A3B-NVFP4', messages, max_tokens: 800, temperature: 0.7 }) });
          if (!response.ok) {
            await response.body?.cancel();
            return json({ error: response.status === 401 || response.status === 403 ? 'KI-Server lehnt die Server-Anmeldung ab.' : response.status === 402 ? 'KI-Guthaben aufgebraucht. Bitte Anbieter-Konto prüfen.' : response.status === 429 ? 'KI-Server ist ausgelastet. Später erneut versuchen.' : 'KI-Server ist derzeit nicht verfügbar.', code: 'MODEL_UNAVAILABLE' }, 502);
          }
          const reader = response.body?.getReader();
          if (!reader) throw new Error('empty');
          let size = 0;
          const decoder = new TextDecoder();
          let text = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 1048576) { await reader.cancel(); throw new Error('large'); }
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
          reply = JSON.parse(text).choices?.[0]?.message?.content;
          if (typeof reply !== 'string' || !reply.trim() || reply.length > 12000) throw new Error('invalid');
        } catch (error) {
          const timedOut = ['TimeoutError', 'AbortError'].includes(error.name);
          return json({ error: timedOut ? 'KI-Antwort dauert zu lange. Erreichbarkeit des Modellservers prüfen.' : 'Keine gültige Antwort vom KI-Server. Verbindung und Modell prüfen.', code: timedOut ? 'MODEL_TIMEOUT' : 'MODEL_UNAVAILABLE' }, timedOut ? 504 : 502);
        }
        let historySaved = true;
        try {
          await env.DB.batch(['user', 'assistant'].map((role, i) => env.DB.prepare('INSERT INTO chat_messages (session_id, conversation_id, role, content) VALUES (?, ?, ?, ?)').bind(identity.id, id, role, i ? reply : safeMessages.at(-1).content)));
        } catch { historySaved = false; }
        return json({ choices: [{ message: { role: 'assistant', content: reply } }], conversation_id: id, historySaved, ...(historySaved ? {} : { warning: 'Antwort erhalten, aber Chatverlauf konnte nicht gespeichert werden.' }) });
      }
      return json({ error: 'Nicht gefunden' }, 404);
    } catch (error) {
      if (error instanceof InputError) return json({ error: error.message }, error.status);
      return json({ error: 'D1-Anfrage fehlgeschlagen. Schema und Verbindung prüfen.', code: 'D1_UNAVAILABLE' }, 503);
    }
  } };
}



