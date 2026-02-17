import { NextResponse } from 'next/server';
import {
  getIpFromRequest,
  getPlatformFromRequest,
  getUserAgentFromRequest,
  verifyActorFromRequest,
  writeActivityLog,
} from '../_lib/activityLogs';

export const runtime = 'nodejs';

const isFirebaseAdminConfigurationError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('credential introuvable') ||
    message.includes('default credentials') ||
    message.includes('application default') ||
    message.includes('unable to detect a project id') ||
    message.includes('project id') ||
    message.includes('projectid') ||
    message.includes('google_cloud_project') ||
    message.includes('gcloud_project')
  );
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeRequiredString = (value: unknown, label: string) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${label} est obligatoire`);
  }
  return normalized;
};

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) ?? {};
  } catch (error) {
    console.warn('Impossible de parser /api/logs', error);
  }

  let actor: { uid: string; email?: string } | null = null;
  let actorError: string | undefined;
  try {
    actor = await verifyActorFromRequest(request);
  } catch (error) {
    if (isFirebaseAdminConfigurationError(error)) {
      console.error('Firebase Admin non configuré pour /api/logs', error);
      return NextResponse.json(
        {
          error:
            process.env.NODE_ENV === 'production'
              ? 'Service indisponible.'
              : 'Firebase Admin non configuré (FIREBASE_SERVICE_ACCOUNT_KEY / FIREBASE_PROJECT_ID manquant).',
        },
        { status: 503 },
      );
    }

    actorError = error instanceof Error ? error.message : undefined;
    console.warn('Token Firebase invalide pour /api/logs', error);
  }

  if (!actor?.uid) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        ...(process.env.NODE_ENV === 'production' ? {} : { debug: actorError }),
      },
      { status: 401 },
    );
  }

  let action: string;
  let targetType: string;
  try {
    action = normalizeRequiredString(body.action, 'action');
    targetType = normalizeRequiredString(body.targetType, 'targetType');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parametres invalides.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const targetId = normalizeOptionalString(body.targetId);
  const details =
    body.details && typeof body.details === 'object' && !Array.isArray(body.details)
      ? (body.details as Record<string, unknown>)
      : undefined;

  const platform = getPlatformFromRequest(request);
  const ip = getIpFromRequest(request);
  const userAgent = getUserAgentFromRequest(request);

  try {
    await writeActivityLog({
      action,
      actorId: actor.uid,
      actorMail: actor.email,
      targetType,
      targetId,
      details,
      platform,
      ip,
      userAgent,
    });
  } catch (error) {
    console.error("Impossible d'ecrire le log", error);
    return NextResponse.json({ error: "Impossible d'ecrire le log." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
