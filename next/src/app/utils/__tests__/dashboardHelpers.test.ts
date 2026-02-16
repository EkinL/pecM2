import {
  statusBucket,
  statusLabels,
  statusBadgeStyles,
  normalizeAiStatus,
  aiStatusLabels,
  aiStatusStyles,
  formatDate,
  formatUserLabel,
  formatLookSummary,
  buildLookPayload,
} from '../dashboardHelpers';
import { AiProfile, Timestamp, Utilisateur } from '../../types/dashboard';

describe('dashboardHelpers', () => {
  describe('statusBucket', () => {
    it('should return "pending" for pending-like statuses', () => {
      expect(statusBucket('pending')).toBe('pending');
      expect(statusBucket('nouveau')).toBe('pending');
      expect(statusBucket('queued')).toBe('pending');
      expect(statusBucket('en attente')).toBe('pending');
      expect(statusBucket('')).toBe('pending');
      expect(statusBucket(undefined)).toBe('pending');
    });

    it('should return "running" for active statuses', () => {
      expect(statusBucket('in progress')).toBe('running');
      expect(statusBucket('en cours')).toBe('running');
      expect(statusBucket('ongoing')).toBe('running');
      expect(statusBucket('matched')).toBe('running');
      expect(statusBucket('actif')).toBe('running');
      expect(statusBucket('accepted')).toBe('running');
    });

    it('should return "completed" for finished statuses', () => {
      expect(statusBucket('completed')).toBe('completed');
      expect(statusBucket('done')).toBe('completed');
      expect(statusBucket('terminé')).toBe('completed');
      expect(statusBucket('closed')).toBe('completed');
      expect(statusBucket('ended')).toBe('completed');
      expect(statusBucket('cancelled')).toBe('completed');
    });

    it('should return "other" for unrecognized statuses', () => {
      expect(statusBucket('unknown')).toBe('other');
      expect(statusBucket('random')).toBe('other');
    });

    it('should handle case insensitivity', () => {
      expect(statusBucket('PENDING')).toBe('pending');
      expect(statusBucket('In Progress')).toBe('running');
      expect(statusBucket('COMPLETED')).toBe('completed');
    });
  });

  describe('statusLabels', () => {
    it('should have correct labels', () => {
      expect(statusLabels.pending).toBe('Ouverte');
      expect(statusLabels.running).toBe('Ouverte');
      expect(statusLabels.completed).toBe('Fermee');
      expect(statusLabels.other).toBe('Ouverte');
    });
  });

  describe('statusBadgeStyles', () => {
    it('should have styles for all status types', () => {
      expect(statusBadgeStyles.pending).toContain('amber');
      expect(statusBadgeStyles.running).toContain('emerald');
      expect(statusBadgeStyles.completed).toContain('sky');
      expect(statusBadgeStyles.other).toContain('slate');
    });
  });

  describe('normalizeAiStatus', () => {
    it('should return valid AI statuses as-is', () => {
      expect(normalizeAiStatus('pending')).toBe('pending');
      expect(normalizeAiStatus('active')).toBe('active');
      expect(normalizeAiStatus('suspended')).toBe('suspended');
      expect(normalizeAiStatus('disabled')).toBe('disabled');
      expect(normalizeAiStatus('rejected')).toBe('rejected');
    });

    it('should return "pending" for invalid statuses', () => {
      expect(normalizeAiStatus('unknown')).toBe('pending');
      expect(normalizeAiStatus('')).toBe('pending');
      expect(normalizeAiStatus(undefined)).toBe('pending');
    });

    it('should handle case insensitivity', () => {
      expect(normalizeAiStatus('ACTIVE')).toBe('active');
      expect(normalizeAiStatus('Suspended')).toBe('suspended');
    });
  });

  describe('aiStatusLabels', () => {
    it('should have French labels for all AI statuses', () => {
      expect(aiStatusLabels.pending).toBe('En attente');
      expect(aiStatusLabels.active).toBe('Active');
      expect(aiStatusLabels.suspended).toBe('Suspendue');
      expect(aiStatusLabels.disabled).toBe('Desactivee');
      expect(aiStatusLabels.rejected).toBe('Refusee');
    });
  });

  describe('aiStatusStyles', () => {
    it('should have styles for all AI status types', () => {
      expect(aiStatusStyles.pending).toContain('amber');
      expect(aiStatusStyles.active).toContain('emerald');
      expect(aiStatusStyles.suspended).toContain('sky');
      expect(aiStatusStyles.disabled).toContain('slate');
      expect(aiStatusStyles.rejected).toContain('rose');
    });
  });

  describe('formatDate', () => {
    it('should return "—" for undefined or null values', () => {
      expect(formatDate(undefined)).toBe('—');
      expect(formatDate()).toBe('—');
    });

    it('should format string dates', () => {
      const dateStr = '2024-01-15T10:30:00Z';
      const result = formatDate(dateStr);
      expect(result).not.toBe('—');
      expect(result).toContain('/');
    });

    it('should format Timestamp objects', () => {
      const timestamp: Timestamp = {
        seconds: 1705318200,
        nanoseconds: 0,
      };
      const result = formatDate(timestamp);
      expect(result).not.toBe('—');
      expect(result).toContain('/');
    });

    it('should handle invalid Timestamp objects', () => {
      const invalidTimestamp = {} as Timestamp;
      const result = formatDate(invalidTimestamp);
      expect(result).toBe('—');
    });
  });

  describe('formatUserLabel', () => {
    it('should return pseudo if available', () => {
      const user: Utilisateur = {
        id: 'user123',
        pseudo: 'JohnDoe',
        mail: 'john@example.com',
      };
      expect(formatUserLabel(user)).toBe('JohnDoe');
    });

    it('should return mail if pseudo is not available', () => {
      const user: Utilisateur = {
        id: 'user123',
        mail: 'john@example.com',
      };
      expect(formatUserLabel(user)).toBe('john@example.com');
    });

    it('should return formatted ID if neither pseudo nor mail is available', () => {
      const user: Utilisateur = {
        id: 'user123456',
      };
      expect(formatUserLabel(user)).toBe('Utilisateur user1');
    });

    it('should return formatted ID if mail is empty string', () => {
      const user: Utilisateur = {
        id: 'user123456',
        mail: '',
      };
      expect(formatUserLabel(user)).toBe('Utilisateur user1');
    });
  });

  describe('formatLookSummary', () => {
    it('should return default message if no look data', () => {
      const profile: AiProfile = {
        id: 'ai123',
      };
      expect(formatLookSummary(profile)).toBe('Apparence en attente');
    });

    it('should format complete look data', () => {
      const profile: AiProfile = {
        id: 'ai123',
        look: {
          gender: 'Homme',
          skin: 'Claire',
          hair: 'Courts',
          outfit: 'Décontractée',
          ethnicity: 'Européenne',
        },
      };
      const result = formatLookSummary(profile);
      expect(result).toContain('Genre Homme');
      expect(result).toContain('Peau Claire');
      expect(result).toContain('Cheveux Courts');
      expect(result).toContain('Tenue Décontractée');
      expect(result).toContain('Ethnie Européenne');
      expect(result).toContain('·');
    });

    it('should handle partial look data', () => {
      const profile: AiProfile = {
        id: 'ai123',
        look: {
          gender: 'Femme',
          hair: 'Longs',
        },
      };
      const result = formatLookSummary(profile);
      expect(result).toContain('Genre Femme');
      expect(result).toContain('Cheveux Longs');
      expect(result).not.toContain('Peau');
    });

    it('should return partial message if look is empty', () => {
      const profile: AiProfile = {
        id: 'ai123',
        look: {},
      };
      expect(formatLookSummary(profile)).toBe('Apparence partiellement renseignée');
    });
  });

  describe('buildLookPayload', () => {
    it('should build payload with trimmed values', () => {
      const values = {
        gender: '  Homme  ',
        skin: 'Claire',
        hair: '  Courts  ',
      };
      const result = buildLookPayload(values);
      expect(result).toEqual({
        gender: 'Homme',
        skin: 'Claire',
        hair: 'Courts',
      });
    });

    it('should exclude empty strings', () => {
      const values = {
        gender: 'Homme',
        skin: '',
        hair: '  ',
        outfit: 'Décontractée',
      };
      const result = buildLookPayload(values);
      expect(result).toEqual({
        gender: 'Homme',
        outfit: 'Décontractée',
      });
    });

    it('should return undefined if all values are empty', () => {
      const values = {
        gender: '',
        skin: '  ',
        hair: '',
      };
      const result = buildLookPayload(values);
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty object', () => {
      const values = {};
      const result = buildLookPayload(values);
      expect(result).toBeUndefined();
    });

    it('should handle mixed whitespace and valid values', () => {
      const values = {
        gender: 'Homme',
        skin: '\n\t',
        hair: '   Courts   ',
        outfit: '',
      };
      const result = buildLookPayload(values);
      expect(result).toEqual({
        gender: 'Homme',
        hair: 'Courts',
      });
    });
  });
});
