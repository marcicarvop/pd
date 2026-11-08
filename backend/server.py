"""Sistema POS Padaria & Lanchonete - FastAPI Backend."""
import asyncio
import logging
import os
import re
import uuid
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, List, Optional
from zoneinfo import ZoneInfo

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
APP_TZ = ZoneInfo(os.environ["APP_TZ"])
JWT_ALGO = "HS256"
JWT_EXPIRE_HOURS = 12

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

app = FastAPI(title="Padaria & Lanchonete POS")
api = APIRouter(prefix="/api")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ============================================================
# Utilities
# ============================================================
def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def local_today():
    return datetime.now(APP_TZ).date()


def local_date(iso: Optional[str]) -> str:
    if not iso:
        return ""
    return datetime.fromisoformat(iso).astimezone(APP_TZ).date().isoformat()


def validate_pin(pin: Optional[str]):
    if pin and not re.fullmatch(r"\d{4}", pin):
        raise HTTPException(400, "PIN deve ter 4 dígitos")


async def ensure_pin_unique(pin: Optional[str], exclude_uid: Optional[str] = None):
    if not pin:
        return
    async for u in db.users.find({"pin_hash": {"$ne": None}}, {"id": 1, "pin_hash": 1}):
        if u["id"] != exclude_uid and check_password(pin, u["pin_hash"]):
            raise HTTPException(400, "PIN já está em uso por outro usuário")


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def check_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


