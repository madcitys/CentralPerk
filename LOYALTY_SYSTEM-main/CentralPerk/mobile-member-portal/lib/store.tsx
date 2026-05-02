import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { loadPortalData, redeemReward as redeemRewardRequest } from "./api";
import { mockPortalData } from "./mock-data";
import type { PortalData, RewardItem, TransactionItem } from "./types";

type StoreValue = PortalData & {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  redeemReward: (reward: RewardItem) => Promise<void>;
};

const MemberPortalContext = createContext<StoreValue | null>(null);

export function MemberPortalProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PortalData>(mockPortalData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);

    try {
      const nextData = await loadPortalData();
      setData(nextData);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to refresh data.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const applyLocalRedemption = (reward: RewardItem) => {
    setData((current) => {
      if (current.member.points < reward.pointsCost) {
        throw new Error("Insufficient points balance.");
      }

      const nextPoints = current.member.points - reward.pointsCost;
      const nextTransaction: TransactionItem = {
        id: `redeem-${reward.id}-${Date.now()}`,
        date: new Date().toISOString(),
        description: `${reward.name} Redemption`,
        type: "redeemed",
        points: reward.pointsCost,
        balance: nextPoints,
        category: "Reward",
      };

      return {
        ...current,
        member: {
          ...current.member,
          points: nextPoints,
          redeemedThisMonth: current.member.redeemedThisMonth + reward.pointsCost,
          transactions: [nextTransaction, ...current.member.transactions],
        },
        source: "mock",
      };
    });
  };

  const redeemReward = async (reward: RewardItem) => {
    if (data.source === "mock") {
      applyLocalRedemption(reward);
      return;
    }

    try {
      await redeemRewardRequest({
        reward,
        points: reward.pointsCost,
      });

      await refresh();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Redemption failed.";
      const networkFailure = message.includes("timed out") || message.includes("Network request failed");

      if (data.source === "mock" || networkFailure) {
        applyLocalRedemption(reward);
        return;
      }

      throw nextError;
    }
  };

  const value = useMemo<StoreValue>(() => ({
    ...data,
    loading,
    refreshing,
    error,
    refresh,
    redeemReward,
  }), [data, error, loading, refreshing]);

  return <MemberPortalContext.Provider value={value}>{children}</MemberPortalContext.Provider>;
}

export function useMemberPortal() {
  const context = useContext(MemberPortalContext);
  if (!context) {
    throw new Error("useMemberPortal must be used inside MemberPortalProvider.");
  }

  return context;
}
