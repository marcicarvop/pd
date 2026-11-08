import { useEffect, useMemo, useState } from "react";
import { apiClient, money } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, X, Pizza, Calculator, ChefHat } from "lucide-react";

const emptyProduct = {
  name: "", category_id: "", base_price: 0, description: "", image_url: "",
  is_pizza: false, pizza_flavors: [], pizza_pricing: "maior",
  variations: [], active: true,
  production_mode: "none", pronto_item_id: null,
  recipe: [], base_recipe: [], recipe_by_flavor: {},
  margin_pct: 100, cost_override: null,
};

export default function Cardapio() {
  const [cats, setCats] = useState([]);
  const [products, setProducts] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [prontos, setProntos] = useState([]);
  const [costs, setCosts] = useState({}); // {product_id: {custo, preco_sugerido}}
  const [editing, setEditing] = useState(null);
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [newCat, setNewCat] = useState("");

  const load = async () => {
    const [c, p, ins, pr] = await Promise.all([
      apiClient.get("/categories"),
      apiClient.get("/products/all"),
      apiClient.get("/estoque", { params: { type: "insumo" } }),
      apiClient.get("/estoque", { params: { type: "revenda" } }),
    ]);
    setCats(c.data); setProducts(p.data); setInsumos(ins.data); setProntos(pr.data);
    // fetch costs in bg
    const costsMap = {};
    await Promise.all(p.data.map(async (prod) => {
      const hasRecipe = (prod.recipe?.length || prod.base_recipe?.length || Object.keys(prod.recipe_by_flavor || {}).length);
      if (prod.production_mode === "pronto" && hasRecipe) {
        try {
          const flavor = prod.is_pizza ? (prod.pizza_flavors?.[0]) : null;
          const r = await apiClient.get(`/products/${prod.id}/custo`, { params: { flavor: flavor || undefined } });
          costsMap[prod.id] = r.data;
        } catch (e) { /* no recipe */ }
      }
    }));
    setCosts(costsMap);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = { ...editing };
      if (!payload.category_id) { toast.error("Selecione a categoria"); return; }
      if (!payload.name) { toast.error("Informe o nome"); return; }
      // enrich recipe items with insumo_name
      const enrich = (arr) => (arr || []).map((r) => {
        const i = insumos.find((x) => x.id === r.insumo_id);
        return i ? { ...r, insumo_name: i.name, unit: i.unit } : r;
      });
      payload.recipe = enrich(payload.recipe);
      payload.base_recipe = enrich(payload.base_recipe);
      payload.recipe_by_flavor = Object.fromEntries(
        Object.entries(payload.recipe_by_flavor || {}).map(([k, v]) => [k, enrich(v)])
      );
      if (payload.id) await apiClient.patch(`/products/${payload.id}`, payload);
      else await apiClient.post("/products", payload);
      toast.success("Produto salvo");
      setEditing(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  const remove = async (p) => {
    if (!confirm(`Remover "${p.name}"?`)) return;
    try {
      await apiClient.delete(`/products/${p.id}`);
      toast.success("Removido");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  const addCategory = async () => {
    if (!newCat.trim()) return;
    await apiClient.post("/categories", { name: newCat });
    setNewCat("");
    toast.success("Categoria adicionada");
    load();
  };

  const removeCategory = async (cid) => {
    try { await apiClient.delete(`/categories/${cid}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">Cardápio</h1>
          <p className="text-sm text-stone-500 mt-1">Produtos, variações, ficha técnica e custo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCatDialog(true)} data-testid="manage-categories-btn">Categorias</Button>
          <Button onClick={() => setEditing({ ...emptyProduct })} data-testid="new-product-btn" className="bg-amber-600 hover:bg-amber-700">
            <Plus className="h-4 w-4 mr-1" /> Novo produto
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        {cats.map((cat) => {
          const items = products.filter((p) => p.category_id === cat.id);
          return (
            <Card key={cat.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold text-lg text-amber-800">{cat.name}</h3>
                <Badge variant="outline">{items.length}</Badge>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
                {items.map((p) => {
                  const c = costs[p.id];
                  return (
                    <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 group" data-testid={`product-row-${p.id}`}>
                      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <span className="font-display text-xl font-bold text-amber-700">{p.name[0]}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate flex items-center gap-1">
                          {p.is_pizza && <Pizza className="h-3 w-3 text-amber-600" />}
                          {p.production_mode === "pronto" && <ChefHat className="h-3 w-3 text-sky-600" />}
                          {p.name}
                          {!p.active && <Badge variant="outline" className="text-xs">inativo</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="pos-number text-amber-700">{money(p.base_price)}</span>
                          {c && (
                            <span className="text-stone-500">· custo {money(c.custo_unitario)} · {p.margin_pct}%</span>
                          )}
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditing({ ...emptyProduct, ...p })} data-testid={`edit-product-${p.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(p)} data-testid={`delete-product-${p.id}`}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <div className="col-span-full text-xs text-stone-400 italic py-2">Sem produtos</div>}
              </div>
            </Card>
          );
        })}
      </div>

      {editing && (
        <ProductEditor
          data={editing} setData={setEditing}
          cats={cats} insumos={insumos} prontos={prontos}
          onClose={() => setEditing(null)} onSave={save}
        />
      )}

      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent data-testid="categories-dialog">
          <DialogHeader><DialogTitle>Categorias</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {cats.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-2 bg-stone-50 rounded">
                <span>{c.name}</span>
                <Button size="icon" variant="ghost" onClick={() => removeCategory(c.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Input placeholder="Nova categoria" value={newCat} onChange={(e) => setNewCat(e.target.value)} data-testid="new-category-input" />
              <Button onClick={addCategory} data-testid="add-category-btn">Adicionar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecipeEditor({ list, onChange, insumos, testid }) {
  const add = () => onChange([...(list || []), { insumo_id: "", quantity: 1 }]);
  const upd = (i, v) => onChange(list.map((x, idx) => idx === i ? { ...x, ...v } : x));
  const del = (i) => onChange(list.filter((_, idx) => idx !== i));

  const total = useMemo(() => {
    let t = 0;
    for (const r of list || []) {
      const i = insumos.find((x) => x.id === r.insumo_id);
      if (i) t += (r.quantity || 0) * (i.cost_price || 0);
    }
    return t;
  }, [list, insumos]);

  return (
    <div className="space-y-1.5">
      {(list || []).map((r, i) => {
        const ins = insumos.find((x) => x.id === r.insumo_id);
        return (
          <div key={i} className="flex gap-1.5 items-center" data-testid={`${testid}-row-${i}`}>
            <Select value={r.insumo_id} onValueChange={(v) => upd(i, { insumo_id: v })}>
              <SelectTrigger className="flex-1" data-testid={`${testid}-insumo-${i}`}><SelectValue placeholder="Insumo..." /></SelectTrigger>
              <SelectContent className="max-h-64">
                {insumos.map((x) => <SelectItem key={x.id} value={x.id}>{x.name} ({x.unit})</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" step="0.001" className="w-24" value={r.quantity} onChange={(e) => upd(i, { quantity: parseFloat(e.target.value) || 0 })} data-testid={`${testid}-qty-${i}`} />
            <div className="w-10 text-xs text-stone-500 shrink-0">{ins?.unit || "—"}</div>
            <Button size="icon" variant="ghost" onClick={() => del(i)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-1">
        <Button size="sm" variant="outline" onClick={add} data-testid={`${testid}-add`}>+ insumo</Button>
        <div className="text-xs text-stone-600">Custo: <span className="pos-number text-stone-800">{money(total)}</span></div>
      </div>
    </div>
  );
}

function ProductEditor({ data, setData, cats, insumos, prontos, onClose, onSave }) {
  const upd = (k, v) => setData((s) => ({ ...s, [k]: v }));
  const [activeFlavor, setActiveFlavor] = useState(data.pizza_flavors?.[0] || "");

  useEffect(() => {
    if (data.is_pizza && !activeFlavor && data.pizza_flavors.length > 0) setActiveFlavor(data.pizza_flavors[0]);
  }, [data.is_pizza, data.pizza_flavors, activeFlavor]);

  const addVariation = () => upd("variations", [...data.variations, { name: "", type: "single", required: false, options: [] }]);
  const updVar = (i, v) => upd("variations", data.variations.map((x, idx) => idx === i ? { ...x, ...v } : x));
  const delVar = (i) => upd("variations", data.variations.filter((_, idx) => idx !== i));
  const addOpt = (vi) => updVar(vi, { options: [...data.variations[vi].options, { label: "", price_delta: 0 }] });
  const updOpt = (vi, oi, o) => updVar(vi, { options: data.variations[vi].options.map((x, idx) => idx === oi ? { ...x, ...o } : x) });
  const delOpt = (vi, oi) => updVar(vi, { options: data.variations[vi].options.filter((_, idx) => idx !== oi) });

  const addFlavor = () => upd("pizza_flavors", [...data.pizza_flavors, ""]);
  const updFlavor = (i, v) => {
    const old = data.pizza_flavors[i];
    const nx = data.pizza_flavors.map((x, idx) => idx === i ? v : x);
    const map = { ...(data.recipe_by_flavor || {}) };
    if (old && map[old]) { map[v] = map[old]; delete map[old]; }
    setData((s) => ({ ...s, pizza_flavors: nx, recipe_by_flavor: map }));
    if (activeFlavor === old) setActiveFlavor(v);
  };
  const delFlavor = (i) => {
    const old = data.pizza_flavors[i];
    const map = { ...(data.recipe_by_flavor || {}) };
    delete map[old];
    setData((s) => ({ ...s, pizza_flavors: s.pizza_flavors.filter((_, idx) => idx !== i), recipe_by_flavor: map }));
  };

  const costTotal = useMemo(() => {
    const calc = (list) => (list || []).reduce((t, r) => {
      const i = insumos.find((x) => x.id === r.insumo_id);
      return t + (i ? r.quantity * i.cost_price : 0);
    }, 0);
    if (data.is_pizza) {
      return calc(data.base_recipe) + calc((data.recipe_by_flavor || {})[activeFlavor] || []);
    }
    return calc(data.recipe);
  }, [data, insumos, activeFlavor]);

  const precoSug = costTotal * (1 + (data.margin_pct || 0) / 100);
  const margemReal = data.base_price && costTotal ? (((data.base_price - costTotal) / costTotal) * 100).toFixed(1) : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="product-editor">
        <DialogHeader><DialogTitle>{data.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
        <Tabs defaultValue="basic">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="basic" data-testid="tab-basic">Básico</TabsTrigger>
            <TabsTrigger value="recipe" data-testid="tab-recipe">Ficha técnica</TabsTrigger>
            <TabsTrigger value="price" data-testid="tab-price">Preço & custo</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome *</Label>
                <Input value={data.name} onChange={(e) => upd("name", e.target.value)} data-testid="prod-edit-name" /></div>
              <div><Label>Categoria *</Label>
                <Select value={data.category_id} onValueChange={(v) => upd("category_id", v)}>
                  <SelectTrigger data-testid="prod-edit-cat"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Preço base (R$) *</Label>
                <Input type="number" step="0.01" value={data.base_price} onChange={(e) => upd("base_price", parseFloat(e.target.value) || 0)} data-testid="prod-edit-price" /></div>
              <div className="col-span-2"><Label>Descrição</Label>
                <Textarea rows={2} value={data.description || ""} onChange={(e) => upd("description", e.target.value)} /></div>
              <div className="col-span-2"><Label>URL da imagem</Label>
                <Input value={data.image_url || ""} onChange={(e) => upd("image_url", e.target.value)} placeholder="https://..." /></div>

              <div className="col-span-2 flex items-center gap-3 p-3 bg-amber-50 rounded border border-amber-200">
                <Pizza className="h-5 w-5 text-amber-700" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">Pizza com múltiplos sabores</div>
                  <div className="text-xs text-stone-600">Meio-a-meio (até 4 sabores). Ficha técnica por sabor.</div>
                </div>
                <Switch checked={data.is_pizza} onCheckedChange={(v) => upd("is_pizza", v)} data-testid="prod-edit-is-pizza" />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <Switch checked={data.active} onCheckedChange={(v) => upd("active", v)} />
                <Label>Produto ativo (aparece no caixa)</Label>
              </div>

              {data.is_pizza && (
                <div className="col-span-2 p-3 bg-stone-50 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="font-semibold">Sabores disponíveis</Label>
                    <Button size="sm" variant="outline" onClick={addFlavor}>+ sabor</Button>
                  </div>
                  <div className="space-y-1.5">
                    {data.pizza_flavors.map((f, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={f} onChange={(e) => updFlavor(i, e.target.value)} placeholder="Ex: Calabresa" data-testid={`flavor-${i}`} />
                        <Button size="icon" variant="ghost" onClick={() => delFlavor(i)}><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="col-span-2 p-3 bg-stone-50 rounded">
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">Variações (tamanho, extras...)</Label>
                  <Button size="sm" variant="outline" onClick={addVariation}>+ variação</Button>
                </div>
                <div className="space-y-3">
                  {data.variations.map((v, vi) => (
                    <div key={vi} className="p-3 bg-white rounded border">
                      <div className="grid grid-cols-5 gap-2 mb-2">
                        <Input className="col-span-2" placeholder="Nome (ex: Tamanho)" value={v.name} onChange={(e) => updVar(vi, { name: e.target.value })} />
                        <Select value={v.type} onValueChange={(val) => updVar(vi, { type: val })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="single">Escolha única</SelectItem>
                            <SelectItem value="multiple">Múltipla</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <Switch checked={v.required} onCheckedChange={(x) => updVar(vi, { required: x })} />
                          <span className="text-xs">obrig.</span>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => delVar(vi)}><X className="h-4 w-4 text-red-500" /></Button>
                      </div>
                      <div className="space-y-1 pl-3 border-l-2 border-amber-200">
                        {v.options.map((o, oi) => (
                          <div key={oi} className="flex gap-1.5">
                            <Input placeholder="Opção" value={o.label} onChange={(e) => updOpt(vi, oi, { label: e.target.value })} />
                            <Input type="number" step="0.01" placeholder="+R$" value={o.price_delta} onChange={(e) => updOpt(vi, oi, { price_delta: parseFloat(e.target.value) || 0 })} className="w-24" />
                            <Button size="icon" variant="ghost" onClick={() => delOpt(vi, oi)}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                        <Button size="sm" variant="ghost" onClick={() => addOpt(vi)}>+ opção</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="recipe" className="mt-4 space-y-4">
            <div>
              <Label className="font-semibold">Modo de baixa no estoque</Label>
              <Select value={data.production_mode || "none"} onValueChange={(v) => {
                setData((s) => ({
                  ...s,
                  production_mode: v,
                  ...(v !== "revenda" ? { stock_item_id: null, tracks_stock: false } : {}),
                }));
              }}>
                <SelectTrigger data-testid="prod-edit-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum controle de estoque</SelectItem>
                  <SelectItem value="revenda">Revenda — baixa direta de um item de estoque</SelectItem>
                  <SelectItem value="pronto">Produção própria — baixa do estoque de pronto</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-stone-500 mt-1">
                {data.production_mode === "revenda" && "Produto comprado pronto (refri, bombom). Venda baixa direto do item de Revenda."}
                {data.production_mode === "pronto" && "Produto feito pela casa. Use a aba Produção para produzir lotes. Venda baixa do pronto (FIFO)."}
                {data.production_mode === "none" && "Sem controle de estoque."}
              </p>
            </div>

            {data.production_mode === "revenda" && (
              <div className="p-3 bg-stone-50 rounded space-y-2">
                <Label>Item de revenda vinculado</Label>
                <Select value={data.stock_item_id || ""} onValueChange={(v) => { upd("stock_item_id", v); upd("tracks_stock", true); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{prontos.map((x) => <SelectItem key={x.id} value={x.id}>{x.name} ({x.quantity} {x.unit})</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">Unidades por venda</Label>
                  <Input type="number" step="0.01" className="w-24" value={data.stock_usage || 1} onChange={(e) => upd("stock_usage", parseFloat(e.target.value) || 1)} />
                </div>
              </div>
            )}

            {data.production_mode === "pronto" && (
              <div className="p-3 bg-stone-50 rounded space-y-3">
                {!data.is_pizza ? (
                  <div>
                    <Label className="font-semibold text-sm">Ficha técnica (insumos por 1 unidade)</Label>
                    <p className="text-xs text-stone-500 mb-2">Quando você produzir N unidades, o sistema consome N × cada quantidade.</p>
                    <RecipeEditor list={data.recipe} onChange={(v) => upd("recipe", v)} insumos={insumos} testid="recipe" />
                  </div>
                ) : (
                  <>
                    <div>
                      <Label className="font-semibold text-sm">Ficha base — comum a todos os sabores (por 1 pizza)</Label>
                      <p className="text-xs text-stone-500 mb-2">Ex: massa, molho, queijo.</p>
                      <RecipeEditor list={data.base_recipe} onChange={(v) => upd("base_recipe", v)} insumos={insumos} testid="base-recipe" />
                    </div>
                    <div className="pt-2 border-t">
                      <Label className="font-semibold text-sm">Ficha por sabor</Label>
                      {data.pizza_flavors.length === 0 ? (
                        <p className="text-xs text-red-600 mt-1">Adicione sabores na aba Básico primeiro.</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-1 mt-2 mb-2">
                            {data.pizza_flavors.filter(Boolean).map((f) => (
                              <button key={f} type="button" onClick={() => setActiveFlavor(f)}
                                className={`text-xs px-2 py-1 rounded-full border ${activeFlavor === f ? "bg-amber-600 text-white border-amber-600" : "bg-white border-stone-200 text-stone-700"}`}
                                data-testid={`recipe-flavor-tab-${f}`}
                              >{f}</button>
                            ))}
                          </div>
                          {activeFlavor && (
                            <RecipeEditor
                              list={(data.recipe_by_flavor || {})[activeFlavor] || []}
                              onChange={(v) => upd("recipe_by_flavor", { ...(data.recipe_by_flavor || {}), [activeFlavor]: v })}
                              insumos={insumos}
                              testid={`recipe-${activeFlavor}`}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="price" className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Preço base (R$)</Label>
                <Input type="number" step="0.01" value={data.base_price} onChange={(e) => upd("base_price", parseFloat(e.target.value) || 0)} /></div>
              <div><Label>Margem desejada (%)</Label>
                <Input type="number" step="1" value={data.margin_pct} onChange={(e) => upd("margin_pct", parseFloat(e.target.value) || 0)} data-testid="prod-margin-input" /></div>
            </div>
            <Card className="p-3 bg-amber-50 border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="h-4 w-4 text-amber-700" />
                <span className="text-sm font-semibold">Cálculo {data.is_pizza && activeFlavor && `(sabor ${activeFlavor})`}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-stone-500 uppercase">Custo</div>
                  <div className="pos-number text-base">{money(costTotal)}</div>
                </div>
                <div>
                  <div className="text-xs text-stone-500 uppercase">Preço sugerido</div>
                  <div className="pos-number text-base text-amber-700">{money(precoSug)}</div>
                </div>
                <div>
                  <div className="text-xs text-stone-500 uppercase">Margem real</div>
                  <div className="pos-number text-base">{margemReal !== null ? `${margemReal}%` : "—"}</div>
                </div>
              </div>
              {costTotal > 0 && data.base_price > 0 && data.base_price < costTotal && (
                <div className="mt-2 text-xs text-red-700">⚠ Preço de venda está abaixo do custo!</div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onSave} className="bg-amber-600 hover:bg-amber-700" data-testid="prod-edit-save">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
