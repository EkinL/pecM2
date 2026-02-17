import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const IMAGE_CACHE_DIR = path.join(os.tmpdir(), 'pecm2-ai-images');

const contentTypeFor = (fileName: string) => {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
};

export async function GET(_request: Request, { params }: { params: Promise<{ name?: string }> }) {
  const resolvedParams = await params;
  const rawName = typeof resolvedParams?.name === 'string' ? resolvedParams.name : '';
  const safeName = path.basename(rawName);
  if (!safeName) {
    return NextResponse.json({ error: 'Fichier introuvable.' }, { status: 404 });
  }

  const filePath = path.join(IMAGE_CACHE_DIR, safeName);
  try {
    const file = await fs.readFile(filePath);
    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        'Content-Type': contentTypeFor(safeName),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Fichier introuvable.' }, { status: 404 });
  }
}
