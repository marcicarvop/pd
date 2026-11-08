import { useEffect, useMemo, useState } from "react";
import { apiClient, money, formatDate, formatDateOnly } from "@/lib/api";
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
import { ChefHat, Plus, AlertTriangle, Trash2, CheckCircle2, Clock, Snowflake } from "lucide-react";

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const daysBetween = (iso) => {
  if (!iso) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  return Math.round((d - today) / (1000 * 60 * 60 * 24));
};

export default function Producao() {
  const [batches, setBatches] = useState([]);
  const [prontos, setProntos] = useState([]);
  const [products, setProducts] = useState([]);
  const [producing, setProducing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [descartar, setDescartar] = useState(null);

  const load = async () => {
    const [b, p, pr] = await Promise.all([
      apiClient.get("/producao"),
      apiClient.get("/estoque", { params: { type: "pronto" } }),
      apiClient.get("/products/all"),
    ]);
    setBatches(b.data);
    setProntos(p.data);
    setProducts(pr.data.filter((x) => x.production_mode === "pronto"));
    window.dispatchEvent(new Event("estoque-changed"));
  };

  useEffect(() => { load(); }, []);

  const openProducao = () => setProducing({ product_id: "", flavor: "", quantity: 1, expiry_date: "", notes: "" });

  const previewCusto = async (p) => {
    try {
      const r = await apiClient.get(`/products/${p.product_id}/custo`, {
        params: { flavor: p.flavor || undefined, quantity: p.quantity || 1 },
      });
      setPreview(r.data);
    } catch (e) {
      setPreview({ error: e.response?.data?.detail || "Sem ficha técnica" });
    }
  };

  useEffect(() => {
    if (producing?.product_id && producing.quantity > 0) {
      const prod = products.find((p) => p.id === producing.product_id);
      if (prod?.is_pizza && !producing.flavor) { setPreview(null); return; }
      previewCusto(producing);
    } else setPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producing?.product_id, producing?.flavor, producing?.quantity]);

  const produce = async () => {
    try {
      await apiClient.post("/producao", {
        product_id: producing.product_id,
        flavor: producing.flavor || null,
        quantity: parseFloat(producing.quantity) || 0,
        expiry_date: producing.expiry_date || null,
        notes: producing.notes || null,
      });
      toast.success("Lote produzido! Insumos consumidos e produto pronto em estoque.");
      setProducing(null); setPreview(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    }
  };

  const doDescartar = async () => {
    try {
      await apiClient.post(`/producao/${descartar.batch.id}/descartar`, {
        quantity: parseFloat(descartar.quantity) || 0,
        reason: descartar.reason || "Descarte",
      });
      toast.success("Descarte registrado");
      setDescartar(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  const selectedProd = products.find((p) => p.id === producing?.product_id);

  const activeBatches = batches.filter((b) => b.quantity_remaining > 0);
  const expiringSoon = activeBatches.filter((b) => {
    const d = daysBetween(b.expiry_date);
    return d !== null && d <= 3 && d >= 0;
  });
  const vencidos = activeBatches.filter((b) => {
    const d = daysBetween(b.expiry_date);
    return d !== null && d < 0;
  });

  const groupedProntos = useMemo(() => {
    const g = {};
    for (const p of prontos) {
      const key = p.product_id || p.id;
      (g[key] = g[key] || []).push(p);
    }
    return g;
  }, [prontos]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900 flex items-center gap-2">
            <ChefHat className="h-7 w-7 text-amber-600" /> Produção
          </h1>
          <p className="text-sm text-stone-500 mt-1">Produtos feitos pela sua casa, com lote e validade (FIFO)</p>
        </div>
        <Button onClick={openProducao} data-testid="producir-lote-btn" className="bg-amber-600 hover:bg-amber-700" disabled={products.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Produzir lote
        </Button>
      </div>

      {products.length === 0 && (
        <Card className="p-6 mb-6 bg-amber-50 border-amber-200 text-sm text-amber-900" data-testid="no-production-products">
          Nenhum produto marcado como <strong>Produção própria</strong> no Cardápio. Abra o Cardápio e, no produto desejado, escolha o modo "Pronto (produzido)" e adicione a ficha técnica.
        </Card>
      )}

      {(expiringSoon.length > 0 || vencidos.length > 0) && (
        <Card className="p-4 mb-6 bg-red-50 border-red-200" data-testid="producao-alertas">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              {vencidos.length > 0 && (
                <div className="text-red-800 font-bold">{vencidos.length} lote(s) vencido(s) — considere descartar</div>
              )}
              {expiringSoon.length > 0 && (
                <div className="text-red-700">{expiringSoon.length} lote(s) vencendo em até 3 dias</div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="prontos">
        <TabsList>
          <TabsTrigger value="prontos" data-testid="tab-prontos">Estoque de prontos</TabsTrigger>
          <TabsTrigger value="batches" data-testid="tab-batches">Lotes</TabsTrigger>
        </TabsList>

        <TabsContent value="prontos" className="mt-4 space-y-3">
          {Object.entries(groupedProntos).map(([pid, items]) => {
            const prod = products.find((p) => p.id === pid);
            return (
              <Card key={pid} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Snowflake className="h-4 w-4 text-sky-600" />
                  <h3 className="font-display font-bold">{prod?.name || items[0].name}</h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {items.map((i) => (
                    <div key={i.id} className="p-2 bg-stone-50 rounded flex items-center justify-between" data-testid={`pronto-${i.id}`}>
                      <div>
                        <div className="text-sm font-medium">{i.flavor || "Padrão"}</div>
                        <div className="text-xs text-stone-500">{i.name}</div>
                      </div>
                      <div className="pos-number text-lg text-amber-700">{i.quantity} {i.unit}</div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
          {prontos.length === 0 && <div className="p-8 text-center text-stone-500">Nenhum produto pronto. Clique em "Produzir lote".</div>}
        </TabsContent>

        <TabsContent value="batches" className="mt-4">
          <Card className="divide-y">
            {batches.map((b) => {
              const d = daysBetween(b.expiry_date);
              const empty = b.quantity_remaining <= 0;
              const vencido = d !== null && d < 0;
              return (
                <div key={b.id} className={`p-4 flex flex-wrap items-center gap-3 ${vencido ? "bg-red-50/60" : empty ? "opacity-60" : ""}`} data-testid={`batch-${b.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{b.product_name} {b.flavor && <span className="text-amber-700">· {b.flavor}</span>}</div>
                    <div className="text-xs text-stone-500 flex items-center gap-2 flex-wrap">
                      <Clock className="h-3 w-3" />
                      Produzido {formatDate(b.produced_at)} · por {b.user_name}
                      {b.expiry_date && (
                        <Badge variant="outline" className={vencido ? "border-red-400 text-red-700" : d <= 3 ? "border-amber-400 text-amber-700" : ""}>
                          Validade {formatDateOnly(b.expiry_date)}{d !== null && (vencido ? ` · venceu há ${-d}d` : ` · ${d}d`)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="pos-number text-base">{b.quantity_remaining}/{b.quantity_initial}</div>
                    <div className="text-xs text-stone-400">restante</div>
                  </div>
                  <div className="text-right w-24">
                    <div className="pos-number text-sm text-stone-600">{money(b.cost_unit)}</div>
                    <div className="text-xs text-stone-400">custo/un</div>
                  </div>
                  {!empty ? (
                    <Button size="sm" variant="outline" onClick={() => setDescartar({ batch: b, quantity: b.quantity_remaining, reason: "" })} data-testid={`batch-descartar-${b.id}`}>
                      <Trash2 className="h-3.5 w-3.5 mr-1 text-red-500" /> Descartar
                    </Button>
                  ) : (
                    <Badge className="bg-stone-200 text-stone-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Consumido</Badge>
                  )}
                </div>
              );
            })}
            {batches.length === 0 && <div className="p-8 text-center text-stone-500">Nenhum lote produzido ainda.</div>}
          </Card>
        </TabsContent>
      </Tabs>

      {producing && (
        <Dialog open onOpenChange={() => { setProducing(null); setPreview(null); }}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="producao-dialog">
            <DialogHeader><DialogTitle>Produzir lote</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Produto *</Label>
                <Select value={producing.product_id} onValueChange={(v) => setProducing({ ...producing, product_id: v, flavor: "" })}>
                  <SelectTrigger data-testid="producao-product"><SelectValue placeholder="Escolha um produto de produção..." /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedProd?.is_pizza && (
                <div>
                  <Label>Sabor *</Label>
                  <Select value={producing.flavor} onValueChange={(v) => setProducing({ ...producing, flavor: v })}>
                    <SelectTrigger data-testid="producao-flavor"><SelectValue placeholder="Escolha o sabor..." /></SelectTrigger>
                    <SelectContent>
                      {selectedProd.pizza_flavors.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quantidade *</Label>
                  <Input type="number" min={1} step="1" value={producing.quantity} onChange={(e) => setProducing({ ...producing, quantity: parseFloat(e.target.value) || 0 })} data-testid="producao-qty" /></div>
                <div><Label>Validade</Label>
                  <Input type="date" min={localToday()} value={producing.expiry_date} onChange={(e) => setProducing({ ...producing, expiry_date: e.target.value })} data-testid="producao-expiry" /></div>
              </div>
              <div><Label>Observações</Label>
                <Textarea rows={2} value={producing.notes} onChange={(e) => setProducing({ ...producing, notes: e.target.value })} /></div>

              {preview && (
                <Card className="p-3 bg-stone-50" data-testid="producao-preview">
                  {preview.error ? (
                    <div className="text-sm text-red-700">{preview.error}</div>
                  ) : (
                    <>
                      <div className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">Insumos necessários</div>
                      <div className="space-y-1 text-sm">
                        {preview.insumos.map((r, idx) => (
                          <div key={idx} className={`flex items-center justify-between ${r.available + 0.0001 < r.needed ? "text-red-700" : "text-stone-700"}`}>
                            <span>{r.insumo_name}</span>
                            <span className="pos-number">{r.needed} {r.unit} <span className="text-xs text-stone-400">/ disp. {r.available}</span></span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-2 mt-2 border-t">
                        <span className="text-sm">Custo total do lote</span>
                        <span className="pos-number text-base text-amber-700">{money(preview.custo)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-stone-500">Custo por unidade</span>
                        <span className="pos-number text-xs text-stone-600">{money(preview.custo_unitario)}</span>
                      </div>
                    </>
                  )}
                </Card>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setProducing(null); setPreview(null); }}>Cancelar</Button>
              <Button onClick={produce} disabled={!producing.product_id || !producing.quantity || (selectedProd?.is_pizza && !producing.flavor)} className="bg-amber-600 hover:bg-amber-700" data-testid="producao-confirm">
                Confirmar produção
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {descartar && (
        <Dialog open onOpenChange={() => setDescartar(null)}>
          <DialogContent data-testid="descartar-dialog">
            <DialogHeader><DialogTitle>Descartar lote</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Card className="p-3 bg-stone-50 text-sm">
                {descartar.batch.product_name} {descartar.batch.flavor && `· ${descartar.batch.flavor}`} · restam {descartar.batch.quantity_remaining}
              </Card>
              <div><Label>Quantidade a descartar</Label>
                <Input type="number" step="1" max={descartar.batch.quantity_remaining} value={descartar.quantity} onChange={(e) => setDescartar({ ...descartar, quantity: e.target.value })} data-testid="descartar-qty" /></div>
              <div><Label>Motivo</Label>
                <Input value={descartar.reason} onChange={(e) => setDescartar({ ...descartar, reason: e.target.value })} placeholder="Ex: vencido" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDescartar(null)}>Cancelar</Button>
              <Button onClick={doDescartar} className="bg-red-600 hover:bg-red-700 text-white" data-testid="descartar-confirm">Confirmar descarte</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
