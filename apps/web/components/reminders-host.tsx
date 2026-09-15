"use client";

import { useEffect, useState } from "react";

import { civilToday } from "@/lib/dates";
import { household } from "@/lib/household-client";

const KEY = "juntos-reminders";

function allowed(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

function remember(id: string) {
  const raw = sessionStorage.getItem(KEY);
  const seen = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  seen.add(id);
  sessionStorage.setItem(KEY, JSON.stringify([...seen]));
}

function already(id: string) {
  const raw = sessionStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as string[]).includes(id) : false;
}

export function RemindersHost() {
  const [prompt, setPrompt] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") setPrompt(true);
  }, []);

  useEffect(() => {
    if (!allowed()) return;
    let cancelled = false;

    async function tick() {
      if (cancelled || !allowed()) return;
      const today = civilToday();
      try {
        const [agenda, meals] = await Promise.all([
          household.agenda(today, today) as Promise<{
            snapshot?: { occurrences: { occurrenceId: string; startsAt: string; event: { title: string } }[] };
          }>,
          household.meals(today, today) as Promise<Array<{ id: string; title: string; time?: string }>>,
        ]);
        const now = Date.now();
        for (const item of agenda.snapshot?.occurrences ?? []) {
          const at = new Date(item.startsAt).getTime();
          if (at - now > 0 && at - now < 15 * 60 * 1000 && !already(item.occurrenceId)) {
            new Notification("Juntos", { body: `${item.event.title} em 15 minutos` });
            remember(item.occurrenceId);
          }
        }
        for (const meal of meals) {
          if (!meal.time) continue;
          const at = new Date(`${today}T${meal.time}:00-03:00`).getTime();
          if (at - now > 0 && at - now < 15 * 60 * 1000 && !already(meal.id)) {
            new Notification("Juntos", { body: `Hora de: ${meal.title}` });
            remember(meal.id);
          }
        }
      } catch {
        /* keep the day going even if reminders miss a beat */
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [prompt]);

  async function enable() {
    if (typeof Notification === "undefined") return;
    await Notification.requestPermission();
    setPrompt(false);
  }

  if (!prompt) return null;

  return (
    <div className="reminder-banner">
      <p>Avisar no celular 15 minutos antes dos compromissos e refeições?</p>
      <div className="slot-actions">
        <button type="button" className="identity-action" onClick={() => void enable()}>Sim, avisar</button>
        <button type="button" className="quiet-button" onClick={() => setPrompt(false)}>Agora não</button>
      </div>
    </div>
  );
}
