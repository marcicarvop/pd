import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiClient, money } from "@/lib/api";
import { Banknote, CreditCard, QrCode, BookOpen, X } from "lucide-react";

const METHODS = [
  { key: "dinheiro", label: "Dinheiro", icon: Banknote, color: "bg-emerald-600 hover:bg-emerald-700" },
  { key: "cartao", label: "Cartão", icon: CreditCard, color: "bg-blue-600 hover:bg-blue-700" },
  { key: "pix", label: "PIX", icon: QrCode, color: "bg-purple-600 hover:bg-purple-700" },
  { key: "fiado", label: "Fiado", icon: BookOpen, color: "bg-orange-700 hover:bg-orange-800" },
];

export default function CheckoutDialog({ order, onClose, onConfirm }) {
  const [discount, setDiscount] = useState(order.discount || 0);
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(order.customer_id || "");
  const [inputAmount, setInputAmount] = useState("");

  const total = useMemo(() => Math.max(0, order.subtotal - discount), [order, discount]);
  const paid = useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments]);
  const remaining = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);

  useEffect(() => {
    apiClient.get("/customers").then((r) => setCustomers(r.data));
  }, []);

  const addPayment = (method) => {
    const amt = parseFloat(inputAmount) || remaining;
    if (amt <= 0) return;
    const pay = { method, amount: amt };
    if (method === "fiado") {
      if (!selectedCustomer) return;
      pay.customer_id = selectedCustomer;
    }
    setPayments((p) => [...p, pay]);
    setInputAmount("");
  };

  const removePayment = (idx) => setPayments((p) => p.filter((_, i) => i !== idx));

  const confirm = () => {
    if (paid < total - 0.009) return;
    onConfirm(payments, discount);
  };

  const quickFill = (v) => setInputAmount(String(v));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin" data-testid="checkout-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Finalizar venda</DialogTitle>
          <p className="text-sm text-stone-500">
            Comanda #{order.number} · {order.table_label}
          </p>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Left: totals */}
          <div className="space-y-4">
            <Card className="p-4 space-y-2 bg-amber-50/60 border-amber-200">
              <div className="flex justify-between text-sm">
                <span className="text-stone-600">Subtotal</span>
                <span className="pos-number">{money(order.subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <Label htmlFor="discount" className="text-stone-600">Desconto</Label>
                <Input
                  id="discount"
                  type="number"
                  min={0}
                  step={0.01}
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  data-testid="checkout-discount-input"
                  className="w-28 text-right pos-number"
                />
              </div>
              <div className="flex justify-between text-base pt-2 border-t">
                <span className="font-semibold">Total</span>
                <span className="pos-number text-2xl text-amber-700" data-testid="checkout-total">{money(total)}</span>
              </div>
            </Card>

            <Card className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-stone-600">Pago</span>
                <span className="pos-number text-emerald-700" data-testid="checkout-paid">{money(paid)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-600">Falta</span>
                <span className="pos-number text-red-600" data-testid="checkout-remaining">{money(remaining)}</span>
              </div>
              {change > 0 && (
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="font-semibold">Troco</span>
                  <span className="pos-number text-lg text-emerald-700" data-testid="checkout-change">{money(change)}</span>
                </div>
              )}
            </Card>

            <div>
              <Label className="text-xs text-stone-500 uppercase tracking-wider">Pagamentos lançados</Label>
              <div className="mt-2 space-y-1.5">
                {payments.length === 0 && (
                  <div className="text-xs text-stone-400 py-2">Nenhum pagamento adicionado ainda</div>
                )}
                {payments.map((p, i) => {
                  const m = METHODS.find((x) => x.key === p.method);
                  const cust = customers.find((c) => c.id === p.customer_id);
                  return (
                    <div key={i} className="flex items-center gap-2 bg-stone-50 rounded-lg p-2 text-sm" data-testid={`payment-row-${i}`}>
                      <Badge className="bg-stone-200 text-stone-700">{m?.label}</Badge>
                      <span className="pos-number flex-1">{money(p.amount)}</span>
                      {cust && <span className="text-xs text-orange-700">{cust.name}</span>}
                      <button onClick={() => removePayment(i)} className="text-red-500 hover:text-red-700">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: input + methods */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">Valor a lançar</Label>
              <Input
                id="amount"
                type="number"
                step={0.01}
                min={0}
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                placeholder={remaining > 0 ? money(remaining) : "0,00"}
                data-testid="checkout-amount-input"
                className="pos-number text-2xl h-14 text-right mt-1.5"
              />
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[10, 20, 50, 100].map((v) => (
                  <button
                    key={v}
                    onClick={() => quickFill(v)}
                    className="h-9 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-medium"
                    data-testid={`quick-amount-${v}`}
                  >
                    R$ {v}
                  </button>
                ))}
              </div>
              <button
                onClick={() => quickFill(remaining.toFixed(2))}
                className="mt-2 w-full h-9 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-semibold"
                data-testid="quick-amount-exact"
              >
                Valor exato ({money(remaining)})
              </button>
            </div>

            <div>
              <Label>Cliente (p/ fiado)</Label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger data-testid="checkout-customer-select" className="mt-1.5">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} · deve {money(c.debt_balance)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-stone-500 uppercase tracking-wider">Forma de pagamento</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {METHODS.map((m) => (
                  <Button
                    key={m.key}
                    onClick={() => addPayment(m.key)}
                    disabled={(parseFloat(inputAmount) || remaining) <= 0 || (m.key === "fiado" && !selectedCustomer)}
                    data-testid={`pay-method-${m.key}`}
                    className={`h-14 ${m.color} text-white font-semibold flex items-center justify-start px-4 pos-btn-touch`}
                  >
                    <m.icon className="h-5 w-5 mr-2" />
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={confirm}
            disabled={paid < total - 0.009}
            data-testid="checkout-confirm-button"
            className="bg-amber-600 hover:bg-amber-700"
          >
            Confirmar e fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
