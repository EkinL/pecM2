import Link from 'next/link';
import { formatLookSummary } from '../../aiOptions';
import type { AiProfile, Timestamp } from '../../types';

const normalizeStatus = (status?: string) => {
  const normalized = status?.toLowerCase() ?? 'pending';
  if (['pending', 'active', 'suspended', 'disabled', 'rejected'].includes(normalized)) {
    return normalized;
  }
  return 'pending';
};

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  active: 'Active',
  suspended: 'Suspendue',
  disabled: 'Desactivee',
  rejected: 'Refusee',
};

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-100/80 text-amber-700 border border-amber-400/70',
  active: 'bg-emerald-100/80 text-emerald-700 border border-emerald-400/70',
  suspended: 'bg-sky-100/80 text-sky-700 border border-sky-400/70',
  disabled: 'bg-slate-100/80 text-slate-700 border border-slate-300/80',
  rejected: 'bg-rose-100/80 text-rose-700 border border-rose-400/70',
};

const formatDate = (value?: Timestamp | string) => {
  if (!value) {
    return '—';
  }
  if (typeof value === 'string') {
    return new Date(value).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }
  if (typeof value === 'object' && value.seconds) {
    return new Date(value.seconds * 1000).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }
  return '—';
};

type OwnerAiCardProps = {
  profile: AiProfile;
  hasSubscription: boolean;
  isUpdating: boolean;
  accessError?: string;
  onVisibilityChange: (value: 'public' | 'private') => void;
  onAccessTypeChange: (value: 'free' | 'paid') => void;
};

export const OwnerAiCard = ({
  profile,
  hasSubscription,
  isUpdating,
  accessError,
  onVisibilityChange,
  onAccessTypeChange,
}: OwnerAiCardProps) => {
  const visibilityValue = profile.visibility ?? 'public';
  const accessTypeValue = profile.accessType ?? 'free';
  const statusKey = normalizeStatus(profile.status);
  const accessBadgeClass =
    accessTypeValue === 'paid'
      ? 'border border-amber-400/70 bg-amber-500/10 text-amber-200'
      : 'border border-emerald-400/70 bg-emerald-500/10 text-emerald-200';

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{profile.name ?? `IA ${profile.id.slice(0, 5)}`}</p>
          <p className="mt-1 text-xs text-slate-400">
            {profile.mentality ?? 'Mentalite non definie'} · {profile.voice ?? 'Voix non definie'}
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatLookSummary(profile.look)}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusStyles[statusKey]}`}
        >
          {statusLabels[statusKey]}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
        {visibilityValue === 'private' && (
          <span className="rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-200">
            Privée
          </span>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${accessBadgeClass}`}
        >
          {accessTypeValue === 'paid' ? 'Payante' : 'Gratuite'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <p>Mis à jour: {formatDate(profile.updatedAt)}</p>
        <Link
          href={`/ia/${profile.id}`}
          className="rounded-full border border-slate-700/80 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-slate-500"
        >
          Voir
        </Link>
      </div>

      <div className="mt-4 space-y-3 border-t border-slate-800/60 pt-4 text-xs text-slate-400">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-[11px] uppercase tracking-wide text-slate-400">
            <span className="font-semibold text-slate-200">Visibilité</span>
            <select
              value={visibilityValue}
              onChange={(event) => onVisibilityChange(event.target.value as 'public' | 'private')}
              disabled={isUpdating}
              className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
            >
              <option value="public">Publique</option>
              <option value="private">Privée</option>
            </select>
          </label>
          <label className="space-y-1 text-[11px] uppercase tracking-wide text-slate-400">
            <span className="font-semibold text-slate-200">Accès</span>
            <select
              value={accessTypeValue}
              onChange={(event) => onAccessTypeChange(event.target.value as 'free' | 'paid')}
              disabled={isUpdating}
              className="w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
            >
              <option value="free">Gratuite</option>
              <option value="paid" disabled={!hasSubscription}>
                Payante
              </option>
            </select>
          </label>
        </div>
        {accessError && <p className="text-[11px] text-rose-300">{accessError}</p>}
        {!hasSubscription && (
          <p className="text-[11px] text-amber-300">
            Vous devez disposer d&apos;un abonnement premium pour vendre votre IA.
          </p>
        )}
      </div>
    </div>
  );
};
