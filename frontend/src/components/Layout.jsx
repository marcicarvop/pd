import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api";
import {
  ShoppingBag, ClipboardList, BookOpen, CalendarDays,
  PackageSearch, LineChart, Users, LogOut, Bell, Menu, UtensilsCrossed, Wheat, ChefHat
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TEST_IDS } from "@/constants/testIds";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [clock, setClock] = useState(new Date());
  const [alertsCount, setAlertsCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (user?.role !== "gerente") return undefined;
    const fetchAlerts = () => {
      apiClient.get("/estoque/alertas").then((r) => setAlertsCount(r.data.length)).catch(() => {});
    };
    fetchAlerts();
    window.addEventListener("estoque-changed", fetchAlerts);
    const t = setInterval(fetchAlerts, 30000);
    return () => { clearInterval(t); window.removeEventListener("estoque-changed", fetchAlerts); };
  }, [user, location.pathname]);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const isGerente = user?.role === "gerente";

  const navItems = [
    { to: "/caixa", label: "Caixa", icon: ShoppingBag, testid: TEST_IDS.sidebarCaixa, roles: ["gerente", "operador"] },
    { to: "/comandas", label: "Comandas", icon: ClipboardList, testid: TEST_IDS.sidebarComandas, roles: ["gerente", "operador"] },
    { to: "/encomendas", label: "Encomendas", icon: CalendarDays, testid: TEST_IDS.sidebarEncomendas, roles: ["gerente", "operador"] },
    { to: "/fiado", label: "Fiado", icon: BookOpen, testid: TEST_IDS.sidebarFiado, roles: ["gerente", "operador"] },
    { to: "/cardapio", label: "Cardápio", icon: UtensilsCrossed, testid: TEST_IDS.sidebarCardapio, roles: ["gerente"] },
    { to: "/insumos", label: "Insumos", icon: Wheat, testid: "sidebar-nav-insumos", roles: ["gerente"] },
    { to: "/producao", label: "Produção", icon: ChefHat, testid: "sidebar-nav-producao", roles: ["gerente"] },
    { to: "/estoque", label: "Revenda", icon: PackageSearch, testid: TEST_IDS.sidebarEstoque, roles: ["gerente"] },
    { to: "/dashboard", label: "Dashboard", icon: LineChart, testid: TEST_IDS.sidebarDashboard, roles: ["gerente"] },
    { to: "/usuarios", label: "Usuários", icon: Users, testid: TEST_IDS.sidebarUsuarios, roles: ["gerente"] },
  ];

  const timeStr = clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = clock.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

  const sidebar = (
      <>
        <div className="p-5 border-b border-stone-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl overflow-hidden ring-1 ring-amber-500/60 bg-stone-950 flex items-center justify-center shrink-0">
              <img src="/logo.webp" alt="Assunção &amp; Paladini" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-base leading-tight">Assunção &amp; Paladini</div>
              <div className="text-[10px] uppercase tracking-widest text-amber-300/70">Padaria · Lanchonete · Pizzaria</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-1">
          {navItems.filter((n) => n.roles.includes(user?.role)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={n.testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                  isActive
                    ? "bg-amber-600 text-white shadow-lg shadow-amber-900/30"
                    : "text-amber-100/70 hover:bg-stone-800 hover:text-amber-100"
                }`
              }
            >
              <n.icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
              <span>{n.label}</span>
              {n.label === "Revenda" && alertsCount > 0 && (
                <Badge className="ml-auto bg-red-600 text-white text-[10px] h-5 px-1.5">{alertsCount}</Badge>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-stone-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-amber-600/30 border border-amber-500/50 flex items-center justify-center text-amber-200 font-bold">
              {user?.name?.[0] || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate" data-testid="current-user-name">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-amber-300/60">{user?.role}</div>
            </div>
          </div>
          <Button
            onClick={() => { logout(); navigate("/login"); }}
            variant="ghost"
            size="sm"
            data-testid={TEST_IDS.logoutButton}
            className="w-full justify-start text-amber-100 hover:text-white hover:bg-stone-800"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </>
  );

  return (
    <div className="h-screen flex bg-[#FAF7F2] bakery-grain">
      <aside className="hidden lg:flex w-64 bg-stone-900 text-amber-50 flex-col shrink-0 border-r border-stone-800 no-print">
        {sidebar}
      </aside>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-stone-900 text-amber-50 border-stone-800 flex flex-col" data-testid="mobile-sidebar">
          {sidebar}
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-stone-200 flex items-center justify-between px-3 sm:px-6 no-print gap-2">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setMenuOpen(true)} data-testid="mobile-menu-button">
              <Menu className="h-5 w-5" />
            </Button>
            <span className="hidden sm:inline text-xs uppercase tracking-widest text-stone-400">{dateStr}</span>
            <span className="pos-number text-lg text-stone-800">{timeStr}</span>
          </div>
          <div className="flex items-center gap-3">
            {isGerente && alertsCount > 0 && (
              <button
                onClick={() => navigate("/estoque")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-medium hover:bg-red-100"
                data-testid="topbar-stock-alert"
              >
                <Bell className="h-3.5 w-3.5" />
                {alertsCount}<span className="hidden sm:inline"> {alertsCount === 1 ? "item" : "itens"} em alerta</span>
              </button>
            )}
            <div className="hidden md:block text-xs text-stone-500">
              Logado como <strong className="text-stone-700">{user?.name}</strong>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
