type RoadmapPhase = {
  title: string;
  summary: string;
  tasks: string[];
};

type RoadmapSectionProps = {
  phases: RoadmapPhase[];
};

export const RoadmapSection = ({ phases }: RoadmapSectionProps) => (
  <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold">Roadmap produit</h2>
      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Vision</span>
    </div>
    <div className="mt-6 space-y-4">
      {phases.map((phase) => (
        <article
          key={phase.title}
          className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{phase.title}</p>
            <span className="text-[11px] text-slate-500">Suivre</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{phase.summary}</p>
          <ul className="mt-3 space-y-1 text-[11px] text-slate-300">
            {phase.tasks.map((task) => (
              <li key={task} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>{task}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  </section>
);
