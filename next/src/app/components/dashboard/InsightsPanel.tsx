'use client';

import { memo } from 'react';
import { MonitoringInsight } from '../../utils/prometheusMonitoring';

type InsightsPanelProps = {
  insights: MonitoringInsight[];
  observedWindowLabel: string;
};

const toneStyles: Record<MonitoringInsight['tone'], string> = {
  positive: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
  neutral: 'border-sky-400/40 bg-sky-500/10 text-sky-100',
  warning: 'border-amber-400/50 bg-amber-500/10 text-amber-100',
};

const toneBulletStyles: Record<MonitoringInsight['tone'], string> = {
  positive: 'bg-emerald-300',
  neutral: 'bg-sky-300',
  warning: 'bg-amber-300',
};

export const InsightsPanel = memo(function InsightsPanel({
  insights,
  observedWindowLabel,
}: InsightsPanelProps) {
  return (
    <aside className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/75 to-slate-950/80 p-4 shadow-lg shadow-black/30">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-100 md:text-base">Insights automatiques</h3>
        <span className="rounded-full border border-slate-700/80 px-2 py-0.5 text-[11px] text-slate-300">
          Fenetre: {observedWindowLabel}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {insights.length > 0 ? (
          insights.map((insight) => (
            <article
              key={insight.id}
              className={`rounded-xl border p-3 text-sm ${toneStyles[insight.tone]}`}
              title={insight.description}
            >
              <p className="flex items-center gap-2 font-semibold">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${toneBulletStyles[insight.tone]}`}
                  aria-hidden="true"
                />
                {insight.title}
              </p>
              <p className="mt-1 text-xs opacity-90 md:text-sm">{insight.description}</p>
            </article>
          ))
        ) : (
          <p className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-3 text-sm text-slate-400">
            Insights indisponibles avec la fenetre courante.
          </p>
        )}
      </div>
    </aside>
  );
});
