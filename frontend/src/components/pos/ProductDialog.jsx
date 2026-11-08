import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Minus, Plus, Pizza } from "lucide-react";
import { money } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export default function ProductDialog({ product, onClose, onConfirm, initial }) {
  const [qty, setQty] = useState(initial?.quantity || 1);
  const [variations, setVariations] = useState(initial?.variations_data || {});
  const [halves, setHalves] = useState(initial?.pizza_halves || []);
  const [notes, setNotes] = useState(initial?.notes || "");

  const toggleHalf = (flavor) => {
    setHalves((h) =>
      h.includes(flavor) ? h.filter((x) => x !== flavor) : h.length < 4 ? [...h, flavor] : h
    );
  };

  const unitPrice = useMemo(() => {
    let price = product.base_price;
    for (const v of product.variations || []) {
      const sel = variations[v.name];
      if (!sel) continue;
      if (v.type === "single") {
        const opt = v.options.find((o) => o.label === sel);
        if (opt) price += opt.price_delta;
      } else {
        for (const label of sel) {
          const opt = v.options.find((o) => o.label === label);
          if (opt) price += opt.price_delta;
        }
      }
    }
    return price;
  }, [product, variations]);

  const canConfirm = useMemo(() => {
    if (product.is_pizza && halves.length === 0) return false;
    for (const v of product.variations || []) {
      if (v.required && !variations[v.name]) return false;
    }
    return qty > 0;
  }, [product, variations, halves, qty]);

  const confirm = () => {
    onConfirm({
      product_id: product.id,
      quantity: qty,
      variations_data: variations,
      pizza_halves: halves,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin" data-testid="product-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            {product.is_pizza && <Pizza className="h-5 w-5 text-amber-600" />}
            {product.name}
          </DialogTitle>
          {product.description && (
            <p className="text-sm text-stone-500">{product.description}</p>
          )}
        </DialogHeader>

        <div className="space-y-5 py-2">
          {product.is_pizza && (
            <div>
              <Label className="font-semibold text-stone-800 flex items-center gap-2">
                Sabores <Badge variant="outline" className="text-xs">até 4 · {halves.length}/4</Badge>
              </Label>
              <p className="text-xs text-stone-500 mb-2">
                Monte a pizza inteira ou meio-a-meio. O valor é o do tamanho escolhido.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {product.pizza_flavors.map((f, i) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleHalf(f)}
                    data-testid={`pizza-flavor-${i}`}
                    className={`p-2.5 rounded-lg border text-sm font-medium text-left transition-all ${
                      halves.includes(f)
                        ? "bg-amber-100 border-amber-500 text-amber-900"
                        : "bg-white border-stone-200 text-stone-700 hover:border-amber-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{f}</span>
                      {halves.includes(f) && (
                        <span className="text-xs font-mono text-amber-700">
                          {halves.length === 1 ? "inteiro" : `1/${halves.length}`}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {product.variations?.map((v, idx) => (
            <div key={v.name}>
              <Label className="font-semibold text-stone-800">
                {v.name} {v.required && <span className="text-red-500">*</span>}
              </Label>
              {v.type === "single" ? (
                <RadioGroup
                  value={variations[v.name] || ""}
                  onValueChange={(val) => setVariations((s) => ({ ...s, [v.name]: val }))}
                  className="mt-2 grid grid-cols-2 gap-2"
                >
                  {v.options.map((o) => (
                    <label
                      key={o.label}
                      data-testid={`variation-${idx}-${o.label}`}
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                        variations[v.name] === o.label
                          ? "bg-amber-50 border-amber-500"
                          : "bg-white border-stone-200 hover:border-amber-300"
                      }`}
                    >
                      <RadioGroupItem value={o.label} />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="text-sm">{o.label}</span>
                        {o.price_delta !== 0 && (
                          <span className="text-xs font-mono text-amber-700">
                            +{money(o.price_delta)}
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {v.options.map((o) => {
                    const sel = variations[v.name] || [];
                    const on = sel.includes(o.label);
                    return (
                      <label
                        key={o.label}
                        data-testid={`variation-${idx}-${o.label}`}
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                          on ? "bg-amber-50 border-amber-500" : "bg-white border-stone-200 hover:border-amber-300"
                        }`}
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={(c) =>
                            setVariations((s) => ({
                              ...s,
                              [v.name]: c ? [...sel, o.label] : sel.filter((x) => x !== o.label),
                            }))
                          }
                        />
                        <div className="flex-1 flex items-center justify-between">
                          <span className="text-sm">{o.label}</span>
                          {o.price_delta !== 0 && (
                            <span className="text-xs font-mono text-amber-700">+{money(o.price_delta)}</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div>
            <Label className="font-semibold text-stone-800">Observação</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: sem cebola, bem passado..."
              rows={2}
              data-testid="product-notes-input"
              className="mt-1.5"
            />
          </div>

          <div className="flex items-center justify-between bg-stone-50 rounded-lg p-3">
            <Label className="font-semibold text-stone-800">Quantidade</Label>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                data-testid="qty-minus"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="w-12 text-center pos-number text-xl">{qty}</div>
              <Button size="icon" variant="outline" onClick={() => setQty((q) => q + 1)} data-testid="qty-plus">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <div className="pos-number text-2xl text-amber-700">
            {money(unitPrice * qty)}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              onClick={confirm}
              disabled={!canConfirm}
              data-testid="product-dialog-confirm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {initial ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
