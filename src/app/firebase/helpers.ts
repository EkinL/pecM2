import { onSnapshot, serverTimestamp } from "firebase/firestore";

export const normalizeRequiredString = (value, label) => {
  if (typeof value !== "string") {
    throw new Error(`${label} est obligatoire`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} est obligatoire`);
  }
  return trimmed;
};

export const normalizeOptionalNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const omitUndefinedFields = (payload) =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

export const normalizeOptionalLocation = (location) => {
  if (!location || typeof location !== "object") {
    return undefined;
  }
  const lat = normalizeOptionalNumber(location.lat);
  const lng = normalizeOptionalNumber(location.lng);
  if (lat === undefined || lng === undefined) {
    return undefined;
  }
  const accuracy = normalizeOptionalNumber(location.accuracy);

  return omitUndefinedFields({ lat, lng, accuracy });
};

export const normalizeOptionalTokenPricing = (pricing) => {
  if (!pricing || typeof pricing !== "object") {
    return undefined;
  }
  const text = normalizeOptionalNumber(pricing.text);
  const image = normalizeOptionalNumber(pricing.image);
  const payload = omitUndefinedFields({ text, image });

  return Object.keys(payload).length ? payload : undefined;
};

export const normalizeCountryCode = (code) => {
  if (typeof code !== "string") {
    return undefined;
  }
  const trimmed = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : undefined;
};

export const normalizeCountryPricingMap = (countries) => {
  if (!countries || typeof countries !== "object") {
    return undefined;
  }
  const normalized = Object.entries(countries).reduce((acc, [code, value]) => {
    const normalizedCode = normalizeCountryCode(code);
    const pricing = normalizeOptionalTokenPricing(value);
    if (normalizedCode && pricing) {
      acc[normalizedCode] = pricing;
    }
    return acc;
  }, {});

  return Object.keys(normalized).length ? normalized : undefined;
};

export const sanitizeOptionalString = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

export const normalizeOptionalString = sanitizeOptionalString;

export const normalizeOptionalLook = (look) => {
  if (!look || typeof look !== "object") {
    return undefined;
  }
  const entries = Object.entries(look).reduce((acc, [key, value]) => {
    const sanitized = sanitizeOptionalString(value);
    if (sanitized) {
      acc[key] = sanitized;
    }
    return acc;
  }, {});

  return Object.keys(entries).length ? entries : undefined;
};

export const normalizeRoleValue = (role) => (role === "prestataire" ? "client" : role);

export const normalizeUtilisateurRole = (user) => {
  if (!user || typeof user !== "object") {
    return user;
  }
  const normalizedRole = normalizeRoleValue(user.role);
  if (normalizedRole === user.role) {
    return user;
  }
  return {
    ...user,
    role: normalizedRole,
  };
};

export const normalizeOptionalStringArray = (values) => {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const sanitized = values.map((value) => sanitizeOptionalString(value)).filter(Boolean);
  return sanitized.length ? sanitized : undefined;
};

export const normalizeVisibilityValue = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["public", "private"].includes(normalized)) {
    return normalized;
  }
  return undefined;
};

export const normalizeAccessTypeValue = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["free", "paid"].includes(normalized)) {
    return normalized;
  }
  return undefined;
};

export const normalizeRequiredPassword = (value) => {
  if (typeof value !== "string") {
    throw new Error("Mot de passe est obligatoire");
  }
  if (!value.length) {
    throw new Error("Mot de passe est obligatoire");
  }
  return value;
};

export const createAdminLogPayload = ({ action, targetType, targetId, adminId, adminMail, details }) =>
  omitUndefinedFields({
    action: normalizeRequiredString(action, "Action"),
    targetType: normalizeRequiredString(targetType, "Type"),
    targetId: normalizeRequiredString(targetId, "Cible ID"),
    adminId: sanitizeOptionalString(adminId),
    adminMail: sanitizeOptionalString(adminMail),
    details: typeof details === "object" && details ? details : undefined,
    createdAt: serverTimestamp(),
  });

export const mapSnapshot = (snapshot) =>
  snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  }));

export const pickRandomItem = (items) => items[Math.floor(Math.random() * items.length)];

export const createRealtimeListener = (reference, onData, onError, label) => {
  try {
    return onSnapshot(
      reference,
      (snapshot) => {
        onData?.(mapSnapshot(snapshot));
      },
      (error) => {
        console.error(`Erreur du flux temps réel ${label}`, error);
        onError?.(error);
      }
    );
  } catch (err) {
    console.error(`Impossible d'écouter ${label}`, err);
    onError?.(err);
    return () => {};
  }
};
