import { useEffect, useState } from "react";
import { apiClient, money, formatDate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Search, DollarSign, Trash2, History } from "lucide-react";

export default function Fiado() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [viewingHistory, setViewingHistory] = useState(null);
  const [history, setHistory] = useState([]);

  const load = async () => {
    const r = await apiClient.get("/customers", { params: search ? { q: search } : {} });
    setCustomers(r.data);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [search]);

  const save = async () => {
    try {
      if (editing.id) {
        await apiClient.patch(`/customers/${editing.id}`, editing);
      } else {
        await apiClient.post("/customers", editing);
      }
      toast.success("Cliente salvo");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    }
  };

  const pay = async () => {
    try {
      await apiClient.post(`/customers/${paying.customer.id}/pagamento`, {
        customer_id: paying.customer.id,
        amount: parseFloat(paying.amount) || 0,
        method: paying.method,
        note: paying.note,
      });
      toast.success("Pagamento registrado");
      setPaying(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    }
  };

  const viewHistory = async (c) => {
    const r = await apiClient.get(`/customers/${c.id}/historico`);
    setHistory(r.data);
    setViewingHistory(c);
  };

  const removeCustomer = async (c) => {
    if (!confirm(`Remover cliente ${c.name}?`)) return;
    try {
      await apiClient.delete(`/customers/${c.id}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    }
  };

  const totalDebt = customers.reduce((s, c) => s + (c.debt_balance || 0), 0);
  const debtors = customers.filter((c) => c.debt_balance > 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">Fiado</h1>
          <p className="text-sm text-stone-500 mt-1">Clientes e saldo devedor</p>
        </div>
        <Button onClick={() => setEditing({ name: "", phone: "", cpf: "", credit_limit: 0, notes: "" })} data-testid="new-customer-btn" className="bg-amber-600 hover:bg-amber-700">
          <Plus className="h-4 w-4 mr-1" /> Novo cliente
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <Card className="p-4 bg-amber-50/60 border-amber-200">
          <div className="text-xs uppercase tracking-widest text-amber-700 font-semibold">Total a receber</div>
          <div className="pos-number text-3xl text-amber-800 mt-1" data-testid="fiado-total">{money(totalDebt)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Clientes devedores</div>
          <div className="pos-number text-3xl text-stone-800 mt-1">{debtors.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Total cadastrado</div>
          <div className="pos-number text-3xl text-stone-800 mt-1">{customers.length}</div>
        </Card>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
        <Input placeholder="Buscar por nome, telefone ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="fiado-search" className="pl-9" />
      </div>

      <Card className="divide-y">
        {customers.map((c) => (
          <div key={c.id} className="p-4 flex items-center gap-3 hover:bg-stone-50" data-testid={`customer-row-${c.id}`}>
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 font-bold shrink-0">
              {c.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-stone-900">{c.name}</div>
              <div className="text-xs text-stone-500">{c.phone} {c.cpf && `· ${c.cpf}`}</div>
            </div>
            <div className="text-right">
              <div className={`pos-number text-lg ${c.debt_balance > 0 ? "text-orange-700" : "text-stone-400"}`} data-testid={`customer-debt-${c.id}`}>
                {money(c.debt_balance)}
              </div>
              {c.credit_limit > 0 && (
                <div className="text-xs text-stone-400">limite {money(c.credit_limit)}</div>
              )}
            </div>
            <div className="flex gap-1">
              {c.debt_balance > 0 && (
                <Button size="sm" onClick={() => setPaying({ customer: c, amount: c.debt_balance, method: "dinheiro", note: "" })} data-testid={`pay-debt-${c.id}`} className="bg-emerald-600 hover:bg-emerald-700">
                  <DollarSign className="h-3.5 w-3.5 mr-1" /> Receber
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => viewHistory(c)} data-testid={`history-${c.id}`}>
                <History className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditing(c)}>
                <Pencil className="h-4 w-4" />
              </Button>
              {user?.role === "gerente" && (
                <Button size="icon" variant="ghost" onClick={() => removeCustomer(c)} data-testid={`delete-customer-${c.id}`}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {customers.length === 0 && <div className="p-8 text-center text-stone-500">Nenhum cliente</div>}
      </Card>

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent data-testid="customer-dialog">
            <DialogHeader><DialogTitle>{editing.id ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome *</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="customer-name-input" /></div>
              <div><Label>Telefone</Label>
                <Input value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div><Label>CPF</Label>
                <Input value={editing.cpf || ""} onChange={(e) => setEditing({ ...editing, cpf: e.target.value })} /></div>
              <div className="col-span-2"><Label>Limite de crédito (R$)</Label>
                <Input type="number" step="0.01" value={editing.credit_limit || 0} onChange={(e) => setEditing({ ...editing, credit_limit: parseFloat(e.target.value) || 0 })} /></div>
              <div className="col-span-2"><Label>Observações</Label>
                <Textarea rows={2} value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save} data-testid="customer-save" className="bg-amber-600 hover:bg-amber-700">Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {paying && (
        <Dialog open onOpenChange={() => setPaying(null)}>
          <DialogContent data-testid="payment-dialog">
            <DialogHeader><DialogTitle>Receber de {paying.customer.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Card className="p-3 bg-amber-50 border-amber-200">
                <div className="text-xs uppercase text-amber-700">Dívida atual</div>
                <div className="pos-number text-2xl text-amber-800">{money(paying.customer.debt_balance)}</div>
              </Card>
              <div><Label>Valor recebido</Label>
                <Input type="number" step="0.01" value={paying.amount} onChange={(e) => setPaying({ ...paying, amount: e.target.value })} data-testid="payment-amount-input" className="pos-number text-xl h-12" /></div>
              <div><Label>Forma</Label>
                <Select value={paying.method} onValueChange={(v) => setPaying({ ...paying, method: v })}>
                  <SelectTrigger data-testid="payment-method-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Observação</Label>
                <Input value={paying.note} onChange={(e) => setPaying({ ...paying, note: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPaying(null)}>Cancelar</Button>
              <Button onClick={pay} data-testid="payment-confirm" className="bg-emerald-600 hover:bg-emerald-700">Registrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {viewingHistory && (
        <Dialog open onOpenChange={() => setViewingHistory(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Histórico de {viewingHistory.name}</DialogTitle></DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin space-y-2">
              {history.length === 0 && <div className="text-stone-500 text-sm">Sem movimentações</div>}
              {history.map((m) => (
                <div key={m.id || m.date} className="flex items-center justify-between p-3 bg-stone-50 rounded">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className={m.type === "venda" ? "bg-orange-100 text-orange-800" : "bg-emerald-100 text-emerald-800"}>
                        {m.type === "venda" ? "Venda fiada" : "Pagamento"}
                      </Badge>
                      {m.order_number && <span className="text-xs text-stone-500 mono">#{m.order_number}</span>}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">{formatDate(m.date)} · {m.user_name}</div>
                    {m.note && <div className="text-xs italic text-stone-500">{m.note}</div>}
                  </div>
                  <div className={`pos-number text-lg ${m.type === "venda" ? "text-orange-700" : "text-emerald-700"}`}>
                    {m.type === "venda" ? "+" : "-"}{money(m.amount)}
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
