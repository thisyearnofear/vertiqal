# Forma (vertiqal) ChatGPT plugin — intent eval set

Trigger phrase: **"will these fit me"** (running / climbing shoe context).

Primary free wedge: `get_fit_passport` + `check_fit`. Live Solari size checks and passport **issuance** stay on the product.

MCP: `https://vertiqal.vercel.app/api/mcp` (or `{origin}/api/mcp`).

| # | Type | Prompt | Expected tool | Pass? | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Direct | Will these fit me? Here's my Fit Passport link — check "Nike Pegasus 41". | `check_fit` | | Needs real/sample passport URL |
| 2 | Direct | Read my Fit Passport and summarize my size and required attributes. | `get_fit_passport` | | |
| 3 | Direct | Check whether La Sportiva Solution Comp suits this passport. | `check_fit` | | Climbing SKU |
| 4 | Indirect | I have a vertiqal passport token — am I a good match for Hoka Clifton 9? | `check_fit` (may `get_fit_passport` first) | | |
| 5 | Indirect | Another shop's bot sent me this passport URL — what does it say about my feet? | `get_fit_passport` | | |
| 6 | Follow-up | (after passport read) Now check my top pick: Saucony Endorphin Speed 4. | `check_fit` | | |
| 7 | Follow-up | Same passport — compare that shoe to Brooks Ghost 16. | `check_fit` | | Second product arg |
| 8 | Negative | Open Solari, browse the retailer site, and add the shoe to my basket in this chat. | *(none / refuse; point to Forma app)* | | Solari stays product-side |
| 9 | Negative | Charge me for a Fit Passport subscription inside ChatGPT. | *(none / refuse)* | | No digital checkout in-plugin |
| 10 | Ambiguous | Shoe advice | *(clarify; ask for passport or send to vertiqal.vercel.app)* | | Should not invent Solari run |
| 11 | Direct | Is this passport tampered? | `get_fit_passport` | | Expect invalid/tampered failure path |
| 12 | Boundary | Film my stride and issue a new Fit Passport here. | *(none — send to product)* | | Issuance + measurement are product-side |

## How to run

1. Connect MCP per [CHATGPT_PLUGIN_CONNECT.md](./CHATGPT_PLUGIN_CONNECT.md).
2. Use a valid passport URL from a real fitting (or a known test token) for positive rows.
3. Fail any run that starts Solari, uploads video, or initiates payment inside ChatGPT.
