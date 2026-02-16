import {
  mentalities,
  voiceStyles,
  voiceRhythms,
  genderOptions,
  skinOptions,
  hairOptions,
  outfitOptions,
  ethnicityOptions,
  formatLookSummary,
  AiLook,
} from '../aiOptions';

describe('aiOptions', () => {
  describe('constant arrays', () => {
    it('should have mentalities array', () => {
      expect(mentalities).toBeInstanceOf(Array);
      expect(mentalities.length).toBeGreaterThan(0);
      expect(mentalities).toContain('Coach');
      expect(mentalities).toContain('Amoureux');
      expect(mentalities).toContain('Sarcastique');
    });

    it('should have voiceStyles array', () => {
      expect(voiceStyles).toBeInstanceOf(Array);
      expect(voiceStyles.length).toBeGreaterThan(0);
      expect(voiceStyles).toContain('Calme');
      expect(voiceStyles).toContain('Energique');
    });

    it('should have voiceRhythms array', () => {
      expect(voiceRhythms).toBeInstanceOf(Array);
      expect(voiceRhythms.length).toBeGreaterThan(0);
      expect(voiceRhythms).toContain('Lent');
      expect(voiceRhythms).toContain('Modere');
      expect(voiceRhythms).toContain('Rapide');
    });

    it('should have genderOptions array', () => {
      expect(genderOptions).toBeInstanceOf(Array);
      expect(genderOptions).toContain('Femme');
      expect(genderOptions).toContain('Homme');
      expect(genderOptions).toContain('Neutre');
      expect(genderOptions).toContain('Autre');
    });

    it('should have skinOptions array', () => {
      expect(skinOptions).toBeInstanceOf(Array);
      expect(skinOptions).toContain('Claire');
      expect(skinOptions).toContain('Halee');
      expect(skinOptions).toContain('Foncee');
    });

    it('should have hairOptions array', () => {
      expect(hairOptions).toBeInstanceOf(Array);
      expect(hairOptions).toContain('Court');
      expect(hairOptions).toContain('Long');
      expect(hairOptions).toContain('Boucle');
    });

    it('should have outfitOptions array', () => {
      expect(outfitOptions).toBeInstanceOf(Array);
      expect(outfitOptions).toContain('Casual');
      expect(outfitOptions).toContain('Chic');
      expect(outfitOptions).toContain('Sport');
    });

    it('should have ethnicityOptions array', () => {
      expect(ethnicityOptions).toBeInstanceOf(Array);
      expect(ethnicityOptions).toContain('Europeenne');
      expect(ethnicityOptions).toContain('Latine');
      expect(ethnicityOptions).toContain('Africaine');
      expect(ethnicityOptions).toContain('Asiatique');
    });
  });

  describe('formatLookSummary', () => {
    it('should return default message for null or undefined', () => {
      expect(formatLookSummary(null)).toBe('Apparence non definie');
      expect(formatLookSummary(undefined)).toBe('Apparence non definie');
    });

    it('should format complete look data', () => {
      const look: AiLook = {
        gender: 'Homme',
        skin: 'Claire',
        hair: 'Court',
        hairColor: 'Brun',
        eyeColor: 'Bleu',
        age: '30',
        height: '180cm',
        bodyType: 'Athletique',
        outfit: 'Casual',
        ethnicity: 'Europeenne',
      };
      const result = formatLookSummary(look);
      expect(result).toContain('Genre Homme');
      expect(result).toContain('Peau Claire');
      expect(result).toContain('Cheveux Court');
      expect(result).toContain('Couleur Brun');
      expect(result).toContain('Yeux Bleu');
      expect(result).toContain('Age 30');
      expect(result).toContain('Taille 180cm');
      expect(result).toContain('Morphologie Athletique');
      expect(result).toContain('Tenue Casual');
      expect(result).toContain('Ethnie Europeenne');
      expect(result).toContain('·');
    });

    it('should format partial look data', () => {
      const look: AiLook = {
        gender: 'Femme',
        hair: 'Long',
        outfit: 'Chic',
      };
      const result = formatLookSummary(look);
      expect(result).toContain('Genre Femme');
      expect(result).toContain('Cheveux Long');
      expect(result).toContain('Tenue Chic');
      expect(result).not.toContain('Peau');
      expect(result).not.toContain('Yeux');
    });

    it('should handle single field', () => {
      const look: AiLook = {
        gender: 'Homme',
      };
      const result = formatLookSummary(look);
      expect(result).toBe('Genre Homme');
      expect(result).not.toContain('·');
    });

    it('should return default message for empty look object', () => {
      const look: AiLook = {};
      expect(formatLookSummary(look)).toBe('Apparence non definie');
    });

    it('should ignore undefined or empty fields', () => {
      const look: AiLook = {
        gender: 'Homme',
        skin: undefined,
        hair: '',
        outfit: 'Casual',
      };
      const result = formatLookSummary(look);
      expect(result).toContain('Genre Homme');
      expect(result).toContain('Tenue Casual');
      expect(result).not.toContain('Peau');
      expect(result).not.toContain('Cheveux');
    });

    it('should handle all optional fields being present', () => {
      const look: AiLook = {
        gender: 'Femme',
        skin: 'Claire',
        hair: 'Long',
        hairColor: 'Blond',
        eyeColor: 'Vert',
        age: '25',
        height: '165cm',
        bodyType: 'Mince',
        facialHair: 'Aucune',
        makeup: 'Naturel',
        glasses: 'Oui',
        accessories: 'Boucles d\'oreilles',
        piercings: 'Non',
        tattoos: 'Non',
        scars: 'Non',
        outfit: 'Chic',
        ethnicity: 'Asiatique',
        details: 'Autres details',
      };
      const result = formatLookSummary(look);
      // Only specific fields are included in the summary
      expect(result).toContain('Genre Femme');
      expect(result).toContain('Peau Claire');
      expect(result).toContain('Cheveux Long');
      expect(result).toContain('Tenue Chic');
      // Fields not in the summary function
      expect(result).not.toContain('Boucles');
      expect(result).not.toContain('Naturel');
    });

    it('should join multiple fields with separator', () => {
      const look: AiLook = {
        gender: 'Homme',
        skin: 'Foncee',
      };
      const result = formatLookSummary(look);
      expect(result).toBe('Genre Homme · Peau Foncee');
    });

    it('should handle fields with special characters', () => {
      const look: AiLook = {
        gender: 'Homme',
        height: '1m80',
        outfit: 'Smart-casual',
      };
      const result = formatLookSummary(look);
      expect(result).toContain('Taille 1m80');
      expect(result).toContain('Tenue Smart-casual');
    });
  });
});
