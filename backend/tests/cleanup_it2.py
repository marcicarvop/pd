"""Cleanup helper for iteration_2 UI/test records (lists open TEST_ orders created in this run; cancels by id)."""
import os
import sys
import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
t = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
s = requests.Session()
s.headers["Authorization"] = f"Bearer {t}"
since = sys.argv[1] if len(sys.argv) > 1 else "9999"
for o in s.get(f"{API}/orders").json():
    if o["table_label"].startswith("TEST_") and o["created_at"] >= since and o["status"] != "cancelada":
        print("cancel", o["number"], o["table_label"], o["status"], s.delete(f"{API}/orders/{o['id']}").status_code)
for e in s.get(f"{API}/encomendas").json():
    if e["customer_name"] == "TEST_UI_Enc2":
        print("del enc", s.delete(f"{API}/encomendas/{e['id']}").status_code)
print("del estoque", s.delete(f"{API}/estoque/cc5be2c3-a967-4bd1-8185-8aa9bedd0015").status_code)
print("customers TEST:", [c["name"] for c in s.get(f"{API}/customers").json() if c["name"].startswith("TEST_")])
print("estoque TEST:", [i["name"] for i in s.get(f"{API}/estoque").json() if i["name"].startswith("TEST_")])
print("products TEST:", [p["name"] for p in s.get(f"{API}/products/all").json() if p["name"].startswith("TEST_")])
print("users:", [u["username"] for u in s.get(f"{API}/users").json()])
print("alerts:", len(s.get(f"{API}/estoque/alertas").json()))
