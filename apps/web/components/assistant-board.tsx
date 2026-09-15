"use client";

import { CalendarCheck2, CookingPot, ShoppingBasket, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";

import { household } from "@/lib/household-client";

type AssistantPayload = {
  ok: boolean;
  summary?: string;
  error?: string;
  results?: Array<{ type: string; ok: boolean; detail: string }>;
};

const EXAMPLES = [
  "Coloque na agenda que tenho consulta amanhã 17h e a janta vai ser arroz, feijão e carne",
  "Almoço de hoje é strogonoff e à noite tem faculdade às 19h",
  "Sábado 10h mercado e coloca banana na lista",
];

export function AssistantBoard() {
  const [command, setCommand] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AssistantPayload | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!command.trim() || pending) return;
    setPending(true);
    setResult(null);
    try {
      const payload = (await household.assistant(command.trim())) as AssistantPayload;
      setResult(payload);
      if (payload.ok) setCommand("");
    } catch {
      setResult({ ok: false, error: "Não deu para falar com a IA agora." });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="collection-view" aria-labelledby="assistant-title">
      <header className="collection-heading">
        <div>
          <p className="eyebrow">Automatizar</p>
          <h1 id="assistant-title">Pedir à IA</h1>
          <p>Falem como no zap: a IA coloca na agenda, no cardápio e na lista.</p>
        </div>
        <span className="collection-count">
          <Sparkles size={16} aria-hidden="true" />
          Grava na rotina
        </span>
      </header>

      <form className="assistant-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="assistant-command">O que vocês querem organizar?</label>
        <textarea
          id="assistant-command"
          rows={5}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="Ex.: consulta amanhã 17h e jantar arroz, feijão e carne"
        />
        <button className="identity-action" type="submit" disabled={pending}>
          <Sparkles size={16} aria-hidden="true" />
          {pending ? "Organizando…" : "Fazer isso"}
        </button>
      </form>

      {result?.ok ? (
        <div className="assistant-result" role="status">
          <p className="eyebrow">Pronto</p>
          <p>{result.summary}</p>
          <ul>
            {(result.results ?? []).map((item, index) => (
              <li key={`${item.detail}-${index}`}>
                {item.type === "agenda" ? <CalendarCheck2 size={16} /> : null}
                {item.type === "meal" ? <CookingPot size={16} /> : null}
                {item.type === "shopping" ? <ShoppingBasket size={16} /> : null}
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result && !result.ok ? (
        <p role="alert">{result.error}</p>
      ) : null}

      <div className="assistant-examples">
        <h2>Podem falar assim</h2>
        <ul>
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button type="button" className="example-chip" onClick={() => setCommand(example)}>
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
