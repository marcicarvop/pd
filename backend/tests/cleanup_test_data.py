"""Cleanup helper for UI-test records created in iteration_1 (by id / exact TEST_ names)."""
import os
import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
t = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
s = requests.Session()
s.headers["Authorization"] = f"Bearer {t}"
print("cancel #111", s.delete(f"{API}/orders/94659a1a-a129-4612-bad8-afea9b16eb9e").status_code)
for o in s.get(f"{API}/orders", params={"status": "aberta"}).json():
    if o["table_label"].startswith("TEST_"):
        print("cancel", o["number"], s.delete(f"{API}/orders/{o['id']}").status_code)
cid = "528bb285-a93c-4d69-87e8-6e6303e4587b"
print("pay", s.post(f"{API}/customers/{cid}/pagamento", json={"customer_id": cid, "amount": 4}).json())
print("del cust", s.delete(f"{API}/customers/{cid}").status_code)
for e in s.get(f"{API}/encomendas").json():
    if e["customer_name"] == "TEST_Enc UI":
        print("del enc", s.delete(f"{API}/encomendas/{e['id']}").status_code)
print("del estoque", s.delete(f"{API}/estoque/4fc0547d-b577-4af8-b5f8-298d27e7ee4e").status_code)
print("customers:", [c["name"] for c in s.get(f"{API}/customers").json()])
print("estoque TEST:", [i["name"] for i in s.get(f"{API}/estoque").json() if i["name"].startswith("TEST_")])
print("products TEST:", [p["name"] for p in s.get(f"{API}/products/all").json() if p["name"].startswith("TEST_")])
print("users:", [u["username"] for u in s.get(f"{API}/users").json()])
