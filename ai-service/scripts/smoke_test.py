"""Local smoke test for the AI service. No deployment needed.

Prereqs:
  1. ai-service/.env filled in (DATABASE_URL, JWT_SECRET, GROK_*, and for invoices
     VERYFI_*, CLOUDINARY_URL, REDIS_URL).
  2. The API running:   uvicorn main:app --port 8000
  3. For the invoice queue, either a worker running:
        rq worker invoices --url <REDIS_URL> --worker-class rq.SimpleWorker
     or leave REDIS_URL empty to process inline (no worker needed).

Run:  .venv/Scripts/python.exe scripts/smoke_test.py
It mints a manager JWT with your JWT_SECRET (same secret Express signs with) and
exercises the recommendation endpoints, then optionally an invoice upload.
"""
import sys
import time
from pathlib import Path

import httpx
import jwt

BASE = "http://127.0.0.1:8000"
ENV = {}
for line in (Path(__file__).resolve().parents[1] / ".env").read_text().splitlines():
    s = line.strip()
    if "=" in s and not s.startswith("#"):
        k, v = s.split("=", 1)
        ENV[k.strip()] = v.strip()

TOKEN = jwt.encode(
    {"sub": "1", "role": "manager", "exp": int(time.time()) + 3600},
    ENV["JWT_SECRET"], algorithm="HS256",
)
H = {"Authorization": f"Bearer {TOKEN}"}
c = httpx.Client(timeout=120)


def show(label, r):
    try:
        body = r.json()
    except Exception:
        body = r.text[:120]
    print(f"{label:34s} {r.status_code}  {body.get('message') if isinstance(body, dict) and 'data' not in body else 'ok'}")
    return r


print("== Recommendations ==")
show("shortage-prediction", c.post(f"{BASE}/ai/inventory/shortage-prediction", headers=H))
show("reorder-suggestion", c.post(f"{BASE}/ai/inventory/reorder-suggestion", headers=H))
show("pricing-suggestion", c.post(f"{BASE}/ai/menu/pricing-suggestion", headers=H))
show("prep-time-estimate", c.post(f"{BASE}/ai/menu/prep-time-estimate", headers=H))
show("waste-analysis", c.post(f"{BASE}/ai/inventory/waste-analysis", headers=H))

# Optional invoice test: pass a file path as the first arg.
if len(sys.argv) > 1:
    p = Path(sys.argv[1])
    mime = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg",
            "jpeg": "image/jpeg", "webp": "image/webp"}.get(p.suffix.lower().lstrip("."), "application/pdf")
    print("\n== Invoice upload ==")
    r = c.post(f"{BASE}/ai/invoices/upload", headers=H,
               files=[("files", (p.name, p.read_bytes(), mime))])
    print("upload:", r.status_code, r.json().get("data"))
    ids = [i["id"] for i in r.json()["data"]["imports"]]
    for _ in range(30):
        time.sleep(1)
        rows = {x["id"]: x["status"] for x in c.get(f"{BASE}/ai/invoices/imports", headers=H).json()["data"] if x["id"] in ids}
        if all(s in ("extracted", "failed", "approved", "rejected") for s in rows.values()):
            break
    print("statuses:", rows)
    detail = c.get(f"{BASE}/ai/invoices/imports/{ids[0]}", headers=H).json()["data"]
    ed = detail.get("extracted_data") or {}
    print(f"extracted: supplier={ed.get('supplier_name')!r} invoice#={ed.get('invoice_number')!r} "
          f"total={ed.get('total')} lines={len(ed.get('line_items', []))}")
