import { useEffect, useState } from "react";
import { apiClient, money, formatDate } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, AlertTriangle, ArrowDown, ArrowUp, Pencil, Trash2, Settings } from "lucide-react";

export default function Estoque() {
  const [items, setItems] = useState([]);
  const [movs, setMovs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null);

  const load = async () => {
    const r = await apiClient.get("/estoque", { params: { type: "revenda" } });
    setItems(r.data);
    const m = await apiClient.get("/estoque/movimentos", { params: { item_type: "revenda" } });
    setMovs(m.data);
    window.dispatchEvent(new Event("estoque-changed"));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editing.id) await apiClient.patch(`/estoque/${editing.id}`, { ...editing, type: "revenda" });
      else await apiClient.post("/estoque", { ...editing, type: "revenda" });
      toast.success("Item salvo");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    }
  };

  const doMove = async () => {
    try {
      await apiClient.post("/estoque/movimento", {
        item_id: moving.item.id,
        type: moving.type,
        quantity: parseFloat(moving.quantity) || 0,
        reason: moving.reason,
      });
      toast.success("Movimentação registrada");
      setMoving(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    }
  };

  const remove = async (i) => {
    if (!confirm(`Remover "${i.name}"?`)) return;
    await apiClient.delete(`/estoque/${i.id}`);
    load();
  };

  const alertas = items.filter((i) => i.quantity <= i.min_quantity);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">Revenda</h1>
          <p className="text-sm text-stone-500 mt-1">Produtos prontos de prateleira (refri, bombom, leite...)</p>
        </div>
        <Button onClick={() => setEditing({ name: "", unit: "un", quantity: 0, min_quantity: 0, cost_price: 0, supplier: "", type: "revenda" })} data-testid="new-estoque-btn" className="bg-amber-600 hover:bg-amber-700">
          <Plus className="h-4 w-4 mr-1" /> Novo item
        </Button>
      </div>

      {alertas.length > 0 && (
        <Card className="p-4 mb-6 bg-red-50 border-red-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-display font-bold text-red-800">Atenção — {alertas.length} {alertas.length === 1 ? "item" : "itens"} abaixo do mínimo</div>
              <div className="text-xs text-red-700 mt-1">
                {alertas.map((a) => `${a.name} (${a.quantity}/${a.min_quantity} ${a.unit})`).join(" · ")}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items" data-testid="tab-items">Itens</TabsTrigger>
          <TabsTrigger value="movs" data-testid="tab-movs">Movimentações</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <Card className="divide-y">
            {items.map((i) => {
              const low = i.quantity <= i.min_quantity;
              return (
                <div key={i.id} className={`p-4 flex items-center gap-3 ${low ? "bg-red-50/40" : ""}`} data-testid={`estoque-row-${i.id}`}>
                  <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${low ? "bg-red-500" : "bg-emerald-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{i.name}</div>
                    <div className="text-xs text-stone-500">{i.supplier || "—"}</div>
                  </div>
                  <div className="text-right w-32">
                    <div className={`pos-number text-lg ${low ? "text-red-700" : "text-stone-800"}`}>
                      {i.quantity} <span className="text-sm text-stone-400">{i.unit}</span>
                    </div>
                    <div className="text-xs text-stone-400">mín {i.min_quantity}</div>
                  </div>
                  <div className="text-right w-24">
                    <div className="pos-number text-sm text-stone-600">{money(i.cost_price)}</div>
                    <div className="text-xs text-stone-400">custo</div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setMoving({ item: i, type: "entrada", quantity: "", reason: "" })} data-testid={`estoque-entrada-${i.id}`}>
                      <ArrowDown className="h-3.5 w-3.5 mr-1" /> Entrada
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMoving({ item: i, type: "saida", quantity: "", reason: "" })} data-testid={`estoque-saida-${i.id}`}>
                      <ArrowUp className="h-3.5 w-3.5 mr-1" /> Saída
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(i)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <div className="p-8 text-center text-stone-500">Nenhum item de revenda</div>}
          </Card>
        </TabsContent>

        <TabsContent value="movs" className="mt-4">
          <Card className="divide-y">
            {movs.map((m) => (
              <div key={m.id} className="p-3 flex items-center gap-3">
                <Badge className={m.type === "entrada" ? "bg-emerald-100 text-emerald-800" : m.type === "saida" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}>
                  {m.type}
                </Badge>
                <div className="flex-1">
                  <div className="font-medium text-sm">{m.item_name}</div>
                  <div className="text-xs text-stone-500">{formatDate(m.date)} · {m.user_name} {m.reason && `· ${m.reason}`}</div>
                </div>
                <div className="pos-number text-sm">{m.quantity}</div>
              </div>
            ))}
            {movs.length === 0 && <div className="p-8 text-center text-stone-500">Sem movimentações</div>}
          </Card>
        </TabsContent>
      </Tabs>

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent data-testid="estoque-dialog">
            <DialogHeader><DialogTitle>{editing.id ? "Editar item" : "Novo item de revenda"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome *</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="estoque-name-input" /></div>
              <div><Label>Unidade</Label>
                <Select value={editing.unit} onValueChange={(v) => setEditing({ ...editing, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="un">unidade</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="l">litro</SelectItem>
                    <SelectItem value="ml">ml</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Quantidade atual</Label>
                <Input type="number" step="0.01" value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Quantidade mínima</Label>
                <Input type="number" step="0.01" value={editing.min_quantity} onChange={(e) => setEditing({ ...editing, min_quantity: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Custo (R$ por unidade)</Label>
                <Input type="number" step="0.01" value={editing.cost_price} onChange={(e) => setEditing({ ...editing, cost_price: parseFloat(e.target.value) || 0 })} /></div>
              <div className="col-span-2"><Label>Fornecedor</Label>
                <Input value={editing.supplier || ""} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save} data-testid="estoque-save" className="bg-amber-600 hover:bg-amber-700">Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {moving && (
        <Dialog open onOpenChange={() => setMoving(null)}>
          <DialogContent data-testid="movimento-dialog">
            <DialogHeader>
              <DialogTitle>
                {moving.type === "entrada" ? "Entrada" : "Saída"} — {moving.item.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Card className="p-3 bg-stone-50">
                <div className="text-xs text-stone-500 uppercase">Estoque atual</div>
                <div className="pos-number text-xl">{moving.item.quantity} {moving.item.unit}</div>
              </Card>
              <div><Label>Quantidade ({moving.item.unit})</Label>
                <Input type="number" step="0.01" value={moving.quantity} onChange={(e) => setMoving({ ...moving, quantity: e.target.value })} data-testid="movimento-qty" className="pos-number text-xl h-12" /></div>
              <div><Label>Motivo</Label>
                <Input value={moving.reason} onChange={(e) => setMoving({ ...moving, reason: e.target.value })} placeholder="Ex: Compra do fornecedor" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMoving(null)}>Cancelar</Button>
              <Button onClick={doMove} data-testid="movimento-save" className="bg-amber-600 hover:bg-amber-700">Confirmar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
