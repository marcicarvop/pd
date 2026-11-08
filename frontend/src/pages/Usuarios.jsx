import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, KeyRound } from "lucide-react";

export default function Usuarios() {
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => apiClient.get("/users").then((r) => setUsers(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editing.id) {
        const patch = { name: editing.name, role: editing.role };
        if (editing.password) patch.password = editing.password;
        if (editing.pin !== undefined && editing.pin !== "") patch.pin = editing.pin;
        await apiClient.patch(`/users/${editing.id}`, patch);
      } else {
        await apiClient.post("/users", editing);
      }
      toast.success("Usuário salvo");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    }
  };

  const remove = async (u) => {
    if (!confirm(`Remover usuário ${u.name}?`)) return;
    try {
      await apiClient.delete(`/users/${u.id}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">Usuários</h1>
          <p className="text-sm text-stone-500 mt-1">Gerencie quem pode acessar o sistema</p>
        </div>
        <Button onClick={() => setEditing({ username: "", name: "", role: "operador", password: "", pin: "" })} data-testid="new-user-btn" className="bg-amber-600 hover:bg-amber-700">
          <Plus className="h-4 w-4 mr-1" /> Novo usuário
        </Button>
      </div>

      <Card className="divide-y">
        {users.map((u) => (
          <div key={u.id} className="p-4 flex items-center gap-3" data-testid={`user-row-${u.id}`}>
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 font-bold">
              {u.name[0]}
            </div>
            <div className="flex-1">
              <div className="font-semibold">{u.name}</div>
              <div className="text-xs text-stone-500">@{u.username}</div>
            </div>
            <Badge className={u.role === "gerente" ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-700"}>
              {u.role}
            </Badge>
            {u.has_pin && (
              <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                <KeyRound className="h-3 w-3 mr-1" /> PIN
              </Badge>
            )}
            <Button size="icon" variant="ghost" onClick={() => setEditing({ ...u, password: "", pin: "" })}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => remove(u)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
      </Card>

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent data-testid="user-dialog">
            <DialogHeader><DialogTitle>{editing.id ? "Editar usuário" : "Novo usuário"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              {!editing.id && (
                <div className="col-span-2"><Label>Usuário (login) *</Label>
                  <Input value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} data-testid="user-username-input" /></div>
              )}
              <div className="col-span-2"><Label>Nome *</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="user-name-input" /></div>
              <div><Label>Perfil *</Label>
                <Select value={editing.role} onValueChange={(v) => setEditing({ ...editing, role: v })}>
                  <SelectTrigger data-testid="user-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operador">Operador de caixa</SelectItem>
                    <SelectItem value="gerente">Gerente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>PIN (4 dígitos)</Label>
                <Input maxLength={4} value={editing.pin || ""} onChange={(e) => setEditing({ ...editing, pin: e.target.value.replace(/\D/g, "") })} placeholder={editing.id ? "deixe vazio p/ manter" : "opcional"} data-testid="user-pin-input" /></div>
              <div className="col-span-2"><Label>Senha {editing.id ? "(nova, opcional)" : "*"}</Label>
                <Input type="password" value={editing.password || ""} onChange={(e) => setEditing({ ...editing, password: e.target.value })} data-testid="user-password-input" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save} data-testid="user-save" className="bg-amber-600 hover:bg-amber-700">Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
