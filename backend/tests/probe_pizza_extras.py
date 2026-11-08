"""Probe: pizza product with extra variations - are extras priced server-side?"""
import os
import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
t = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
s = requests.Session()
s.headers["Authorization"] = f"Bearer {t}"
cat = s.get(f"{API}/categories").json()[0]["id"]
p = s.post(f"{API}/products", json={"name": "TEST_PizzaExtra", "category_id": cat, "base_price": 50, "is_pizza": True,
                                     "pizza_flavors": ["A", "B"],
                                     "variations": [{"name": "Borda", "type": "single", "required": False,
                                                     "options": [{"label": "Catupiry", "price_delta": 8}]}]}).json()
o = s.post(f"{API}/orders", json={"table_label": "TEST_probe"}).json()
r = s.post(f"{API}/orders/{o['id']}/items", json={"product_id": p["id"], "pizza_halves": ["A", "B"],
                                                    "variations_data": {"Borda": "Catupiry"}}).json()
print("server total (frontend would show 58):", r["total"], r["items"][0]["variations_text"])
s.delete(f"{API}/orders/{o['id']}")
s.delete(f"{API}/products/{p['id']}")