# ============================================================
# Models
# ============================================================
class LoginRequest(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    pin: Optional[str] = None


class UserCreate(BaseModel):
    username: str
    name: str
    role: str  # 'gerente' | 'operador'
    password: str
    pin: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    pin: Optional[str] = None


class UserOut(BaseModel):
    id: str
    username: str
    name: str
    role: str
    has_pin: bool
    email: Optional[str] = None


class Category(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    icon: Optional[str] = None


class VariationOption(BaseModel):
    label: str
    price_delta: float = 0.0


class ProductVariation(BaseModel):
    name: str  # ex: "Tamanho", "Ingredientes"
    type: str  # 'single' | 'multiple'
    required: bool = False
    options: List[VariationOption] = []


class RecipeItem(BaseModel):
    insumo_id: str
    insumo_name: str = ""
    quantity: float = Field(gt=0)
    unit: str = "un"


class Product(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    category_id: str
    base_price: float
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_pizza: bool = False
    pizza_flavors: List[str] = []  # names of available flavors if is_pizza
    pizza_pricing: str = "maior"  # 'maior' or 'media'
    variations: List[ProductVariation] = []
    active: bool = True
    tracks_stock: bool = False
    stock_item_id: Optional[str] = None  # link to estoque item
    stock_usage: float = 1.0  # units consumed per sale
    # Ficha técnica
    production_mode: str = "none"  # 'revenda' | 'pronto' | 'none'
    pronto_item_id: Optional[str] = None  # non-pizza prontos
    recipe: List[RecipeItem] = []
    base_recipe: List[RecipeItem] = []  # pizza: massa/molho comuns
    recipe_by_flavor: dict = {}  # pizza: {flavor: [RecipeItem]}
    margin_pct: float = 100.0
    cost_override: Optional[float] = None


class ProductIn(BaseModel):
    name: str
    category_id: str
    base_price: float
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_pizza: bool = False
    pizza_flavors: List[str] = []
    pizza_pricing: str = "maior"
    variations: List[ProductVariation] = []
    active: bool = True
    tracks_stock: bool = False
    stock_item_id: Optional[str] = None
    stock_usage: float = 1.0
    production_mode: str = "none"
    pronto_item_id: Optional[str] = None
    recipe: List[RecipeItem] = []
    base_recipe: List[RecipeItem] = []
    recipe_by_flavor: dict = {}
    margin_pct: float = 100.0
    cost_override: Optional[float] = None


class Customer(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    phone: Optional[str] = None
    cpf: Optional[str] = None
    credit_limit: float = 0.0
    debt_balance: float = 0.0
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class CustomerIn(BaseModel):
    name: str
    phone: Optional[str] = None
    cpf: Optional[str] = None
    credit_limit: float = 0.0
    notes: Optional[str] = None


class OrderItem(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    product_name: str
    quantity: float = 1
    unit_price: float
    total_price: float
    variations_text: Optional[str] = None  # human readable
    variations_data: dict = {}
    pizza_halves: List[str] = []  # flavor names
    notes: Optional[str] = None


class OrderItemIn(BaseModel):
    product_id: str
    quantity: float = Field(default=1, gt=0)
    variations_data: dict = {}
    pizza_halves: List[str] = []
    notes: Optional[str] = None


class Payment(BaseModel):
    method: str  # 'dinheiro' | 'cartao' | 'pix' | 'fiado'
    amount: float = Field(gt=0)
    change: float = 0.0
    customer_id: Optional[str] = None  # required for fiado


class Order(BaseModel):
    id: str = Field(default_factory=new_id)
    number: int
    table_label: str  # Mesa 5 / Balcão / Entrega
    status: str = "aberta"  # aberta | em_producao | pronta | aguardando_pagamento | fechada | cancelada
    items: List[OrderItem] = []
    subtotal: float = 0.0
    discount: float = 0.0
    total: float = 0.0
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    payments: List[Payment] = []
    operator_id: str
    operator_name: str
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    closed_at: Optional[str] = None


class OrderCreate(BaseModel):
    table_label: str
    customer_id: Optional[str] = None
    notes: Optional[str] = None


class OrderUpdate(BaseModel):
    status: Optional[str] = None
    discount: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None
    table_label: Optional[str] = None
    customer_id: Optional[str] = None


class CheckoutRequest(BaseModel):
    payments: List[Payment]
    discount: float = Field(default=0.0, ge=0)


class Encomenda(BaseModel):
    id: str = Field(default_factory=new_id)
    customer_name: str
    customer_phone: Optional[str] = None
    customer_id: Optional[str] = None
    delivery_date: str  # ISO date
    delivery_time: Optional[str] = None
    items: List[OrderItem] = []
    total: float = 0.0
    deposit: float = 0.0
    status: str = "pendente"  # pendente | em_producao | pronta | entregue | cancelada
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class EncomendaIn(BaseModel):
    customer_name: str = Field(min_length=1)
    customer_phone: Optional[str] = None
    customer_id: Optional[str] = None
    delivery_date: str
    delivery_time: Optional[str] = None
    items: List[OrderItemIn] = []
    deposit: float = Field(default=0.0, ge=0)
    notes: Optional[str] = None


class EncomendaUpdate(BaseModel):
    status: Optional[str] = None
    deposit: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None
    delivery_date: Optional[str] = None
    delivery_time: Optional[str] = None


ENCOMENDA_STATUSES = {"pendente", "em_producao", "pronta", "entregue", "cancelada"}
ORDER_EDITABLE_STATUSES = {"aberta", "em_producao", "pronta", "aguardando_pagamento"}


class EstoqueItem(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    unit: str = "un"  # un | kg | g | l | ml
    quantity: float = 0.0
    min_quantity: float = 0.0
    cost_price: float = 0.0
    supplier: Optional[str] = None
    notes: Optional[str] = None
    type: str = "revenda"  # 'revenda' | 'insumo' | 'pronto'
    product_id: Optional[str] = None  # when type='pronto'
    flavor: Optional[str] = None  # pizza prontos


class EstoqueItemIn(BaseModel):
    name: str
    unit: str = "un"
    quantity: float = 0.0
    min_quantity: float = 0.0
    cost_price: float = 0.0
    supplier: Optional[str] = None
    notes: Optional[str] = None
    type: str = "revenda"


class EstoqueMovimento(BaseModel):
    id: str = Field(default_factory=new_id)
    item_id: str
    item_name: str
    type: str  # 'entrada' | 'saida' | 'ajuste'
    quantity: float
    reason: Optional[str] = None
    user_name: str
    date: str = Field(default_factory=now_iso)


class EstoqueMovimentoIn(BaseModel):
    item_id: str
    type: str
    quantity: float = Field(gt=0)
    reason: Optional[str] = None


class FiadoPayment(BaseModel):
    customer_id: str
    amount: float = Field(gt=0)
    method: str = "dinheiro"  # dinheiro | cartao | pix
    note: Optional[str] = None


# ============================================================
# Auth deps
# ============================================================
async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    return user


def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Acesso restrito")
        return user
    return dep


require_gerente = require_role("gerente")
require_any = require_role("gerente", "operador")


# ============================================================
# Indexes & Seed
# ============================================================
INDEXES = {
    "users": [IndexModel([("id", ASCENDING)], unique=True, name="id"),
              IndexModel([("username", ASCENDING)], unique=True, name="username")],
    "products": [IndexModel([("id", ASCENDING)], unique=True, name="id")],
    "categories": [IndexModel([("id", ASCENDING)], unique=True, name="id")],
    "customers": [IndexModel([("id", ASCENDING)], unique=True, name="id")],
    "orders": [IndexModel([("id", ASCENDING)], unique=True, name="id"),
               IndexModel([("number", DESCENDING)], name="number"),
               IndexModel([("status", ASCENDING)], name="status"),
               IndexModel([("created_at", DESCENDING)], name="created_at")],
    "encomendas": [IndexModel([("id", ASCENDING)], unique=True, name="id"),
                   IndexModel([("delivery_date", ASCENDING)], name="delivery_date")],
    "estoque_items": [IndexModel([("id", ASCENDING)], unique=True, name="id"),
                       IndexModel([("type", ASCENDING)], name="type")],
    "estoque_mov": [IndexModel([("id", ASCENDING)], unique=True, name="id"),
                    IndexModel([("date", DESCENDING)], name="date")],
    "production_batches": [IndexModel([("id", ASCENDING)], unique=True, name="id"),
                           IndexModel([("estoque_item_id", ASCENDING)], name="estoque_item_id"),
                           IndexModel([("produced_at", ASCENDING)], name="produced_at")],
    "fiado_mov": [IndexModel([("customer_id", ASCENDING)], name="customer"),
                  IndexModel([("date", DESCENDING)], name="date")],
}


async def ensure_indexes():
    for col, idxs in INDEXES.items():
        for idx in idxs:
            try:
                await db[col].create_indexes([idx])
            except Exception as e:
                logger.warning("index %s.%s: %s", col, idx.document["name"], e)


async def seed_initial_data():
    """Seed sample data if DB is empty."""
    if await db.users.count_documents({}) > 0:
        return

    logger.info("Seeding initial data...")

    # Users
    admin = {
        "id": new_id(),
        "username": "admin",
        "name": "Gerente Principal",
        "email": "smardigo@gmail.com",
        "role": "gerente",
        "password_hash": hash_password("admin123"),
        "pin_hash": hash_password("1234"),
        "created_at": now_iso(),
    }
    caixa = {
        "id": new_id(),
        "username": "caixa1",
        "name": "Maria (Operadora)",
        "role": "operador",
        "password_hash": hash_password("caixa123"),
        "pin_hash": hash_password("5678"),
        "created_at": now_iso(),
    }
    await db.users.insert_many([admin, caixa])

    # Categories
    cats_data = [
        ("Padaria", "croissant"),
        ("Salgados", "drumstick"),
        ("Lanches", "sandwich"),
        ("Pizzas", "pizza"),
        ("Bebidas", "coffee"),
        ("Doces", "cake"),
    ]
    cats = [{"id": new_id(), "name": n, "icon": i} for n, i in cats_data]
    await db.categories.insert_many(cats)
    cat_id = {c["name"]: c["id"] for c in cats}

    # Estoque
    estoque = [
        {"id": new_id(), "name": "Farinha de trigo", "unit": "kg", "quantity": 25.0, "min_quantity": 10.0, "cost_price": 4.5, "supplier": "Moinho Central"},
        {"id": new_id(), "name": "Queijo mussarela", "unit": "kg", "quantity": 8.0, "min_quantity": 3.0, "cost_price": 38.0, "supplier": "Laticínios Vale"},
        {"id": new_id(), "name": "Presunto cozido", "unit": "kg", "quantity": 4.0, "min_quantity": 2.0, "cost_price": 28.0, "supplier": "Frigorífico"},
        {"id": new_id(), "name": "Café em grãos", "unit": "kg", "quantity": 5.0, "min_quantity": 2.0, "cost_price": 45.0, "supplier": "Café do Vale"},
        {"id": new_id(), "name": "Açúcar refinado", "unit": "kg", "quantity": 15.0, "min_quantity": 5.0, "cost_price": 3.8, "supplier": "União"},
        {"id": new_id(), "name": "Leite integral", "unit": "l", "quantity": 20.0, "min_quantity": 10.0, "cost_price": 5.2, "supplier": "Laticínios Vale"},
        {"id": new_id(), "name": "Refrigerante lata", "unit": "un", "quantity": 48.0, "min_quantity": 24.0, "cost_price": 3.5, "supplier": "Distribuidora"},
        {"id": new_id(), "name": "Calabresa", "unit": "kg", "quantity": 1.5, "min_quantity": 2.0, "cost_price": 32.0, "supplier": "Frigorífico"},
        {"id": new_id(), "name": "Molho de tomate", "unit": "kg", "quantity": 6.0, "min_quantity": 3.0, "cost_price": 8.0, "supplier": "Conservas Boa"},
    ]
    await db.estoque_items.insert_many(estoque)

    # Products
    produtos = [
        {"name": "Pão Francês", "category_id": cat_id["Padaria"], "base_price": 0.75, "description": "Unidade fresquinha",
         "image_url": "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=400"},
        {"name": "Pão de Queijo", "category_id": cat_id["Padaria"], "base_price": 3.50, "description": "Mineiro tradicional",
         "image_url": "https://images.unsplash.com/photo-1623334044303-241021148842?w=400"},
        {"name": "Croissant", "category_id": cat_id["Padaria"], "base_price": 7.00, "description": "Manteiga francesa",
         "image_url": "https://images.unsplash.com/photo-1530610476181-d83430b64dcd?w=400"},
        {"name": "Bolo de Fubá", "category_id": cat_id["Doces"], "base_price": 5.50, "description": "Fatia caseira",
         "variations": [{"name": "Tamanho", "type": "single", "required": True,
                        "options": [{"label": "Fatia", "price_delta": 0}, {"label": "Bolo inteiro", "price_delta": 25.0}]}]},
        {"name": "Brigadeiro Gourmet", "category_id": cat_id["Doces"], "base_price": 4.00, "description": "Unidade"},
        {"name": "Coxinha", "category_id": cat_id["Salgados"], "base_price": 6.50, "description": "Frango cremoso",
         "image_url": "https://images.unsplash.com/photo-1626200419199-391ae4be7a41?w=400"},
        {"name": "Pastel", "category_id": cat_id["Salgados"], "base_price": 8.00, "description": "Recheios variados",
         "variations": [{"name": "Recheio", "type": "single", "required": True,
                        "options": [{"label": "Carne", "price_delta": 0}, {"label": "Queijo", "price_delta": 0},
                                    {"label": "Palmito", "price_delta": 1.0}, {"label": "Frango c/ catupiry", "price_delta": 1.5}]}]},
        {"name": "Empada", "category_id": cat_id["Salgados"], "base_price": 7.00},
        {"name": "Café Expresso", "category_id": cat_id["Bebidas"], "base_price": 4.00, "description": "Grãos selecionados"},
        {"name": "Pingado", "category_id": cat_id["Bebidas"], "base_price": 5.50, "description": "Café com leite"},
        {"name": "Suco Natural", "category_id": cat_id["Bebidas"], "base_price": 9.00,
         "variations": [{"name": "Sabor", "type": "single", "required": True,
                        "options": [{"label": "Laranja", "price_delta": 0}, {"label": "Abacaxi", "price_delta": 0},
                                    {"label": "Maracujá", "price_delta": 1.0}, {"label": "Morango", "price_delta": 2.0}]},
                       {"name": "Tamanho", "type": "single", "required": True,
                        "options": [{"label": "300ml", "price_delta": 0}, {"label": "500ml", "price_delta": 4.0}]}]},
        {"name": "Refrigerante Lata", "category_id": cat_id["Bebidas"], "base_price": 6.00},
        {"name": "X-Burger", "category_id": cat_id["Lanches"], "base_price": 18.00, "description": "Pão, carne, queijo, salada",
         "image_url": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400",
         "variations": [{"name": "Extras", "type": "multiple", "required": False,
                        "options": [{"label": "Bacon", "price_delta": 4.0}, {"label": "Ovo", "price_delta": 2.5},
                                    {"label": "Catupiry", "price_delta": 3.0}, {"label": "Cheddar", "price_delta": 3.0}]}]},
        {"name": "Misto Quente", "category_id": cat_id["Lanches"], "base_price": 12.00, "description": "Pão francês com presunto e queijo"},
        {"name": "Pizza Grande", "category_id": cat_id["Pizzas"], "base_price": 55.00, "description": "8 fatias - personalize sabores",
         "image_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400",
         "is_pizza": True, "pizza_pricing": "maior",
         "pizza_flavors": ["Calabresa", "Mussarela", "Quatro Queijos", "Margherita", "Portuguesa",
                           "Frango c/ Catupiry", "Pepperoni", "Atum", "Vegetariana", "Chocolate"]},
        {"name": "Pizza Média", "category_id": cat_id["Pizzas"], "base_price": 42.00, "description": "6 fatias - personalize sabores",
         "is_pizza": True, "pizza_pricing": "maior",
         "pizza_flavors": ["Calabresa", "Mussarela", "Quatro Queijos", "Margherita", "Portuguesa",
                           "Frango c/ Catupiry", "Pepperoni", "Vegetariana"]},
    ]
    for p in produtos:
        p["id"] = new_id()
        p.setdefault("variations", [])
        p.setdefault("is_pizza", False)
        p.setdefault("pizza_flavors", [])
        p.setdefault("pizza_pricing", "maior")
        p.setdefault("active", True)
        p.setdefault("tracks_stock", False)
    await db.products.insert_many(produtos)

    # Customers
    clientes = [
        {"id": new_id(), "name": "João da Silva", "phone": "(11) 98765-4321", "cpf": "111.222.333-44",
         "credit_limit": 200.0, "debt_balance": 45.50, "created_at": now_iso()},
        {"id": new_id(), "name": "Maria Oliveira", "phone": "(11) 91234-5678", "cpf": "222.333.444-55",
         "credit_limit": 150.0, "debt_balance": 0.0, "created_at": now_iso()},
        {"id": new_id(), "name": "Carlos Souza", "phone": "(11) 99876-5432",
         "credit_limit": 300.0, "debt_balance": 112.00, "created_at": now_iso()},
        {"id": new_id(), "name": "Ana Paula", "phone": "(11) 98111-2233",
         "credit_limit": 100.0, "debt_balance": 28.00, "created_at": now_iso()},
    ]
    await db.customers.insert_many(clientes)

    # Counter
    await db.counters.insert_one({"_id": "order_number", "seq": 100})

    logger.info("Seed concluído.")


# ============================================================
# Auth routes
# ============================================================
@api.post("/auth/login")
async def login(req: LoginRequest):
    user = None
    if req.pin:
        # Match any user by trying pin against each (small user base)
        users = await db.users.find({}).to_list(100)
        for u in users:
            if u.get("pin_hash") and check_password(req.pin, u["pin_hash"]):
                user = u
                break
        if not user:
            raise HTTPException(status_code=401, detail="PIN inválido")
    elif req.username and req.password:
        user = await db.users.find_one({"username": req.username})
        if not user or not check_password(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")
    else:
        raise HTTPException(status_code=400, detail="Forneça usuário/senha ou PIN")

    token = make_token(user["id"], user["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "name": user["name"],
            "role": user["role"],
            "has_pin": bool(user.get("pin_hash")),
        },
    }


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "username": user["username"],
        "name": user["name"],
        "role": user["role"],
        "has_pin": bool(user.get("pin_hash")),
    }


# ============================================================
# Users (gerente)
# ============================================================
@api.get("/users", response_model=List[UserOut])
async def list_users(_: dict = Depends(require_gerente)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return [{"id": u["id"], "username": u["username"], "name": u["name"], "role": u["role"],
             "has_pin": bool(u.get("pin_hash")), "email": u.get("email")} for u in users]


@api.post("/users", response_model=UserOut)
async def create_user(u: UserCreate, _: dict = Depends(require_gerente)):
    if u.role not in ("gerente", "operador"):
        raise HTTPException(400, "Perfil inválido")
    if await db.users.find_one({"username": u.username}):
        raise HTTPException(400, "Usuário já existe")
    validate_pin(u.pin)
    await ensure_pin_unique(u.pin)
    doc = {
        "id": new_id(),
        "username": u.username,
        "name": u.name,
        "role": u.role,
        "password_hash": hash_password(u.password),
        "pin_hash": hash_password(u.pin) if u.pin else None,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    return {"id": doc["id"], "username": doc["username"], "name": doc["name"], "role": doc["role"],
            "has_pin": bool(doc.get("pin_hash"))}


@api.patch("/users/{uid}", response_model=UserOut)
async def update_user(uid: str, u: UserUpdate, _: dict = Depends(require_gerente)):
    upd = {}
    if u.name is not None:
        upd["name"] = u.name
    if u.role is not None:
        if u.role not in ("gerente", "operador"):
            raise HTTPException(400, "Perfil inválido")
        upd["role"] = u.role
    if u.password:
        upd["password_hash"] = hash_password(u.password)
    if u.pin is not None:
        validate_pin(u.pin)
        await ensure_pin_unique(u.pin, uid)
        upd["pin_hash"] = hash_password(u.pin) if u.pin else None
    if upd:
        await db.users.update_one({"id": uid}, {"$set": upd})
    doc = await db.users.find_one({"id": uid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Não encontrado")
    return {"id": doc["id"], "username": doc["username"], "name": doc["name"], "role": doc["role"],
            "has_pin": bool(doc.get("pin_hash"))}


@api.delete("/users/{uid}")
async def delete_user(uid: str, me: dict = Depends(require_gerente)):
    if uid == me["id"]:
        raise HTTPException(400, "Não pode excluir a si mesmo")
    gerentes = await db.users.count_documents({"role": "gerente"})
    target = await db.users.find_one({"id": uid})
    if target and target["role"] == "gerente" and gerentes <= 1:
        raise HTTPException(400, "Mantenha ao menos um gerente")
    await db.users.delete_one({"id": uid})
    return {"ok": True}


# ============================================================
# Categories
# ============================================================
@api.get("/categories")
async def list_categories(_: dict = Depends(require_any)):
    return await db.categories.find({}, {"_id": 0}).to_list(100)


@api.post("/categories")
async def create_category(c: Category, _: dict = Depends(require_gerente)):
    doc = c.model_dump()
    await db.categories.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.delete("/categories/{cid}")
async def delete_category(cid: str, _: dict = Depends(require_gerente)):
    if await db.products.count_documents({"category_id": cid}) > 0:
        raise HTTPException(400, "Categoria em uso por produtos")
    await db.categories.delete_one({"id": cid})
    return {"ok": True}


# ============================================================
# Products
# ============================================================
@api.get("/products")
async def list_products(category_id: Optional[str] = None, _: dict = Depends(require_any)):
    q = {"active": True}
    if category_id:
        q["category_id"] = category_id
    return await db.products.find(q, {"_id": 0}).to_list(1000)


@api.get("/products/all")
async def list_all_products(_: dict = Depends(require_gerente)):
    return await db.products.find({}, {"_id": 0}).to_list(1000)


@api.post("/products")
async def create_product(p: ProductIn, _: dict = Depends(require_gerente)):
    doc = Product(**p.model_dump()).model_dump()
    await db.products.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.patch("/products/{pid}")
async def update_product(pid: str, p: ProductIn, _: dict = Depends(require_gerente)):
    upd = p.model_dump()
    await db.products.update_one({"id": pid}, {"$set": upd})
    doc = await db.products.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Produto não encontrado")
    return doc


@api.delete("/products/{pid}")
async def delete_product(pid: str, _: dict = Depends(require_gerente)):
    res = await db.products.delete_one({"id": pid})
    if not res.deleted_count:
        raise HTTPException(404, "Produto não encontrado")
    # Cascade: remove linked pronto items and their batches
    pronto_items = [p["id"] async for p in db.estoque_items.find({"type": "pronto", "product_id": pid}, {"id": 1})]
    if pronto_items:
        await db.estoque_items.delete_many({"id": {"$in": pronto_items}})
    await db.production_batches.delete_many({"product_id": pid})
    return {"ok": True}


# ============================================================
# Customers
# ============================================================
@api.get("/customers")
async def list_customers(q: Optional[str] = None, _: dict = Depends(require_any)):
    query = {}
    if q:
        rq = re.escape(q)
        query = {"$or": [{"name": {"$regex": rq, "$options": "i"}},
                         {"phone": {"$regex": rq, "$options": "i"}},
                         {"cpf": {"$regex": rq, "$options": "i"}}]}
    return await db.customers.find(query, {"_id": 0}).sort("name", 1).to_list(500)


@api.post("/customers")
async def create_customer(c: CustomerIn, _: dict = Depends(require_any)):
    doc = Customer(**c.model_dump()).model_dump()
    await db.customers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.patch("/customers/{cid}")
async def update_customer(cid: str, c: CustomerIn, _: dict = Depends(require_any)):
    await db.customers.update_one({"id": cid}, {"$set": c.model_dump()})
    doc = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Cliente não encontrado")
    return doc


@api.delete("/customers/{cid}")
async def delete_customer(cid: str, _: dict = Depends(require_gerente)):
    c = await db.customers.find_one({"id": cid})
    if c and c.get("debt_balance", 0) > 0:
        raise HTTPException(400, "Cliente possui saldo devedor")
    await db.customers.delete_one({"id": cid})
    return {"ok": True}


@api.get("/customers/{cid}/historico")
async def customer_history(cid: str, _: dict = Depends(require_any)):
    movs = await db.fiado_mov.find({"customer_id": cid}, {"_id": 0}).sort("date", -1).to_list(500)
    return movs


@api.post("/customers/{cid}/pagamento")
async def pay_debt(cid: str, p: FiadoPayment, user: dict = Depends(require_any)):
    customer = await db.customers.find_one({"id": cid})
    if not customer:
        raise HTTPException(404, "Cliente não encontrado")
    new_balance = max(0.0, customer.get("debt_balance", 0) - p.amount)
    await db.customers.update_one({"id": cid}, {"$set": {"debt_balance": new_balance}})
    mov = {
        "id": new_id(),
        "customer_id": cid,
        "customer_name": customer["name"],
        "type": "pagamento",
        "amount": p.amount,
        "method": p.method,
        "note": p.note,
        "user_name": user["name"],
        "date": now_iso(),
    }
    await db.fiado_mov.insert_one(mov)
    return {"ok": True, "debt_balance": new_balance}


# ============================================================
# Orders / Comandas
# ============================================================
async def next_order_number() -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": "order_number"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return doc["seq"] if doc else 1


def _format_variations(product: dict, variations_data: dict) -> tuple[float, str]:
    """Return (price_delta, text)."""
    delta = 0.0
    parts = []
    for v in product.get("variations", []):
        name = v["name"]
        sel = variations_data.get(name)
        if not sel:
            if v.get("required"):
                raise HTTPException(400, f"Selecione {name}")
            continue
        if v["type"] == "single":
            opt = next((o for o in v["options"] if o["label"] == sel), None)
            if opt:
                delta += opt["price_delta"]
                parts.append(f"{name}: {sel}")
        else:
            labels = sel if isinstance(sel, list) else [sel]
            for label in labels:
                opt = next((o for o in v["options"] if o["label"] == label), None)
                if opt:
                    delta += opt["price_delta"]
            if labels:
                parts.append(f"{name}: {', '.join(labels)}")
    return delta, " | ".join(parts) if parts else ""


async def _build_item(it: OrderItemIn) -> OrderItem:
    product = await db.products.find_one({"id": it.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Produto não encontrado")

    unit_price = float(product["base_price"])
    text_parts = []

    if product.get("is_pizza"):
        halves = it.pizza_halves or []
        if not halves:
            raise HTTPException(400, "Selecione os sabores da pizza")
        if len(halves) > 4:
            raise HTTPException(400, "Máximo 4 sabores")
        invalid = [h for h in halves if h not in product.get("pizza_flavors", [])]
        if invalid:
            raise HTTPException(400, f"Sabor inválido: {', '.join(invalid)}")
    delta, text = _format_variations(product, it.variations_data or {})
    unit_price += delta
    if text:
        text_parts.append(text)

    total = unit_price * it.quantity
    return OrderItem(
        product_id=product["id"],
        product_name=product["name"],
        quantity=it.quantity,
        unit_price=unit_price,
        total_price=total,
        variations_text=" | ".join(text_parts) if text_parts else None,
        variations_data=it.variations_data or {},
        pizza_halves=it.pizza_halves or [],
        notes=it.notes,
    )


def _recalc_totals(order: dict):
    sub = sum(i["total_price"] for i in order.get("items", []))
    order["subtotal"] = round(sub, 2)
    order["total"] = round(max(0.0, sub - order.get("discount", 0.0)), 2)


@api.get("/orders")
async def list_orders(status: Optional[str] = None, user: dict = Depends(require_any)):
    q = {}
    if status:
        if "," in status:
            q["status"] = {"$in": status.split(",")}
        else:
            q["status"] = status
    orders = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).limit(300).to_list(300)
    return orders


@api.get("/orders/{oid}")
async def get_order(oid: str, _: dict = Depends(require_any)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Comanda não encontrada")
    return o


@api.post("/orders")
async def create_order(o: OrderCreate, user: dict = Depends(require_any)):
    customer_name = None
    if o.customer_id:
        c = await db.customers.find_one({"id": o.customer_id})
        if c:
            customer_name = c["name"]
    order = Order(
        number=await next_order_number(),
        table_label=o.table_label,
        operator_id=user["id"],
        operator_name=user["name"],
        customer_id=o.customer_id,
        customer_name=customer_name,
        notes=o.notes,
    ).model_dump()
    await db.orders.insert_one(order)
    return {k: v for k, v in order.items() if k != "_id"}


@api.patch("/orders/{oid}")
async def update_order(oid: str, u: OrderUpdate, _: dict = Depends(require_any)):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(404, "Comanda não encontrada")
    if order["status"] not in ORDER_EDITABLE_STATUSES:
        raise HTTPException(400, "Comanda já fechada ou cancelada")
    upd = {}
    for k, v in u.model_dump().items():
        if v is not None:
            upd[k] = v
    if "status" in upd and upd["status"] not in ORDER_EDITABLE_STATUSES:
        raise HTTPException(400, "Status inválido (use o fechamento de venda)")
    if "customer_id" in upd and upd["customer_id"]:
        c = await db.customers.find_one({"id": upd["customer_id"]})
        upd["customer_name"] = c["name"] if c else None
    if upd:
        order.update(upd)
        _recalc_totals(order)
        await db.orders.update_one({"id": oid}, {"$set": {**upd, "subtotal": order["subtotal"], "total": order["total"]}})
    return await db.orders.find_one({"id": oid}, {"_id": 0})


@api.post("/orders/{oid}/items")
async def add_item(oid: str, it: OrderItemIn, _: dict = Depends(require_any)):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(404, "Comanda não encontrada")
    if order["status"] not in ORDER_EDITABLE_STATUSES:
        raise HTTPException(400, "Comanda já fechada ou cancelada")
    item = await _build_item(it)
    order.setdefault("items", []).append(item.model_dump())
    _recalc_totals(order)
    await db.orders.update_one({"id": oid}, {"$set": {
        "items": order["items"], "subtotal": order["subtotal"], "total": order["total"],
    }})
    return await db.orders.find_one({"id": oid}, {"_id": 0})


@api.delete("/orders/{oid}/items/{item_id}")
async def remove_item(oid: str, item_id: str, _: dict = Depends(require_any)):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(404, "Comanda não encontrada")
    if order["status"] not in ORDER_EDITABLE_STATUSES:
        raise HTTPException(400, "Comanda já fechada ou cancelada")
    order["items"] = [i for i in order.get("items", []) if i["id"] != item_id]
    _recalc_totals(order)
    await db.orders.update_one({"id": oid}, {"$set": {
        "items": order["items"], "subtotal": order["subtotal"], "total": order["total"],
    }})
    return await db.orders.find_one({"id": oid}, {"_id": 0})


@api.post("/orders/{oid}/checkout")
async def checkout_order(oid: str, req: CheckoutRequest, user: dict = Depends(require_any)):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(404, "Comanda não encontrada")
    if order["status"] not in ORDER_EDITABLE_STATUSES:
        raise HTTPException(400, "Comanda já fechada ou cancelada")
    if not order.get("items"):
        raise HTTPException(400, "Adicione itens antes de fechar")

    order["discount"] = req.discount or 0.0
    _recalc_totals(order)

    paid = sum(p.amount for p in req.payments)
    if paid + 0.009 < order["total"]:
        raise HTTPException(400, f"Pagamento insuficiente: R$ {paid:.2f} < R$ {order['total']:.2f}")

    non_cash = sum(p.amount for p in req.payments if p.method != "dinheiro")
    if non_cash > order["total"] + 0.009:
        raise HTTPException(400, "Cartão, Pix e Fiado não podem ultrapassar o total (troco só em dinheiro)")

    # Validate all fiado payments before writing anything
    fiado_plan: dict[str, dict] = {}
    for p in req.payments:
        if p.method == "fiado":
            cid = p.customer_id or order.get("customer_id")
            if not cid:
                raise HTTPException(400, "Fiado requer cliente")
            if cid not in fiado_plan:
                customer = await db.customers.find_one({"id": cid})
                if not customer:
                    raise HTTPException(404, "Cliente de fiado não encontrado")
                fiado_plan[cid] = {"customer": customer, "amount": 0.0}
            fiado_plan[cid]["amount"] += p.amount
            p.customer_id = cid
    for cid, plan in fiado_plan.items():
        customer = plan["customer"]
        new_balance = customer.get("debt_balance", 0) + plan["amount"]
        if customer.get("credit_limit", 0) > 0 and new_balance > customer["credit_limit"]:
            raise HTTPException(400, f"Limite de crédito excedido para {customer['name']}")

    for cid, plan in fiado_plan.items():
        customer = plan["customer"]
        await db.customers.update_one({"id": cid}, {"$inc": {"debt_balance": plan["amount"]}})
        await db.fiado_mov.insert_one({
            "id": new_id(),
            "customer_id": cid,
            "customer_name": customer["name"],
            "type": "venda",
            "amount": plan["amount"],
            "order_id": oid,
            "order_number": order["number"],
            "user_name": user["name"],
            "date": now_iso(),
        })

    # Compute change (only on dinheiro)
    change = max(0.0, paid - order["total"])
    payments_doc = [p.model_dump() for p in req.payments]
    # assign change to last dinheiro payment if present
    for p in reversed(payments_doc):
        if p["method"] == "dinheiro":
            p["change"] = round(change, 2)
            break

    await db.orders.update_one({"id": oid}, {"$set": {
        "status": "fechada",
        "payments": payments_doc,
        "discount": order["discount"],
        "total": order["total"],
        "subtotal": order["subtotal"],
        "closed_at": now_iso(),
    }})

    # Decrement stock for products linked
    for it in order.get("items", []):
        await _apply_sale_consumption(it, order["number"], user["name"])

    return await db.orders.find_one({"id": oid}, {"_id": 0})


@api.delete("/orders/{oid}")
async def cancel_order(oid: str, _: dict = Depends(require_gerente)):
    order = await db.orders.find_one({"id": oid}, {"status": 1})
    if not order:
        raise HTTPException(404, "Comanda não encontrada")
    if order["status"] == "fechada":
        raise HTTPException(400, "Venda já fechada não pode ser cancelada")
    await db.orders.update_one({"id": oid}, {"$set": {"status": "cancelada", "closed_at": now_iso()}})
    return {"ok": True}


# ============================================================
# Encomendas
# ============================================================
@api.get("/encomendas")
async def list_encomendas(_: dict = Depends(require_any)):
    return await db.encomendas.find({}, {"_id": 0}).sort("delivery_date", 1).to_list(500)


@api.post("/encomendas")
async def create_encomenda(e: EncomendaIn, user: dict = Depends(require_any)):
    items = []
    total = 0.0
    for it in e.items:
        built = await _build_item(it)
        items.append(built.model_dump())
        total += built.total_price
    if not e.customer_name.strip():
        raise HTTPException(400, "Informe o nome do cliente")
    if e.deposit > total + 0.009:
        raise HTTPException(400, "Sinal maior que o total da encomenda")
    enc = Encomenda(
        customer_name=e.customer_name,
        customer_phone=e.customer_phone,
        customer_id=e.customer_id,
        delivery_date=e.delivery_date,
        delivery_time=e.delivery_time,
        items=[OrderItem(**i) for i in items],
        total=round(total, 2),
        deposit=e.deposit,
        notes=e.notes,
    ).model_dump()
    await db.encomendas.insert_one(enc)
    return {k: v for k, v in enc.items() if k != "_id"}


@api.patch("/encomendas/{eid}")
async def update_encomenda(eid: str, body: EncomendaUpdate, _: dict = Depends(require_any)):
    enc = await db.encomendas.find_one({"id": eid}, {"_id": 0})
    if not enc:
        raise HTTPException(404, "Encomenda não encontrada")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if "deposit" in upd and upd["deposit"] > enc.get("total", 0) + 0.009:
        raise HTTPException(400, "Sinal maior que o total da encomenda")
    if "status" in upd and upd["status"] not in ENCOMENDA_STATUSES:
        raise HTTPException(400, "Status inválido")
    if not upd:
        raise HTTPException(400, "Nada para atualizar")
    await db.encomendas.update_one({"id": eid}, {"$set": upd})
    return await db.encomendas.find_one({"id": eid}, {"_id": 0})


@api.delete("/encomendas/{eid}")
async def delete_encomenda(eid: str, _: dict = Depends(require_any)):
    res = await db.encomendas.delete_one({"id": eid})
    if not res.deleted_count:
        raise HTTPException(404, "Encomenda não encontrada")
    return {"ok": True}


# ============================================================
# Estoque
# ============================================================
@api.get("/estoque")
async def list_estoque(type: Optional[str] = None, _: dict = Depends(require_any)):
    q: dict = {}
    if type:
        q["type"] = type
    else:
        q["type"] = {"$in": ["revenda", None]}
    items = await db.estoque_items.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    for it in items:
        it.setdefault("type", "revenda")
    return items


@api.get("/estoque/alertas")
async def estoque_alertas(_: dict = Depends(require_any)):
    items = await db.estoque_items.find({"type": {"$in": ["revenda", "insumo", None]}}, {"_id": 0}).to_list(500)
    return [i for i in items if i.get("quantity", 0) <= i.get("min_quantity", 0)]


@api.post("/estoque")
async def create_estoque(i: EstoqueItemIn, _: dict = Depends(require_gerente)):
    if i.type not in ("revenda", "insumo", "pronto"):
        raise HTTPException(400, "Tipo inválido")
    doc = EstoqueItem(**i.model_dump()).model_dump()
    await db.estoque_items.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.patch("/estoque/{iid}")
async def update_estoque(iid: str, i: EstoqueItemIn, _: dict = Depends(require_gerente)):
    existing = await db.estoque_items.find_one({"id": iid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Item não encontrado")
    upd = i.model_dump(exclude_unset=True)
    # preserve type if client didn't explicitly send it
    if "type" not in i.model_fields_set:
        upd.pop("type", None)
    elif upd.get("type") not in ("revenda", "insumo", "pronto"):
        raise HTTPException(400, "Tipo inválido")
    if upd:
        await db.estoque_items.update_one({"id": iid}, {"$set": upd})
    return await db.estoque_items.find_one({"id": iid}, {"_id": 0})


@api.delete("/estoque/{iid}")
async def delete_estoque(iid: str, _: dict = Depends(require_gerente)):
    item = await db.estoque_items.find_one({"id": iid}, {"type": 1})
    if not item:
        raise HTTPException(404, "Item não encontrado")
    await db.estoque_items.delete_one({"id": iid})
    if item.get("type") == "pronto":
        await db.production_batches.delete_many({"estoque_item_id": iid})
    return {"ok": True}


@api.post("/estoque/movimento")
async def estoque_movimento(m: EstoqueMovimentoIn, user: dict = Depends(require_any)):
    item = await db.estoque_items.find_one({"id": m.item_id})
    if not item:
        raise HTTPException(404, "Insumo não encontrado")
    if m.type == "entrada":
        new_qty = item["quantity"] + m.quantity
    elif m.type == "saida":
        new_qty = item["quantity"] - m.quantity
    elif m.type == "ajuste":
        new_qty = m.quantity
    else:
        raise HTTPException(400, "Tipo inválido")
    await db.estoque_items.update_one({"id": m.item_id}, {"$set": {"quantity": new_qty}})
    mov = {
        "id": new_id(),
        "item_id": m.item_id,
        "item_name": item["name"],
        "type": m.type,
        "quantity": m.quantity,
        "reason": m.reason,
        "user_name": user["name"],
        "date": now_iso(),
    }
    await db.estoque_mov.insert_one(mov)
    return {"ok": True, "new_quantity": new_qty}


@api.get("/estoque/movimentos")
async def list_movimentos(item_id: Optional[str] = None, item_type: Optional[str] = None,
                          _: dict = Depends(require_any)):
    q: dict = {}
    if item_type:
        ids = [i["id"] async for i in db.estoque_items.find({"type": item_type}, {"id": 1})]
        q["item_id"] = {"$in": ([item_id] if item_id and item_id in ids else (ids if not item_id else []))}
    elif item_id:
        q["item_id"] = item_id
    return await db.estoque_mov.find(q, {"_id": 0}).sort("date", -1).limit(300).to_list(300)



# ============================================================
# Ficha técnica, Produção, Prontos
# ============================================================
def _recipe_for(prod: dict, flavor: Optional[str]) -> list[dict]:
    """Return the per-unit recipe for a product (with flavor for pizzas)."""
    if prod.get("is_pizza"):
        if not flavor:
            raise HTTPException(400, "Informe o sabor para pizzas")
        if flavor not in prod.get("pizza_flavors", []):
            raise HTTPException(400, "Sabor inválido")
        flavor_recipe = (prod.get("recipe_by_flavor") or {}).get(flavor) or []
        return list(prod.get("base_recipe") or []) + list(flavor_recipe)
    return list(prod.get("recipe") or [])


async def _compute_cost(prod: dict, flavor: Optional[str], quantity: float = 1.0) -> dict:
    recipe = _recipe_for(prod, flavor)
    if not recipe:
        raise HTTPException(400, "Produto sem ficha técnica")
    rows = []
    cost_total = 0.0
    for r in recipe:
        item = await db.estoque_items.find_one({"id": r["insumo_id"]}, {"_id": 0})
        name = item.get("name") if item else r.get("insumo_name", "insumo")
        unit = item.get("unit") if item else r.get("unit", "un")
        price = float(item.get("cost_price", 0)) if item else 0.0
        need = float(r["quantity"]) * quantity
        available = float(item.get("quantity", 0)) if item else 0.0
        line_cost = need * price
        cost_total += line_cost
        rows.append({
            "insumo_id": r["insumo_id"], "insumo_name": name,
            "needed": round(need, 4), "unit": unit, "cost_unit": price,
            "line_cost": round(line_cost, 4), "available": available,
        })
    custo_unit = cost_total / quantity if quantity else 0
    margin = float(prod.get("margin_pct", 100))
    return {
        "custo": round(cost_total, 4),
        "custo_unitario": round(custo_unit, 4),
        "margem_pct": margin,
        "preco_sugerido": round(custo_unit * (1 + margin / 100), 2),
        "insumos": rows,
    }


@api.get("/products/{pid}/custo")
async def product_cost(pid: str, flavor: Optional[str] = None, quantity: float = 1.0,
                       _: dict = Depends(require_gerente)):
    prod = await db.products.find_one({"id": pid}, {"_id": 0})
    if not prod:
        raise HTTPException(404, "Produto não encontrado")
    return await _compute_cost(prod, flavor, quantity or 1.0)


class ProducaoIn(BaseModel):
    product_id: str
    flavor: Optional[str] = None
    quantity: float = Field(gt=0)
    expiry_date: Optional[str] = None
    notes: Optional[str] = None


class DescarteIn(BaseModel):
    quantity: float = Field(gt=0)
    reason: Optional[str] = None


async def _get_or_create_pronto(prod: dict, flavor: Optional[str]) -> dict:
    if prod.get("is_pizza"):
        item = await db.estoque_items.find_one(
            {"type": "pronto", "product_id": prod["id"], "flavor": flavor}, {"_id": 0}
        )
        name = f"{prod['name']} — {flavor} (pronto)"
    else:
        item = None
        if prod.get("pronto_item_id"):
            item = await db.estoque_items.find_one({"id": prod["pronto_item_id"]}, {"_id": 0})
        name = f"{prod['name']} (pronto)"
    if item:
        return item
    new = {
        "id": new_id(), "name": name, "unit": "un",
        "quantity": 0.0, "min_quantity": 0.0, "cost_price": 0.0,
        "type": "pronto", "product_id": prod["id"], "flavor": flavor,
    }
    await db.estoque_items.insert_one(new)
    if not prod.get("is_pizza"):
        await db.products.update_one({"id": prod["id"]}, {"$set": {"pronto_item_id": new["id"]}})
    return new


@api.get("/producao")
async def list_batches(status: Optional[str] = None, _: dict = Depends(require_gerente)):
    q: dict = {}
    if status == "ativo":
        q["quantity_remaining"] = {"$gt": 0}
    elif status == "esgotado":
        q["quantity_remaining"] = {"$lte": 0}
    return await db.production_batches.find(q, {"_id": 0}).sort("produced_at", -1).to_list(500)


@api.post("/producao")
async def create_batch(p: ProducaoIn, user: dict = Depends(require_gerente)):
    prod = await db.products.find_one({"id": p.product_id}, {"_id": 0})
    if not prod:
        raise HTTPException(404, "Produto não encontrado")
    if prod.get("production_mode") != "pronto":
        raise HTTPException(400, "Este produto não está no modo de produção própria")
    recipe = _recipe_for(prod, p.flavor)
    if not recipe:
        raise HTTPException(400, "Produto sem ficha técnica para este sabor")
    # Validate insumo availability
    shortages = []
    for r in recipe:
        need = float(r["quantity"]) * p.quantity
        ins = await db.estoque_items.find_one({"id": r["insumo_id"]})
        if not ins or ins.get("quantity", 0) + 0.0001 < need:
            have = ins.get("quantity", 0) if ins else 0
            shortages.append(f"{ins.get('name', r.get('insumo_name', 'insumo')) if ins else 'insumo'} (precisa {need:.3f}, tem {have})")
    if shortages:
        raise HTTPException(400, "Insumo insuficiente: " + "; ".join(shortages))

    # Consume insumos
    cost_total = 0.0
    for r in recipe:
        need = float(r["quantity"]) * p.quantity
        ins = await db.estoque_items.find_one({"id": r["insumo_id"]})
        cost_total += need * float(ins.get("cost_price", 0))
        await db.estoque_items.update_one({"id": r["insumo_id"]}, {"$inc": {"quantity": -need}})
        await db.estoque_mov.insert_one({
            "id": new_id(), "item_id": r["insumo_id"], "item_name": ins["name"],
            "type": "saida", "quantity": need,
            "reason": f"Produção: {prod['name']}" + (f" — {p.flavor}" if p.flavor else ""),
            "user_name": user["name"], "date": now_iso(),
        })

    pronto = await _get_or_create_pronto(prod, p.flavor)
    await db.estoque_items.update_one({"id": pronto["id"]}, {"$inc": {"quantity": p.quantity}})

    batch = {
        "id": new_id(),
        "estoque_item_id": pronto["id"],
        "product_id": prod["id"],
        "product_name": prod["name"],
        "flavor": p.flavor,
        "quantity_initial": p.quantity,
        "quantity_remaining": p.quantity,
        "produced_at": now_iso(),
        "expiry_date": p.expiry_date,
        "cost_total": round(cost_total, 4),
        "cost_unit": round(cost_total / p.quantity, 4) if p.quantity else 0,
        "user_name": user["name"],
        "notes": p.notes,
    }
    await db.production_batches.insert_one(batch)
    return {k: v for k, v in batch.items() if k != "_id"}


@api.post("/producao/{bid}/descartar")
async def descartar_batch(bid: str, body: DescarteIn, user: dict = Depends(require_gerente)):
    batch = await db.production_batches.find_one({"id": bid})
    if not batch:
        raise HTTPException(404, "Lote não encontrado")
    qty = min(body.quantity, batch["quantity_remaining"])
    if qty <= 0:
        raise HTTPException(400, "Lote já consumido")
    await db.production_batches.update_one({"id": bid}, {"$inc": {"quantity_remaining": -qty}})
    await db.estoque_items.update_one({"id": batch["estoque_item_id"]}, {"$inc": {"quantity": -qty}})
    await db.estoque_mov.insert_one({
        "id": new_id(), "item_id": batch["estoque_item_id"],
        "item_name": batch["product_name"] + (f" — {batch['flavor']}" if batch.get("flavor") else ""),
        "type": "saida", "quantity": qty,
        "reason": f"Descarte: {body.reason or 'sem motivo'}",
        "user_name": user["name"], "date": now_iso(),
    })
    return {"ok": True}


async def _consume_pronto(pronto: dict, qty: float, ref: str, user_name: str):
    """FIFO-consume quantity from production_batches; cap at what's really available."""
    remaining = qty
    consumed = 0.0
    cursor = db.production_batches.find(
        {"estoque_item_id": pronto["id"], "quantity_remaining": {"$gt": 0}},
    ).sort([("expiry_date", 1), ("produced_at", 1)])
    async for b in cursor:
        if remaining <= 0.0001:
            break
        take = min(remaining, b["quantity_remaining"])
        await db.production_batches.update_one({"id": b["id"]}, {"$inc": {"quantity_remaining": -take}})
        remaining -= take
        consumed += take
    if consumed <= 0:
        return
    await db.estoque_items.update_one({"id": pronto["id"]}, {"$inc": {"quantity": -consumed}})
    await db.estoque_mov.insert_one({
        "id": new_id(), "item_id": pronto["id"],
        "item_name": pronto.get("name", "pronto"),
        "type": "saida", "quantity": consumed,
        "reason": ref, "user_name": user_name, "date": now_iso(),
    })


async def _apply_sale_consumption(it: dict, order_number: int, user_name: str):
    prod = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
    if not prod:
        return
    mode = prod.get("production_mode")
    if mode in (None, "", "none") and prod.get("stock_item_id"):
        mode = "revenda"
    qty = float(it.get("quantity", 1))
    ref = f"Venda comanda #{order_number}"
    if mode == "revenda" and prod.get("stock_item_id"):
        total_qty = qty * float(prod.get("stock_usage", 1.0))
        await db.estoque_items.update_one({"id": prod["stock_item_id"]}, {"$inc": {"quantity": -total_qty}})
        await db.estoque_mov.insert_one({
            "id": new_id(), "item_id": prod["stock_item_id"],
            "item_name": prod.get("name", ""), "type": "saida",
            "quantity": total_qty, "reason": ref, "user_name": user_name, "date": now_iso(),
        })
    elif mode == "pronto":
        if prod.get("is_pizza"):
            halves = it.get("pizza_halves") or []
            if not halves:
                return
            fraction = qty / len(halves)
            for flavor in halves:
                pronto = await db.estoque_items.find_one(
                    {"type": "pronto", "product_id": prod["id"], "flavor": flavor}, {"_id": 0}
                )
                if pronto:
                    await _consume_pronto(pronto, fraction, ref, user_name)
        else:
            if prod.get("pronto_item_id"):
                pronto = await db.estoque_items.find_one({"id": prod["pronto_item_id"]}, {"_id": 0})
                if pronto:
                    await _consume_pronto(pronto, qty, ref, user_name)


async def migrate_add_estoque_type():
    """Ensure legacy estoque_items have a type (defaults to 'revenda'); set production_mode only for products that never had one."""
    await db.estoque_items.update_many(
        {"type": {"$exists": False}}, {"$set": {"type": "revenda"}}
    )
    await db.products.update_many(
        {"production_mode": {"$exists": False}, "stock_item_id": {"$ne": None}},
        {"$set": {"production_mode": "revenda"}}
    )
    await db.products.update_many(
        {"production_mode": {"$exists": False}},
        {"$set": {"production_mode": "none"}}
    )


# ============================================================
# Dashboard (gerente)
# ============================================================
@api.get("/dashboard")
async def dashboard(_: dict = Depends(require_gerente)):
    today_d = local_today()
    today = today_d.isoformat()
    since = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
    orders = await db.orders.find({"status": "fechada", "closed_at": {"$gte": since}}, {"_id": 0}).to_list(20000)
    for o in orders:
        o["_local_day"] = local_date(o.get("closed_at"))
    today_orders = [o for o in orders if o["_local_day"] == today]

    faturamento_hoje = sum(o["total"] for o in today_orders)
    num_vendas_hoje = len(today_orders)
    ticket_medio = faturamento_hoje / num_vendas_hoje if num_vendas_hoje else 0

    # por forma de pagamento hoje
    por_pagamento = {}
    for o in today_orders:
        for p in o.get("payments", []):
            net = p["amount"] - p.get("change", 0)
            por_pagamento[p["method"]] = round(por_pagamento.get(p["method"], 0) + net, 2)

    # top produtos
    prod_count: dict[str, dict] = {}
    for o in today_orders:
        for i in o.get("items", []):
            k = i["product_name"]
            d = prod_count.setdefault(k, {"name": k, "quantidade": 0, "valor": 0})
            d["quantidade"] += i["quantity"]
            d["valor"] += i["total_price"]
    top_produtos = sorted(prod_count.values(), key=lambda x: x["valor"], reverse=True)[:5]

    # fiado total
    customers = await db.customers.find({}, {"_id": 0}).to_list(1000)
    total_fiado = sum(c.get("debt_balance", 0) for c in customers)
    clientes_devedores = len([c for c in customers if c.get("debt_balance", 0) > 0])

    # estoque alerta
    estoque = await db.estoque_items.find({}, {"_id": 0}).to_list(500)
    alertas_estoque = [i for i in estoque if i.get("quantity", 0) <= i.get("min_quantity", 0)]

    # encomendas de hoje
    encomendas = await db.encomendas.find({"delivery_date": today}, {"_id": 0}).to_list(100)

    # 7-day sales trend
    trend = []
    for delta in range(6, -1, -1):
        d = (today_d - timedelta(days=delta)).isoformat()
        day_total = sum(o["total"] for o in orders if o["_local_day"] == d)
        trend.append({"date": d, "total": round(day_total, 2)})

    return {
        "faturamento_hoje": round(faturamento_hoje, 2),
        "vendas_hoje": num_vendas_hoje,
        "ticket_medio": round(ticket_medio, 2),
        "por_pagamento": por_pagamento,
        "top_produtos": top_produtos,
        "total_fiado": round(total_fiado, 2),
        "clientes_devedores": clientes_devedores,
        "alertas_estoque": alertas_estoque,
        "encomendas_hoje": encomendas,
        "trend_7dias": trend,
    }


# ============================================================
# Mount
# ============================================================
@api.get("/")
async def root():
    return {"app": "Padaria POS", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# Optional: serve the compiled React build when running as a desktop app.
if os.environ.get("SERVE_FRONTEND") == "1" and os.environ.get("FRONTEND_DIR"):
    from pathlib import Path as _P
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    _front = _P(os.environ["FRONTEND_DIR"])
    if (_front / "static").is_dir():
        app.mount("/static", StaticFiles(directory=str(_front / "static")), name="static")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _spa(full_path: str):
        candidate = _front / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_front / "index.html")


@app.on_event("startup")
async def startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    await seed_initial_data()
    await migrate_add_estoque_type()


@app.on_event("shutdown")
async def shutdown():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
