"""Iteration 4 UI setup: TEST_ fiado customer with debt + TEST_ encomenda. Prints ids as JSON."""
import json
import os

import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
s.headers["Authorization"] = "Bearer " + requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
prods = s.get(f"{API}/products").json()
simple = next(p for p in prods if not p.get("is_pizza") and not any(v.get("required") for v in p.get("variations", [])))
c = s.post(f"{API}/customers", json={"name": "TEST_it4_cliente", "phone": "000"}).json()
o = s.post(f"{API}/orders", json={"table_label": "TEST_it4_fiado"}).json()
s.post(f"{API}/orders/{o['id']}/items", json={"product_id": simple["id"], "quantity": 1})
tot = s.get(f"{API}/orders/{o['id']}").json()["total"]
r = s.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "fiado", "amount": tot}], "customer_id": c["id"]})
e = s.post(f"{API}/encomendas", json={"customer_name": "TEST_it4_enc", "delivery_date": "2026-03-01",
                                     "items": [{"product_id": simple["id"], "quantity": 1}]}).json()
print(json.dumps({"customer": c["id"], "debt": tot, "checkout": r.status_code, "order_number": o["number"], "encomenda": e["id"]}))
