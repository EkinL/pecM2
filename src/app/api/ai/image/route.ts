import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  addConversationMessage,
  fetchAiProfileById,
  fetchConversationById,
  flagAiProfileSafetyViolation,
  updateAiProfileDetails,
} from "../../../indexFirebase";
import admin from "firebase-admin";

type AiProfile = {
  id: string;
  name?: string;
  mentality?: string;
  expressions?: string[];
  imageUrl?: string;
  imagePrompt?: string;
  status?: string;
  look?: {
    gender?: string;
    skin?: string;
    hair?: string;
    outfit?: string;
    ethnicity?: string;
    details?: string;
  };
};

const normalizePromptValue = (value?: string) =>
  typeof value === "string" ? value.trim() : "";

const IMAGE_CACHE_DIR = path.join(process.cwd(), ".cache", "ai-images");
const FIREBASE_STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "";

const extensionFromContentType = (contentType?: string) => {
  const lower = contentType?.toLowerCase() ?? "";
  if (lower.includes("webp")) {
    return "webp";
  }
  if (lower.includes("jpeg")) {
    return "jpeg";
  }
  if (lower.includes("jpg")) {
    return "jpg";
  }
  if (lower.includes("png")) {
    return "png";
  }
  return "png";
};

const persistBufferImage = async (
  buffer: Buffer,
  aiId: string,
  extension = "png"
) => {
  await fs.mkdir(IMAGE_CACHE_DIR, { recursive: true });
  const fileName = `${aiId}-${Date.now()}.${extension}`;
  const filePath = path.join(IMAGE_CACHE_DIR, fileName);
  await fs.writeFile(filePath, buffer);
  return fileName;
};

const buildCachedImageUrl = (fileName: string, request: Request) => {
  try {
    const origin = new URL(request.url).origin;
    return `${origin}/api/ai/image/file/${fileName}`;
  } catch {
    return `/api/ai/image/file/${fileName}`;
  }
};

let firebaseAdminApp: admin.app.App | null = null;

const getFirebaseAdminApp = () => {
  if (firebaseAdminApp) {
    return firebaseAdminApp;
  }
  if (admin.apps.length) {
    firebaseAdminApp = admin.apps[0];
    return firebaseAdminApp;
  }
  const bucket = FIREBASE_STORAGE_BUCKET;
  if (!bucket) {
    console.warn(
      "Firebase Storage bucket introuvable, upload IA ignoré (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET absent)."
    );
    return null;
  }

  const options: admin.AppOptions = { storageBucket: bucket };
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountRaw) {
    try {
      options.credential = admin.credential.cert(JSON.parse(serviceAccountRaw));
    } catch (error) {
      console.error("Impossible d'analyser la clé de service Firebase", error);
    }
  }

  if (!options.credential) {
    try {
      options.credential = admin.credential.applicationDefault();
    } catch (error) {
      console.error("Impossible d'utiliser les identifiants d'application Firebase par défaut", error);
    }
  }

  try {
    firebaseAdminApp = admin.initializeApp(options);
    return firebaseAdminApp;
  } catch (error) {
    console.error("Erreur d'initialisation de Firebase Admin", error);
    return null;
  }
};

