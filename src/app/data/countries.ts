export type CountryOption = {
  code: string;
  label: string;
};

export const countryOptions: CountryOption[] = [
  { code: "FR", label: "France" },
  { code: "BE", label: "Belgique" },
  { code: "CH", label: "Suisse" },
  { code: "LU", label: "Luxembourg" },
  { code: "DE", label: "Allemagne" },
  { code: "ES", label: "Espagne" },
  { code: "IT", label: "Italie" },
  { code: "PT", label: "Portugal" },
  { code: "NL", label: "Pays-Bas" },
  { code: "GB", label: "Royaume-Uni" },
  { code: "IE", label: "Irlande" },
  { code: "US", label: "Etats-Unis" },
  { code: "CA", label: "Canada" },
  { code: "MA", label: "Maroc" },
  { code: "TN", label: "Tunisie" },
  { code: "DZ", label: "Algerie" },
  { code: "SN", label: "Senegal" },
  { code: "CI", label: "Cote d'Ivoire" },
  { code: "CM", label: "Cameroun" },
  { code: "TG", label: "Togo" },
];

export const countryLabelByCode = countryOptions.reduce<Record<string, string>>(
  (acc, option) => {
    acc[option.code] = option.label;
    return acc;
  },
  {}
);

export const normalizeCountryCodeInput = (value: string) => value.trim().toUpperCase();

export const isValidCountryCode = (value: string) => /^[A-Z]{2}$/.test(value);

const STORAGE_KEY = "manualCountry";

export const readStoredManualCountry = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { code?: string; label?: string } | null;
    const code = normalizeCountryCodeInput(parsed?.code ?? "");
    if (!isValidCountryCode(code)) {
      return null;
    }
    const label =
      typeof parsed?.label === "string" && parsed.label.trim().length > 0
        ? parsed.label.trim()
        : countryLabelByCode[code] ?? `Pays ${code}`;
    return { code, label };
  } catch (error) {
    console.warn("Impossible de lire le pays manuel", error);
    return null;
  }
};

export const writeStoredManualCountry = (code: string, label?: string) => {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeCountryCodeInput(code);
  if (!isValidCountryCode(normalized)) {
    return;
  }
  const resolvedLabel =
    typeof label === "string" && label.trim().length > 0
      ? label.trim()
      : countryLabelByCode[normalized] ?? `Pays ${normalized}`;
  const payload = JSON.stringify({ code: normalized, label: resolvedLabel });
  window.localStorage.setItem(STORAGE_KEY, payload);
};
