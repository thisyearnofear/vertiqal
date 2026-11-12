import json

BEATS = [
    ("01-open",   "Every shoe wall sorts by colourway. By price. By what's already selling.", 2.0, 13.6),
    ("02-move",   "Forma sorts by how you move. Film a short clip, and the camera measures what a size chart never could. Cadence. Overstride. Knee at contact.", 14.0, 25.6),
    ("03-brief",  "It confirms the brief with you. Size. Budget. The ground you run on. The goal you're chasing.", 26.0, 35.2),
    ("04-search", "Then an agent goes to work. Reading the research. Checking real stock. Comparing craft, not marketing.", 35.6, 50.8),
    ("05-picks",  "Three shoes. Chosen by your movement, not a wall of a hundred. It shows its work. The field notes, the craft, the honest verdict when stock can't be verified.", 51.0, 70.8),
    ("06-paypal", "When you say yes, PayPal does what it does best. Order created. Approved by you. Captured, with receipts.", 71.2, 83.8),
    ("07-ledger", "And the merchant sees every step. The ledger. The fitting. The outcome.", 84.2, 91.8),
    ("08-agents", "Here's the part nobody else can show you. Your fit passport is signed, and readable by other agents. A shopper agent checks the fit itself, and prepares a PayPal order for your approval.", 92.2, 107.5),
    ("09-end",    "Agents sell. Agents buy. PayPal settles.", 108.9, 111.7),
]

for name, text, t0, t1 in BEATS:
    body = {"text": text, "model_id": "eleven_v4",
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.75, "style": 0.35}}
    with open(f"/tmp/vqvo/{name}.json", "w") as f:
        json.dump(body, f)
    print(name, t0, t1)
