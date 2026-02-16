export type AiLook = {
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

export const mentalities = [
  'Coach',
  'Amoureux',
  'Sarcastique',
  'Philosophe',
  'Motivant',
  'Zen',
  'Protecteur',
  'Ludique',
];

export const voiceStyles = ['Calme', 'Energique', 'Chaleureuse', 'Grave', 'Posee', 'Rythmee'];

export const voiceRhythms = ['Lent', 'Modere', 'Rapide', 'Percutant', 'Progressif'];

export const genderOptions = ['Femme', 'Homme', 'Neutre', 'Autre'];
export const skinOptions = ['Claire', 'Halee', 'Foncee', 'Ebene', 'Autre'];
export const hairOptions = ['Court', 'Long', 'Boucle', 'Lisse', 'Afro', 'Tresse', 'Autre'];
export const outfitOptions = ['Casual', 'Chic', 'Sport', 'Tech', 'Minimal', 'Autre'];
export const ethnicityOptions = [
  'Europeenne',
  'Latine',
  'Africaine',
  'Asiatique',
  'Moyen-Orient',
  'Mixte',
  'Autre',
];

export const formatLookSummary = (look?: AiLook | null) => {
  if (!look) {
    return 'Apparence non definie';
  }
  const parts = [
    look.gender && `Genre ${look.gender}`,
    look.skin && `Peau ${look.skin}`,
    look.hair && `Cheveux ${look.hair}`,
    look.hairColor && `Couleur ${look.hairColor}`,
    look.eyeColor && `Yeux ${look.eyeColor}`,
    look.age && `Age ${look.age}`,
    look.height && `Taille ${look.height}`,
    look.bodyType && `Morphologie ${look.bodyType}`,
    look.outfit && `Tenue ${look.outfit}`,
    look.ethnicity && `Ethnie ${look.ethnicity}`,
  ].filter(Boolean);

  return parts.join(' · ') || 'Apparence non definie';
};
