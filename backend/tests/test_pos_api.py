"""Padaria POS - backend regression tests (auth, roles, products, orders/checkout, fiado, encomendas, estoque, dashboard, users)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(payload):
    r = requests.post(f"{API}/auth/login", json=payload, timeout=20)
    return r


@pytest.fixture(scope="module")
def ger():
    r = _login({"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("gerente login failed")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def op():
    r = _login({"username": "caixa1", "password": "caixa123"})
    if r.status_code != 200:
        pytest.skip("operador login failed")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def products(ger):
    return ger.get(f"{API}/products").json()


def _prod(products, name):
    return next(p for p in products if p["name"] == name)


# ---------- Auth ----------
class TestAuth:
    def test_login_password_gerente(self):
        r = _login({"username": "admin", "password": "admin123"})
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "gerente" and isinstance(d["access_token"], str)

    def test_login_password_operador(self):
        r = _login({"username": "caixa1", "password": "caixa123"})
        assert r.status_code == 200 and r.json()["user"]["role"] == "operador"

    def test_login_pin(self):
        assert _login({"pin": "1234"}).json()["user"]["role"] == "gerente"
        assert _login({"pin": "5678"}).json()["user"]["role"] == "operador"

    def test_login_invalid(self):
        assert _login({"username": "admin", "password": "x"}).status_code == 401
        assert _login({"pin": "0000"}).status_code == 401
        assert _login({}).status_code == 400

    def test_me_requires_token(self, ger):
        assert requests.get(f"{API}/auth/me").status_code == 401
        assert ger.get(f"{API}/auth/me").json()["username"] == "admin"


# ---------- Roles ----------
class TestRoles:
    @pytest.mark.parametrize("method,path", [
        ("get", "/users"), ("get", "/dashboard"), ("get", "/products/all"),
        ("post", "/products"), ("post", "/estoque"), ("delete", "/orders/xyz"),
    ])
    def test_operador_forbidden(self, op, method, path):
        r = getattr(op, method)(f"{API}{path}", json={})
        assert r.status_code == 403, f"{method} {path} -> {r.status_code}"

    def test_operador_allowed(self, op):
        for p in ["/products", "/categories", "/customers", "/orders", "/encomendas", "/estoque"]:
            assert op.get(f"{API}{p}").status_code == 200, p


# ---------- Cardapio ----------
class TestProducts:
    def test_product_crud(self, ger):
        cats = ger.get(f"{API}/categories").json()
        payload = {"name": "TEST_Prod", "category_id": cats[0]["id"], "base_price": 10.0,
                   "variations": [{"name": "Tamanho", "type": "single", "required": True,
                                   "options": [{"label": "P", "price_delta": 0}, {"label": "G", "price_delta": 5}]}]}
        r = ger.post(f"{API}/products", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        try:
            all_p = ger.get(f"{API}/products/all").json()
            got = next(p for p in all_p if p["id"] == pid)
            assert got["variations"][0]["options"][1]["price_delta"] == 5
            payload["name"] = "TEST_Prod2"
            r = ger.patch(f"{API}/products/{pid}", json=payload)
            assert r.status_code == 200 and r.json()["name"] == "TEST_Prod2"
        finally:
            assert ger.delete(f"{API}/products/{pid}").status_code == 200
        assert not any(p["id"] == pid for p in ger.get(f"{API}/products/all").json())


# ---------- Orders / Checkout ----------
class TestOrders:
    def test_comanda_flow_dinheiro_change(self, op, products):
        o = op.post(f"{API}/orders", json={"table_label": "TEST_Mesa 99"}).json()
        oid = o["id"]
        pao = _prod(products, "Pão de Queijo")
        r = op.post(f"{API}/orders/{oid}/items", json={"product_id": pao["id"], "quantity": 2})
        assert r.status_code == 200 and r.json()["total"] == 7.0
        xb = _prod(products, "X-Burger")
        r = op.post(f"{API}/orders/{oid}/items", json={"product_id": xb["id"], "quantity": 1,
                                                        "variations_data": {"Extras": ["Bacon", "Ovo"]}})
        assert r.json()["total"] == 7.0 + 24.5
        # remove first item
        item_id = r.json()["items"][0]["id"]
        r = op.delete(f"{API}/orders/{oid}/items/{item_id}")
        assert r.json()["total"] == 24.5
        # insufficient
        assert op.post(f"{API}/orders/{oid}/checkout", json={"payments": [{"method": "dinheiro", "amount": 10}]}).status_code == 400
        r = op.post(f"{API}/orders/{oid}/checkout", json={"payments": [{"method": "dinheiro", "amount": 50}]})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "fechada" and d["payments"][0]["change"] == 25.5
        # closed comanda cannot be edited
        assert op.post(f"{API}/orders/{oid}/items", json={"product_id": pao["id"]}).status_code == 400

    def test_pizza_half_half(self, op, products):
        pz = _prod(products, "Pizza Grande")
        o = op.post(f"{API}/orders", json={"table_label": "TEST_Balcao"}).json()
        r = op.post(f"{API}/orders/{o['id']}/items", json={"product_id": pz["id"], "pizza_halves": []})
        assert r.status_code == 400
        r = op.post(f"{API}/orders/{o['id']}/items", json={"product_id": pz["id"], "pizza_halves": ["Calabresa", "Mussarela"]})
        assert r.status_code == 200
        it = r.json()["items"][0]
        assert it["pizza_halves"] == ["Calabresa", "Mussarela"] and it["total_price"] == 55.0
        r = op.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "cartao", "amount": 30}, {"method": "pix", "amount": 25}]})
        assert r.status_code == 200 and r.json()["status"] == "fechada"

    def test_required_variation(self, op, products):
        pastel = _prod(products, "Pastel")
        o = op.post(f"{API}/orders", json={"table_label": "TEST_Balcao"}).json()
        assert op.post(f"{API}/orders/{o['id']}/items", json={"product_id": pastel["id"]}).status_code == 400

    def test_fiado_checkout(self, op, ger, products):
        c = op.post(f"{API}/customers", json={"name": "TEST_Cliente Fiado", "credit_limit": 100}).json()
        try:
            o = op.post(f"{API}/orders", json={"table_label": "TEST_Balcao"}).json()
            op.post(f"{API}/orders/{o['id']}/items", json={"product_id": _prod(products, "Coxinha")["id"], "quantity": 2})
            r = op.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "fiado", "amount": 13}]})
            assert r.status_code == 400  # no customer
            r = op.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "fiado", "amount": 13, "customer_id": c["id"]}]})
            assert r.status_code == 200
            cust = next(x for x in op.get(f"{API}/customers", params={"q": "TEST_Cliente"}).json() if x["id"] == c["id"])
            assert cust["debt_balance"] == 13
            r = op.post(f"{API}/customers/{c['id']}/pagamento", json={"customer_id": c["id"], "amount": 5, "method": "pix"})
            assert r.json()["debt_balance"] == 8
            hist = op.get(f"{API}/customers/{c['id']}/historico").json()
            assert {h["type"] for h in hist} == {"venda", "pagamento"}
            # limit exceeded
            o2 = op.post(f"{API}/orders", json={"table_label": "TEST_Balcao"}).json()
            op.post(f"{API}/orders/{o2['id']}/items", json={"product_id": _prod(products, "Pizza Grande")["id"], "pizza_halves": ["Atum"], "quantity": 2})
            r = op.post(f"{API}/orders/{o2['id']}/checkout", json={"payments": [{"method": "fiado", "amount": 110, "customer_id": c["id"]}]})
            assert r.status_code == 400
        finally:
            op.post(f"{API}/customers/{c['id']}/pagamento", json={"customer_id": c["id"], "amount": 1000})
            assert ger.delete(f"{API}/customers/{c['id']}").status_code == 200

    def test_customer_search_regex_special_chars(self, op):
        r = op.get(f"{API}/customers", params={"q": "("})
        assert r.status_code == 200, f"regex special char crash: {r.status_code}"

    def test_negative_payment_amount_rejected(self, op):
        c = op.post(f"{API}/customers", json={"name": "TEST_Neg"}).json()
        r = op.post(f"{API}/customers/{c['id']}/pagamento", json={"customer_id": c["id"], "amount": -50})
        bal = r.json().get("debt_balance") if r.status_code == 200 else None
        # cleanup
        op.post(f"{API}/customers/{c['id']}/pagamento", json={"customer_id": c["id"], "amount": 1000})
        requests.delete(f"{API}/customers/{c['id']}", headers={"Authorization": _login({"username": "admin", "password": "admin123"}).json() and f"Bearer {_login({'username': 'admin', 'password': 'admin123'}).json()['access_token']}"})
        assert r.status_code in (400, 422), f"negative payment accepted; balance became {bal}"


# ---------- Encomendas ----------
class TestEncomendas:
    def test_encomenda_flow(self, op, products):
        payload = {"customer_name": "TEST_Enc", "delivery_date": "2026-12-31",
                   "items": [{"product_id": _prod(products, "Bolo de Fubá")["id"], "quantity": 1,
                              "variations_data": {"Tamanho": "Bolo inteiro"}}], "deposit": 10}
        r = op.post(f"{API}/encomendas", json=payload)
        assert r.status_code == 200
        e = r.json()
        try:
            assert e["total"] == 30.5 and e["status"] == "pendente"
            r = op.patch(f"{API}/encomendas/{e['id']}", json={"status": "pronta"})
            assert r.json()["status"] == "pronta"
            assert any(x["id"] == e["id"] and x["status"] == "pronta" for x in op.get(f"{API}/encomendas").json())
        finally:
            op.delete(f"{API}/encomendas/{e['id']}")


# ---------- Estoque ----------
class TestEstoque:
    def test_estoque_flow(self, ger, op):
        r = ger.post(f"{API}/estoque", json={"name": "TEST_Insumo", "unit": "kg", "quantity": 5, "min_quantity": 3})
        assert r.status_code == 200
        iid = r.json()["id"]
        try:
            r = op.post(f"{API}/estoque/movimento", json={"item_id": iid, "type": "entrada", "quantity": 2})
            assert r.json()["new_quantity"] == 7
            r = op.post(f"{API}/estoque/movimento", json={"item_id": iid, "type": "saida", "quantity": 5})
            assert r.json()["new_quantity"] == 2
            assert any(a["id"] == iid for a in op.get(f"{API}/estoque/alertas").json())
            movs = op.get(f"{API}/estoque/movimentos", params={"item_id": iid}).json()
            assert len(movs) == 2
        finally:
            ger.delete(f"{API}/estoque/{iid}")


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard(self, ger):
        d = ger.get(f"{API}/dashboard").json()
        for k in ["faturamento_hoje", "vendas_hoje", "por_pagamento", "trend_7dias", "alertas_estoque"]:
            assert k in d
        assert len(d["trend_7dias"]) == 7

    def test_dashboard_cash_excludes_change(self, ger, op, products):
        before = ger.get(f"{API}/dashboard").json()
        o = op.post(f"{API}/orders", json={"table_label": "TEST_Balcao"}).json()
        op.post(f"{API}/orders/{o['id']}/items", json={"product_id": _prod(products, "Café Expresso")["id"]})
        op.post(f"{API}/orders/{o['id']}/checkout", json={"payments": [{"method": "dinheiro", "amount": 10}]})
        after = ger.get(f"{API}/dashboard").json()
        diff_fat = after["faturamento_hoje"] - before["faturamento_hoje"]
        diff_cash = after["por_pagamento"].get("dinheiro", 0) - before["por_pagamento"].get("dinheiro", 0)
        assert round(diff_fat, 2) == 4.0
        assert round(diff_cash, 2) == 4.0, f"dinheiro increased by {diff_cash} (includes troco)"


# ---------- Usuarios ----------
class TestUsers:
    def test_user_crud(self, ger):
        uname = f"test_{uuid.uuid4().hex[:6]}"
        r = ger.post(f"{API}/users", json={"username": uname, "name": "TEST_User", "role": "operador", "password": "x1234", "pin": "9911"})
        assert r.status_code == 200
        uid = r.json()["id"]
        try:
            assert ger.post(f"{API}/users", json={"username": uname, "name": "d", "role": "operador", "password": "x"}).status_code == 400
            r = ger.patch(f"{API}/users/{uid}", json={"name": "TEST_User2", "role": "gerente"})
            assert r.json()["name"] == "TEST_User2" and r.json()["role"] == "gerente"
            assert _login({"username": uname, "password": "x1234"}).status_code == 200
        finally:
            assert ger.delete(f"{API}/users/{uid}").status_code == 200
        assert not any(u["id"] == uid for u in ger.get(f"{API}/users").json())

    def test_duplicate_pin_rejected(self, ger):
        uname = f"test_{uuid.uuid4().hex[:6]}"
        r = ger.post(f"{API}/users", json={"username": uname, "name": "TEST_Dup", "role": "operador", "password": "x", "pin": "1234"})
        if r.status_code == 200:
            ger.delete(f"{API}/users/{r.json()['id']}")
        assert r.status_code == 400, "duplicate PIN 1234 accepted -> PIN login ambiguous"
