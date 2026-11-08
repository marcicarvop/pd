import { useEffect, useState } from "react";
import { apiClient, money } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Package, Users, AlertCircle, ShoppingBag, Clock } from "lucide-react";

const PAYMENT_COLORS = {
  dinheiro: "#16A34A",
  cartao: "#2563EB",
  pix: "#9333EA",
  fiado: "#C2410C",
};
const PAYMENT_LABEL = { dinheiro: "Dinheiro", cartao: "Cartão", pix: "PIX", fiado: "Fiado" };

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiClient.get("/dashboard").then((r) => setData(r.data));
  }, []);

  if (!data) return <div className="p-6 text-stone-500">Carregando…</div>;

  const paymentData = Object.entries(data.por_pagamento || {}).map(([k, v]) => ({
    name: PAYMENT_LABEL[k] || k,
    value: v,
    color: PAYMENT_COLORS[k] || "#78716C",
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-stone-900">Painel gerencial</h1>
        <p className="text-sm text-stone-500 mt-1">Visão consolidada do dia</p>
      </div>

      <div className="grid md:grid-cols-4 gap-3 mb-6">
        <KPI
          label="Faturamento hoje"
          value={money(data.faturamento_hoje)}
          icon={TrendingUp}
          accent="bg-amber-100 text-amber-800"
          testid="kpi-faturamento"
        />
        <KPI
          label="Vendas hoje"
          value={data.vendas_hoje}
          icon={ShoppingBag}
          accent="bg-emerald-100 text-emerald-800"
          testid="kpi-vendas"
        />
        <KPI
          label="Ticket médio"
          value={money(data.ticket_medio)}
          icon={TrendingUp}
          accent="bg-blue-100 text-blue-800"
          testid="kpi-ticket"
        />
        <KPI
          label="A receber (fiado)"
          value={money(data.total_fiado)}
          sub={`${data.clientes_devedores} ${data.clientes_devedores === 1 ? "cliente" : "clientes"}`}
          icon={Users}
          accent="bg-orange-100 text-orange-800"
          testid="kpi-fiado"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-6">
        <Card className="p-5">
          <h3 className="font-display font-bold mb-3">Vendas - últimos 7 dias</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.trend_7dias}>
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="#78716C" fontSize={11} />
              <YAxis stroke="#78716C" fontSize={11} tickFormatter={(v) => `R$${v}`} />
              <Tooltip formatter={(v) => money(v)} />
              <Line type="monotone" dataKey="total" stroke="#D97706" strokeWidth={2.5} dot={{ fill: "#D97706", r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-bold mb-3">Formas de pagamento hoje</h3>
          {paymentData.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-stone-400">Sem vendas hoje</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {paymentData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Legend verticalAlign="middle" align="right" layout="vertical" />
                <Tooltip formatter={(v) => money(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card className="p-5">
          <h3 className="font-display font-bold mb-3">Top 5 produtos de hoje</h3>
          {data.top_produtos?.length === 0 ? (
            <div className="text-sm text-stone-400 py-6 text-center">Sem vendas hoje</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.top_produtos} layout="vertical">
                <XAxis type="number" tickFormatter={(v) => `R$${v}`} fontSize={11} stroke="#78716C" />
                <YAxis dataKey="name" type="category" width={120} fontSize={11} stroke="#271E17" />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="valor" fill="#D97706" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-bold mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600" />
            Alertas de estoque
          </h3>
          <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-thin">
            {data.alertas_estoque?.length === 0 && <div className="text-sm text-stone-400">Nenhum alerta ✓</div>}
            {data.alertas_estoque?.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-2 bg-red-50 rounded">
                <span className="text-sm font-medium">{a.name}</span>
                <span className="pos-number text-sm text-red-700">{a.quantity}/{a.min_quantity} {a.unit}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 md:col-span-2">
          <h3 className="font-display font-bold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            Encomendas para hoje
          </h3>
          <div className="space-y-2">
            {data.encomendas_hoje?.length === 0 && <div className="text-sm text-stone-400">Nenhuma encomenda para hoje</div>}
            {data.encomendas_hoje?.map((e) => (
              <div key={e.id} className="flex items-center justify-between p-3 bg-amber-50/50 rounded border border-amber-100">
                <div>
                  <div className="font-semibold text-sm">{e.customer_name}</div>
                  <div className="text-xs text-stone-500">{e.delivery_time} · {e.items.length} itens</div>
                </div>
                <div className="pos-number text-amber-700">{money(e.total)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function KPI({ label, value, sub, icon: Icon, accent, testid }) {
  return (
    <Card className="p-4" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold">{label}</div>
          <div className="pos-number text-2xl text-stone-900 mt-1">{value}</div>
          {sub && <div className="text-xs text-stone-500 mt-0.5">{sub}</div>}
        </div>
        <div className={`h-9 w-9 rounded-lg ${accent} flex items-center justify-center`}>
          <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
        </div>
      </div>
    </Card>
  );
}
