import { NextResponse } from 'next/server';
import {
  getFirebaseAdminConfigurationErrorMessage,
  getFirebaseAdminFirestore,
  isFirebaseAdminConfigurationError,
} from '../../../_lib/firebaseAdmin';

export const runtime = 'nodejs';

const bufferFromFirestoreBytes = (value: unknown) => {
  if (!value) {
    return null;
  }
  if (value instanceof Buffer) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (
    typeof value === 'object' &&
    typeof (value as { toBuffer?: unknown }).toBuffer === 'function'
  ) {
    try {
      return (value as { toBuffer: () => Buffer }).toBuffer();
    } catch {
      return null;
    }
  }
  return null;
};

export async function GET(request: Request, { params }: { params: Promise<{ aiId?: string }> }) {
  try {
    const resolvedParams = await params;
    const aiId = typeof resolvedParams?.aiId === 'string' ? resolvedParams.aiId.trim() : '';
    if (!aiId) {
      return NextResponse.json({ error: 'Avatar introuvable.' }, { status: 404 });
    }

    const firestore = getFirebaseAdminFirestore();
    const avatarRef = firestore.collection('iaProfiles').doc(aiId).collection('assets').doc('avatar');
    const avatarSnap = await avatarRef.get();
    if (!avatarSnap.exists) {
      return NextResponse.json({ error: 'Avatar introuvable.' }, { status: 404 });
    }

    const avatarData = avatarSnap.data() ?? {};
    const contentType =
      typeof avatarData.contentType === 'string' && avatarData.contentType.trim()
        ? avatarData.contentType.trim()
        : 'image/png';
    const chunkCount = typeof avatarData.chunkCount === 'number' ? avatarData.chunkCount : 0;
    const sha256 =
      typeof avatarData.sha256 === 'string' && avatarData.sha256.trim()
        ? avatarData.sha256.trim()
        : null;

    if (chunkCount <= 0) {
      return NextResponse.json({ error: 'Avatar introuvable.' }, { status: 404 });
    }

    const etag = sha256 ? `"${sha256}"` : null;
    const ifNoneMatch = request.headers.get('if-none-match');
    if (etag && ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    const chunks = await Promise.all(
      Array.from({ length: chunkCount }, (_unused, index) => {
        const chunkId = `chunk_${String(index).padStart(4, '0')}`;
        return avatarRef.collection('chunks').doc(chunkId).get();
      }),
    );
    const buffers: Buffer[] = [];
    for (const chunkSnap of chunks) {
      if (!chunkSnap.exists) {
        return NextResponse.json({ error: 'Avatar introuvable.' }, { status: 404 });
      }
      const bytes = bufferFromFirestoreBytes(chunkSnap.data()?.data);
      if (!bytes) {
        return NextResponse.json({ error: 'Avatar introuvable.' }, { status: 404 });
      }
      buffers.push(bytes);
    }

    const payload = Buffer.concat(buffers);

    return new Response(payload, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...(etag ? { ETag: etag } : {}),
      },
    });
  } catch (error) {
    if (isFirebaseAdminConfigurationError(error)) {
      console.error('Firebase Admin non configuré pour /api/ai/avatar/[aiId]', error);
      return NextResponse.json(
        { error: getFirebaseAdminConfigurationErrorMessage(error) },
        { status: 503 },
      );
    }
    console.error('Erreur avatar IA', error);
    const message = error instanceof Error ? error.message : 'Erreur avatar IA.';
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === 'production' ? 'Erreur avatar IA.' : message,
      },
      { status: 500 },
    );
  }
}
