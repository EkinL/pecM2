export type Timestamp = {
  seconds?: number;
  nanoseconds?: number;
};

export type Utilisateur = {
  id: string;
  mail?: string;
  pseudo?: string;
  role?: string;
  tokens?: number;
  createdAt?: Timestamp;
  [key: string]: unknown;
};

export type Conversation = {
  id: string;
  userId?: string;
  aiId?: string;
  status?: string;
  messageCount?: number;
  updatedAt?: Timestamp;
  [key: string]: unknown;
};

export type AiProfile = {
  id: string;
  ownerId?: string;
  ownerMail?: string;
  name?: string;
  mentality?: string;
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
  voice?: string;
  voiceRhythm?: string;
  imageUrl?: string;
  tokensSpent?: number;
  status?: string;
  createdAt?: Timestamp;
  [key: string]: unknown;
};
