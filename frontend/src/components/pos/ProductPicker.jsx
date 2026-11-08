import { useEffect, useMemo, useState } from "react";
import { apiClient, money } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pizza, Search } from "lucide-react";

export default function ProductPicker({ onPick }) {
  const [cats, setCats] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiClient.get("/categories").then((r) => setCats(r.data));
    apiClient.get("/products").then((r) => setProducts(r.data));
  }, []);

  const filtered = useMemo(() => {
    let list = products;
    if (activeCat) list = list.filter((p) => p.category_id === activeCat);
    if (search) {
      const q = search.toLowerCase();
      list = products.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCat, search]);

  return (
    <div className="p-4">
      <div className="sticky top-0 z-10 bg-white pb-3 -mt-4 -mx-4 px-4 pt-4 border-b border-stone-100 mb-4">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="product-search-input"
            className="pl-9 h-11"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
          <button
            onClick={() => setActiveCat(null)}
            data-testid="cat-filter-all"
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              !activeCat ? "bg-stone-900 text-amber-50" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            Todos
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              data-testid={`cat-filter-${c.name.toLowerCase()}`}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeCat === c.id ? "bg-amber-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            data-testid={`product-card-${p.id}`}
            className="group text-left bg-white border border-stone-200 rounded-xl overflow-hidden hover:border-amber-400 hover:shadow-md transition-all active:scale-[0.98]"
          >
            <div className="aspect-[4/3] bg-gradient-to-br from-amber-100 to-orange-100 relative overflow-hidden">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-amber-700/50 font-display text-4xl font-bold">
                  {p.name[0]}
                </div>
              )}
              {p.is_pizza && (
                <div className="absolute top-2 right-2 bg-amber-600 text-white rounded-full p-1.5">
                  <Pizza className="h-3 w-3" />
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="font-semibold text-sm text-stone-900 line-clamp-1">{p.name}</div>
              <div className="pos-number text-sm text-amber-700 mt-1">{money(p.base_price)}</div>
            </div>
          </button>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-12 text-stone-400 text-sm">Nenhum produto encontrado</div>
      )}
    </div>
  );
}
