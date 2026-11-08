"""Iteration 5: 3 estoque types (revenda/insumo/pronto), ficha técnica, custo, produção (lotes FIFO), descarte, checkout consumption."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
S = {"estoque": [], "products": [], "orders": []}
TAG = uuid.uuid4().hex[:5]


def login(u, p):
    r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login {u} failed")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def g():
    s = login("admin", "admin123")
    yield s
    for pid in S["products"]:
        s.delete(f"{API}/products/{pid}")
    for iid in S["estoque"]:
        s.delete(f"{API}/estoque/{iid}")


def item(g, iid):
    for t in ("revenda", "insumo", "pronto"):
        for i in g.get(f"{API}/estoque", params={"type": t}).json():
            if i["id"] == iid:
                return i
    return None


def batch(g, bid):
    return next((b for b in g.get(f"{API}/producao").json() if b["id"] == bid), None)


def sell(g, product_id, qty=1, halves=None):
    o = g.post(f"{API}/orders", json={"table_label": f"TEST_it5_{TAG}"}).json()
    S["orders"].append(o["id"])
    body = {"product_id": product_id, "quantity": qty}
    if halves:
        body["pizza_halves"] = halves
    r = g.post(f"{API}/orders/{o['id']}/items", json=body)
    assert r.status_code == 200, r.text
    total = r.json()["total"]
    r = g.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "dinheiro", "amount": total + 10}]})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "fechada"
    return r.json()


def mk_insumo(g, name, unit, qty, cost, minq=0):
    r = g.post(f"{API}/estoque", json={"name": f"TEST_{name}_{TAG}", "unit": unit, "quantity": qty,
                                       "min_quantity": minq, "cost_price": cost, "type": "insumo"})
    assert r.status_code == 200, r.text
    S["estoque"].append(r.json()["id"])
    return r.json()


class TestProducao:
    def test_01_legacy_items_are_revenda(self, g):
        default = g.get(f"{API}/estoque").json()
        assert all(i.get("type") == "revenda" for i in default)
        rev = g.get(f"{API}/estoque", params={"type": "revenda"}).json()
        assert {i["id"] for i in default} == {i["id"] for i in rev}

    def test_02_create_insumos_and_filter(self, g):
        S["far"] = mk_insumo(g, "Farinha", "kg", 10, 5.0)
        S["qj"] = mk_insumo(g, "Queijo", "kg", 2, 40.0)
        S["cal"] = mk_insumo(g, "Calabresa", "kg", 1, 30.0)
        S["ovo"] = mk_insumo(g, "Ovo", "un", 3, 0.8, minq=5)
        assert S["far"]["type"] == "insumo"
        ins_ids = {i["id"] for i in g.get(f"{API}/estoque", params={"type": "insumo"}).json()}
        assert S["far"]["id"] in ins_ids and S["ovo"]["id"] in ins_ids
        rev_ids = {i["id"] for i in g.get(f"{API}/estoque", params={"type": "revenda"}).json()}
        def_ids = {i["id"] for i in g.get(f"{API}/estoque").json()}
        assert S["far"]["id"] not in rev_ids and S["far"]["id"] not in def_ids

    def test_03_alertas_include_low_insumo(self, g):
        al = {i["id"] for i in g.get(f"{API}/estoque/alertas").json()}
        assert S["ovo"]["id"] in al
        assert S["far"]["id"] not in al

    def test_04_create_pronto_product_and_custo(self, g):
        cat = g.get(f"{API}/categories").json()[0]["id"]
        S["cat"] = cat
        r = g.post(f"{API}/products", json={
            "name": f"TEST_PaoQueijo_{TAG}", "category_id": cat, "base_price": 3.0,
            "production_mode": "pronto", "margin_pct": 150,
            "recipe": [{"insumo_id": S["far"]["id"], "quantity": 0.05, "unit": "kg"},
                       {"insumo_id": S["qj"]["id"], "quantity": 0.02, "unit": "kg"}],
        })
        assert r.status_code == 200, r.text
        S["pq"] = r.json(); S["products"].append(S["pq"]["id"])
        c = g.get(f"{API}/products/{S['pq']['id']}/custo").json()
        assert abs(c["custo"] - 1.05) < 1e-6
        assert abs(c["custo_unitario"] - 1.05) < 1e-6
        assert c["margem_pct"] == 150
        assert abs(c["preco_sugerido"] - 2.62) < 0.011
        assert len(c["insumos"]) == 2 and {"needed", "available"} <= set(c["insumos"][0])
        c10 = g.get(f"{API}/products/{S['pq']['id']}/custo", params={"quantity": 10}).json()
        assert abs(c10["custo"] - 10.5) < 1e-6 and abs(c10["custo_unitario"] - 1.05) < 1e-6

    def test_05_custo_without_recipe_400(self, g):
        r = g.post(f"{API}/products", json={"name": f"TEST_NoRecipe_{TAG}", "category_id": S["cat"], "base_price": 1})
        S["norec"] = r.json(); S["products"].append(r.json()["id"])
        assert g.get(f"{API}/products/{S['norec']['id']}/custo").status_code == 400
        assert g.get(f"{API}/products/nonexistent-id/custo").status_code == 404

    def test_06_producao_requires_pronto_mode(self, g):
        r = g.post(f"{API}/producao", json={"product_id": S["norec"]["id"], "quantity": 1})
        assert r.status_code == 400

    def test_07_producao_insufficient_400_no_consumption(self, g):
        r = g.post(f"{API}/producao", json={"product_id": S["pq"]["id"], "quantity": 500})
        assert r.status_code == 400 and "insuficiente" in r.json()["detail"].lower()
        assert item(g, S["far"]["id"])["quantity"] == 10
        assert item(g, S["qj"]["id"])["quantity"] == 2

    def test_08_producao_creates_batches_and_pronto(self, g):
        ra = g.post(f"{API}/producao", json={"product_id": S["pq"]["id"], "quantity": 5, "expiry_date": "2026-03-01"})
        assert ra.status_code == 200, ra.text
        rb = g.post(f"{API}/producao", json={"product_id": S["pq"]["id"], "quantity": 5, "expiry_date": "2026-02-01", "notes": "TEST"})
        assert rb.status_code == 200
        S["bA"], S["bB"] = ra.json(), rb.json()
        b = S["bA"]
        assert b["quantity_initial"] == 5 and b["quantity_remaining"] == 5
        assert abs(b["cost_unit"] - 1.05) < 1e-4 and b["produced_at"] and b["expiry_date"] == "2026-03-01"
        assert S["bA"]["estoque_item_id"] == S["bB"]["estoque_item_id"]
        S["pq_pronto"] = b["estoque_item_id"]; S["estoque"].append(b["estoque_item_id"])
        pr = item(g, S["pq_pronto"])
        assert pr["type"] == "pronto" and pr["quantity"] == 10
        assert abs(item(g, S["far"]["id"])["quantity"] - 9.5) < 1e-6
        assert abs(item(g, S["qj"]["id"])["quantity"] - 1.8) < 1e-6
        prod = next(p for p in g.get(f"{API}/products/all").json() if p["id"] == S["pq"]["id"])
        assert prod["pronto_item_id"] == S["pq_pronto"]
        movs = g.get(f"{API}/estoque/movimentos", params={"item_id": S["far"]["id"]}).json()
        assert any(m["type"] == "saida" and "Produção" in (m["reason"] or "") for m in movs)

    def test_09_checkout_pronto_fifo(self, g):
        sell(g, S["pq"]["id"], 3)
        assert batch(g, S["bB"]["id"])["quantity_remaining"] == 2  # earliest expiry first
        assert batch(g, S["bA"]["id"])["quantity_remaining"] == 5
        sell(g, S["pq"]["id"], 4)
        assert batch(g, S["bB"]["id"])["quantity_remaining"] == 0
        assert batch(g, S["bA"]["id"])["quantity_remaining"] == 3
        assert item(g, S["pq_pronto"])["quantity"] == 3

    def test_10_descartar(self, g):
        r = g.post(f"{API}/producao/{S['bA']['id']}/descartar", json={"quantity": 1, "reason": "TEST vencido"})
        assert r.status_code == 200
        assert batch(g, S["bA"]["id"])["quantity_remaining"] == 2
        assert item(g, S["pq_pronto"])["quantity"] == 2
        movs = g.get(f"{API}/estoque/movimentos", params={"item_id": S["pq_pronto"]}).json()
        assert any("Descarte" in (m["reason"] or "") for m in movs)
        assert g.post(f"{API}/producao/{S['bB']['id']}/descartar", json={"quantity": 1}).status_code == 400
        assert g.post(f"{API}/producao/bad-id/descartar", json={"quantity": 1}).status_code == 404

    def test_11_sale_beyond_pronto_stock(self, g):
        """Spec: if no pronto, sale passes without decrement. Check pronto never goes negative."""
        sell(g, S["pq"]["id"], 5)
        q = item(g, S["pq_pronto"])["quantity"]
        assert batch(g, S["bA"]["id"])["quantity_remaining"] == 0
        assert q >= 0, f"pronto stock went negative: {q}"

    def test_12_pizza_custo_and_producao(self, g):
        fl = [f"TEST_Cal_{TAG}", f"TEST_Mus_{TAG}", f"TEST_Port_{TAG}"]
        S["fl"] = fl
        r = g.post(f"{API}/products", json={
            "name": f"TEST_Pizza_{TAG}", "category_id": S["cat"], "base_price": 50, "is_pizza": True,
            "pizza_flavors": fl, "production_mode": "pronto", "margin_pct": 100,
            "base_recipe": [{"insumo_id": S["far"]["id"], "quantity": 0.3}],
            "recipe_by_flavor": {fl[0]: [{"insumo_id": S["cal"]["id"], "quantity": 0.1}],
                                 fl[1]: [{"insumo_id": S["qj"]["id"], "quantity": 0.15}],
                                 fl[2]: [{"insumo_id": S["ovo"]["id"], "quantity": 1}]},
        })
        assert r.status_code == 200, r.text
        S["pz"] = r.json(); S["products"].append(S["pz"]["id"])
        c = g.get(f"{API}/products/{S['pz']['id']}/custo", params={"flavor": fl[0]}).json()
        assert abs(c["custo"] - 4.5) < 1e-6 and abs(c["preco_sugerido"] - 9.0) < 0.01
        assert g.get(f"{API}/products/{S['pz']['id']}/custo").status_code == 400  # flavor required
        assert g.post(f"{API}/producao", json={"product_id": S["pz"]["id"], "quantity": 1}).status_code == 400
        assert g.post(f"{API}/producao", json={"product_id": S["pz"]["id"], "flavor": "nope", "quantity": 1}).status_code == 400
        for f in fl[:2]:
            r = g.post(f"{API}/producao", json={"product_id": S["pz"]["id"], "flavor": f, "quantity": 2})
            assert r.status_code == 200, r.text
            S[f] = r.json()["estoque_item_id"]; S["estoque"].append(S[f])
        assert S[fl[0]] != S[fl[1]]
        assert item(g, S[fl[0]])["flavor"] == fl[0]

    def test_13_pizza_half_half_sale(self, g):
        fl = S["fl"]
        sell(g, S["pz"]["id"], 1, halves=[fl[0], fl[1]])
        assert abs(item(g, S[fl[0]])["quantity"] - 1.5) < 1e-6
        assert abs(item(g, S[fl[1]])["quantity"] - 1.5) < 1e-6
        # flavor without pronto: sale still passes
        sell(g, S["pz"]["id"], 1, halves=[fl[0], fl[2]])
        assert abs(item(g, S[fl[0]])["quantity"] - 1.0) < 1e-6

    def test_14_revenda_sale(self, g):
        r = g.post(f"{API}/estoque", json={"name": f"TEST_Refri_{TAG}", "unit": "un", "quantity": 10, "type": "revenda"})
        S["refri"] = r.json(); S["estoque"].append(r.json()["id"])
        r = g.post(f"{API}/products", json={"name": f"TEST_RefriProd_{TAG}", "category_id": S["cat"], "base_price": 5,
                                            "production_mode": "revenda", "tracks_stock": True,
                                            "stock_item_id": S["refri"]["id"], "stock_usage": 1})
        S["products"].append(r.json()["id"])
        sell(g, r.json()["id"], 2)
        assert item(g, S["refri"]["id"])["quantity"] == 8

    def test_15_legacy_stock_item_without_mode(self, g):
        """Product created with stock_item_id but no production_mode (legacy clients)."""
        r = g.post(f"{API}/products", json={"name": f"TEST_Legacy_{TAG}", "category_id": S["cat"], "base_price": 5,
                                            "tracks_stock": True, "stock_item_id": S["refri"]["id"]})
        S["products"].append(r.json()["id"])
        sell(g, r.json()["id"], 1)
        assert item(g, S["refri"]["id"])["quantity"] == 7, "legacy product (stock_item_id, no mode) did not decrement"

    def test_16_patch_insumo_without_type_keeps_type(self, g):
        r = g.patch(f"{API}/estoque/{S['ovo']['id']}", json={"name": S["ovo"]["name"], "unit": "un", "quantity": 3,
                                                           "min_quantity": 5, "cost_price": 0.8})
        assert r.status_code == 200
        assert r.json()["type"] == "insumo", f"type changed to {r.json()['type']}"

    def test_17_caixa_forbidden(self):
        c = login("caixa1", "caixa123")
        assert c.get(f"{API}/producao").status_code == 403
        assert c.post(f"{API}/producao", json={"product_id": "x", "quantity": 1}).status_code == 403
