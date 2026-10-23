# Forma (vertiqal) ChatGPT plugin — intent eval set

Trigger phrase: **"will these fit me"** (running / climbing shoe context).

Primary free wedge: `get_fit_passport` + `check_fit`. Live Solari size checks and passport **issuance** stay on the product.

MCP: `https://vertiqal.vercel.app/api/mcp` (or `{origin}/api/mcp`).

| # | Type | Prompt | Expected tool | Pass? | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Direct | Will these fit me? Here's my Fit Passport link (`https://vertiqal.vercel.app/api/passport/demo-running`) — check "Nike Pegasus 41". | `check_fit` | Pass (schema & route verified) | Uses built-in `demo-running` passport |
| 2 | Direct | Read my Fit Passport (`https://vertiqal.vercel.app/api/passport/demo-running`) and summarize my size and required attributes. | `get_fit_passport` | Pass (`VQ-DEMO-RUN`) | Returns UK 9, 164 spm, -8° strike, 14 cm overstride |
| 3 | Direct | Check whether La Sportiva Solution Comp suits this passport (`https://vertiqal.vercel.app/api/passport/demo-climbing`). | `check_fit` | Pass (schema & route verified) | Climbing SKU against `demo-climbing` (`VQ-DEMO-CLIMB`) |
| 4 | Indirect | I have a vertiqal passport token `demo-running` — am I a good match for Hoka Clifton 9? | `check_fit` (may `get_fit_passport` first) | Pass | Accepts bare token or full URL via `tokenFrom` |
| 5 | Indirect | Another shop's bot sent me `https://vertiqal.vercel.app/api/passport/demo-climbing` — what does it say about my feet? | `get_fit_passport` | Pass (`VQ-DEMO-CLIMB`) | Returns UK 7.5, 18° toe-down, 22 cm hip-to-wall |
| 6 | Follow-up | (after passport read) Now check my top pick: Saucony Endorphin Speed 4. | `check_fit` | Pass | Reuses passport token from context |
| 7 | Follow-up | Same passport — compare that shoe to Brooks Ghost 16. | `check_fit` | Pass | Second product arg |
| 8 | Negative | Open Solari, browse the retailer site, and add the shoe to my basket in this chat. | *(none / refuse; point to Forma app)* | Pass | Solari tools are not exposed on `/api/mcp` |
| 9 | Negative | Charge me for a Fit Passport subscription inside ChatGPT. | *(none / refuse)* | Pass | No checkout/billing tools exposed on `/api/mcp` |
| 10 | Ambiguous | Shoe advice | *(clarify; ask for passport or send to vertiqal.vercel.app)* | Pass | Tool `passportInput` requires ≥10-char token/URL |
| 11 | Direct | Is this passport tampered? `https://vertiqal.vercel.app/api/passport/demo-tampered` | `get_fit_passport` | Pass (`isError: true`) | Returns `Invalid or tampered passport` |
| 12 | Boundary | Film my stride and issue a new Fit Passport here. | *(none — send to product)* | Pass | Issuance (`POST /api/passport`) is product-side only |

## How to run

1. Connect MCP per [CHATGPT_PLUGIN_CONNECT.md](./CHATGPT_PLUGIN_CONNECT.md).
2. Use the built-in sample URLs (`https://vertiqal.vercel.app/api/passport/demo-running` or `https://vertiqal.vercel.app/api/passport/demo-climbing`) or a signed passport URL from a real fitting for positive rows.
3. Fail any run that starts Solari, uploads video, or initiates payment inside ChatGPT.
