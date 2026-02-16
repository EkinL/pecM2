import {
  normalizeRequiredString,
  normalizeOptionalNumber,
  omitUndefinedFields,
  normalizeOptionalLocation,
  normalizeOptionalTokenPricing,
  normalizeCountryCode,
  normalizeCountryPricingMap,
  sanitizeOptionalString,
  normalizeOptionalString,
  normalizeOptionalLook,
  normalizeRoleValue,
  normalizeUtilisateurRole,
  normalizeOptionalStringArray,
  normalizeVisibilityValue,
  normalizeAccessTypeValue,
  normalizeRequiredPassword,
  mapSnapshot,
  pickRandomItem,
} from '../helpers';

describe('firebase helpers', () => {
  describe('normalizeRequiredString', () => {
    it('should return trimmed string for valid input', () => {
      expect(normalizeRequiredString('  Hello  ', 'Label')).toBe('Hello');
      expect(normalizeRequiredString('World', 'Label')).toBe('World');
    });

    it('should throw error for non-string values', () => {
      expect(() => normalizeRequiredString(123, 'Label')).toThrow('Label est obligatoire');
      expect(() => normalizeRequiredString(null, 'Label')).toThrow('Label est obligatoire');
      expect(() => normalizeRequiredString(undefined, 'Label')).toThrow('Label est obligatoire');
    });

    it('should throw error for empty or whitespace-only strings', () => {
      expect(() => normalizeRequiredString('', 'Label')).toThrow('Label est obligatoire');
      expect(() => normalizeRequiredString('   ', 'Label')).toThrow('Label est obligatoire');
    });
  });

  describe('normalizeOptionalNumber', () => {
    it('should return number for valid numeric input', () => {
      expect(normalizeOptionalNumber(42)).toBe(42);
      expect(normalizeOptionalNumber(0)).toBe(0);
      expect(normalizeOptionalNumber(-10)).toBe(-10);
      expect(normalizeOptionalNumber(3.14)).toBe(3.14);
    });

    it('should parse numeric strings', () => {
      expect(normalizeOptionalNumber('42')).toBe(42);
      expect(normalizeOptionalNumber('  3.14  ')).toBe(3.14);
      expect(normalizeOptionalNumber('-10')).toBe(-10);
    });

    it('should return undefined for invalid inputs', () => {
      expect(normalizeOptionalNumber('not a number')).toBeUndefined();
      expect(normalizeOptionalNumber('')).toBeUndefined();
      expect(normalizeOptionalNumber('   ')).toBeUndefined();
      expect(normalizeOptionalNumber(NaN)).toBeUndefined();
      expect(normalizeOptionalNumber(Infinity)).toBeUndefined();
      expect(normalizeOptionalNumber(null)).toBeUndefined();
      expect(normalizeOptionalNumber(undefined)).toBeUndefined();
    });
  });

  describe('omitUndefinedFields', () => {
    it('should remove undefined fields', () => {
      const input = { a: 1, b: undefined, c: 'hello', d: undefined };
      expect(omitUndefinedFields(input)).toEqual({ a: 1, c: 'hello' });
    });

    it('should keep null and false values', () => {
      const input = { a: null, b: false, c: 0, d: '' };
      expect(omitUndefinedFields(input)).toEqual({ a: null, b: false, c: 0, d: '' });
    });

    it('should return empty object for all undefined', () => {
      const input = { a: undefined, b: undefined };
      expect(omitUndefinedFields(input)).toEqual({});
    });
  });

  describe('normalizeOptionalLocation', () => {
    it('should normalize valid location', () => {
      const location = { lat: 48.8566, lng: 2.3522, accuracy: 10 };
      expect(normalizeOptionalLocation(location)).toEqual({
        lat: 48.8566,
        lng: 2.3522,
        accuracy: 10,
      });
    });

    it('should normalize location without accuracy', () => {
      const location = { lat: 48.8566, lng: 2.3522 };
      expect(normalizeOptionalLocation(location)).toEqual({
        lat: 48.8566,
        lng: 2.3522,
      });
    });

    it('should parse string coordinates', () => {
      const location = { lat: '48.8566', lng: '2.3522' };
      expect(normalizeOptionalLocation(location)).toEqual({
        lat: 48.8566,
        lng: 2.3522,
      });
    });

    it('should return undefined for invalid location', () => {
      expect(normalizeOptionalLocation(null)).toBeUndefined();
      expect(normalizeOptionalLocation(undefined)).toBeUndefined();
      expect(normalizeOptionalLocation('not an object')).toBeUndefined();
      expect(normalizeOptionalLocation({ lat: 48.8566 })).toBeUndefined();
      expect(normalizeOptionalLocation({ lng: 2.3522 })).toBeUndefined();
      expect(normalizeOptionalLocation({ lat: 'invalid', lng: 2.3522 })).toBeUndefined();
    });
  });

  describe('normalizeOptionalTokenPricing', () => {
    it('should normalize valid pricing', () => {
      const pricing = { text: 10, image: 20 };
      expect(normalizeOptionalTokenPricing(pricing)).toEqual({ text: 10, image: 20 });
    });

    it('should normalize partial pricing', () => {
      expect(normalizeOptionalTokenPricing({ text: 10 })).toEqual({ text: 10 });
      expect(normalizeOptionalTokenPricing({ image: 20 })).toEqual({ image: 20 });
    });

    it('should parse string values', () => {
      const pricing = { text: '10', image: '20' };
      expect(normalizeOptionalTokenPricing(pricing)).toEqual({ text: 10, image: 20 });
    });

    it('should return undefined for invalid pricing', () => {
      expect(normalizeOptionalTokenPricing(null)).toBeUndefined();
      expect(normalizeOptionalTokenPricing(undefined)).toBeUndefined();
      expect(normalizeOptionalTokenPricing({})).toBeUndefined();
      expect(normalizeOptionalTokenPricing({ text: 'invalid' })).toBeUndefined();
    });
  });

  describe('normalizeCountryCode', () => {
    it('should normalize valid country codes', () => {
      expect(normalizeCountryCode('fr')).toBe('FR');
      expect(normalizeCountryCode('FR')).toBe('FR');
      expect(normalizeCountryCode('  us  ')).toBe('US');
    });

    it('should return undefined for invalid codes', () => {
      expect(normalizeCountryCode('france')).toBeUndefined();
      expect(normalizeCountryCode('F')).toBeUndefined();
      expect(normalizeCountryCode('123')).toBeUndefined();
      expect(normalizeCountryCode('')).toBeUndefined();
      expect(normalizeCountryCode(null)).toBeUndefined();
      expect(normalizeCountryCode(undefined)).toBeUndefined();
    });
  });

  describe('normalizeCountryPricingMap', () => {
    it('should normalize valid country pricing map', () => {
      const input = {
        fr: { text: 10, image: 20 },
        us: { text: 15 },
      };
      expect(normalizeCountryPricingMap(input)).toEqual({
        FR: { text: 10, image: 20 },
        US: { text: 15 },
      });
    });

    it('should filter out invalid entries', () => {
      const input = {
        fr: { text: 10 },
        invalid: { text: 15 },
        us: { text: 'not a number' },
      };
      expect(normalizeCountryPricingMap(input)).toEqual({
        FR: { text: 10 },
      });
    });

    it('should return undefined for invalid input', () => {
      expect(normalizeCountryPricingMap(null)).toBeUndefined();
      expect(normalizeCountryPricingMap(undefined)).toBeUndefined();
      expect(normalizeCountryPricingMap({})).toBeUndefined();
    });
  });

  describe('sanitizeOptionalString', () => {
    it('should return trimmed string for valid input', () => {
      expect(sanitizeOptionalString('  Hello  ')).toBe('Hello');
      expect(sanitizeOptionalString('World')).toBe('World');
    });

    it('should return undefined for empty or invalid input', () => {
      expect(sanitizeOptionalString('')).toBeUndefined();
      expect(sanitizeOptionalString('   ')).toBeUndefined();
      expect(sanitizeOptionalString(null)).toBeUndefined();
      expect(sanitizeOptionalString(undefined)).toBeUndefined();
      expect(sanitizeOptionalString(123)).toBeUndefined();
    });
  });

  describe('normalizeOptionalString', () => {
    it('should be an alias for sanitizeOptionalString', () => {
      expect(normalizeOptionalString).toBe(sanitizeOptionalString);
    });
  });

  describe('normalizeOptionalLook', () => {
    it('should normalize valid look object', () => {
      const look = {
        gender: '  Homme  ',
        skin: 'Claire',
        hair: 'Courts',
        empty: '',
        whitespace: '   ',
      };
      expect(normalizeOptionalLook(look)).toEqual({
        gender: 'Homme',
        skin: 'Claire',
        hair: 'Courts',
      });
    });

    it('should return undefined for invalid input', () => {
      expect(normalizeOptionalLook(null)).toBeUndefined();
      expect(normalizeOptionalLook(undefined)).toBeUndefined();
      expect(normalizeOptionalLook('not an object')).toBeUndefined();
      expect(normalizeOptionalLook({})).toBeUndefined();
    });
  });

  describe('normalizeRoleValue', () => {
    it('should convert "prestataire" to "client"', () => {
      expect(normalizeRoleValue('prestataire')).toBe('client');
    });

    it('should return other roles unchanged', () => {
      expect(normalizeRoleValue('admin')).toBe('admin');
      expect(normalizeRoleValue('client')).toBe('client');
      expect(normalizeRoleValue('user')).toBe('user');
    });
  });

  describe('normalizeUtilisateurRole', () => {
    it('should normalize role in user object', () => {
      const user = { id: '123', role: 'prestataire', name: 'John' };
      expect(normalizeUtilisateurRole(user)).toEqual({
        id: '123',
        role: 'client',
        name: 'John',
      });
    });

    it('should return unchanged if role is not "prestataire"', () => {
      const user = { id: '123', role: 'admin', name: 'John' };
      expect(normalizeUtilisateurRole(user)).toBe(user);
    });

    it('should handle invalid input', () => {
      expect(normalizeUtilisateurRole(null)).toBe(null);
      expect(normalizeUtilisateurRole(undefined)).toBe(undefined);
      expect(normalizeUtilisateurRole('not an object')).toBe('not an object');
    });
  });

  describe('normalizeOptionalStringArray', () => {
    it('should sanitize and return valid strings', () => {
      const input = ['  Hello  ', 'World', '', '   ', 'Test'];
      expect(normalizeOptionalStringArray(input)).toEqual(['Hello', 'World', 'Test']);
    });

    it('should return undefined for non-arrays', () => {
      expect(normalizeOptionalStringArray(null)).toBeUndefined();
      expect(normalizeOptionalStringArray(undefined)).toBeUndefined();
      expect(normalizeOptionalStringArray('not an array')).toBeUndefined();
    });

    it('should return undefined for empty result', () => {
      expect(normalizeOptionalStringArray([])).toBeUndefined();
      expect(normalizeOptionalStringArray(['', '   '])).toBeUndefined();
    });

    it('should filter out non-string values', () => {
      const input = ['Hello', 123, 'World', null, undefined];
      expect(normalizeOptionalStringArray(input)).toEqual(['Hello', 'World']);
    });
  });

  describe('normalizeVisibilityValue', () => {
    it('should normalize valid visibility values', () => {
      expect(normalizeVisibilityValue('public')).toBe('public');
      expect(normalizeVisibilityValue('private')).toBe('private');
      expect(normalizeVisibilityValue('PUBLIC')).toBe('public');
      expect(normalizeVisibilityValue('  Private  ')).toBe('private');
    });

    it('should return undefined for invalid values', () => {
      expect(normalizeVisibilityValue('hidden')).toBeUndefined();
      expect(normalizeVisibilityValue('')).toBeUndefined();
      expect(normalizeVisibilityValue(null)).toBeUndefined();
      expect(normalizeVisibilityValue(undefined)).toBeUndefined();
      expect(normalizeVisibilityValue(123)).toBeUndefined();
    });
  });

  describe('normalizeAccessTypeValue', () => {
    it('should normalize valid access type values', () => {
      expect(normalizeAccessTypeValue('free')).toBe('free');
      expect(normalizeAccessTypeValue('paid')).toBe('paid');
      expect(normalizeAccessTypeValue('FREE')).toBe('free');
      expect(normalizeAccessTypeValue('  Paid  ')).toBe('paid');
    });

    it('should return undefined for invalid values', () => {
      expect(normalizeAccessTypeValue('premium')).toBeUndefined();
      expect(normalizeAccessTypeValue('')).toBeUndefined();
      expect(normalizeAccessTypeValue(null)).toBeUndefined();
      expect(normalizeAccessTypeValue(undefined)).toBeUndefined();
      expect(normalizeAccessTypeValue(123)).toBeUndefined();
    });
  });

  describe('normalizeRequiredPassword', () => {
    it('should return password for valid input', () => {
      expect(normalizeRequiredPassword('mypassword')).toBe('mypassword');
      expect(normalizeRequiredPassword('  password  ')).toBe('  password  ');
    });

    it('should throw error for invalid input', () => {
      expect(() => normalizeRequiredPassword('')).toThrow('Mot de passe est obligatoire');
      expect(() => normalizeRequiredPassword(null)).toThrow('Mot de passe est obligatoire');
      expect(() => normalizeRequiredPassword(undefined)).toThrow('Mot de passe est obligatoire');
      expect(() => normalizeRequiredPassword(123)).toThrow('Mot de passe est obligatoire');
    });
  });

  describe('mapSnapshot', () => {
    it('should map snapshot docs to objects with id', () => {
      const snapshot = {
        docs: [
          { id: 'doc1', data: () => ({ name: 'Alice', age: 30 }) },
          { id: 'doc2', data: () => ({ name: 'Bob', age: 25 }) },
        ],
      };
      expect(mapSnapshot(snapshot)).toEqual([
        { id: 'doc1', name: 'Alice', age: 30 },
        { id: 'doc2', name: 'Bob', age: 25 },
      ]);
    });

    it('should handle empty snapshot', () => {
      const snapshot = { docs: [] };
      expect(mapSnapshot(snapshot)).toEqual([]);
    });
  });

  describe('pickRandomItem', () => {
    it('should return an item from the array', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const picked = pickRandomItem(items);
      expect(items).toContain(picked);
    });

    it('should return the only item in single-item array', () => {
      const items = ['only'];
      expect(pickRandomItem(items)).toBe('only');
    });

    it('should work with different data types', () => {
      const numbers = [1, 2, 3, 4, 5];
      const picked = pickRandomItem(numbers);
      expect(numbers).toContain(picked);
    });

    it('should produce different results over multiple calls', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const results = new Set();

      // Run multiple times to check randomness
      for (let i = 0; i < 100; i++) {
        results.add(pickRandomItem(items));
      }

      // With 100 iterations on 5 items, we should get more than 1 unique result
      expect(results.size).toBeGreaterThan(1);
    });
  });
});
