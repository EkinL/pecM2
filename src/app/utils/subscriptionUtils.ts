export type SubscriptionAwareProfile = {
  subscription?: {
    status?: string;
  };
  subscriptionActive?: boolean;
  hasSubscription?: boolean;
  isSubscriber?: boolean;
  plan?: string;
};

export const hasActiveSubscription = (
  profile?: SubscriptionAwareProfile | null
) => {
  if (!profile) {
    return false;
  }

  const status = profile.subscription?.status?.trim().toLowerCase();
  if (status === "active") {
    return true;
  }

  if (profile.subscriptionActive || profile.hasSubscription || profile.isSubscriber) {
    return true;
  }

  if (typeof profile.plan === "string" && profile.plan.toLowerCase().includes("premium")) {
    return true;
  }

  return false;
};
