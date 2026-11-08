"""Padaria POS - iteration 3 retest: order status guards, cancel guard, encomenda validation, pizza flavor validation."""
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
CREATED = {"orders": [], "encomendas": [], "closed": []}


@pytest.fixture(scope="module")
def ger():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=20)
    if r.status_code != 200:
        pytest.skip("gerente login failed")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    yield s
    for oid in CREATED["orders"]:
        s.delete(f"{API}/orders/{oid}")
    for eid in CREATED["encomendas"]:
        s.delete(f"{API}/encomendas/{eid}")
    print("CLOSED_TEST_ORDERS_LEFT:", CREATED["closed"])


@pytest.fixture(scope="module")
def products(ger):
    return ger.get(f"{API}/products").json()


def _simple(products):
    return next(p for p in products if not p.get("is_pizza") and not any(v.get("required") for v in p.get("variations", [])))


def _pizza(products):
    return next(p for p in products if p.get("is_pizza"))


def _order(s):
    o = s.post(f"{API}/orders", json={"table_label": "TEST_it3"}).json()
    CREATED["orders"].append(o["id"])
    return o


# Order guards
class TestOrderGuards:
    def test_patch_status_fechada_rejected(self, ger):
        o = _order(ger)
        r = ger.patch(f"{API}/orders/{o['id']}", json={"status": "fechada"})
        assert r.status_code == 400
        assert ger.get(f"{API}/orders/{o['id']}").json()["status"] == "aberta"

    def test_patch_status_cancelada_rejected(self, ger):
        o = _order(ger)
        r = ger.patch(f"{API}/orders/{o['id']}", json={"status": "cancelada"})
        assert r.status_code == 400

    def test_patch_status_valid(self, ger):
        o = _order(ger)
        r = ger.patch(f"{API}/orders/{o['id']}", json={"status": "em_producao"})
        assert r.status_code == 200 and r.json()["status"] == "em_producao"

    def test_patch_garbage_status_rejected(self, ger):
        o = _order(ger)
        assert ger.patch(f"{API}/orders/{o['id']}", json={"status": "xyz"}).status_code == 400

    def test_delete_fechada_rejected(self, ger, products):
        o = _order(ger)
        p = _simple(products)
        ger.post(f"{API}/orders/{o['id']}/items", json={"product_id": p["id"], "quantity": 1})
        tot = ger.get(f"{API}/orders/{o['id']}").json()["total"]
        r = ger.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "pix", "amount": tot}]})
        assert r.status_code == 200
        CREATED["orders"].remove(o["id"])
        CREATED["closed"].append(o["number"])
        r = ger.delete(f"{API}/orders/{o['id']}")
        assert r.status_code == 400
        assert ger.get(f"{API}/orders/{o['id']}").json()["status"] == "fechada"

    def test_delete_open_ok(self, ger):
        o = ger.post(f"{API}/orders", json={"table_label": "TEST_it3"}).json()
        assert ger.delete(f"{API}/orders/{o['id']}").status_code == 200
        assert ger.get(f"{API}/orders/{o['id']}").json()["status"] == "cancelada"

    # Probe: cancelled order can be reopened / items added / checked out?
    def test_cancelled_order_cannot_be_reopened(self, ger, products):
        o = ger.post(f"{API}/orders", json={"table_label": "TEST_it3"}).json()
        ger.delete(f"{API}/orders/{o['id']}")
        r = ger.patch(f"{API}/orders/{o['id']}", json={"status": "aberta"})
        print("PATCH cancelled->aberta:", r.status_code)
        r2 = ger.post(f"{API}/orders/{o['id']}/items", json={"product_id": _simple(products)["id"], "quantity": 1})
        print("add item to cancelled:", r2.status_code)
        # restore to cancelled for cleanup
        ger.delete(f"{API}/orders/{o['id']}")
        assert r.status_code == 400 and r2.status_code == 400


# Pizza flavor validation
class TestPizza:
    def test_invalid_flavor(self, ger, products):
        o = _order(ger)
        pz = _pizza(products)
        r = ger.post(f"{API}/orders/{o['id']}/items", json={"product_id": pz["id"], "pizza_halves": ["TEST_Nope"]})
        assert r.status_code == 400 and "Sabor" in r.json()["detail"]

    def test_valid_flavors(self, ger, products):
        o = _order(ger)
        pz = _pizza(products)
        fl = pz["pizza_flavors"][:2]
        req = {v["name"]: (v["options"][0]["label"] if v["type"] == "single" else [v["options"][0]["label"]])
               for v in pz.get("variations", []) if v.get("required")}
        r = ger.post(f"{API}/orders/{o['id']}/items", json={"product_id": pz["id"], "pizza_halves": fl, "variations_data": req})
        assert r.status_code == 200, r.text
        assert r.json()["items"][0]["pizza_halves"] == fl


# Encomenda validation
class TestEncomenda:
    def _items(self, products):
        return [{"product_id": _simple(products)["id"], "quantity": 2}]

    def test_empty_name(self, ger, products):
        r = ger.post(f"{API}/encomendas", json={"customer_name": "", "delivery_date": "2026-02-01", "items": self._items(products)})
        assert r.status_code in (400, 422)
        assert isinstance(r.json()["detail"], (str, list))

    def test_blank_name(self, ger, products):
        r = ger.post(f"{API}/encomendas", json={"customer_name": "   ", "delivery_date": "2026-02-01", "items": self._items(products)})
        assert r.status_code in (400, 422)

    def test_negative_deposit(self, ger, products):
        r = ger.post(f"{API}/encomendas", json={"customer_name": "TEST_E", "delivery_date": "2026-02-01", "deposit": -5, "items": self._items(products)})
        assert r.status_code == 422

    def test_deposit_gt_total(self, ger, products):
        r = ger.post(f"{API}/encomendas", json={"customer_name": "TEST_E", "delivery_date": "2026-02-01", "deposit": 99999, "items": self._items(products)})
        assert r.status_code == 400

    def test_create_and_patch(self, ger, products):
        r = ger.post(f"{API}/encomendas", json={"customer_name": "TEST_E3", "delivery_date": "2026-02-01", "deposit": 1, "items": self._items(products)})
        assert r.status_code == 200
        e = r.json()
        CREATED["encomendas"].append(e["id"])
        assert e["total"] > 0 and e["deposit"] == 1
        assert ger.patch(f"{API}/encomendas/{e['id']}", json={"status": "bogus"}).status_code == 400
        assert ger.patch(f"{API}/encomendas/{e['id']}", json={"deposit": -1}).status_code == 422
        r = ger.patch(f"{API}/encomendas/{e['id']}", json={"status": "pronta"})
        assert r.status_code == 200 and r.json()["status"] == "pronta"
        got = [x for x in ger.get(f"{API}/encomendas").json() if x["id"] == e["id"]][0]
        assert got["status"] == "pronta"

    def test_patch_deposit_gt_total(self, ger, products):
        r = ger.post(f"{API}/encomendas", json={"customer_name": "TEST_E3b", "delivery_date": "2026-02-01", "items": self._items(products)})
        e = r.json()
        CREATED["encomendas"].append(e["id"])
        r = ger.patch(f"{API}/encomendas/{e['id']}", json={"deposit": e["total"] + 1000})
        print("PATCH deposit>total:", r.status_code)
        assert r.status_code == 400

    def test_patch_unknown_id(self, ger):
        r = ger.patch(f"{API}/encomendas/TEST_nonexistent", json={"status": "pronta"})
        print("PATCH unknown encomenda:", r.status_code, r.text[:80])
        assert r.status_code == 404
