import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useMemberPortal } from "../../lib/store";

function formatCountdown(targetDate?: string | null) {
  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return "Ended";

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${minutes}m left`;
}

export default function RewardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rewards, member } = useMemberPortal();
  const reward = rewards.find((entry) => entry.id === id);

  if (!reward) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>Reward not found</Text>
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const canAfford = member.points >= reward.pointsCost;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>

        {reward.imageUrl ? <Image source={{ uri: reward.imageUrl }} style={styles.heroImage} /> : null}

        <View style={styles.contentCard}>
          <Text style={styles.category}>{reward.category.toUpperCase()}</Text>
          <Text style={styles.title}>{reward.name}</Text>
          <Text style={styles.description}>{reward.description}</Text>

          <View style={styles.metaGrid}>
            <View style={styles.metaTile}>
              <Text style={styles.metaLabel}>Cost</Text>
              <Text style={styles.metaValue}>{reward.pointsCost} pts</Text>
            </View>
            <View style={styles.metaTile}>
              <Text style={styles.metaLabel}>Balance</Text>
              <Text style={styles.metaValue}>{member.points} pts</Text>
            </View>
          </View>

          {reward.activeFlashSaleId ? (
            <View style={styles.flashCard}>
              <Text style={styles.flashTitle}>Flash sale live</Text>
              <Text style={styles.flashBody}>{reward.flashSaleBanner || "Limited reward availability."}</Text>
              <Text style={styles.flashTime}>{formatCountdown(reward.flashSaleEndsAt)}</Text>
            </View>
          ) : null}

          {reward.partnerName ? (
            <View style={styles.partnerCard}>
              <Text style={styles.partnerLabel}>Partner reward</Text>
              <Text style={styles.partnerName}>{reward.partnerName}</Text>
            </View>
          ) : null}

          {!canAfford ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Insufficient points</Text>
              <Text style={styles.errorBody}>
                You need {Math.max(reward.pointsCost - member.points, 0)} more points to redeem this reward.
              </Text>
            </View>
          ) : null}

          <Pressable onPress={() => router.push(`/redeem/${reward.id}`)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Redeem Reward</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f4f1ea",
  },
  container: {
    padding: 18,
    paddingBottom: 40,
    gap: 16,
  },
  backLink: {
    color: "#10213a",
    fontSize: 15,
    fontWeight: "700",
  },
  heroImage: {
    width: "100%",
    height: 260,
    borderRadius: 28,
    backgroundColor: "#ddd",
  },
  contentCard: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 20,
    gap: 14,
  },
  category: {
    color: "#8b5b00",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  title: {
    color: "#10213a",
    fontSize: 30,
    fontWeight: "900",
  },
  description: {
    color: "#65748a",
    fontSize: 15,
    lineHeight: 22,
  },
  metaGrid: {
    flexDirection: "row",
    gap: 12,
  },
  metaTile: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#f6f8fb",
    padding: 14,
  },
  metaLabel: {
    color: "#6d7888",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metaValue: {
    color: "#10213a",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 6,
  },
  flashCard: {
    borderRadius: 20,
    backgroundColor: "#fff1e8",
    padding: 14,
    gap: 6,
  },
  flashTitle: {
    color: "#a33a00",
    fontSize: 14,
    fontWeight: "800",
  },
  flashBody: {
    color: "#7b4b2c",
    fontSize: 13,
    lineHeight: 19,
  },
  flashTime: {
    color: "#d9480f",
    fontSize: 12,
    fontWeight: "800",
  },
  partnerCard: {
    borderRadius: 20,
    backgroundColor: "#edf7ff",
    padding: 14,
  },
  partnerLabel: {
    color: "#34516c",
    fontSize: 12,
    fontWeight: "700",
  },
  partnerName: {
    color: "#10213a",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  errorCard: {
    borderRadius: 20,
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
    lineHeight: 19,
    marginTop: 4,
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 18,
    backgroundColor: "#10213a",
    paddingVertical: 16,
    alignItems: "center",
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
    gap: 14,
    padding: 24,
  },
  centerTitle: {
    color: "#10213a",
    fontSize: 24,
    fontWeight: "800",
  },
});
