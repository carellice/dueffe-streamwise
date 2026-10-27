# StreamWise AI Worker

Cloudflare Worker che genera i consigli "Chiedi all'IA" dell'app con Workers AI.

- Endpoint: `POST /recommend` con header `x-streamwise-key` e corpo JSON
  `{ "type": "all|movie|tv", "request": "...", "liked": [], "disliked": [], "watching": [], "exclude": [], "count": 8 }`.
- Risposta: `{ "items": [{ "title", "year", "type", "reason" }] }`.

Deploy: `npx wrangler deploy`. La chiave condivisa con l'app si imposta con
`npx wrangler secret put APP_KEY`; nell'app va in `local.properties` come `ai.key=...`
insieme a `ai.endpoint=https://streamwise-ai.<sottodominio>.workers.dev/recommend`.
