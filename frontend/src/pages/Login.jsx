import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { TEST_IDS } from "@/constants/testIds";
import { Delete } from "lucide-react";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const doLogin = async (payload) => {
    try {
      setBusy(true);
      const u = await login(payload);
      toast.success(`Bem-vindo, ${u.name}!`);
      navigate(u.role === "gerente" ? "/dashboard" : "/caixa", { replace: true });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Falha ao entrar");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const onPinKey = (digit) => {
    if (pin.length >= 4 || busy) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      doLogin({ pin: next });
    }
  };

  const onPinBack = () => setPin((p) => p.slice(0, -1));

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex bakery-grain">
      {/* Left panel - brand */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(135deg, rgba(28,20,15,0.92), rgba(55,30,15,0.88)), url('/logo.webp')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-xl bg-white/10 border border-amber-400/40 overflow-hidden flex items-center justify-center shadow-xl">
              <img src="/logo.webp" alt="Assunção &amp; Paladini" className="h-full w-full object-cover" />
            </div>
            <div>
              <div className="font-display text-xl font-bold leading-none">Assunção &amp; Paladini</div>
              <div className="text-xs text-amber-100">Padaria · Lanchonete · Pizzaria</div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-widest text-amber-200">Sistema integrado de balcão</div>
            <h1 className="font-display text-5xl font-extrabold leading-tight">
              Vendas, comandas<br />e retaguarda<br />em um só lugar.
            </h1>
            <p className="text-amber-100/90 max-w-md">
              Caixa rápido, cardápio flexível, fiado controlado e estoque acompanhado — tudo pensado para o seu balcão.
            </p>
          </div>
          <div className="text-xs text-amber-200/70">
            © 2026 · Uso em rede local
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-xl overflow-hidden ring-1 ring-amber-200 bg-stone-900 flex items-center justify-center">
              <img src="/logo.webp" alt="Assunção &amp; Paladini" className="h-full w-full object-cover" />
            </div>
            <div>
              <div className="font-display text-lg font-bold">Assunção &amp; Paladini</div>
              <div className="text-xs text-stone-500">Padaria · Lanchonete · Pizzaria</div>
            </div>
          </div>

          <h2 className="font-display text-3xl font-bold text-stone-900 mb-1">Entrar</h2>
          <p className="text-sm text-stone-500 mb-8">Acesse com seu usuário ou PIN rápido</p>

          <Tabs defaultValue="user" className="w-full">
            <TabsList className="grid grid-cols-2 w-full bg-amber-50 border border-amber-200">
              <TabsTrigger value="user" data-testid={TEST_IDS.loginUserTab}>Usuário & senha</TabsTrigger>
              <TabsTrigger value="pin" data-testid={TEST_IDS.loginPinTab}>PIN rápido</TabsTrigger>
            </TabsList>

            <TabsContent value="user" className="mt-6">
              <form
                onSubmit={(e) => { e.preventDefault(); doLogin({ username, password }); }}
                className="space-y-4"
              >
                <div>
                  <Label htmlFor="username">Usuário</Label>
                  <Input
                    id="username"
                    data-testid={TEST_IDS.loginUsername}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="seu usuário"
                    autoComplete="username"
                    className="h-12 mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    data-testid={TEST_IDS.loginPassword}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-12 mt-1.5"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={busy || !username || !password}
                  data-testid={TEST_IDS.loginSubmit}
                  className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                >
                  {busy ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="pin" className="mt-6">
              <div className="flex justify-center gap-3 mb-6">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    data-testid={`login-pin-digit-${i}`}
                    className={`w-14 h-16 rounded-xl border-2 flex items-center justify-center font-mono text-3xl font-bold transition-all ${
                      pin.length > i
                        ? "border-amber-600 bg-amber-100 text-amber-900"
                        : "border-stone-200 bg-white text-stone-300"
                    }`}
                  >
                    {pin.length > i ? "•" : "·"}
                  </div>
                ))}
              </div>
              <input
                type="hidden"
                data-testid={TEST_IDS.loginPinInput}
                value={pin}
                readOnly
              />
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    type="button"
                    data-testid={`login-pinpad-${n}`}
                    onClick={() => onPinKey(String(n))}
                    disabled={busy}
                    className="h-16 rounded-xl bg-white border border-stone-200 text-2xl font-display font-bold text-stone-700 hover:bg-amber-50 hover:border-amber-400 active:scale-95 transition-all"
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={onPinBack}
                  data-testid="login-pinpad-back"
                  className="h-16 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-200 active:scale-95 transition-all"
                >
                  <Delete className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => onPinKey("0")}
                  disabled={busy}
                  data-testid="login-pinpad-0"
                  className="h-16 rounded-xl bg-white border border-stone-200 text-2xl font-display font-bold text-stone-700 hover:bg-amber-50 hover:border-amber-400 active:scale-95 transition-all"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPin("")}
                  data-testid="login-pinpad-clear"
                  className="h-16 rounded-xl bg-stone-100 border border-stone-200 text-sm font-medium text-stone-600 hover:bg-stone-200 active:scale-95 transition-all"
                >
                  Limpar
                </button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
