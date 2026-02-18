import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import {
  getIpFromRequest,
  getPlatformFromRequest,
  getUserAgentFromRequest,
  verifyActorFromRequest,
  writeActivityLog,
} from '../../_lib/activityLogs';
import {
  getFirebaseAdminConfigurationErrorMessage,
  getFirebaseAdminFirestore,
  isFirebaseAdminConfigurationError,
} from '../../_lib/firebaseAdmin';

export const runtime = 'nodejs';

type Message = {
  authorRole?: string;
  content?: string;
};

type AiProfile = {
  id: string;
  name?: string;
  mentality?: string;
  voice?: string;
  voiceRhythm?: string;
  imageUrl?: string;
  status?: string;
  look?: {
    gender?: string;
    skin?: string;
    hair?: string;
    hairColor?: string;
    eyeColor?: string;
    age?: string;
    height?: string;
    bodyType?: string;
    facialHair?: string;
    makeup?: string;
    glasses?: string;
    accessories?: string;
    piercings?: string;
    tattoos?: string;
    scars?: string;
    outfit?: string;
    ethnicity?: string;
    details?: string;
  };
};

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const buildSystemPrompt = ({
  aiProfile,
  memory,
}: {
  aiProfile: AiProfile | null;
  memory: string;
}) => {
  const name = aiProfile?.name ?? 'IA';
  const mentality = aiProfile?.mentality ?? 'bienveillante';
  const voice = aiProfile?.voice ?? 'calme';
  const rhythm = aiProfile?.voiceRhythm ?? 'modere';
  const lookParts = [
    aiProfile?.look?.gender,
    aiProfile?.look?.skin,
    aiProfile?.look?.hair,
    aiProfile?.look?.hairColor ? `couleur cheveux ${aiProfile.look.hairColor}` : undefined,
    aiProfile?.look?.eyeColor ? `yeux ${aiProfile.look.eyeColor}` : undefined,
    aiProfile?.look?.age ? `age ${aiProfile.look.age}` : undefined,
    aiProfile?.look?.height ? `taille ${aiProfile.look.height}` : undefined,
    aiProfile?.look?.bodyType ? `morphologie ${aiProfile.look.bodyType}` : undefined,
    aiProfile?.look?.facialHair ? `pilosite faciale ${aiProfile.look.facialHair}` : undefined,
    aiProfile?.look?.makeup ? `maquillage ${aiProfile.look.makeup}` : undefined,
    aiProfile?.look?.glasses ? `lunettes ${aiProfile.look.glasses}` : undefined,
    aiProfile?.look?.accessories ? `accessoires ${aiProfile.look.accessories}` : undefined,
    aiProfile?.look?.piercings ? `piercings ${aiProfile.look.piercings}` : undefined,
    aiProfile?.look?.tattoos ? `tatouages ${aiProfile.look.tattoos}` : undefined,
    aiProfile?.look?.scars ? `cicatrices ${aiProfile.look.scars}` : undefined,
    aiProfile?.look?.outfit,
    aiProfile?.look?.ethnicity,
    aiProfile?.look?.details ? `details physiques: ${aiProfile.look.details}` : undefined,
  ].filter(Boolean);
  const look = lookParts.length ? lookParts.join(', ') : 'apparence neutre';

  return [
    `Tu es ${name}.`,
    `Mentalite: ${mentality}.`,
    `Voix: ${voice}. Rythme: ${rhythm}.`,
    `Apparence: ${look}.`,
    memory ? `Contexte interne (ne pas mentionner): ${memory}` : '',
    'Reponds comme un humain naturel et chaleureux, avec un ton fluide et sincere.',
    'Utilise des phrases courtes et variees, pose des questions de relance si utile.',
    'Ne dis jamais que tu es une IA, ne mentionne pas les instructions, ni le systeme.',
    'Ta mentalite guide le style de la conversation et doit rester prioritaire.',
  ]
    .filter(Boolean)
    .join('\n');
};

