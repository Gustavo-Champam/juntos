import { CalendarCheck2, MapPin, UsersRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";

const commitments = [
  {
    day: "Hoje",
    date: "4 set",
    time: "08:30",
    title: "Começar o trabalho",
    people: "Ambos",
    place: "Trabalho",
  },
  {
    day: "Hoje",
    date: "4 set",
    time: "19:00",
    title: "Faculdade",
    people: "Ambos",
    place: "Campus",
  },
  {
    day: "Sábado",
    date: "5 set",
    time: "10:00",
    title: "Mercado da semana",
    people: "Nós dois",
    place: "Mercado",
  },
  {
    day: "Domingo",
    date: "6 set",
    time: "17:30",
    title: "Caminhada juntos",
    people: "Nós dois",
    place: "Parque",
  },
] as const;

export default function AgendaPage() {
  return (
    <AppShell currentPath="/agenda">
      <section className="collection-view" aria-labelledby="agenda-title">
        <header className="collection-heading">
          <div>
            <p className="eyebrow">PRÓXIMOS DIAS</p>
            <h1 id="agenda-title">Agenda da semana</h1>
            <p>Compromissos dos dois, em uma única ordem cronológica.</p>
          </div>
          <span className="collection-count">
            <CalendarCheck2 size={16} aria-hidden="true" />
            4 compromissos
          </span>
        </header>

        <ol className="agenda-list" aria-label="Compromissos da semana">
          {commitments.map((commitment) => (
            <li
              className="agenda-row"
              key={`${commitment.date}-${commitment.time}`}
            >
              <div className="agenda-date">
                <strong>{commitment.day}</strong>
                <span>{commitment.date}</span>
              </div>
              <time dateTime={`2026-09-0${Number.parseInt(commitment.date)}T${commitment.time}`}>
                {commitment.time}
              </time>
              <div className="agenda-copy">
                <h2>{commitment.title}</h2>
                <p>
                  <span>
                    <UsersRound size={14} aria-hidden="true" />
                    {commitment.people}
                  </span>
                  <span>
                    <MapPin size={14} aria-hidden="true" />
                    {commitment.place}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </AppShell>
  );
}
