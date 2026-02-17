import Link from 'next/link';
import { Conversation, Timestamp, Utilisateur } from '../../types/dashboard';

type UserRoleAction = null | {
  id: string;
  status: 'loading' | 'success' | 'error';
  message?: string;
};

type TokenGrantAction = null | {
  id: string;
  status: 'loading' | 'success' | 'error';
  message?: string;
};

type TokenGrantInputs = Record<string, { amount: string; password: string }>;

type UsersSectionProps = {
  usersLoading: boolean;
  usersError: string | null;
  latestUsers: Utilisateur[];
  conversations: Conversation[];
  userRoleAction: UserRoleAction;
  tokenGrantInputs: TokenGrantInputs;
  tokenGrantAction: TokenGrantAction;
  handlePromoteToAdmin: (userId: string) => void;
  updateTokenGrantInput: (userId: string, field: 'amount' | 'password', value: string) => void;
  handleGrantTokens: (userId: string) => void;
  formatUserLabel: (user: Utilisateur) => string;
  formatDate: (value?: Timestamp | string) => string;
};

const UserListItem = ({
  user,
  actionState,
  tokenInput,
  tokenAction,
  conversations,
  handlePromoteToAdmin,
  updateTokenGrantInput,
  handleGrantTokens,
  formatUserLabel,
  formatDate,
}: {
  user: Utilisateur;
  actionState: UserRoleAction;
  tokenInput: { amount: string; password: string };
  tokenAction: TokenGrantAction;
  conversations: Conversation[];
  handlePromoteToAdmin: (userId: string) => void;
  updateTokenGrantInput: (userId: string, field: 'amount' | 'password', value: string) => void;
  handleGrantTokens: (userId: string) => void;
  formatUserLabel: (user: Utilisateur) => string;
  formatDate: (value?: Timestamp | string) => string;
}) => {
  const userConversations = conversations.filter((conv) => conv.userId === user.id).length;
  const isAdmin = user.role === 'admin';
  const isPromoting = actionState?.status === 'loading';
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>{formatUserLabel(user)}</span>
        <span className="text-xs text-slate-500">{user.role ?? 'Role non défini'}</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">Mail : {user.mail ?? '—'}</p>
      <p className="mt-1 text-xs text-slate-400">
        Tokens : {typeof user.tokens === 'number' ? user.tokens.toLocaleString('fr-FR') : '—'}
      </p>
      <p className="mt-1 text-xs text-slate-500">Créé le : {formatDate(user.createdAt)}</p>
      <p className="mt-2 text-xs text-slate-400">Conversations associées : {userConversations}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/users/${user.id}/logs`}
          className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600"
        >
          Voir logs
        </Link>
      </div>
      {!isAdmin && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handlePromoteToAdmin(user.id)}
            disabled={isPromoting}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
          >
            {isPromoting ? 'Promotion...' : 'Rendre admin'}
          </button>
          {actionState?.message && (
            <span
              className={`text-[11px] ${actionState.status === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}
            >
              {actionState.message}
            </span>
          )}
        </div>
      )}
      <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Donner des tokens</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[0.6fr_1fr_auto]">
          <input
            type="number"
            min="1"
            value={tokenInput.amount}
            onChange={(event) => updateTokenGrantInput(user.id, 'amount', event.target.value)}
            className="w-full rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
            placeholder="Montant"
          />
          <input
            type="password"
            value={tokenInput.password}
            onChange={(event) => updateTokenGrantInput(user.id, 'password', event.target.value)}
            className="w-full rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600"
            placeholder="Mot de passe admin"
          />
          <button
            type="button"
            onClick={() => handleGrantTokens(user.id)}
            disabled={tokenAction?.status === 'loading'}
            className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
          >
            {tokenAction?.status === 'loading' ? 'Ajout...' : 'Ajouter'}
          </button>
        </div>
        {tokenAction?.message && (
          <p
            className={`mt-2 text-[11px] ${tokenAction.status === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}
          >
            {tokenAction.message}
          </p>
        )}
      </div>
    </div>
  );
};

export const UsersSection = ({
  usersLoading,
  usersError,
  latestUsers,
  conversations,
  userRoleAction,
  tokenGrantInputs,
  tokenGrantAction,
  handlePromoteToAdmin,
  updateTokenGrantInput,
  handleGrantTokens,
  formatUserLabel,
  formatDate,
}: UsersSectionProps) => (
  <article className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/40">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-xl font-semibold">Utilisateurs clés</h2>
        <p className="text-sm text-slate-400">
          Liste filtrée des derniers inscrits et rôle (client).
        </p>
      </div>
      <span className="text-xs text-slate-400">
        {usersLoading ? '↻ Chargement...' : `Mis à jour récemment`}
      </span>
    </div>
    <div className="mt-6 space-y-3">
      {usersLoading ? (
        <p className="text-sm text-slate-400">Chargement des utilisateurs…</p>
      ) : usersError ? (
        <p className="text-sm text-red-400">{usersError}</p>
      ) : latestUsers.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun utilisateur disponible.</p>
      ) : (
        latestUsers.map((user) => (
          <UserListItem
            key={user.id}
            user={user}
            actionState={userRoleAction?.id === user.id ? userRoleAction : null}
            tokenInput={tokenGrantInputs[user.id] ?? { amount: '', password: '' }}
            tokenAction={tokenGrantAction?.id === user.id ? tokenGrantAction : null}
            conversations={conversations}
            handlePromoteToAdmin={handlePromoteToAdmin}
            updateTokenGrantInput={updateTokenGrantInput}
            handleGrantTokens={handleGrantTokens}
            formatUserLabel={formatUserLabel}
            formatDate={formatDate}
          />
        ))
      )}
    </div>
  </article>
);
