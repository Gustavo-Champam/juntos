"use client";

import { ShoppingBasket } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";

const shoppingItems = [
  { name: "Banana", quantity: "8 unidades", note: "cafés e vitaminas", checked: false },
  { name: "Iogurte natural", quantity: "6 potes", note: "cafés rápidos", checked: true },
  { name: "Ovos", quantity: "18 unidades", note: "café e jantar", checked: false },
  { name: "Peito de frango", quantity: "1,5 kg", note: "almoços e wraps", checked: false },
  { name: "Arroz", quantity: "1 pacote", note: "base da semana", checked: true },
  { name: "Legumes variados", quantity: "1 cesta", note: "almoço e sopa", checked: false },
  { name: "Pão integral", quantity: "1 pacote", note: "torradas e sanduíches", checked: false },
  { name: "Queijo", quantity: "400 g", note: "lanches e receitas", checked: false },
] as const;

export default function ShoppingPage() {
  const [checkedItems, setCheckedItems] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        shoppingItems.filter((item) => item.checked).map((item) => item.name),
      ),
  );

  function toggleItem(name: string) {
    setCheckedItems((currentItems) => {
      const nextItems = new Set(currentItems);

      if (nextItems.has(name)) {
        nextItems.delete(name);
      } else {
        nextItems.add(name);
      }

      return nextItems;
    });
  }

  return (
    <AppShell currentPath="/compras">
      <section className="collection-view" aria-labelledby="shopping-title">
        <header className="collection-heading">
          <div>
            <p className="eyebrow">GERADA PELO CARDÁPIO</p>
            <h1 id="shopping-title">Lista de compras</h1>
            <p>Uma lista única para os dois acompanharem sem duplicar itens.</p>
          </div>
          <span className="collection-count" aria-live="polite">
            <ShoppingBasket size={16} aria-hidden="true" />
            {checkedItems.size} de {shoppingItems.length} comprados
          </span>
        </header>

        <fieldset className="shopping-list">
          <legend>Itens para esta semana</legend>
          {shoppingItems.map((item) => (
            <label className="shopping-row" key={item.name}>
              <input
                type="checkbox"
                checked={checkedItems.has(item.name)}
                onChange={() => toggleItem(item.name)}
              />
              <span className="shopping-check" aria-hidden="true" />
              <span className="shopping-copy">
                <strong>{item.name}</strong>
                <small>{item.note}</small>
              </span>
              <span className="shopping-quantity">{item.quantity}</span>
            </label>
          ))}
        </fieldset>
      </section>
    </AppShell>
  );
}
