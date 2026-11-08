import { useEffect, useState } from "react";
import { apiClient, money, formatDate } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, AlertTriangle, ArrowDown, ArrowUp, Pencil, Trash2, Wheat } from "lucide-react";

const empty = { name: "", unit: "kg", quantity: 0, min_quantity: 0, cost_price: 0, supplier: "", type: "insumo" };

export default function Insumos() {
  const [items, setItems] = useState([]);
  const [movs, setMovs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null);

  const load = async () => {
    const r = await apiClient.get("/estoque", { params: { type: "insumo" } });
    setItems(r.data);
    const m = await apiClient.get("/estoque/movimentos", { params: { item_type: "insumo" } });
    setMovs(m.data);
    window.dispatchEvent(new Event("estoque-changed"));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = { ...editing, type: "insumo" };
      if (editing.id) await apiClient.patch(`/estoque/${editing.id}`, payload);
      else await apiClient.post("/estoque", payload);
      toast.success("Insumo salvo");
      setEditing(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  const doMove = async () => {
    try {
      await apiClient.post("/estoque/movimento", {
        item_id: moving.item.id, type: moving.type,
        quantity: parseFloat(moving.quantity) || 0, reason: moving.reason,
      });
      toast.success("Movimentação registrada");
      setMoving(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  const remove = async (i) => {
    if (!confirm(`Remover "${i.name}"?`)) return;
    try {
      await apiClient.delete(`/estoque/${i.id}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  const insumosMovs = movs;
  const alertas = items.filter((i) => i.quantity <= i.min_quantity);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900 flex items-center gap-2">
            <Wheat className="h-7 w-7 text-amber-600" /> Insumos
          </h1>
          <p className="text-sm text-stone-500 mt-1">Matéria-prima da sua produção (trigo, açúcar, ovos, queijo…)</p>
        </div>
        <Button onClick={() => setEditing({ ...empty })} data-testid="new-insumo-btn" className="bg-amber-600 hover:bg-amber-700">
          <Plus className="h-4 w-4 mr-1" /> Novo insumo
        </Button>
      </div>

      {alertas.length > 0 && (
        <Card className="p-4 mb-6 bg-red-50 border-red-200" data-testid="insumo-alertas">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-display font-bold text-red-800">{alertas.length} {alertas.length === 1 ? "insumo" : "insumos"} abaixo do mínimo</div>
              <div className="text-xs text-red-700 mt-1">
                {alertas.map((a) => `${a.name} (${a.quantity}/${a.min_quantity} ${a.unit})`).join(" · ")}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items" data-testid="tab-insumo-items">Insumos</TabsTrigger>
          <TabsTrigger value="movs" data-testid="tab-insumo-movs">Movimentações</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <Card className="divide-y">
            {items.map((i) => {
              const low = i.quantity <= i.min_quantity;
              return (
                <div key={i.id} className={`p-4 flex flex-wrap items-center gap-3 ${low ? "bg-red-50/40" : ""}`} data-testid={`insumo-row-${i.id}`}>
                  <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${low ? "bg-red-500" : "bg-emerald-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{i.name}</div>
                    <div className="text-xs text-stone-500">{i.supplier || "—"}</div>
                  </div>
                  <div className="text-right w-28">
                    <div className={`pos-number text-lg ${low ? "text-red-700" : "text-stone-800"}`}>{i.quantity} <span className="text-sm text-stone-400">{i.unit}</span></div>
                    <div className="text-xs text-stone-400">mín {i.min_quantity}</div>
                  </div>
                  <div className="text-right w-24">
                    <div className="pos-number text-sm text-stone-600">{money(i.cost_price)}</div>
                    <div className="text-xs text-stone-400">por {i.unit}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setMoving({ item: i, type: "entrada", quantity: "", reason: "" })} data-testid={`insumo-entrada-${i.id}`}>
                      <ArrowDown className="h-3.5 w-3.5 mr-1" /> Entrada
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMoving({ item: i, type: "saida", quantity: "", reason: "" })} data-testid={`insumo-saida-${i.id}`}>
                      <ArrowUp className="h-3.5 w-3.5 mr-1" /> Saída
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(i)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <div className="p-8 text-center text-stone-500">Nenhum insumo. Clique em "Novo insumo" acima.</div>}
          </Card>
        </TabsContent>

        <TabsContent value="movs" className="mt-4">
          <Card className="divide-y">
            {insumosMovs.map((m) => (
              <div key={m.id} className="p-3 flex items-center gap-3">
                <Badge className={m.type === "entrada" ? "bg-emerald-100 text-emerald-800" : m.type === "saida" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}>{m.type}</Badge>
                <div className="flex-1">
                  <div className="font-medium text-sm">{m.item_name}</div>
                  <div className="text-xs text-stone-500">{formatDate(m.date)} · {m.user_name} {m.reason && `· ${m.reason}`}</div>
                </div>
                <div className="pos-number text-sm">{m.quantity}</div>
              </div>
            ))}
            {insumosMovs.length === 0 && <div className="p-8 text-center text-stone-500">Sem movimentações</div>}
          </Card>
        </TabsContent>
      </Tabs>

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent data-testid="insumo-dialog">
            <DialogHeader><DialogTitle>{editing.id ? "Editar insumo" : "Novo insumo"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome *</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="insumo-name-input" placeholder="Ex: Farinha de trigo" /></div>
              <div><Label>Unidade</Label>
                <Select value={editing.unit} onValueChange={(v) => setEditing({ ...editing, unit: v })}>
                  <SelectTrigger data-testid="insumo-unit-trigger"><SelectValue /></SelectTrigger>
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
              <div><Label>Custo (R$ por {editing.unit})</Label>
                <Input type="number" step="0.01" value={editing.cost_price} onChange={(e) => setEditing({ ...editing, cost_price: parseFloat(e.target.value) || 0 })} data-testid="insumo-cost-input" /></div>
              <div className="col-span-2"><Label>Fornecedor</Label>
                <Input value={editing.supplier || ""} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save} data-testid="insumo-save" className="bg-amber-600 hover:bg-amber-700">Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {moving && (
        <Dialog open onOpenChange={() => setMoving(null)}>
          <DialogContent data-testid="insumo-movimento-dialog">
            <DialogHeader>
              <DialogTitle>{moving.type === "entrada" ? "Entrada" : "Saída"} — {moving.item.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Card className="p-3 bg-stone-50">
                <div className="text-xs text-stone-500 uppercase">Estoque atual</div>
                <div className="pos-number text-xl">{moving.item.quantity} {moving.item.unit}</div>
              </Card>
              <div><Label>Quantidade ({moving.item.unit})</Label>
                <Input type="number" step="0.01" value={moving.quantity} onChange={(e) => setMoving({ ...moving, quantity: e.target.value })} data-testid="insumo-mov-qty" className="pos-number text-xl h-12" /></div>
              <div><Label>Motivo</Label>
                <Input value={moving.reason} onChange={(e) => setMoving({ ...moving, reason: e.target.value })} placeholder="Ex: Compra do fornecedor" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMoving(null)}>Cancelar</Button>
              <Button onClick={doMove} data-testid="insumo-mov-save" className="bg-amber-600 hover:bg-amber-700">Confirmar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
