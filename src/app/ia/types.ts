export type Timestamp = {
  seconds?: number;
  nanoseconds?: number;
};

export type AiProfile = {
  id: string;
  ownerId?: string;
  ownerMail?: string;
  name?: string;
  mentality?: string;
  voice?: string;
  voiceRhythm?: string;
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
  imageUrl?: string;
  imagePrompt?: string;
  status?: string;
  statusNote?: string;
  ownerNotification?: string;
  hiddenFromCatalogue?: boolean;
  safetyWarnings?: string[];
  warningCount?: number;
  visibility?: "public" | "private";
  accessType?: "free" | "paid";
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  [key: string]: unknown;
};
