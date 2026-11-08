"""Padaria POS - retest of iteration_1 fixes: pizza variations pricing, validation 422s, PIN uniqueness, checkout guards, dashboard tz."""
import os
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(payload):
    return requests.post(f"{API}/auth/login", json=payload, timeout=20)


@pytest.fixture(scope="module")
def ger():
    r = _login({"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("gerente login failed")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def products(ger):
    return ger.get(f"{API}/products").json()


def _prod(products, name):
    return next(p for p in products if p["name"] == name)


def _new_order(s, label="TEST_it2"):
    return s.post(f"{API}/orders", json={"table_label": label}).json()


# ---------- Pizza with variations ----------
class TestPizzaVariations:
    def test_pizza_borda_price_and_text(self, ger):
        cat = ger.get(f"{API}/categories").json()[0]["id"]
        p = ger.post(f"{API}/products", json={
            "name": "TEST_PizzaExtra", "category_id": cat, "base_price": 50, "is_pizza": True,
            "pizza_flavors": ["A", "B"],
            "variations": [{"name": "Borda", "type": "single", "required": False,
                            "options": [{"label": "Catupiry", "price_delta": 8}]},
                           {"name": "Extras", "type": "multiple", "required": False,
                            "options": [{"label": "Bacon", "price_delta": 4}, {"label": "Ovo", "price_delta": 2}]}]}).json()
        o = _new_order(ger)
        try:
            r = ger.post(f"{API}/orders/{o['id']}/items", json={
                "product_id": p["id"], "pizza_halves": ["A", "B"],
                "variations_data": {"Borda": "Catupiry", "Extras": ["Bacon", "Ovo"]}})
            assert r.status_code == 200
            d = r.json()
            assert d["total"] == 64.0
            txt = d["items"][0]["variations_text"] or ""
            assert "Sabores" not in txt
            assert "Borda: Catupiry" in txt and "Extras: Bacon, Ovo" in txt
        finally:
            ger.delete(f"{API}/orders/{o['id']}")
            ger.delete(f"{API}/products/{p['id']}")

    def test_pizza_plain_text_none(self, ger, products):
        o = _new_order(ger)
        try:
            r = ger.post(f"{API}/orders/{o['id']}/items", json={
                "product_id": _prod(products, "Pizza Grande")["id"], "pizza_halves": ["Calabresa", "Atum"]})
            it = r.json()["items"][0]
            assert it["variations_text"] in (None, "") and it["total_price"] == 55.0
        finally:
            ger.delete(f"{API}/orders/{o['id']}")


# ---------- Validation ----------
class TestValidation:
    def test_customer_search_paren(self, ger):
        for q in ["(", "[", "*", "+?"]:
            r = ger.get(f"{API}/customers", params={"q": q})
            assert r.status_code == 200 and isinstance(r.json(), list), q

    def test_fiado_payment_zero_negative(self, ger):
        c = ger.post(f"{API}/customers", json={"name": "TEST_it2_neg"}).json()
        try:
            for amt in [0, -5]:
                r = ger.post(f"{API}/customers/{c['id']}/pagamento", json={"customer_id": c["id"], "amount": amt})
                assert r.status_code == 422, amt
        finally:
            ger.delete(f"{API}/customers/{c['id']}")

    def test_item_quantity_and_payment_and_discount(self, ger, products):
        o = _new_order(ger)
        try:
            pid = _prod(products, "Coxinha")["id"]
            for q in [0, -1]:
                assert ger.post(f"{API}/orders/{o['id']}/items", json={"product_id": pid, "quantity": q}).status_code == 422
            ger.post(f"{API}/orders/{o['id']}/items", json={"product_id": pid, "quantity": 1})
            r = ger.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "dinheiro", "amount": -10}, {"method": "dinheiro", "amount": 20}]})
            assert r.status_code == 422
            r = ger.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "dinheiro", "amount": 10}], "discount": -5})
            assert r.status_code == 422
            assert ger.patch(f"{API}/orders/{o['id']}", json={"discount": -1}).status_code == 422
            assert ger.get(f"{API}/orders/{o['id']}").json()["status"] == "aberta"
        finally:
            ger.delete(f"{API}/orders/{o['id']}")

    def test_estoque_movement_quantity(self, ger):
        it = ger.post(f"{API}/estoque", json={"name": "TEST_it2_ins", "quantity": 5, "min_quantity": 1}).json()
        try:
            for q in [0, -3]:
                r = ger.post(f"{API}/estoque/movimento", json={"item_id": it["id"], "type": "entrada", "quantity": q})
                assert r.status_code == 422
            assert next(x for x in ger.get(f"{API}/estoque").json() if x["id"] == it["id"])["quantity"] == 5
        finally:
            ger.delete(f"{API}/estoque/{it['id']}")


