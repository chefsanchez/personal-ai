
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        status: "online",
        name: "Personal AI",
        version: "0.2.0"
      });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (!env.VLLM_BASE_URL || !env.VLLM_API_KEY) {
        return Response.json({
          error: "KI-Verbindung noch nicht konfiguriert"
        }, { status: 503 });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({
          error: "Ungültige JSON-Anfrage"
        }, { status: 400 });
      }

      if (!Array.isArray(body.messages)) {
        return Response.json({
          error: "messages muss eine Liste sein"
        }, { status: 400 });
      }

      try {
        const base = env.VLLM_BASE_URL.replace(/\/+$/, "");
        const response = await fetch(
          `${base}/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.VLLM_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: env.VLLM_MODEL || "nvidia/Qwen3.6-35B-A3B-NVFP4",
              messages: body.messages,
              max_tokens: 800,
              temperature: 0.7
            })
          }
        );

        const data = await response.json();

        return Response.json(data, {
          status: response.status
        });
      } catch {
        return Response.json({
          error: "KI-Server nicht erreichbar"
        }, { status: 502 });
      }
    }

    return new Response("Personal AI – Das Fundament steht!", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
};
