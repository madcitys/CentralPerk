import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useMemberPortal } from "../../lib/store";

type RedemptionMethod = "counter" | "delivery";

export default function RedeemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rewards, member, redeemReward } = useMemberPortal();
  const reward = rewards.find((entry) => entry.id === id);
  const [method, setMethod] = useState<RedemptionMethod>("counter");
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const insufficient = useMemo(
    () => (reward ? member.points < reward.pointsCost : false),
    [member.points, reward]
  );

  if (!reward) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.title}>Reward not found</Text>
          <Pressable onPress={() => router.replace("/(tabs)/rewards")} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Back to rewards</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleConfirm = async () => {
    if (insufficient) {
      setError("Insufficient points balance.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await redeemReward(reward);
      setCompleted(true);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Redemption failed.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>

        {!completed ? (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>Reward Confirmation</Text>
            <Text style={styles.title}>Redeem {reward.name}</Text>
            <Text style={styles.description}>
              Confirm the redemption method and use this screen as your Sprint 6 confirmation-state proof.
            </Text>

            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Current balance</Text>
              <Text style={styles.summaryValue}>{member.points} pts</Text>
              <Text style={styles.summaryLabel}>Reward cost</Text>
              <Text style={styles.summaryValue}>{reward.pointsCost} pts</Text>
              <Text style={styles.summaryLabel}>Balance after redeem</Text>
              <Text style={styles.summaryValue}>{Math.max(member.points - reward.pointsCost, 0)} pts</Text>
            </View>

            <View style={styles.methodsRow}>
              <Pressable
                onPress={() => setMethod("counter")}
                style={[styles.methodCard, method === "counter" && styles.methodCardActive]}
              >
                <Text style={[styles.methodTitle, method === "counter" && styles.methodTitleActive]}>In-store</Text>
                <Text style={styles.methodBody}>Claim at the counter</Text>
              </Pressable>
              <Pressable
                onPress={() => setMethod("delivery")}
                style={[styles.methodCard, method === "delivery" && styles.methodCardActive]}
              >
                <Text style={[styles.methodTitle, method === "delivery" && styles.methodTitleActive]}>Delivery</Text>
                <Text style={styles.methodBody}>Send through partner fulfillment</Text>
              </Pressable>
            </View>

            {insufficient ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Insufficient points</Text>
                <Text style={styles.errorBody}>
                  You need {reward.pointsCost - member.points} more points before this redemption can continue.
                </Text>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Redemption error</Text>
                <Text style={styles.errorBody}>{error}</Text>
              </View>
            ) : null}

            <Pressable onPress={handleConfirm} disabled={saving} style={styles.primaryButton}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Confirm Redemption</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={styles.successCard}>
            <Text style={styles.eyebrow}>Success State</Text>
            <Text style={styles.title}>Redemption complete</Text>
            <Text style={styles.description}>
              {reward.name} was redeemed successfully via {method === "counter" ? "in-store pickup" : "delivery"}.
            </Text>
            <Pressable onPress={() => router.replace("/(tabs)/rewards")} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Back to rewards</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f4f1ea",
  },
  container: {
    flex: 1,
    padding: 18,
    gap: 16,
  },
  backLink: {
    color: "#10213a",
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 20,
    gap: 16,
  },
  successCard: {
    backgroundColor: "#ecfbf2",
    borderRadius: 28,
    padding: 20,
    gap: 16,
  },
  eyebrow: {
    color: "#8b5b00",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  title: {
    color: "#10213a",
    fontSize: 30,
    fontWeight: "900",
  },
  description: {
    color: "#65748a",
    fontSize: 14,
    lineHeight: 21,
  },
  summaryBox: {
    borderRadius: 20,
    backgroundColor: "#f6f8fb",
    padding: 16,
    gap: 4,
  },
  summaryLabel: {
    color: "#6d7888",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  summaryValue: {
    color: "#10213a",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  methodsRow: {
    flexDirection: "row",
    gap: 12,
  },
  methodCard: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#eef2f7",
    padding: 14,
  },
  methodCardActive: {
    backgroundColor: "#10213a",
  },
  methodTitle: {
    color: "#10213a",
    fontSize: 15,
    fontWeight: "800",
  },
  methodTitleActive: {
    color: "#ffffff",
  },
  methodBody: {
    color: "#65748a",
    fontSize: 12,
    marginTop: 6,
  },
  errorCard: {
    borderRadius: 18,
    backgroundColor: "#fff3e0",
    padding: 14,
  },
  errorTitle: {
    color: "#a05a00",
    fontSize: 14,
    fontWeight: "800",
  },
  errorBody: {
    color: "#7d5b2c",
    fontSize: 13,
    marginTop: 4,
    lineHeight: 19,
  },
  primaryButton: {
    borderRadius: 18,
    backgroundColor: "#10213a",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
});
