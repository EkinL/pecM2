import { NextResponse } from 'next/server';
import { fetchAiProfileById } from '../../../indexFirebase';
import {
  getIpFromRequest,
  getPlatformFromRequest,
  getUserAgentFromRequest,
  verifyActorFromRequest,
  writeActivityLog,
} from '../../_lib/activityLogs';

const ALLOWED_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);

type AiProfile = {
  voice?: string;
  mentality?: string;
  voiceRhythm?: string;
  look?: {
    gender?: string;
  };
};

const normalizeText = (value: string | undefined) =>
  typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    : '';

const normalizeVoice = (value: string | undefined) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (ALLOWED_VOICES.has(normalized)) {
    return normalized;
  }
  return null;
};

const boostScores = (scores: Record<string, number>, voices: string[], weight: number) => {
  voices.forEach((voice) => {
    if (ALLOWED_VOICES.has(voice)) {
      scores[voice] = (scores[voice] ?? 0) + weight;
    }
  });
};

const pickTopVoice = (scores: Record<string, number>, fallback: string) => {
  const order = ['alloy', 'nova', 'shimmer', 'echo', 'fable', 'onyx'];
  const sorted = order
    .map((voice) => ({ voice, score: scores[voice] ?? 0 }))
    .sort((a, b) => b.score - a.score || order.indexOf(a.voice) - order.indexOf(b.voice));
  return sorted[0]?.score ? sorted[0].voice : fallback;
};

const deriveVoiceFromProfile = (profile: AiProfile | null, fallback: string) => {
  if (!profile) {
    return fallback;
  }

  const scores: Record<string, number> = {
    alloy: 0,
    echo: 0,
    fable: 0,
    onyx: 0,
    nova: 0,
    shimmer: 0,
  };

  const gender = normalizeText(profile.look?.gender);
  if (gender.includes('femme')) {
    boostScores(scores, ['shimmer', 'nova'], 3);
  } else if (gender.includes('homme')) {
    boostScores(scores, ['onyx', 'echo'], 3);
  } else if (gender.includes('neutre')) {
    boostScores(scores, ['alloy', 'fable'], 2);
  }

  const mentality = normalizeText(profile.mentality);
  if (mentality.includes('coach') || mentality.includes('motivant')) {
    boostScores(scores, ['echo', 'nova'], 2);
  }
  if (mentality.includes('amour')) {
    boostScores(scores, ['shimmer', 'nova'], 2);
  }
  if (mentality.includes('sarcast')) {
    boostScores(scores, ['onyx', 'echo'], 2);
  }
  if (mentality.includes('philo')) {
    boostScores(scores, ['fable', 'alloy'], 2);
  }
  if (mentality.includes('zen')) {
    boostScores(scores, ['alloy', 'fable'], 2);
  }
  if (mentality.includes('protect')) {
    boostScores(scores, ['onyx', 'alloy'], 2);
  }
  if (mentality.includes('ludi') || mentality.includes('joueur') || mentality.includes('fun')) {
    boostScores(scores, ['nova', 'shimmer'], 2);
  }

  const voiceStyle = normalizeText(profile.voice);
  if (voiceStyle.includes('calme') || voiceStyle.includes('pose')) {
    boostScores(scores, ['alloy', 'fable'], 2);
  }
  if (voiceStyle.includes('energ') || voiceStyle.includes('rythm')) {
    boostScores(scores, ['echo', 'nova'], 2);
  }
  if (voiceStyle.includes('chaleur')) {
    boostScores(scores, ['shimmer', 'nova'], 2);
  }
  if (voiceStyle.includes('grave')) {
    boostScores(scores, ['onyx', 'alloy'], 2);
  }

  const rhythm = normalizeText(profile.voiceRhythm);
  if (rhythm.includes('lent')) {
    boostScores(scores, ['fable', 'alloy'], 2);
  }
  if (rhythm.includes('modere')) {
    boostScores(scores, ['alloy', 'fable'], 1);
  }
  if (rhythm.includes('rapide')) {
    boostScores(scores, ['echo', 'nova'], 2);
  }
  if (rhythm.includes('percut')) {
    boostScores(scores, ['onyx', 'echo'], 2);
  }
  if (rhythm.includes('progress')) {
    boostScores(scores, ['fable', 'nova'], 1);
  }

  return pickTopVoice(scores, fallback);
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const aiId = typeof body?.aiId === 'string' ? body.aiId.trim() : '';
    const voiceInput = typeof body?.voice === 'string' ? body.voice : undefined;

    if (!text) {
      return NextResponse.json({ error: 'Texte manquant.' }, { status: 400 });
    }

    const actor = await verifyActorFromRequest(request).catch(() => null);
    const actorIdForLog = actor?.uid ?? undefined;
    const actorMail = actor?.email;
    const platform = getPlatformFromRequest(request);
    const ip = getIpFromRequest(request);
    const userAgent = getUserAgentFromRequest(request);

    const rawOpenAiKey =
      process.env.OPENAI_API_KEY ??
      process.env.OPENAI_TOKEN ??
      process.env.NEXT_PUBLIC_OPENAI_API_KEY ??
      '';
    const openAiKey = typeof rawOpenAiKey === 'string' ? rawOpenAiKey.trim() : '';
    const hasOpenAiKey =
      Boolean(openAiKey) && openAiKey !== '0' && openAiKey !== 'undefined' && openAiKey !== 'null';

    if (!hasOpenAiKey) {
      return NextResponse.json({ error: 'Cle OpenAI manquante.' }, { status: 502 });
    }

    const model = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
    const voiceFallback = normalizeVoice(process.env.OPENAI_TTS_VOICE) ?? 'alloy';
    const explicitVoice = normalizeVoice(voiceInput);
    let aiProfile: AiProfile | null = null;

    if (aiId) {
      try {
        aiProfile = (await fetchAiProfileById(aiId)) as AiProfile | null;
      } catch (error) {
        console.error('Erreur recuperation profil IA pour TTS', error);
      }
    }

    const profileVoice = normalizeVoice(aiProfile?.voice);
    const derivedVoice = deriveVoiceFromProfile(aiProfile, voiceFallback);
    const voice = explicitVoice ?? profileVoice ?? derivedVoice;

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const errorMessage =
        typeof data?.error?.message === 'string'
          ? data.error.message
          : typeof data?.error === 'string'
            ? data.error
            : `Erreur TTS (${response.status})`;
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }

    const audioBuffer = await response.arrayBuffer();

    if (actorIdForLog) {
      try {
        await writeActivityLog({
          action: 'tts_generated',
          actorId: actorIdForLog,
          actorMail,
          targetType: aiId ? 'aiProfile' : 'system',
          targetId: aiId || undefined,
          platform,
          ip,
          userAgent,
          details: {
            aiId: aiId || undefined,
            model,
            voice,
            textLength: text.length,
          },
        });
      } catch (logError) {
        console.warn("Impossible d'ecrire le log tts_generated", logError);
      }
    }

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Erreur TTS', error);
    return NextResponse.json({ error: 'Erreur synthese vocale.' }, { status: 500 });
  }
}