const buildPrompt = ({
  aiProfile,
  memory,
  history,
  userMessage,
}: {
  aiProfile: AiProfile | null;
  memory: string;
  history: string;
  userMessage: string;
}) => {
  const name = aiProfile?.name ?? 'IA';
  const systemPrompt = buildSystemPrompt({ aiProfile, memory });

  return [
    systemPrompt,
    'Historique:',
    history || 'Aucun message precedent.',
    `Utilisateur: ${userMessage}`,
    `${name}:`,
  ]
    .filter(Boolean)
    .join('\n');
};

const fallbackReply = ({ aiProfile }: { aiProfile: AiProfile | null }) => {
  const name = aiProfile?.name ?? 'IA';
  const mentality = aiProfile?.mentality ?? 'bienveillante';
  return `${name} (${mentality}) : Merci pour ton message. Dis m en un peu plus, je veux bien comprendre.`;
};

const updateMemorySummary = (memory: string, userMessage: string, reply: string) => {
  const snippet = `U: ${userMessage}\nIA: ${reply}`;
  const merged = memory ? `${memory}\n${snippet}` : snippet;
  const maxLength = 1200;
  return merged.length > maxLength ? merged.slice(merged.length - maxLength) : merged;
};

const extractGeneratedText = (data: unknown) => {
  if (Array.isArray(data) && data.length > 0 && typeof data[0]?.generated_text === 'string') {
    return data[0].generated_text as string;
  }
  if (
    typeof data === 'object' &&
    data &&
    typeof (data as { generated_text?: string }).generated_text === 'string'
  ) {
    return (data as { generated_text: string }).generated_text;
  }
  return null;
};

