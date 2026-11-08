import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { money, formatDate } from "@/lib/api";
import { Printer, X } from "lucide-react";

const METHOD_LABEL = {
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  pix: "PIX",
  fiado: "Fiado",
};

export default function ReceiptDialog({ order, onClose }) {
  const printIt = () => window.print();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden" data-testid="receipt-dialog">
        <div className="print-area">
          <div className="text-center border-b-2 border-dashed border-stone-300 pb-3 mb-3 pt-6 px-6">
            <div className="font-display font-extrabold text-xl">ASSUNÇÃO &amp; PALADINI</div>
            <div className="text-[10px] text-stone-600 uppercase tracking-wider">Padaria · Lanchonete · Pizzaria</div>
            <div className="text-[10px] text-stone-500 mt-1">Rua do Pão, 123 · (11) 5555-0000</div>
            <div className="text-[10px] text-stone-500">CNPJ: 00.000.000/0000-00</div>
            <div className="text-[10px] mt-2 font-semibold uppercase">Não é documento fiscal</div>
          </div>

          <div className="px-6 text-xs space-y-0.5 mono">
            <div className="flex justify-between">
              <span>Comanda:</span><span className="font-bold">#{order.number}</span>
            </div>
            <div className="flex justify-between">
              <span>Local:</span><span>{order.table_label}</span>
            </div>
            <div className="flex justify-between">
              <span>Operador:</span><span>{order.operator_name}</span>
            </div>
            <div className="flex justify-between">
              <span>Abertura:</span><span>{formatDate(order.created_at)}</span>
            </div>
            {order.closed_at && (
              <div className="flex justify-between">
                <span>Fechamento:</span><span>{formatDate(order.closed_at)}</span>
              </div>
            )}
            {order.customer_name && (
              <div className="flex justify-between"><span>Cliente:</span><span>{order.customer_name}</span></div>
            )}
          </div>

          <div className="mt-3 border-t border-dashed border-stone-300 mx-6" />

          <div className="px-6 py-3 space-y-2">
            {order.items?.map((it) => (
              <div key={it.id} className="text-xs">
                <div className="flex justify-between">
                  <span className="flex-1">{it.quantity}× {it.product_name}</span>
                  <span className="pos-number">{money(it.total_price)}</span>
                </div>
                {it.variations_text && (
                  <div className="text-[10px] text-stone-600 pl-3">{it.variations_text}</div>
                )}
                {it.pizza_halves?.length > 0 && !it.variations_text?.includes("Sabores:") && (
                  <div className="text-[10px] text-stone-600 pl-3">
                    Sabores: {it.pizza_halves.join(" / ")}
                  </div>
                )}
                {it.notes && (
                  <div className="text-[10px] italic text-stone-600 pl-3">Obs: {it.notes}</div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-stone-300 mx-6" />

          <div className="px-6 py-3 text-xs space-y-1 mono">
            <div className="flex justify-between">
              <span>Subtotal:</span><span>{money(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between">
                <span>Desconto:</span><span>-{money(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm border-t border-stone-300 pt-1 mt-1">
              <span>TOTAL:</span><span>{money(order.total)}</span>
            </div>
          </div>

          {order.payments?.length > 0 && (
            <>
              <div className="border-t border-dashed border-stone-300 mx-6" />
              <div className="px-6 py-3 text-xs mono space-y-0.5">
                <div className="font-semibold uppercase text-[10px] mb-1">Pagamentos</div>
                {order.payments.map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{METHOD_LABEL[p.method] || p.method}</span>
                    <span>{money(p.amount)}</span>
                  </div>
                ))}
                {order.payments.some((p) => p.change > 0) && (
                  <div className="flex justify-between pt-1 border-t border-stone-300 mt-1">
                    <span>Troco:</span>
                    <span>{money(order.payments.find((p) => p.change > 0)?.change || 0)}</span>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="text-center text-[10px] text-stone-500 pb-6 px-6">
            Obrigado pela preferência! ☕<br />
            Assunção &amp; Paladini · {new Date().getFullYear()}
          </div>
        </div>

        <div className="p-3 bg-stone-50 border-t flex justify-between no-print">
          <Button variant="outline" onClick={onClose} data-testid="receipt-close">
            <X className="h-4 w-4 mr-1" /> Fechar
          </Button>
          <Button onClick={printIt} data-testid="receipt-print" className="bg-amber-600 hover:bg-amber-700">
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
