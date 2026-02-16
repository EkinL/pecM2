import { hasActiveSubscription, SubscriptionAwareProfile } from '../subscriptionUtils';

describe('subscriptionUtils', () => {
  describe('hasActiveSubscription', () => {
    it('should return false for null or undefined profile', () => {
      expect(hasActiveSubscription(null)).toBe(false);
      expect(hasActiveSubscription(undefined)).toBe(false);
    });

    it('should return true when subscription status is "active"', () => {
      const profile: SubscriptionAwareProfile = {
        subscription: {
          status: 'active',
        },
      };
      expect(hasActiveSubscription(profile)).toBe(true);
    });

    it('should handle case insensitivity and whitespace in subscription status', () => {
      const profile1: SubscriptionAwareProfile = {
        subscription: {
          status: 'ACTIVE',
        },
      };
      expect(hasActiveSubscription(profile1)).toBe(true);

      const profile2: SubscriptionAwareProfile = {
        subscription: {
          status: '  active  ',
        },
      };
      expect(hasActiveSubscription(profile2)).toBe(true);

      const profile3: SubscriptionAwareProfile = {
        subscription: {
          status: 'Active',
        },
      };
      expect(hasActiveSubscription(profile3)).toBe(true);
    });

    it('should return true when subscriptionActive flag is true', () => {
      const profile: SubscriptionAwareProfile = {
        subscriptionActive: true,
      };
      expect(hasActiveSubscription(profile)).toBe(true);
    });

    it('should return true when hasSubscription flag is true', () => {
      const profile: SubscriptionAwareProfile = {
        hasSubscription: true,
      };
      expect(hasActiveSubscription(profile)).toBe(true);
    });

    it('should return true when isSubscriber flag is true', () => {
      const profile: SubscriptionAwareProfile = {
        isSubscriber: true,
      };
      expect(hasActiveSubscription(profile)).toBe(true);
    });

    it('should return true when plan includes "premium"', () => {
      const profile1: SubscriptionAwareProfile = {
        plan: 'premium',
      };
      expect(hasActiveSubscription(profile1)).toBe(true);

      const profile2: SubscriptionAwareProfile = {
        plan: 'Premium Plus',
      };
      expect(hasActiveSubscription(profile2)).toBe(true);

      const profile3: SubscriptionAwareProfile = {
        plan: 'PREMIUM',
      };
      expect(hasActiveSubscription(profile3)).toBe(true);
    });

    it('should return false when plan does not include "premium"', () => {
      const profile: SubscriptionAwareProfile = {
        plan: 'basic',
      };
      expect(hasActiveSubscription(profile)).toBe(false);
    });

    it('should return false when subscription status is not active', () => {
      const profile: SubscriptionAwareProfile = {
        subscription: {
          status: 'inactive',
        },
      };
      expect(hasActiveSubscription(profile)).toBe(false);
    });

    it('should return false when subscription status is cancelled', () => {
      const profile: SubscriptionAwareProfile = {
        subscription: {
          status: 'cancelled',
        },
      };
      expect(hasActiveSubscription(profile)).toBe(false);
    });

    it('should return false for empty profile object', () => {
      const profile: SubscriptionAwareProfile = {};
      expect(hasActiveSubscription(profile)).toBe(false);
    });

    it('should prioritize subscription status over other fields', () => {
      const profile: SubscriptionAwareProfile = {
        subscription: {
          status: 'active',
        },
        subscriptionActive: false,
        hasSubscription: false,
        isSubscriber: false,
        plan: 'basic',
      };
      expect(hasActiveSubscription(profile)).toBe(true);
    });

    it('should check multiple fields when subscription status is not active', () => {
      const profile: SubscriptionAwareProfile = {
        subscription: {
          status: 'inactive',
        },
        subscriptionActive: true,
      };
      expect(hasActiveSubscription(profile)).toBe(true);
    });

    it('should return false when all indicators are negative', () => {
      const profile: SubscriptionAwareProfile = {
        subscription: {
          status: 'expired',
        },
        subscriptionActive: false,
        hasSubscription: false,
        isSubscriber: false,
        plan: 'free',
      };
      expect(hasActiveSubscription(profile)).toBe(false);
    });

    it('should handle profile with missing subscription object', () => {
      const profile: SubscriptionAwareProfile = {
        subscriptionActive: false,
        hasSubscription: false,
        isSubscriber: false,
        plan: 'basic',
      };
      expect(hasActiveSubscription(profile)).toBe(false);
    });

    it('should handle empty subscription object', () => {
      const profile: SubscriptionAwareProfile = {
        subscription: {},
      };
      expect(hasActiveSubscription(profile)).toBe(false);
    });

    it('should return true if any boolean flag is true, regardless of others', () => {
      const profile1: SubscriptionAwareProfile = {
        subscriptionActive: true,
        hasSubscription: false,
        isSubscriber: false,
      };
      expect(hasActiveSubscription(profile1)).toBe(true);

      const profile2: SubscriptionAwareProfile = {
        subscriptionActive: false,
        hasSubscription: true,
        isSubscriber: false,
      };
      expect(hasActiveSubscription(profile2)).toBe(true);

      const profile3: SubscriptionAwareProfile = {
        subscriptionActive: false,
        hasSubscription: false,
        isSubscriber: true,
      };
      expect(hasActiveSubscription(profile3)).toBe(true);
    });
  });
});
