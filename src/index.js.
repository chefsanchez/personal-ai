
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        status: "online",
        name: "Personal AI",
        version: "0.1.0"
      });
    }

    return new Response(
      "Personal AI – Das Fundament steht!",
      {
        headers: {
          "content-type": "text/plain; charset=utf-8"
        }
      }
    );
  }
};
