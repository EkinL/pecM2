import { NextResponse } from 'next/server';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  addConversationMessage,
  fetchAiProfileById,
  fetchConversationById,
  firestore,
} from '../../../indexFirebase';

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

const fallbackReply = ({
  aiProfile,
  memory,
  userMessage,
}: {
  aiProfile: AiProfile | null;
  memory: string;
  userMessage: string;
}) => {
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
    const body = await request.json();
    const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : '';
    const userId = typeof body?.userId === 'string' ? body.userId : '';
    const aiId = typeof body?.aiId === 'string' ? body.aiId : '';
    const userMessage = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!conversationId || !userId || !aiId || !userMessage) {
      return NextResponse.json({ error: 'Parametres invalides.' }, { status: 400 });
    }

    const conversation = (await fetchConversationById(conversationId)) as {
      id: string;
      userId?: string;
      aiId?: string;
    } | null;
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
    }
    if (conversation.userId !== userId) {
      return NextResponse.json({ error: 'Conversation non autorisee.' }, { status: 403 });
    }
    if (conversation.aiId && conversation.aiId !== aiId) {
      return NextResponse.json({ error: 'IA non associee a cette conversation.' }, { status: 403 });
    }

    const aiProfile = (await fetchAiProfileById(aiId)) as AiProfile | null;
    if (!aiProfile) {
      return NextResponse.json({ error: 'Profil IA introuvable.' }, { status: 404 });
    }
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

    const messagesRef = collection(firestore, 'conversations', conversationId, 'messages');
    const messagesSnapshot = await getDocs(
      query(messagesRef, orderBy('createdAt', 'desc'), limit(12)),
    );
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

    const memoryRef = doc(firestore, 'utilisateurs', userId, 'aiMemory', aiId);
    const memorySnap = await getDoc(memoryRef);
    const memory =
      memorySnap.exists() && typeof memorySnap.data().summary === 'string'
        ? memorySnap.data().summary
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
    }

    if (!replyText && hasApiKey) {
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
      replyText = fallbackReply({ aiProfile, memory, userMessage });
      replySource = 'fallback';
    }

    const memorySummary = updateMemorySummary(memory, userMessage, replyText);
    await setDoc(
      memoryRef,
      {
        summary: memorySummary,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await addConversationMessage({
      conversationId,
      authorId: aiId,
      authorRole: 'ai',
      content: replyText,
      kind: 'text',
      tokenCost: 0,
      metadata: {
        model:
          replySource === 'openai'
            ? openAiModel
            : replySource === 'huggingface'
              ? model
              : 'fallback',
        via: replySource ?? 'fallback',
      },
    });

    return NextResponse.json({ reply: replyText });
  } catch (error) {
    console.error('Erreur AI reply', error);
    return NextResponse.json({ error: 'Erreur generation IA.' }, { status: 500 });
  }
}
