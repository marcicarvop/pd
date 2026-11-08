"""Padaria POS - iteration 4 retest: cancelled-order guards, encomenda PATCH deposit/404, DELETE 404."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
CREATED = {"encomendas": []}


@pytest.fixture(scope="module")
def ger():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=20)
    if r.status_code != 200:
        pytest.skip("gerente login failed")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    yield s
    for eid in CREATED["encomendas"]:
        s.delete(f"{API}/encomendas/{eid}")


@pytest.fixture(scope="module")
def products(ger):
    return ger.get(f"{API}/products").json()


def _simple(products):
    return next(p for p in products if not p.get("is_pizza") and not any(v.get("required") for v in p.get("variations", [])))


@pytest.fixture(scope="module")
def cancelled(ger, products):
    """Open order with 1 item, then cancel it (DELETE)."""
    o = ger.post(f"{API}/orders", json={"table_label": "TEST_it4"}).json()
    p = _simple(products)
    r = ger.post(f"{API}/orders/{o['id']}/items", json={"product_id": p["id"], "quantity": 1})
    assert r.status_code == 200
    order = ger.get(f"{API}/orders/{o['id']}").json()
    assert ger.delete(f"{API}/orders/{o['id']}").status_code == 200
    assert ger.get(f"{API}/orders/{o['id']}").json()["status"] == "cancelada"
    return {"order": order, "product": p}


# Cancelled order guards
class TestCancelledOrderGuards:
    @pytest.mark.parametrize("status", ["aberta", "em_producao", "pronta", "aguardando_pagamento", "fechada", "cancelada"])
    def test_patch_status_on_cancelled(self, ger, cancelled, status):
        oid = cancelled["order"]["id"]
        r = ger.patch(f"{API}/orders/{oid}", json={"status": status})
        assert r.status_code == 400, r.text
        assert ger.get(f"{API}/orders/{oid}").json()["status"] == "cancelada"

    def test_patch_other_field_on_cancelled(self, ger, cancelled):
        oid = cancelled["order"]["id"]
        r = ger.patch(f"{API}/orders/{oid}", json={"table_label": "TEST_x"})
        assert r.status_code == 400, r.text

    def test_add_item_on_cancelled(self, ger, cancelled):
        oid = cancelled["order"]["id"]
        r = ger.post(f"{API}/orders/{oid}/items", json={"product_id": cancelled["product"]["id"], "quantity": 1})
        assert r.status_code == 400, r.text
        assert len(ger.get(f"{API}/orders/{oid}").json()["items"]) == 1

    def test_remove_item_on_cancelled(self, ger, cancelled):
        oid = cancelled["order"]["id"]
        iid = cancelled["order"]["items"][0]["id"]
        r = ger.delete(f"{API}/orders/{oid}/items/{iid}")
        assert r.status_code == 400, r.text
        assert len(ger.get(f"{API}/orders/{oid}").json()["items"]) == 1

    def test_checkout_on_cancelled(self, ger, cancelled):
        oid = cancelled["order"]["id"]
        tot = cancelled["order"]["total"]
        r = ger.post(f"{API}/orders/{oid}/checkout", json={"payments": [{"method": "dinheiro", "amount": tot}]})
        assert r.status_code == 400, r.text
        assert ger.get(f"{API}/orders/{oid}").json()["status"] == "cancelada"


# Encomenda PATCH/DELETE validations
class TestEncomendaFixes:
    def _create(self, ger, products):
        p = _simple(products)
        r = ger.post(f"{API}/encomendas", json={"customer_name": "TEST_E4", "delivery_date": "2026-02-10",
                                                "deposit": 1, "items": [{"product_id": p["id"], "quantity": 2}]})
        assert r.status_code == 200, r.text
        e = r.json()
        CREATED["encomendas"].append(e["id"])
        return e

    def test_patch_deposit_gt_total(self, ger, products):
        e = self._create(ger, products)
        r = ger.patch(f"{API}/encomendas/{e['id']}", json={"deposit": e["total"] + 10})
        assert r.status_code == 400
        got = [x for x in ger.get(f"{API}/encomendas").json() if x["id"] == e["id"]][0]
        assert got["deposit"] == 1

    def test_patch_deposit_eq_total_ok(self, ger, products):
        e = self._create(ger, products)
        r = ger.patch(f"{API}/encomendas/{e['id']}", json={"deposit": e["total"]})
        assert r.status_code == 200 and r.json()["deposit"] == e["total"]

    def test_patch_unknown_404(self, ger):
        r = ger.patch(f"{API}/encomendas/{uuid.uuid4()}", json={"status": "pronta"})
        assert r.status_code == 404

    def test_delete_unknown_404(self, ger):
        r = ger.delete(f"{API}/encomendas/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_delete_existing_then_404(self, ger, products):
        e = self._create(ger, products)
        assert ger.delete(f"{API}/encomendas/{e['id']}").status_code == 200
        CREATED["encomendas"].remove(e["id"])
        assert ger.delete(f"{API}/encomendas/{e['id']}").status_code == 404