# ---------- Users PIN ----------
class TestUserPin:
    def test_pin_rules(self, ger):
        base = {"name": "TEST_pin", "role": "operador", "password": "x"}
        for pin in ["123", "12345", "abcd"]:
            r = ger.post(f"{API}/users", json={**base, "username": f"test_{uuid.uuid4().hex[:6]}", "pin": pin})
            if r.status_code == 200:
                ger.delete(f"{API}/users/{r.json()['id']}")
            assert r.status_code == 400, pin
        for pin in ["1234", "5678"]:
            r = ger.post(f"{API}/users", json={**base, "username": f"test_{uuid.uuid4().hex[:6]}", "pin": pin})
            if r.status_code == 200:
                ger.delete(f"{API}/users/{r.json()['id']}")
            assert r.status_code == 400, pin

    def test_patch_duplicate_pin(self, ger):
        r = ger.post(f"{API}/users", json={"name": "TEST_pin2", "role": "operador", "password": "x",
                                           "username": f"test_{uuid.uuid4().hex[:6]}"})
        assert r.status_code == 200
        uid = r.json()["id"]
        try:
            assert ger.patch(f"{API}/users/{uid}", json={"pin": "1234"}).status_code == 400
            assert ger.patch(f"{API}/users/{uid}", json={"pin": "12"}).status_code == 400
            assert ger.patch(f"{API}/users/{uid}", json={"pin": "4821"}).status_code == 200
            assert ger.patch(f"{API}/users/{uid}", json={"pin": "4821"}).status_code == 200  # own pin ok
            assert _login({"pin": "1234"}).json()["user"]["username"] == "admin"
        finally:
            assert ger.delete(f"{API}/users/{uid}").status_code == 200


# ---------- Checkout guards ----------
class TestCheckoutGuards:
    def test_non_cash_overpay_rejected(self, ger, products):
        o = _new_order(ger)
        try:
            ger.post(f"{API}/orders/{o['id']}/items", json={"product_id": _prod(products, "Café Expresso")["id"]})
            r = ger.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "cartao", "amount": 10}]})
            assert r.status_code == 400
            r = ger.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "pix", "amount": 3}, {"method": "cartao", "amount": 3}]})
            assert r.status_code == 400
            assert ger.get(f"{API}/orders/{o['id']}").json()["status"] == "aberta"
            # mixed: cartao 2 + dinheiro 5 -> change 3
            r = ger.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "cartao", "amount": 2}, {"method": "dinheiro", "amount": 5}]})
            assert r.status_code == 200
            pays = r.json()["payments"]
            assert next(p for p in pays if p["method"] == "dinheiro")["change"] == 3.0
        finally:
            ger.delete(f"{API}/orders/{o['id']}")  # marks cancelled only if still open semantics

    def test_fiado_no_partial_debt(self, ger, products):
        c1 = ger.post(f"{API}/customers", json={"name": "TEST_it2_f1", "credit_limit": 100}).json()
        c2 = ger.post(f"{API}/customers", json={"name": "TEST_it2_f2", "credit_limit": 5}).json()
        o = _new_order(ger)
        try:
            ger.post(f"{API}/orders/{o['id']}/items", json={"product_id": _prod(products, "Coxinha")["id"], "quantity": 2})
            r = ger.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [
                {"method": "fiado", "amount": 6, "customer_id": c1["id"]},
                {"method": "fiado", "amount": 7, "customer_id": c2["id"]}]})
            assert r.status_code == 400
            custs = {c["id"]: c for c in ger.get(f"{API}/customers", params={"q": "TEST_it2_f"}).json()}
            assert custs[c1["id"]]["debt_balance"] == 0
            assert custs[c2["id"]]["debt_balance"] == 0
            assert ger.get(f"{API}/customers/{c1['id']}/historico").json() == []
            # nonexistent customer -> 404, nothing written
            r = ger.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [
                {"method": "fiado", "amount": 6, "customer_id": c1["id"]},
                {"method": "fiado", "amount": 7, "customer_id": "nope"}]})
            assert r.status_code == 404
            assert ger.get(f"{API}/customers/{c1['id']}/historico").json() == []
        finally:
            ger.delete(f"{API}/orders/{o['id']}")
            ger.delete(f"{API}/customers/{c1['id']}")
            ger.delete(f"{API}/customers/{c2['id']}")


# ---------- Dashboard ----------
class TestDashboardTz:
    def test_trend_ends_local_today(self, ger):
        d = ger.get(f"{API}/dashboard").json()
        today = datetime.now(ZoneInfo("America/Sao_Paulo")).date().isoformat()
        assert d["trend_7dias"][-1]["date"] == today
        assert round(d["trend_7dias"][-1]["total"], 2) == round(d["faturamento_hoje"], 2)

    def test_mixed_cash_change_net(self, ger, products):
        before = ger.get(f"{API}/dashboard").json()["por_pagamento"]
        o = _new_order(ger)
        ger.post(f"{API}/orders/{o['id']}/items", json={"product_id": _prod(products, "Café Expresso")["id"]})
        r = ger.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "pix", "amount": 1}, {"method": "dinheiro", "amount": 10}]})
        assert r.status_code == 200
        after = ger.get(f"{API}/dashboard").json()["por_pagamento"]
        ger.delete(f"{API}/orders/{o['id']}")
        assert round(after.get("dinheiro", 0) - before.get("dinheiro", 0), 2) == 3.0
        assert round(after.get("pix", 0) - before.get("pix", 0), 2) == 1.0
