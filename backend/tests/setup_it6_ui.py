"""Setup/cleanup TEST_ data for iteration 6 UI smoke. Usage: python setup_it6_ui.py setup|cleanup"""
import json, os, sys, requests
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
F = "/tmp/it6_ui.json"
t = requests.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
s = requests.Session(); s.headers["Authorization"] = f"Bearer {t}"
if sys.argv[1] == "setup":
    cat = s.get(f"{BASE}/categories").json()[0]["id"]
    far = s.post(f"{BASE}/estoque", json={"name": "TEST_UI6_Farinha", "unit": "kg", "quantity": 20, "cost_price": 5, "type": "insumo"}).json()
    qj = s.post(f"{BASE}/estoque", json={"name": "TEST_UI6_Queijo", "unit": "kg", "quantity": 10, "cost_price": 40, "type": "insumo"}).json()
    pao = s.post(f"{BASE}/products", json={"name": "TEST_UI6_Pao", "category_id": cat, "base_price": 3, "production_mode": "pronto",
                                           "recipe": [{"insumo_id": far["id"], "quantity": 0.1}]}).json()
    pz = s.post(f"{BASE}/products", json={"name": "TEST_UI6_Pizza", "category_id": cat, "base_price": 40, "is_pizza": True,
                                          "pizza_flavors": ["TEST_Cal", "TEST_Mus"], "production_mode": "pronto",
                                          "base_recipe": [{"insumo_id": far["id"], "quantity": 0.3}],
                                          "recipe_by_flavor": {"TEST_Cal": [{"insumo_id": qj["id"], "quantity": 0.1}],
                                                               "TEST_Mus": [{"insumo_id": qj["id"], "quantity": 0.2}]}}).json()
    json.dump({"far": far["id"], "qj": qj["id"], "pao": pao["id"], "pz": pz["id"]}, open(F, "w"))
    print(json.load(open(F)))
else:
    d = json.load(open(F))
    for pid in (d["pao"], d["pz"]):
        print(s.delete(f"{BASE}/products/{pid}").status_code)
    ids = [d["far"], d["qj"]] + [i["id"] for i in s.get(f"{BASE}/estoque", params={"type": "pronto"}).json()
                                 if i.get("product_id") in (d["pao"], d["pz"])]
    for iid in ids:
        print(iid, s.delete(f"{BASE}/estoque/{iid}").status_code)
