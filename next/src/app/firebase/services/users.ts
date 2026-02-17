import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { EmailAuthProvider, linkWithCredential, reauthenticateWithCredential } from 'firebase/auth';
import { auth, firestore } from '../init';
import { utilisateurs } from '../collections';
import {
  mapSnapshot,
  normalizeOptionalNumber,
  normalizeOptionalString,
  normalizeRequiredPassword,
  normalizeRequiredString,
  normalizeUtilisateurRole,
  omitUndefinedFields,
  sanitizeOptionalString,
  createRealtimeListener,
} from '../helpers';
import { recordBusinessTokensGranted, trackFirestoreCall } from '../../observability/metrics';

export const fetchUtilisateurs = async () => {
  try {
    const snapshot = await getDocs(utilisateurs);
    return mapSnapshot(snapshot).map((user) => normalizeUtilisateurRole(user));
  } catch (err) {
    console.error('Erreur lors de la récupération des utilisateurs', err);
    throw err;
  }
};

export const addUtilisateur = async ({ mail, pseudo, adult }: any) => {
  const payload = {
    mail: normalizeRequiredString(mail, 'Mail'),
    pseudo: normalizeRequiredString(pseudo, 'Pseudo'),
    adult: Boolean(adult),
    dateOfCreate: serverTimestamp(),
  };

  return addDoc(utilisateurs, payload);
};

export const fetchUtilisateursRealTime = (onData: any, onError: any) =>
  createRealtimeListener(
    utilisateurs,
    (data: any) => {
      const normalized = Array.isArray(data)
        ? data.map((user: any) => normalizeUtilisateurRole(user))
        : data;
      onData?.(normalized);
    },
    onError,
    'utilisateurs',
  );

export const fetchUtilisateurById = async (uid: any) => {
  const normalizedId = normalizeRequiredString(uid, 'UID');
  const docRef = doc(utilisateurs, normalizedId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  return normalizeUtilisateurRole({
    id: snapshot.id,
    ...snapshot.data(),
  });
};

export const fetchUtilisateurByIdRealTime = (uid: any, onData: any, onError: any) => {
  try {
    const normalizedId = normalizeRequiredString(uid, 'UID');
    const docRef = doc(utilisateurs, normalizedId);

    return onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          onData?.(null);
          return;
        }
        const payload = {
          id: snapshot.id,
          ...snapshot.data(),
        };
        onData?.(normalizeUtilisateurRole(payload));
      },
      (error) => {
        console.error('Erreur du flux temps reel utilisateur', error);
        onError?.(error);
      },
    );
  } catch (err) {
    console.error("Impossible d'ecouter l'utilisateur", err);
    onError?.(err);
    return () => {};
  }
};

export const ensureUtilisateurProfile = async ({ user, role, pseudo }: any) => {
  if (!user?.uid) {
    throw new Error('Utilisateur Firebase manquant.');
  }

  const normalizedRole = normalizeOptionalString(role);
  const effectiveRole = normalizedRole === 'prestataire' ? 'client' : normalizedRole;
  const normalizedPseudo = normalizeOptionalString(pseudo);
  const docRef = doc(utilisateurs, user.uid);
  const snapshot = await getDoc(docRef);
  const mail = normalizeOptionalString(user.email ?? '');
  const providerIds = (user.providerData ?? [])
    .map((provider: any) => provider?.providerId)
    .filter(Boolean);
  const fallbackPseudo = mail ? mail.split('@')[0] : undefined;

  if (!snapshot.exists()) {
    if (!effectiveRole) {
      throw new Error('Le rôle est obligatoire pour créer un profil.');
    }

    const payload = {
      mail,
      pseudo: normalizedPseudo ?? sanitizeOptionalString(user.displayName ?? '') ?? fallbackPseudo,
      role: effectiveRole,
      providerIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, omitUndefinedFields(payload));

    return {
      isNew: true,
      profile: {
        id: user.uid,
        ...omitUndefinedFields(payload),
      },
    };
  }

  const existing = snapshot.data();
  const updates: any = {
    updatedAt: serverTimestamp(),
  };

  if (effectiveRole && !(existing as any).role) {
    updates.role = effectiveRole;
  }
  if ((existing as any).role === 'prestataire') {
    updates.role = 'client';
  }
  if (mail && !(existing as any).mail) {
    updates.mail = mail;
  }
  if ((normalizedPseudo ?? fallbackPseudo) && !(existing as any).pseudo) {
    updates.pseudo = normalizedPseudo ?? fallbackPseudo;
  }
  if (providerIds.length > 0 && !(existing as any).providerIds) {
    updates.providerIds = providerIds;
  }

  if (Object.keys(updates).length > 1) {
    await setDoc(docRef, updates, { merge: true });
  }

  return {
    isNew: false,
    profile: {
      id: snapshot.id,
      ...existing,
      ...updates,
    },
  };
};

