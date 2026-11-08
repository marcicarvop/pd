"""Iteration 6: retest fixes - pronto never negative, PATCH/DELETE estoque 404/type preservation,
legacy revenda (production_mode None/''/'none'), movimentos item_type filter, pizza half-half."""
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TAG = uuid.uuid4().hex[:5]
S = {"estoque": [], "products": []}


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


@pytest.fixture(scope="module")
def mdb():
    c = MongoClient(os.environ["MONGO_URL"])
    yield c[os.environ["DB_NAME"]]
    c.close()


def item(g, iid):
    for t in ("revenda", "insumo", "pronto"):
        for i in g.get(f"{API}/estoque", params={"type": t}).json():
            if i["id"] == iid:
                return i
    return None


def sell(g, pid, qty=1, halves=None):
    o = g.post(f"{API}/orders", json={"table_label": f"TEST_it6_{TAG}"}).json()
    body = {"product_id": pid, "quantity": qty}
    if halves:
        body["pizza_halves"] = halves
    r = g.post(f"{API}/orders/{o['id']}/items", json=body)
    assert r.status_code == 200, r.text
    total = r.json()["total"]
    r = g.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "dinheiro", "amount": total + 10}]})
    assert r.status_code == 200, r.text
    return r.json()


def mk(g, name, typ="insumo", qty=10, cost=1.0, unit="kg"):
    r = g.post(f"{API}/estoque", json={"name": f"TEST_{name}_{TAG}", "unit": unit, "quantity": qty,
                                       "min_quantity": 0, "cost_price": cost, "type": typ})
    assert r.status_code == 200, r.text
    S["estoque"].append(r.json()["id"])
    return r.json()


def mkprod(g, **kw):
    r = g.post(f"{API}/products", json={"category_id": S["cat"], "base_price": 5, **kw})
    assert r.status_code == 200, r.text
    S["products"].append(r.json()["id"])
    return r.json()