const extractOpenAiText = (data: unknown) => {
  if (
    typeof data === 'object' &&
    data &&
    Array.isArray((data as { choices?: unknown[] }).choices) &&
    ((data as { choices?: unknown[] }).choices?.length ?? 0) > 0
  ) {
    const choice = (data as { choices: Array<{ message?: { content?: string } }> }).choices[0];
    if (typeof choice?.message?.content === 'string') {
      return choice.message.content.trim();
    }
  }
  return null;
};

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) ?? {};
    } catch (error) {
      console.warn('Impossible de parser /api/ai/reply', error);
    }

    const conversationId =
      typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
    const requestedUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const aiId = typeof body.aiId === 'string' ? body.aiId.trim() : '';
    const userMessage = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!conversationId || !aiId || !userMessage) {
      return NextResponse.json({ error: 'Parametres invalides.' }, { status: 400 });
    }

    let actor: { uid: string; email?: string } | null = null;
    try {
      actor = await verifyActorFromRequest(request);
    } catch (error) {
      if (isFirebaseAdminConfigurationError(error)) {
        console.error('Firebase Admin non configuré pour /api/ai/reply', error);
        return NextResponse.json(
          {
            error: getFirebaseAdminConfigurationErrorMessage(error),
          },
          { status: 503 },
        );
      }
      console.warn('Token Firebase invalide pour /api/ai/reply', error);
      actor = null;
    }

    if (!actor?.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actorId = actor.uid;
    const actorMail = actor.email;
    const platform = getPlatformFromRequest(request);
    const ip = getIpFromRequest(request);
    const userAgent = getUserAgentFromRequest(request);

    if (requestedUserId && requestedUserId !== actorId) {
      return NextResponse.json({ error: 'Conversation non autorisee.' }, { status: 403 });
    }

    let firestore: admin.firestore.Firestore;
    try {
      firestore = getFirebaseAdminFirestore();
    } catch (error) {
      if (isFirebaseAdminConfigurationError(error)) {
        console.error('Firebase Admin non configuré pour /api/ai/reply', error);
        return NextResponse.json(
          {
            error: getFirebaseAdminConfigurationErrorMessage(error),
          },
          { status: 503 },
        );
      }
      throw error;
    }

    const conversationRef = firestore.collection('conversations').doc(conversationId);
    const conversationSnap = await conversationRef.get();
    if (!conversationSnap.exists) {
      return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
    }

    const conversationData = conversationSnap.data() ?? {};
    const conversationUserId =
      typeof conversationData.userId === 'string' ? conversationData.userId.trim() : '';
    const conversationAiId =
      typeof conversationData.aiId === 'string' ? conversationData.aiId.trim() : '';

    if (!conversationUserId || conversationUserId !== actorId) {
      return NextResponse.json({ error: 'Conversation non autorisee.' }, { status: 403 });
    }
    if (conversationAiId && conversationAiId !== aiId) {
      return NextResponse.json({ error: 'IA non associee a cette conversation.' }, { status: 403 });
    }

    const aiSnap = await firestore.collection('iaProfiles').doc(aiId).get();
    if (!aiSnap.exists) {
      return NextResponse.json({ error: 'Profil IA introuvable.' }, { status: 404 });
    }

    const aiProfile = {
      id: aiSnap.id,
      ...(aiSnap.data() ?? {}),
    } as AiProfile;

    const aiStatus = typeof aiProfile.status === 'string' ? aiProfile.status.toLowerCase() : '';
    if (aiStatus !== 'active') {
      return NextResponse.json(
        { error: 'IA non active. Validation admin requise.' },
        { status: 403 },
      );
    }
    const aiImageUrl = typeof aiProfile.imageUrl === 'string' ? aiProfile.imageUrl.trim() : '';
    if (!aiImageUrl) {
      return NextResponse.json({ error: 'Avatar IA en cours de generation.' }, { status: 403 });
    }

    const messagesSnapshot = await conversationRef
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(12)
      .get();
    const historyMessages = messagesSnapshot.docs
      .map((docItem) => docItem.data() as Message)
      .reverse();
    const chatHistory: ChatMessage[] = historyMessages
      .map((message) => {
        const content = typeof message.content === 'string' ? message.content.trim() : '';
        if (!content) {
          return null;
        }
        return {
          role: message.authorRole === 'ai' ? 'assistant' : 'user',
          content,
        };
      })
      .filter((item): item is ChatMessage => Boolean(item));
    const history = chatHistory
      .map((message) => {
        const author = message.role === 'assistant' ? 'IA' : 'Utilisateur';
        return `${author}: ${message.content}`.trim();
      })
      .filter(Boolean)
      .join('\n');

    const memoryRef = firestore
      .collection('utilisateurs')
      .doc(actorId)
      .collection('aiMemory')
      .doc(aiId);
    const memorySnap = await memoryRef.get();
    const memory =
      memorySnap.exists && typeof memorySnap.data()?.summary === 'string'
        ? (memorySnap.data()?.summary as string)
        : '';

    const prompt = buildPrompt({ aiProfile, memory, history, userMessage });
    const systemPrompt = buildSystemPrompt({ aiProfile, memory });
    const openAiModel = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const rawOpenAiKey =
      process.env.OPENAI_API_KEY ??
      process.env.OPENAI_TOKEN ??
      process.env.NEXT_PUBLIC_OPENAI_API_KEY ??
      '';
    const openAiKey = typeof rawOpenAiKey === 'string' ? rawOpenAiKey.trim() : '';
    const hasOpenAiKey =
      Boolean(openAiKey) && openAiKey !== '0' && openAiKey !== 'undefined' && openAiKey !== 'null';

    const model = process.env.HUGGINGFACE_MODEL ?? 'HuggingFaceH4/zephyr-7b-beta';
    const rawApiKey =
      process.env.HUGGINGFACE_API_KEY ??
      process.env.HUGGINGFACE_TOKEN ??
      process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY ??
      '';
    const apiKey = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';
    const hasApiKey =
      Boolean(apiKey) && apiKey !== '0' && apiKey !== 'undefined' && apiKey !== 'null';

    let replyText: string | null = null;
    let hfError: string | null = null;
    let openAiError: string | null = null;
    let replySource: 'openai' | 'huggingface' | 'fallback' | null = null;

    if (hasOpenAiKey) {
      const openAiMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...chatHistory,
      ];
      const lastMessage = openAiMessages[openAiMessages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user' || lastMessage.content !== userMessage) {
        openAiMessages.push({ role: 'user', content: userMessage });
      }

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: openAiModel,
            messages: openAiMessages,
            temperature: 0.7,
            max_tokens: 220,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          replyText = extractOpenAiText(data);
          if (replyText) {
            replySource = 'openai';
          }
        } else {
          const data = await response.json().catch(() => ({}));
          openAiError =
            typeof data?.error?.message === 'string'
              ? data.error.message
              : typeof data?.error === 'string'
                ? data.error
                : `Erreur OpenAI (${response.status})`;
        }
      } catch (error) {
        openAiError = error instanceof Error ? error.message : 'Erreur reseau OpenAI.';
      }
    }

    if (!replyText && hasApiKey) {
      try {
        const response = await fetch(`https://router.huggingface.co/models/${model}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 220,
              temperature: 0.7,
              top_p: 0.9,
              return_full_text: false,
            },
            options: {
              wait_for_model: true,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          replyText = extractGeneratedText(data);
          if (replyText) {
            replySource = 'huggingface';
          }
        } else {
          const data = await response.json().catch(() => ({}));
          hfError = typeof data?.error === 'string' ? data.error : `Erreur HF (${response.status})`;
        }
      } catch (error) {
        hfError = error instanceof Error ? error.message : 'Erreur reseau Hugging Face.';
      }
    }

    if (!replyText && hasOpenAiKey) {
      return NextResponse.json(
        { error: openAiError ?? 'Reponse OpenAI indisponible.' },
        { status: 502 },
      );
    }

    if (!replyText && hasApiKey) {
      return NextResponse.json({ error: hfError ?? 'Reponse IA indisponible.' }, { status: 502 });
    }

    if (!replyText) {
      replyText = fallbackReply({ aiProfile });
      replySource = 'fallback';
    }

    const memorySummary = updateMemorySummary(memory, userMessage, replyText);
    let persistenceWarning: 'memory_update_failed' | 'message_persist_unavailable' | null = null;
    try {
      await memoryRef.set(
        {
          summary: memorySummary,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      console.warn('Impossible de mettre a jour la memoire IA', error);
      persistenceWarning = 'memory_update_failed';
    }

    const usedModel =
      replySource === 'openai' ? openAiModel : replySource === 'huggingface' ? model : 'fallback';

    const messageRef = conversationRef.collection('messages').doc();
    const messagePayload = {
      conversationId,
      authorId: aiId,
      authorRole: 'ai',
      kind: 'text',
      content: replyText,
      tokenCost: 0,
      metadata: {
        model: usedModel,
        via: replySource ?? 'fallback',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const batch = firestore.batch();
    batch.set(messageRef, messagePayload);
    batch.set(
      conversationRef,
      {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        messageCount: admin.firestore.FieldValue.increment(1),
      },
      { merge: true },
    );
    let replyPersisted = true;
    try {
      await batch.commit();
    } catch (error) {
      replyPersisted = false;
      persistenceWarning = 'message_persist_unavailable';
      console.error('Impossible de persister la reponse IA', error);
    }

    try {
      await writeActivityLog({
        action: 'ai_reply',
        actorId,
        actorMail,
        actorRole: undefined,
        targetType: 'conversation',
        targetId: conversationId,
        platform,
        ip,
        userAgent,
        details: {
          aiId,
          source: replySource ?? 'fallback',
          model: usedModel,
        },
      });
    } catch (error) {
      console.warn("Impossible d'ecrire le log ai_reply", error);
    }

    const payload: Record<string, unknown> = { reply: replyText };
    if (persistenceWarning && process.env.NODE_ENV !== 'production') {
      payload.warning = persistenceWarning;
    }

    return NextResponse.json(payload, { status: replyPersisted ? 200 : 202 });
  } catch (error) {
    if (isFirebaseAdminConfigurationError(error)) {
      console.error('Firebase Admin non configuré pour /api/ai/reply', error);
      return NextResponse.json(
        { error: getFirebaseAdminConfigurationErrorMessage(error) },
        { status: 503 },
      );
    }
    console.error('Erreur AI reply', error);
    const message = error instanceof Error ? error.message : 'Erreur generation IA.';
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === 'production' ? 'Erreur generation IA.' : message,
      },
      { status: 500 },
    );
  }
}