const uploadBufferToFirebaseStorage = async (
  buffer: Buffer,
  aiId: string,
  contentType?: string
): Promise<string | null> => {
  if (!FIREBASE_STORAGE_BUCKET) {
    return null;
  }
  const app = getFirebaseAdminApp();
  if (!app) {
    return null;
  }

  const bucket = admin.storage(app).bucket(FIREBASE_STORAGE_BUCKET);
  const extension = extensionFromContentType(contentType);
  const filePath = `ai-avatars/${aiId}-${Date.now()}.${extension}`;
  const file = bucket.file(filePath);
  try {
    await file.save(buffer, {
      metadata: {
        contentType: contentType ?? "image/png",
      },
    });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${file.name}`;
  } catch (error) {
    console.error("Erreur upload image sur Firebase Storage", error);
    return null;
  }
};

const buildIdentityPrompt = (aiProfile: AiProfile | null) => {
  const stored = normalizePromptValue(aiProfile?.imagePrompt);
  if (stored) {
    return stored;
  }

  const look = aiProfile?.look ?? {};
  const parts: string[] = [];

  if (look.gender) {
    parts.push(`genre ${look.gender.toLowerCase()}`);
  }
  if (look.skin) {
    parts.push(`peau ${look.skin.toLowerCase()}`);
  }
  if (look.hair) {
    parts.push(`cheveux ${look.hair.toLowerCase()}`);
  }
  if (look.outfit) {
    parts.push(`tenue ${look.outfit.toLowerCase()}`);
  }
  if (look.ethnicity) {
    parts.push(`ethnie ${look.ethnicity.toLowerCase()}`);
  }
  if (look.details) {
    const details = look.details.trim();
    if (details) {
      parts.push(`details physiques ${details}`);
    }
  }

  return parts.length ? parts.join(", ") : "apparence neutre";
};

const buildBaseImagePrompt = (
  aiProfile: AiProfile | null,
  identityPrompt: string
) => {
  const expressions =
    aiProfile?.expressions?.length
      ? aiProfile.expressions.join(", ")
      : "expression calme et naturelle";

  const mentality = normalizePromptValue(aiProfile?.mentality);
  const name = normalizePromptValue(aiProfile?.name);

  const personality = [
    name ? `Prénom : ${name}.` : null,
    mentality ? `État émotionnel dominant : ${mentality}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

    return [
      // Brief photo réaliste et crédible
      `Photographie studio réaliste d’une personne humaine, style portrait professionnel ou photo de casting.`,
    
      // Appareil & optique réalistes
      `Photo prise avec un appareil photo plein format, objectif portrait 50mm ou 85mm, rendu naturel et équilibré.`,
    
      // Cadrage & composition (centrage explicite)
      `Cadrage vertical : de la tête jusqu’aux hanches.`,
      `Sujet parfaitement centré dans l’image, aligné sur l’axe vertical.`,
      `Composition symétrique, sujet placé exactement au centre du cadre.`,
      `La personne occupe le centre exact du cadre, avec des marges équilibrées à gauche et à droite.`,
      `Posture naturelle, épaules visibles, corps face à l’objectif.`,
    
      // Identité
      `Description de la personne : ${identityPrompt}.`,
      personality,
      `Expression du visage : ${expressions}, sourire naturel, regard vivant et crédible dirigé vers l’objectif.`,
    
      // Peau & visage réalistes
      `Peau humaine naturelle avec texture subtile, légères imperfections normales, traits du visage réalistes.`,
      `Yeux nets avec reflets naturels, expression authentique.`,
    
      // Lumière réaliste (clé du rendu)
      `Éclairage studio simple et réaliste, lumière douce frontale légèrement latérale.`,
      `Ombres légères et naturelles sous le menton et le cou.`,
      `Balance des blancs neutre, couleurs naturelles, contraste modéré.`,
    
      // Fond & ambiance
      `Fond studio uni gris ou beige clair, homogène et centré derrière le sujet.`,
      `Ambiance sobre et professionnelle, sans mise en scène artistique.`,
    
      // Contraintes claires
      `Une seule personne, entièrement visible dans le cadre.`,
      `Aucun texte, aucun logo, aucun watermark.`,
    ]
      .filter(Boolean)
      .join(" ");
};

const buildConversationImagePrompt = (identityPrompt: string, userMessage: string) => {
  const request = userMessage.trim();
  return [
    "Meme personne que l avatar de base.",
    `Identite: ${identityPrompt}.`,
    "Conserver exactement les traits du visage, la coiffure et la tenue.",
    request ? `Adapter la pose et la scene selon: ${request}.` : "",
    "Plan plein pied, corps entier visible, hanches visibles, pieds dans le cadre.",
    "Full-length photograph, full body visible.",
    "Une seule personne, aucun autre sujet dans l image.",
    "Apparence soignee, naturelle et esthetique.",
    "Photographie ultra realiste, qualite elevee.",
    "Texture peau naturelle, details fins, rendu photo.",
    "Eclairage naturel ou studio selon la scene, couleurs realistes.",
    "Pas de style illustration, pas de CGI, pas de rendu 3D.",
    "Pas de texte, pas de watermark.",
  ]
    .filter(Boolean)
    .join(" ");
};

type OpenAiImagePayload = {
  url?: string;
  base64?: string;
};

const extractImagePayload = (data: unknown): OpenAiImagePayload | null => {
  if (!data || typeof data !== "object") {
    return null;
  }
  const payload = Array.isArray((data as { data?: unknown[] }).data)
    ? (data as { data: Array<{ url?: string; b64_json?: string }> }).data[0]
    : undefined;

  if (!payload) {
    return null;
  }

  const url = typeof payload?.url === "string" ? payload.url : undefined;
  const base64 = typeof payload?.b64_json === "string" ? payload.b64_json : undefined;
  if (!url && !base64) {
    return null;
  }
  return { url, base64 };
};

const resolveImageUrl = async (
  data: unknown,
  aiId: string,
  request: Request
): Promise<string | null> => {
  const payload = extractImagePayload(data);
  if (!payload) {
    return null;
  }

  let buffer: Buffer | null = null;
  let detectedContentType: string | undefined;
  let fallbackUrl: string | undefined;

  if (payload.base64) {
    buffer = Buffer.from(payload.base64, "base64");
    detectedContentType = "image/png";
  } else if (payload.url) {
    fallbackUrl = payload.url;
    try {
      const response = await fetch(payload.url);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        detectedContentType = response.headers.get("content-type") ?? undefined;
      }
    } catch (error) {
      console.error("Erreur lors de la recuperation de l'image OpenAI", error);
    }
  }

  if (buffer) {
    const firebaseUrl = await uploadBufferToFirebaseStorage(
      buffer,
      aiId,
      detectedContentType
    );
    if (firebaseUrl) {
      return firebaseUrl;
    }
    const extension = extensionFromContentType(detectedContentType);
    const fileName = await persistBufferImage(buffer, aiId, extension);
    return buildCachedImageUrl(fileName, request);
  }

  return fallbackUrl ?? null;
};

