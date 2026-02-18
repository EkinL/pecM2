export type Timestamp = {
  seconds?: number;
  nanoseconds?: number;
};

export type DemandeStatus = 'pending' | 'matched' | 'accepted' | 'cancelled' | 'other';

export type DemandeRequestType =
  | 'create_ai'
  | 'update_ai'
  | 'moderation'
  | 'incident'
  | 'usage_ai'
  | 'other';

export type DemandeAiPayload = {
  objective?: string;
  tone?: string;
  constraints?: string;
  requestedChanges?: string;
  currentStatus?: string;
  requestedStatus?: string;
  incidentType?: string;
  incidentSeverity?: 'low' | 'medium' | 'high';
  incidentContext?: string;
  mentality?: string;
  voice?: string;
  look?: Record<string, string>;
  [key: string]: unknown;
};

export type Demande = {
  id: string;
  clientId?: string;
  clientMail?: string;
  clientPseudo?: string;
  title?: string;
  description?: string;
  category?: string;
  budget?: number;
  city?: string;
  availability?: string;
  status?: string;
  prestataireId?: string;
  prestatairePseudo?: string;
  prestataireMail?: string;
  location?: {
    lat?: number;
    lng?: number;
    accuracy?: number;
  };
  locationUpdatedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  matchedAt?: Timestamp;
  acceptedAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancelReason?: string;
  aiId?: string;
  aiName?: string;
  requestType?: DemandeRequestType;
  payload?: DemandeAiPayload;
  adminNote?: string;
  [key: string]: unknown;
};

export const IA_REQUEST_TYPES: DemandeRequestType[] = [
  'create_ai',
  'update_ai',
  'moderation',
  'incident',
  'usage_ai',
  'other',
];

export const normalizeDemandeRequestType = (value: unknown): DemandeRequestType => {
  if (typeof value !== 'string') {
    return 'other';
  }
  const normalized = value.trim().toLowerCase() as DemandeRequestType;
  if (IA_REQUEST_TYPES.includes(normalized)) {
    return normalized;
  }
  return 'other';
};

export const isAiDemandeRequest = (requestType: unknown): boolean =>
  normalizeDemandeRequestType(requestType) !== 'other';

