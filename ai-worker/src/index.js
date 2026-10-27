// StreamWise AI: turns the user's taste (liked, disliked, watching, saved titles) and an optional
// free-text request into a short list of motivated film/series picks, using Workers AI.
// The app authenticates with a shared key (secret APP_KEY); the Cloudflare credentials never leave here.

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_BODY = 16 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const list = (value, max) =>
  (Array.isArray(value) ? value : []).filter((item) => typeof item === "string" && item.trim()).slice(0, max).map((item) => item.trim().slice(0, 120));

function prompt(input) {
  const kind = input.type === "movie" ? "solo film" : input.type === "tv" ? "solo serie TV" : "film o serie TV";
  const lines = [
    `Consiglia ${input.count} titoli (${kind}) per una persona con questi gusti.`,
    input.liked.length ? `Le sono piaciuti: ${input.liked.join("; ")}.` : "Non conosci ancora i suoi gusti: motiva i titoli con la richiesta e con le loro qualità, senza inventare titoli che le sarebbero piaciuti.",
    input.disliked.length ? `Non le sono piaciuti: ${input.disliked.join("; ")}.` : "",
    input.watching.length ? `Sta guardando: ${input.watching.join("; ")}.` : "",
    input.request ? `Richiesta per stasera: "${input.request}".` : "",
    input.exclude.length ? `Non proporre questi titoli, li conosce già: ${input.exclude.join("; ")}.` : "",
    "Proponi titoli reali e noti, preferibilmente disponibili in Italia, vari tra loro e non scontati.",
    "Per ogni titolo indica il titolo originale, l'anno di uscita e il tipo (movie o tv).",
    "La motivazione (reason) deve essere una frase completa e naturale in italiano, tra 80 e 140 caratteri, che spieghi perché le piacerà: cita un titolo che le è piaciuto o la sua richiesta, non limitarti al genere.",
    'Rispondi solo con JSON nel formato {"items":[{"title":"...","year":2020,"type":"movie","reason":"..."}]}.'
  ];
  return lines.filter(Boolean).join("\n");
}

function parseItems(result) {
  const raw = result?.response ?? result;
  let data = raw;
  if (typeof raw === "string") {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return [];
    try { data = JSON.parse(raw.slice(start, end + 1)); } catch { return []; }
  }
  return (Array.isArray(data?.items) ? data.items : [])
    .filter((item) => item && typeof item.title === "string" && (item.type === "movie" || item.type === "tv"))
    .map((item) => ({
      title: item.title.slice(0, 120),
      year: Number.isInteger(item.year) ? item.year : null,
      type: item.type,
      reason: String(item.reason ?? "").slice(0, 200)
    }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/recommend") return json({ error: "not_found" }, 404);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!env.APP_KEY || request.headers.get("x-streamwise-key") !== env.APP_KEY) return json({ error: "unauthorized" }, 401);
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: "too_large" }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: "bad_json" }, 400); }
    const input = {
      type: ["movie", "tv"].includes(body.type) ? body.type : "all",
      request: typeof body.request === "string" ? body.request.trim().slice(0, 300) : "",
      liked: list(body.liked, 30),
      disliked: list(body.disliked, 15),
      watching: list(body.watching, 15),
      exclude: list(body.exclude, 80),
      count: Math.min(Math.max(Number(body.count) || 8, 3), 10)
    };
    const messages = [
      { role: "system", content: "Sei un esperto di cinema e serie TV che dà consigli personali, concreti e motivati in italiano. Rispondi sempre e solo con JSON valido." },
      { role: "user", content: prompt(input) }
    ];
    try {
      const result = await env.AI.run(MODEL, {
        messages,
        max_tokens: 900,
        temperature: 0.8
      });
      return json({ items: parseItems(result) });
    } catch (error) {
      return json({ error: "ai_unavailable", detail: String(error?.message ?? error).slice(0, 200) }, 502);
    }
  }
};
