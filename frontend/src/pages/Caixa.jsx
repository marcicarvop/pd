import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { apiClient, money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import ProductPicker from "@/components/pos/ProductPicker";
import ProductDialog from "@/components/pos/ProductDialog";
import CheckoutDialog from "@/components/pos/CheckoutDialog";
import ReceiptDialog from "@/components/pos/ReceiptDialog";
import { Plus, Trash2, Receipt, ClipboardList, Pizza, ArrowLeft, Printer } from "lucide-react";

export default function Caixa() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const orderId = sp.get("order");

  const [order, setOrder] = useState(null);
  const [newTable, setNewTable] = useState("");
  const [productDialog, setProductDialog] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [openOrders, setOpenOrders] = useState([]);

  const loadOrder = async (id) => {
    const r = await apiClient.get(`/orders/${id}`);
    setOrder(r.data);
  };

  const loadOpen = async () => {
    const r = await apiClient.get("/orders", { params: { status: "aberta,em_producao,pronta,aguardando_pagamento" } });
    setOpenOrders(r.data);
  };

  useEffect(() => {
    if (orderId) loadOrder(orderId).catch(() => toast.error("Comanda não encontrada"));
    else {
      setOrder(null);
      loadOpen();
    }
  }, [orderId]);

  const openComanda = async (tableLabel) => {
    try {
      const r = await apiClient.post("/orders", { table_label: tableLabel });
      setSp({ order: r.data.id });
      setNewTable("");
      toast.success(`Comanda #${r.data.number} aberta`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    }
  };

  const addItem = async (payload) => {
    try {
      const r = await apiClient.post(`/orders/${orderId}/items`, payload);
      setOrder(r.data);
      setProductDialog(null);
      toast.success("Item adicionado");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    }
  };

  const removeItem = async (itemId) => {
    const r = await apiClient.delete(`/orders/${orderId}/items/${itemId}`);
    setOrder(r.data);
  };

  const onCheckout = async (payments, discount) => {
    try {
      const r = await apiClient.post(`/orders/${orderId}/checkout`, { payments, discount });
      setCheckoutOpen(false);
      setReceiptOrder(r.data);
      toast.success("Venda finalizada!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao finalizar");
    }
  };

  const backToList = () => {
    setReceiptOrder(null);
    setSp({});
  };

  // === Comanda list view ===
  if (!orderId) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-bold text-stone-900">Caixa</h1>
            <p className="text-sm text-stone-500 mt-1">Abra uma comanda ou continue uma já aberta</p>
          </div>
        </div>

        <Card className="p-5 mb-6 bg-amber-50/60 border-amber-200">
          <div className="text-xs uppercase tracking-widest text-amber-800 font-semibold mb-3">Abrir nova comanda</div>
          <div className="flex gap-2">
            <Input
              placeholder="Ex: Mesa 5, Balcão, Retirada..."
              value={newTable}
              onChange={(e) => setNewTable(e.target.value)}
              data-testid="caixa-new-table-input"
              className="h-12"
            />
            <Button
              onClick={() => newTable.trim() && openComanda(newTable.trim())}
              className="h-12 bg-amber-600 hover:bg-amber-700 px-6"
              data-testid="caixa-open-order-button"
            >
              <Plus className="h-5 w-5 mr-2" />
              Abrir
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Balcão", "Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Retirada", "Delivery"].map((t) => (
              <Button
                key={t}
                size="sm"
                variant="outline"
                onClick={() => openComanda(t)}
                data-testid={`caixa-quick-table-${t.toLowerCase().replace(" ", "-")}`}
                className="border-amber-300 text-amber-800 hover:bg-amber-100"
              >
                {t}
              </Button>
            ))}
          </div>
        </Card>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-semibold text-stone-800">Comandas em aberto</h2>
          <Badge variant="outline" className="border-amber-300 text-amber-800">{openOrders.length}</Badge>
        </div>

        {openOrders.length === 0 ? (
          <Card className="p-12 text-center text-stone-500">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 text-stone-300" />
            Nenhuma comanda aberta. Comece abrindo uma acima.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {openOrders.map((o) => (
              <Card
                key={o.id}
                onClick={() => setSp({ order: o.id })}
                data-testid={`open-order-card-${o.number}`}
                className="p-4 cursor-pointer hover:border-amber-400 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-mono text-xs text-stone-400">#{o.number}</div>
                    <div className="font-display font-bold text-lg text-stone-900">{o.table_label}</div>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100">
                  <div className="text-xs text-stone-500">{o.items?.length || 0} {o.items?.length === 1 ? "item" : "itens"}</div>
                  <div className="pos-number text-xl text-amber-700">{money(o.total)}</div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!order) {
    return <div className="p-6 text-stone-500">Carregando comanda…</div>;
  }

  return (
    <div className="lg:h-full flex flex-col lg:flex-row lg:overflow-hidden">
      {/* Left: product grid */}
      <div className="flex-1 flex flex-col lg:overflow-hidden lg:border-r border-stone-200 bg-white">
        <div className="px-3 sm:px-6 py-4 border-b border-stone-200 flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={backToList} data-testid="caixa-back-button">
            <ArrowLeft className="h-4 w-4 mr-1" /> Comandas
          </Button>
          <div className="flex-1">
            <div className="font-display font-bold text-lg text-stone-900">
              {order.table_label} <span className="text-stone-400 font-mono text-sm">#{order.number}</span>
            </div>
            <div className="text-xs text-stone-500">Operador: {order.operator_name}</div>
          </div>
          <StatusBadge status={order.status} />
        </div>
        <div className="flex-1 lg:overflow-y-auto scrollbar-thin">
          <ProductPicker onPick={(p) => setProductDialog(p)} />
        </div>
      </div>

      {/* Right: order summary */}
      <div className="w-full lg:w-[380px] flex flex-col bg-stone-50 shrink-0 border-t lg:border-t-0 border-stone-200">
        <div className="p-4 border-b border-stone-200">
          <div className="text-xs uppercase tracking-widest text-stone-400 font-semibold mb-1">Pedido atual</div>
          <h2 className="font-display font-bold text-xl text-stone-900">
            {order.items?.length || 0} {order.items?.length === 1 ? "item" : "itens"}
          </h2>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {order.items?.length === 0 && (
              <div className="text-center text-sm text-stone-400 py-8">
                Toque em um produto para adicionar
              </div>
            )}
            {order.items?.map((it) => (
              <Card key={it.id} className="p-3" data-testid={`order-item-${it.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {it.pizza_halves?.length > 0 && <Pizza className="h-3.5 w-3.5 text-amber-600" />}
                      <div className="font-semibold text-sm text-stone-900 truncate">{it.product_name}</div>
                    </div>
                    {it.variations_text && (
                      <div className="text-xs text-stone-500 mt-0.5">{it.variations_text}</div>
                    )}
                    {it.pizza_halves?.length > 0 && !it.variations_text?.includes("Sabores:") && (
                      <div className="text-xs text-amber-700 mt-0.5">
                        {it.pizza_halves.length === 1 ? it.pizza_halves[0] : it.pizza_halves.join(" / ")}
                      </div>
                    )}
                    {it.notes && <div className="text-xs italic text-stone-500 mt-0.5">Obs: {it.notes}</div>}
                    <div className="text-xs text-stone-400 mt-1">
                      {it.quantity}× {money(it.unit_price)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="pos-number text-sm text-stone-900">{money(it.total_price)}</div>
                    <button
                      onClick={() => removeItem(it.id)}
                      data-testid={`remove-item-${it.id}`}
                      className="mt-1 text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-stone-200 p-4 bg-white space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-stone-500">Subtotal</span>
            <span className="pos-number text-stone-900">{money(order.subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Desconto</span>
              <span className="pos-number text-red-600">-{money(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-2 border-t">
            <span className="font-display font-semibold text-stone-700">Total</span>
            <span className="pos-number text-3xl text-amber-700" data-testid="order-total">{money(order.total)}</span>
          </div>
          <Button
            onClick={() => setCheckoutOpen(true)}
            disabled={!order.items?.length || order.status === "fechada"}
            data-testid="caixa-checkout-button"
            className="w-full h-14 bg-amber-600 hover:bg-amber-700 text-white font-display font-bold text-base pos-btn-touch"
          >
            <Receipt className="h-5 w-5 mr-2" />
            Fechar venda
          </Button>
          <Button
            onClick={() => setReceiptOrder(order)}
            variant="outline"
            data-testid="caixa-preview-receipt"
            className="w-full"
          >
            <Printer className="h-4 w-4 mr-2" />
            Ver resumo / Imprimir
          </Button>
        </div>
      </div>

      {productDialog && (
        <ProductDialog
          product={productDialog}
          onClose={() => setProductDialog(null)}
          onConfirm={addItem}
        />
      )}
      {checkoutOpen && (
        <CheckoutDialog
          order={order}
          onClose={() => setCheckoutOpen(false)}
          onConfirm={onCheckout}
        />
      )}
      {receiptOrder && (
        <ReceiptDialog
          order={receiptOrder}
          onClose={() => { setReceiptOrder(null); if (receiptOrder.status === "fechada") backToList(); }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    aberta: { label: "Aberta", c: "bg-blue-100 text-blue-800 border-blue-200" },
    em_producao: { label: "Em produção", c: "bg-amber-100 text-amber-800 border-amber-200" },
    pronta: { label: "Pronta", c: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    aguardando_pagamento: { label: "Aguardando pag.", c: "bg-orange-100 text-orange-800 border-orange-200" },
    fechada: { label: "Fechada", c: "bg-stone-100 text-stone-700 border-stone-200" },
    cancelada: { label: "Cancelada", c: "bg-red-100 text-red-700 border-red-200" },
  };
  const s = map[status] || map.aberta;
  return <Badge className={`${s.c} font-medium`}>{s.label}</Badge>;
}
