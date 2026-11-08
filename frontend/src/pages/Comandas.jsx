import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, money, formatDate } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Receipt, ArrowRight } from "lucide-react";
import ReceiptDialog from "@/components/pos/ReceiptDialog";

function StatusBadge({ status }) {
  const map = {
    aberta: ["Aberta", "bg-blue-100 text-blue-800"],
    em_producao: ["Em produção", "bg-amber-100 text-amber-800"],
    pronta: ["Pronta", "bg-emerald-100 text-emerald-800"],
    aguardando_pagamento: ["Aguardando pag.", "bg-orange-100 text-orange-800"],
    fechada: ["Fechada", "bg-stone-100 text-stone-700"],
    cancelada: ["Cancelada", "bg-red-100 text-red-700"],
  };
  const [l, c] = map[status] || map.aberta;
  return <Badge className={c}>{l}</Badge>;
}

export default function Comandas() {
  const [openList, setOpenList] = useState([]);
  const [closedList, setClosedList] = useState([]);
  const [viewing, setViewing] = useState(null);

  const load = () => {
    apiClient.get("/orders", { params: { status: "aberta,em_producao,pronta,aguardando_pagamento" } })
      .then((r) => setOpenList(r.data));
    apiClient.get("/orders", { params: { status: "fechada" } })
      .then((r) => setClosedList(r.data.slice(0, 50)));
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    await apiClient.patch(`/orders/${id}`, { status });
    load();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">Comandas</h1>
          <p className="text-sm text-stone-500 mt-1">Acompanhe pedidos e status em tempo real</p>
        </div>
        <Button onClick={load} variant="outline" data-testid="comandas-refresh">Atualizar</Button>
      </div>

      <Tabs defaultValue="abertas">
        <TabsList>
          <TabsTrigger value="abertas" data-testid="tab-abertas">
            Abertas <Badge className="ml-2 bg-amber-100 text-amber-800">{openList.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="fechadas" data-testid="tab-fechadas">
            Fechadas hoje <Badge className="ml-2 bg-stone-100 text-stone-700">{closedList.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="abertas" className="mt-4">
          {openList.length === 0 ? (
            <Card className="p-12 text-center text-stone-500">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 text-stone-300" />
              Nenhuma comanda aberta
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {openList.map((o) => (
                <Card key={o.id} className="p-4" data-testid={`comanda-card-${o.number}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-xs text-stone-400">#{o.number}</div>
                      <div className="font-display font-bold text-lg">{o.table_label}</div>
                      {o.customer_name && (
                        <div className="text-xs text-orange-700">{o.customer_name}</div>
                      )}
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="text-xs text-stone-500 mb-3">
                    {o.items?.length || 0} itens · {formatDate(o.created_at)}
                  </div>
                  <div className="pos-number text-xl text-amber-700 mb-3">{money(o.total)}</div>
                  <div className="flex gap-2 flex-wrap">
                    {o.status === "aberta" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(o.id, "em_producao")}>Em produção</Button>
                    )}
                    {o.status === "em_producao" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(o.id, "pronta")}>Pronta</Button>
                    )}
                    {o.status === "pronta" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(o.id, "aguardando_pagamento")}>Aguardando pag.</Button>
                    )}
                    <Link to={`/caixa?order=${o.id}`}>
                      <Button size="sm" className="bg-amber-600 hover:bg-amber-700" data-testid={`comanda-goto-${o.number}`}>
                        Abrir <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="fechadas" className="mt-4">
          <Card className="divide-y">
            {closedList.length === 0 && <div className="p-8 text-center text-stone-500">Sem vendas fechadas ainda</div>}
            {closedList.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-4 hover:bg-stone-50">
                <div>
                  <div className="font-mono text-xs text-stone-400">#{o.number}</div>
                  <div className="font-semibold">{o.table_label}</div>
                  <div className="text-xs text-stone-500">{formatDate(o.closed_at)} · {o.operator_name}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="pos-number text-lg text-stone-800">{money(o.total)}</div>
                  <Button size="sm" variant="outline" onClick={() => setViewing(o)} data-testid={`view-closed-${o.number}`}>
                    <Receipt className="h-3 w-3 mr-1" /> Resumo
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      {viewing && <ReceiptDialog order={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