type SafetyViolationInfo = {
  message: string;
  violations?: string[];
};

const extractSafetyViolationInfo = (data: unknown): SafetyViolationInfo | null => {
  if (!data || typeof data !== "object") {
    return null;
  }
  const errorObject = (data as { error?: Record<string, unknown> }).error;
  const violationsCandidate =
    Array.isArray(errorObject?.safety_violations)
      ? errorObject?.safety_violations
      : Array.isArray((data as { safety_violations?: unknown[] }).safety_violations)
        ? (data as { safety_violations?: unknown[] }).safety_violations
        : undefined;
  if (!violationsCandidate || !violationsCandidate.length) {
    return null;
  }
  const violations = violationsCandidate.filter((value) => typeof value === "string") as string[];
  const message: string =
    typeof errorObject?.message === "string"
      ? (errorObject.message as string)
      : typeof (data as { message?: string }).message === "string"
        ? ((data as { message?: string }).message as string)
        : "Requête rejetée par le système de sécurité OpenAI.";
  return { message, violations };
};

const formatSafetyViolationNote = (info: SafetyViolationInfo) => {
  if (!info.violations?.length) {
    return info.message;
  }
  return `${info.message} (violations : ${info.violations.join(", ")})`;
};
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mode = typeof body?.mode === "string" ? body.mode.trim().toLowerCase() : "";
    const conversationId =
      typeof body?.conversationId === "string" ? body.conversationId.trim() : "";
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const aiId = typeof body?.aiId === "string" ? body.aiId.trim() : "";
    const userMessage = typeof body?.message === "string" ? body.message.trim() : "";

    if (!aiId) {
      return NextResponse.json({ error: "IA manquante." }, { status: 400 });
    }

    const aiProfile = (await fetchAiProfileById(aiId)) as AiProfile | null;
    if (!aiProfile) {
      return NextResponse.json({ error: "Profil IA introuvable." }, { status: 404 });
    }

    const isBaseRequest = mode === "base";

    if (!isBaseRequest) {
      if (!conversationId || !userId || !userMessage) {
        return NextResponse.json({ error: "Parametres invalides." }, { status: 400 });
      }

      const conversation = await fetchConversationById(conversationId) as { id: string; userId?: string; aiId?: string } | null;
      if (!conversation) {
        return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
      }
      if (conversation.userId !== userId) {
        return NextResponse.json({ error: "Conversation non autorisee." }, { status: 403 });
      }
      if (conversation.aiId && conversation.aiId !== aiId) {
        return NextResponse.json(
          { error: "IA non associee a cette conversation." },
          { status: 403 }
        );
      }

      const aiStatus = typeof aiProfile.status === "string" ? aiProfile.status.toLowerCase() : "";
      if (aiStatus !== "active") {
        return NextResponse.json(
          { error: "IA non active. Validation admin requise." },
          { status: 403 }
        );
      }
      const aiImageUrl =
        typeof aiProfile.imageUrl === "string" ? aiProfile.imageUrl.trim() : "";
      if (!aiImageUrl) {
        return NextResponse.json(
          { error: "Avatar IA en cours de generation." },
          { status: 403 }
        );
      }
    }

    const rawOpenAiKey =
      process.env.OPENAI_API_KEY ??
      process.env.OPENAI_TOKEN ??
      process.env.NEXT_PUBLIC_OPENAI_API_KEY ??
      "";
    const openAiKey = typeof rawOpenAiKey === "string" ? rawOpenAiKey.trim() : "";
    const hasOpenAiKey =
      Boolean(openAiKey) && openAiKey !== "0" && openAiKey !== "undefined" && openAiKey !== "null";

    if (!hasOpenAiKey) {
      return NextResponse.json({ error: "Cle OpenAI manquante." }, { status: 502 });
    }

    const identityPrompt = buildIdentityPrompt(aiProfile);
    const prompt = isBaseRequest
      ? buildBaseImagePrompt(aiProfile, identityPrompt)
      : buildConversationImagePrompt(identityPrompt, userMessage);

    const model = normalizePromptValue(process.env.OPENAI_IMAGE_MODEL) || "gpt-image-1.5";
    const normalizedModel = model.toLowerCase();
    const usesDalle3Options = normalizedModel.startsWith("dall-e-3");
    const usesGptImage = normalizedModel.startsWith("gpt-image-1");
    const qualityOverride = normalizePromptValue(process.env.OPENAI_IMAGE_QUALITY);
    const styleOverride = normalizePromptValue(process.env.OPENAI_IMAGE_STYLE);
    const requestBody: Record<string, unknown> = {
      model,
      prompt,
      n: 1,
      size: "1024x1024",
    };

    if (usesDalle3Options) {
      requestBody.quality = qualityOverride || "hd";
      requestBody.style = styleOverride || "natural";
      requestBody.response_format = "url";
    } else if (usesGptImage) {
      requestBody.quality = qualityOverride || "high";
    }
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const safetyInfo = extractSafetyViolationInfo(data);
      if (safetyInfo) {
        const note = formatSafetyViolationNote(safetyInfo);
        try {
          await flagAiProfileSafetyViolation({
            profileId: aiId,
            warning: note,
            note: safetyInfo.message,
            adminId: undefined,
            adminMail: undefined,
          });
        } catch (flagError) {
          console.error("Erreur en signalant la violation de sécurité IA", flagError);
        }
        return NextResponse.json(
          {
            error: safetyInfo.message,
            safetyViolation: {
              message: safetyInfo.message,
              violations: safetyInfo.violations,
            },
          },
          { status: 403 }
        );
      }
      const errorMessage =
        typeof data?.error?.message === "string"
          ? data.error.message
          : typeof data?.error === "string"
            ? data.error
            : `Erreur OpenAI (${response.status})`;
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }

    const data = await response.json();
    const imageUrl = await resolveImageUrl(data, aiId, request);
    if (!imageUrl) {
      return NextResponse.json({ error: "Image OpenAI indisponible." }, { status: 502 });
    }
    console.info("Image IA generee", { aiId, mode, model, imageUrl });

    let updateError: string | null = null;
    if (isBaseRequest) {
      try {
        await updateAiProfileDetails({
          profileId: aiId,
          updates: {
            imageUrl,
            imagePrompt: identityPrompt || undefined,
          },
          adminId: undefined,
          adminMail: undefined,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erreur mise a jour avatar IA.";
        console.error("Erreur mise a jour avatar IA", error);
        updateError = message;
      }
    } else {
      const content = `Image generee: ${userMessage}`;
      await addConversationMessage({
        conversationId,
        authorId: aiId,
        authorRole: "ai",
        content,
        kind: "image",
        tokenCost: 0,
        metadata: {
          imageUrl,
          prompt,
          model,
        },
      });
    }

    return NextResponse.json({
      imageUrl,
      prompt,
      identityPrompt,
      model,
      updateError: updateError || undefined,
    });
  } catch (error) {
    console.error("Erreur image IA", error);
    return NextResponse.json({ error: "Erreur generation image." }, { status: 500 });
  }
}
