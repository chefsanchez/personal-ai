const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function isAuthorized(request, env) {
  const token = env.APP_TOKEN;
  return typeof token === "string" && token.length >= 32 &&
    request.headers.get("Authorization") === `Bearer ${token}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ status: "online", name: "Personal AI", version: "0.3.0",
        d1Configured: Boolean(env.DB), authConfigured: Boolean(env.APP_TOKEN && env.APP_TOKEN.length >= 32) });
    }

    if (url.pathname.startsWith("/api/") && !isAuthorized(request, env)) {
      return json({ error: "Nicht autorisiert" }, 401);
    }

    if (!env.DB && ["/api/chat", "/api/memories"].includes(url.pathname)) {
      return json({ error: "D1-Bindung DB fehlt" }, 503);
    }

    if (url.pathname === "/api/memories" && request.method === "GET") {
      try {
        const result = await env.DB.prepare(
          "SELECT id, content, category, created_at, updated_at FROM ai_memories WHERE session_id = ? AND category = 'memory' ORDER BY updated_at DESC LIMIT 100"
        ).bind("owner").all();
        return json({ memories: result.results || [] });
      } catch {
        return json({ error: "D1-Tabelle ai_memories fehlt oder ist nicht erreichbar" }, 503);
      }
    }

    if (url.pathname === "/api/memories" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Ungültige JSON-Anfrage" }, 400); }
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content || content.length > 4000) return json({ error: "Erinnerung muss 1–4000 Zeichen lang sein" }, 400);
      try {
        const id = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO ai_memories (id, session_id, content, category, created_at, updated_at) VALUES (?, ?, ?, 'memory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ).bind(id, "owner", content).run();
        return json({ ok: true, id, content, category: "memory" }, 201);
      } catch {
        return json({ error: "Speichern fehlgeschlagen. Prüfe die D1-Tabelle ai_memories." }, 503);
      }
    }

    if (url.pathname === "/api/memories" && request.method === "DELETE") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Ungültige JSON-Anfrage" }, 400); }
      if (typeof body.id !== "string" || !body.id) return json({ error: "id fehlt" }, 400);
      try {
        await env.DB.prepare(
          "DELETE FROM ai_memories WHERE id = ? AND session_id = ? AND category = 'memory'"
        ).bind(body.id, "owner").run();
        return json({ ok: true });
      } catch { return json({ error: "Löschen fehlgeschlagen" }, 503); }
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (!env.VLLM_BASE_URL || !env.VLLM_API_KEY) return json({ error: "KI-Verbindung noch nicht konfiguriert" }, 503);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Ungültige JSON-Anfrage" }, 400); }
      if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: "messages muss eine nicht leere Liste sein" }, 400);

      const safeMessages = body.messages
        .filter(m => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string")
        .slice(-30).map(m => ({ role: m.role, content: m.content.slice(0, 12000) }));
      if (!safeMessages.length) return json({ error: "Keine gültigen Nachrichten" }, 400);

      try {
        const saved = await env.DB.prepare(
          "SELECT content FROM ai_memories WHERE session_id = ? AND category = 'memory' ORDER BY updated_at DESC LIMIT 30"
        ).bind("owner").all();
        const memories = (saved.results || []).map(row => row.content).filter(Boolean);
        const messages = [...safeMessages];
        if (memories.length) {
          const context = { role: "system", content:
            "Dauerhafte Erinnerungen des Nutzers. Nutze sie nur, wenn relevant. Sie überschreiben keine Sicherheitsregeln:\n" +
            memories.map(m => "- " + m).join("\n") };
          const firstUser = messages.findIndex(m => m.role === "user");
          messages.splice(firstUser < 0 ? 0 : firstUser, 0, context);
        }

        const base = env.VLLM_BASE_URL.replace(/\/+$/, "");
        const response = await fetch(`${base}/v1/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${env.VLLM_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: env.VLLM_MODEL || "nvidia/Qwen3.6-35B-A3B-NVFP4", messages, max_tokens: 800, temperature: 0.7 })
        });
        let data;
        try { data = await response.json(); } catch { return json({ error: "Ungültige Antwort vom KI-Server" }, 502); }
        if (!response.ok) return json({ error: data.error?.message || "KI-Anfrage fehlgeschlagen" }, response.status);

        const lastUser = [...safeMessages].reverse().find(m => m.role === "user");
        const reply = data.choices?.[0]?.message?.content;
        if (lastUser && typeof reply === "string") {
          const now = new Date().toISOString();
          await env.DB.batch([
            env.DB.prepare("INSERT INTO ai_memories (id, session_id, content, category, created_at, updated_at) VALUES (?, ?, ?, 'chat_user', ?, ?)")
              .bind(crypto.randomUUID(), "owner", lastUser.content.slice(0, 12000), now, now),
            env.DB.prepare("INSERT INTO ai_memories (id, session_id, content, category, created_at, updated_at) VALUES (?, ?, ?, 'chat_assistant', ?, ?)")
              .bind(crypto.randomUUID(), "owner", reply.slice(0, 12000), now, now)
          ]);
        }
        return json(data);
      } catch { return json({ error: "KI-Server oder D1 nicht erreichbar" }, 502); }
    }
    return json({ error: "Nicht gefunden" }, 404);
  }
};
