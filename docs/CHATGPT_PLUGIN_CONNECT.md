# Connect Forma (vertiqal) MCP in ChatGPT Plugins

Product: [vertiqal.vercel.app](https://vertiqal.vercel.app)

MCP path (relative to the app origin): **`/api/mcp`**  
Public HTTPS URL when the app is deployed: **`https://vertiqal.vercel.app/api/mcp`**

Tools (both free / read-oriented):

- `get_fit_passport` — read a signed Fit Passport (URL or bare token)
- `check_fit` — judge a named shoe against that passport (verdict, score, reasons)

Passport JSON also advertises the same MCP block at `/api/passport/<token>` (`mcp.url`, `mcp.tools`).

## Steps (ChatGPT Plugins · custom MCP)

1. Open ChatGPT → **Plugins** (or [chatgpt.com/plugins](https://chatgpt.com/plugins)).
2. Tap **+** / **Add** → **custom MCP**.
3. Paste: `https://vertiqal.vercel.app/api/mcp`  
   Transport: streamable HTTP (Next.js `mcp-handler` route: GET/POST/DELETE).
4. Save / connect; wait for tool metadata.
5. **Refresh metadata** after tool description or schema changes.
6. Test with [CHATGPT_PLUGIN_EVAL.md](./CHATGPT_PLUGIN_EVAL.md) and [CHATGPT_PLUGIN_STARTER_PROMPTS.md](./CHATGPT_PLUGIN_STARTER_PROMPTS.md).

## Free wedge vs product-side deep actions

| Surface | Where it lives | ChatGPT posture |
| --- | --- | --- |
| `get_fit_passport` | MCP `/api/mcp` | Free wedge — portable fit profile |
| `check_fit` | MCP `/api/mcp` | Free wedge — "will these fit me" for a named shoe |
| Issue Fit Passport | Product UI after size matches decision form | Stay on vertiqal — not a ChatGPT checkout |
| Live Solari size / stock check | Product (Solari stealth browser) | Stay product-side — receipts, quotas, retailer allowlists |
| Buy / retailer handoff | Product (affiliate link plan) | External; no in-plugin digital commerce |

See [CHATGPT_PLUGIN_PLAYBOOK.md](./CHATGPT_PLUGIN_PLAYBOOK.md) and [monetisation.md](./monetisation.md).

## Live status caveat

As of packaging (2026-10-07), `POST https://vertiqal.vercel.app/api/mcp` with an MCP `initialize` request returned **200** (`serverInfo.name = vertiqal-fit-passport`). Plain GET without MCP headers may return 405 — use the Plugins custom-MCP flow (or a proper streamable-HTTP client), not a browser GET smoke test alone.

## Deploy note

If a custom domain or preview deploy is used, substitute that origin + `/api/mcp`. Do not invent alternate live hosts — use the origin already shipping the Next app. If `/api/mcp` is not reachable from the public internet yet, connect will fail until the route is deployed and HTTPS is valid.