export const updateUtilisateur = async (id: any) => {
  const normalizedId = normalizeRequiredString(id, 'ID');
  const docRef = doc(utilisateurs, normalizedId);

  return updateDoc(docRef, { adult: true });
};

export const updateUtilisateurRole = async ({ userId, role }: any) => {
  const normalizedId = normalizeRequiredString(userId, 'Utilisateur ID');
  const normalizedRole = normalizeRequiredString(role, 'Role');
  const allowedRoles = ['client', 'admin'];

  if (!allowedRoles.includes(normalizedRole)) {
    throw new Error('Role utilisateur invalide.');
  }

  const docRef = doc(utilisateurs, normalizedId);
  const updatePayload = {
    role: normalizedRole,
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(firestore);
  batch.update(docRef, updatePayload);

  return batch.commit();
};

export const updateUtilisateurDeletionRequestStatus = async ({
  userId,
  status,
  adminId,
  adminMail,
  note,
}: any) => {
  const normalizedId = normalizeRequiredString(userId, 'Utilisateur ID');
  const normalizedStatus = normalizeRequiredString(status, 'Statut');
  const allowedStatuses = ['pending', 'in_review', 'completed', 'rejected'];

  if (!allowedStatuses.includes(normalizedStatus)) {
    throw new Error('Statut de demande RGPD invalide.');
  }

  const docRef = doc(utilisateurs, normalizedId);
  const payload: Record<string, unknown> = {
    accountDeletionRequestStatus: normalizedStatus,
    accountDeletionReviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const normalizedAdminId = normalizeOptionalString(adminId);
  if (normalizedAdminId) {
    payload.accountDeletionReviewedBy = normalizedAdminId;
  }

  const normalizedAdminMail = normalizeOptionalString(adminMail);
  if (normalizedAdminMail) {
    payload.accountDeletionReviewedByMail = normalizedAdminMail;
  }

  const normalizedNote = normalizeOptionalString(note);
  if (normalizedNote) {
    payload.accountDeletionReviewNote = normalizedNote;
  } else {
    payload.accountDeletionReviewNote = null;
  }

  return updateDoc(docRef, payload);
};

export const grantUserTokensWithPassword = async ({
  targetUserId,
  amount,
  adminId,
  adminPassword,
}: any) => {
  const normalizedId = normalizeRequiredString(targetUserId, 'Utilisateur ID');
  const normalizedAmount = normalizeOptionalNumber(amount);
  const password = normalizeRequiredPassword(adminPassword);

  if (
    normalizedAmount === undefined ||
    !Number.isInteger(normalizedAmount) ||
    normalizedAmount <= 0
  ) {
    throw new Error('Montant invalide.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error('Session admin invalide.');
  }
  if (adminId && currentUser.uid !== adminId) {
    throw new Error('Admin invalide.');
  }

  const credential = EmailAuthProvider.credential(currentUser.email, password);
  const providerIds = (currentUser.providerData ?? [])
    .map((provider) => provider?.providerId)
    .filter(Boolean);
  const hasPasswordProvider = providerIds.includes('password');

  if (hasPasswordProvider) {
    await reauthenticateWithCredential(currentUser, credential);
  } else {
    await linkWithCredential(currentUser, credential);
  }

  const docRef = doc(utilisateurs, normalizedId);
  const updatePayload = {
    tokens: increment(normalizedAmount),
    updatedAt: serverTimestamp(),
  };

  const batch2 = writeBatch(firestore);
  batch2.update(docRef, updatePayload);

  const commitResult = await trackFirestoreCall('writeBatch.commit', 'utilisateurs.adminLogs', () =>
    batch2.commit(),
  );
  recordBusinessTokensGranted({
    source: 'admin_grant',
    amount: normalizedAmount,
  });
  return commitResult;
};
