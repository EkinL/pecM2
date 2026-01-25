type FocusSectionProps = {
  title: string;
  items: string[];
};

const FocusList = ({ title, items }: FocusSectionProps) => (
  <article className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4">
    <h3 className="text-sm font-semibold">{title}</h3>
    <ul className="mt-3 space-y-2 text-[11px] text-slate-200">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </article>
);

type FocusGridProps = {
  definitions: string[];
  functionality: string[];
  monetization: string[];
};

export const FocusSection = ({ definitions, functionality, monetization }: FocusGridProps) => (
  <section className="grid gap-4 lg:grid-cols-3">
    <FocusList title="Focus UX" items={definitions} />
    <FocusList title="Fonctionnalité IA" items={functionality} />
    <FocusList title="Monétisation" items={monetization} />
  </section>
);