class TestFixes:
    def test_01_setup(self, g):
        S["cat"] = g.get(f"{API}/categories").json()[0]["id"]
        S["far"] = mk(g, "Farinha", qty=10, cost=5)
        S["qj"] = mk(g, "Queijo", qty=5, cost=40)

    def test_02_pronto_no_batches_not_negative(self, g):
        p = mkprod(g, name=f"TEST_PaoA_{TAG}", production_mode="pronto",
                   recipe=[{"insumo_id": S["far"]["id"], "quantity": 0.1}])
        # produce 2, sell 5 -> only 2 consumed
        b = g.post(f"{API}/producao", json={"product_id": p["id"], "quantity": 2}).json()
        S["estoque"].append(b["estoque_item_id"])
        S["pA"], S["prA"] = p, b["estoque_item_id"]
        sell(g, p["id"], 5)
        it = item(g, b["estoque_item_id"])
        assert it["quantity"] == 0, it["quantity"]
        # sell again with zero batches -> still 0
        sell(g, p["id"], 3)
        assert item(g, b["estoque_item_id"])["quantity"] == 0
        movs = g.get(f"{API}/estoque/movimentos", params={"item_id": b["estoque_item_id"]}).json()
        sale_movs = [m for m in movs if "Venda" in (m.get("reason") or "")]
        assert len(sale_movs) == 1 and sale_movs[0]["quantity"] == 2

    def test_03_patch_preserves_type(self, g):
        r = g.patch(f"{API}/estoque/{S['far']['id']}", json={"name": S["far"]["name"], "quantity": 8})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "insumo" and d["quantity"] == 8
        assert d["cost_price"] == 5 and d["unit"] == "kg"  # unsent fields preserved
        assert item(g, S["far"]["id"])["type"] == "insumo"

    def test_04_patch_pronto_preserves_type_and_product_id(self, g):
        r = g.patch(f"{API}/estoque/{S['prA']}", json={"name": "TEST_renamed_pronto", "min_quantity": 1})
        assert r.status_code == 200
        d = r.json()
        assert d["type"] == "pronto" and d.get("product_id") == S["pA"]["id"]

    def test_05_patch_404_and_invalid_type(self, g):
        r = g.patch(f"{API}/estoque/nonexistent-{TAG}", json={"name": "x"})
        assert r.status_code == 404
        r = g.patch(f"{API}/estoque/{S['far']['id']}", json={"name": S["far"]["name"], "type": "bogus"})
        assert r.status_code == 400
        assert item(g, S["far"]["id"])["type"] == "insumo"

    def test_06_patch_explicit_type_change(self, g):
        x = mk(g, "TypeSwap", typ="insumo")
        r = g.patch(f"{API}/estoque/{x['id']}", json={"name": x["name"], "type": "revenda"})
        assert r.status_code == 200 and r.json()["type"] == "revenda"

    def test_07_delete_404(self, g):
        assert g.delete(f"{API}/estoque/nonexistent-{TAG}").status_code == 404

    def test_08_legacy_mode_none_string(self, g):
        S["refri"] = mk(g, "Refri", typ="revenda", qty=10, unit="un")
        p = mkprod(g, name=f"TEST_LegNone_{TAG}", production_mode="none", tracks_stock=True,
                   stock_item_id=S["refri"]["id"])
        sell(g, p["id"], 2)
        assert item(g, S["refri"]["id"])["quantity"] == 8

    def test_09_legacy_mode_null(self, g, mdb):
        p = mkprod(g, name=f"TEST_LegNull_{TAG}", tracks_stock=True, stock_item_id=S["refri"]["id"])
        mdb.products.update_one({"id": p["id"]}, {"$set": {"production_mode": None}})
        sell(g, p["id"], 1)
        assert item(g, S["refri"]["id"])["quantity"] == 7
        mdb.products.update_one({"id": p["id"]}, {"$set": {"production_mode": ""}})
        sell(g, p["id"], 1)
        assert item(g, S["refri"]["id"])["quantity"] == 6

    def test_10_legacy_mode_missing_key(self, g, mdb):
        p = mkprod(g, name=f"TEST_LegMissing_{TAG}", tracks_stock=True, stock_item_id=S["refri"]["id"])
        mdb.products.update_one({"id": p["id"]}, {"$unset": {"production_mode": ""}})
        sell(g, p["id"], 1)
        assert item(g, S["refri"]["id"])["quantity"] == 5

    def test_11_movimentos_item_type(self, g):
        for t in ("insumo", "revenda", "pronto"):
            r = g.get(f"{API}/estoque/movimentos", params={"item_type": t})
            assert r.status_code == 200
            ids = {i["id"] for i in g.get(f"{API}/estoque", params={"type": t}).json()}
            if t == "revenda":
                ids |= {i["id"] for i in g.get(f"{API}/estoque").json()}
            movs = r.json()
            assert all(m["item_id"] in ids for m in movs), f"{t}: foreign movement"
        ins = g.get(f"{API}/estoque/movimentos", params={"item_type": "insumo"}).json()
        assert any(m["item_id"] == S["far"]["id"] for m in ins)
        assert not any(m["item_id"] == S["refri"]["id"] for m in ins)
        rev = g.get(f"{API}/estoque/movimentos", params={"item_type": "revenda"}).json()
        assert any(m["item_id"] == S["refri"]["id"] for m in rev)

    def test_12_pizza_half_half(self, g):
        fl = [f"TEST_Cal_{TAG}", f"TEST_Mus_{TAG}"]
        p = mkprod(g, name=f"TEST_Pizza_{TAG}", base_price=50, is_pizza=True, pizza_flavors=fl,
                   production_mode="pronto",
                   base_recipe=[{"insumo_id": S["far"]["id"], "quantity": 0.3}],
                   recipe_by_flavor={fl[0]: [{"insumo_id": S["qj"]["id"], "quantity": 0.1}],
                                     fl[1]: [{"insumo_id": S["qj"]["id"], "quantity": 0.2}]})
        ids = {}
        for f in fl:
            r = g.post(f"{API}/producao", json={"product_id": p["id"], "flavor": f, "quantity": 1})
            assert r.status_code == 200, r.text
            ids[f] = r.json()["estoque_item_id"]; S["estoque"].append(ids[f])
        out = sell(g, p["id"], 1, halves=fl)
        assert out["status"] == "fechada"
        assert abs(item(g, ids[fl[0]])["quantity"] - 0.5) < 1e-6
        assert abs(item(g, ids[fl[1]])["quantity"] - 0.5) < 1e-6
        # sell 3 more half-half: only 0.5 left per flavor -> must floor at 0
        sell(g, p["id"], 3, halves=fl)
        assert item(g, ids[fl[0]])["quantity"] >= 0 and item(g, ids[fl[1]])["quantity"] >= 0
        assert abs(item(g, ids[fl[0]])["quantity"]) < 1e-6
