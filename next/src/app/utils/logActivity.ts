'use client';

import { auth } from '../indexFirebase';

export type ActivityLogRequest = {
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

export const logActivity = async (payload: ActivityLogRequest) => {
  const user = auth.currentUser;
  if (!user) {
    return;
  }

  let token: string | null = null;
  try {
    token = await user.getIdToken();
  } catch (error) {
    console.warn("Impossible d'obtenir le token Firebase pour logger une activite", error);
  }

  if (!token) {
    return;
  }

  try {
    const response = await fetch('/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-pecm2-platform': 'web',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });

    if (!response.ok && process.env.NODE_ENV !== 'production') {
      const data = await response.json().catch(() => ({}));
      console.warn('/api/logs a repondu', response.status, data);
    }
  } catch (error) {
    console.warn("Echec d'envoi du log d'activite", error);
  }
};
