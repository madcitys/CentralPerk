import { useEffect, useMemo, useRef } from "react";
import { router } from "expo-router";
import {
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { formatRemainingTierPoints } from "../../lib/api";
import { useMemberPortal } from "../../lib/store";

function formatCountdown(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return "Schedule unavailable";
  if (diff <= 0) return "Expired";

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${Math.max(minutes, 1)}m left`;
}

function formatTransactionDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardScreen() {
  const { member, campaigns, loading, refreshing, refresh } = useMemberPortal();
  const progressInfo = useMemo(() => formatRemainingTierPoints(member.points), [member.points]);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: progressInfo.percent,
      duration: 650,
      useNativeDriver: false,
    }).start();
  }, [progress, progressInfo.percent]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing && !loading} onRefresh={() => void refresh()} />}
      >
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Member Overview</Text>
          <Text style={styles.heroTitle}>Dashboard</Text>
          <Text style={styles.heroSubtitle}>
            Track your points, active campaigns, and recent rewards activity in one mobile view.
          </Text>

          <View style={styles.balanceRow}>
            <View>
              <Text style={styles.balanceLabel}>Current Points</Text>
              <Text style={styles.balanceValue}>{member.points.toLocaleString()}</Text>
            </View>
            <View style={styles.tierPill}>
              <Text style={styles.tierPillLabel}>{member.tier}</Text>
            </View>
          </View>

          <View style={styles.progressPanel}>
            <Text style={styles.progressTitle}>Tier progress</Text>
            <Text style={styles.progressSubtitle}>{progressInfo.label}</Text>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>{member.points.toLocaleString()} pts</Text>
              <Text style={styles.progressLabel}>{progressInfo.target.toLocaleString()} pts</Text>
            </View>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Pending</Text>
            <Text style={styles.metricValue}>{member.pendingPoints}</Text>
            <Text style={styles.metricFoot}>Processing</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Earned</Text>
            <Text style={styles.metricValue}>{member.earnedThisMonth}</Text>
            <Text style={styles.metricFoot}>This month</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Redeemed</Text>
            <Text style={styles.metricValue}>{member.redeemedThisMonth}</Text>
            <Text style={styles.metricFoot}>This month</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Campaigns</Text>
          <Text style={styles.sectionCaption}>Horizontal promo cards with swipe interaction</Text>
        </View>

        <FlatList
          horizontal
          data={campaigns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.horizontalList}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.campaignCard}>
              <Text style={styles.campaignType}>
                {item.campaignType === "flash_sale" ? "FLASH SALE" : item.campaignType === "multiplier_event" ? "MULTIPLIER" : "BONUS"}
              </Text>
              <Text style={styles.campaignTitle}>{item.bannerTitle || item.campaignName}</Text>
              <Text style={styles.campaignBody}>{item.bannerMessage || item.description}</Text>
              <Text style={styles.campaignMeta}>
                {item.multiplier > 1 ? `${item.multiplier}x points` : `${item.bonusPoints} bonus points`}
              </Text>
              <Text style={styles.campaignMeta}>{formatCountdown(item.endsAt)}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No active campaigns yet</Text>
              <Text style={styles.emptyBody}>This area is ready for API-driven promotions.</Text>
            </View>
          }
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <Text style={styles.sectionCaption}>Formatted earning and redemption history</Text>
        </View>

        <View style={styles.transactionsList}>
          {member.transactions.slice(0, 6).map((transaction) => (
            <View key={transaction.id} style={styles.transactionCard}>
              <View style={styles.transactionBody}>
                <Text style={[styles.transactionBadge, transaction.type === "redeemed" ? styles.badgeRedeem : styles.badgeEarn]}>
                  {transaction.type === "redeemed" ? "REDEEM" : "EARN"}
                </Text>
                <Text style={styles.transactionTitle}>{transaction.description}</Text>
                <Text style={styles.transactionDate}>{formatTransactionDate(transaction.date)}</Text>
              </View>
              <Text style={[styles.transactionPoints, transaction.type === "redeemed" ? styles.pointsRedeem : styles.pointsEarn]}>
                {transaction.type === "redeemed" ? "-" : "+"}
                {Math.abs(transaction.points)}
              </Text>
            </View>
          ))}
        </View>

        <Pressable onPress={() => router.push("/(tabs)/transactions")} style={styles.historyButton}>
          <Text style={styles.historyButtonText}>View Full History</Text>
        </Pressable>
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
    paddingBottom: 120,
    gap: 18,
  },
  heroCard: {
    backgroundColor: "#10213a",
    borderRadius: 28,
    padding: 20,
    gap: 14,
  },
  eyebrow: {
    color: "#8fd9dc",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.3,
    fontWeight: "700",
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "800",
  },
  heroSubtitle: {
    color: "#dce6ef",
    fontSize: 14,
    lineHeight: 21,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLabel: {
    color: "#cdd6e2",
    fontSize: 13,
    fontWeight: "600",
  },
  balanceValue: {
    color: "#ffffff",
    fontSize: 42,
    fontWeight: "900",
    marginTop: 4,
  },
  tierPill: {
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  tierPillLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  progressPanel: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  progressTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  progressSubtitle: {
    color: "#dce6ef",
    fontSize: 13,
  },
  progressTrack: {
    height: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#35d4dc",
    borderRadius: 999,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
  },
  metricLabel: {
    color: "#65748a",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metricValue: {
    color: "#10213a",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 8,
  },
  metricFoot: {
    color: "#7f8a98",
    fontSize: 12,
    marginTop: 4,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: "#10213a",
    fontSize: 20,
    fontWeight: "800",
  },
  sectionCaption: {
    color: "#6a7686",
    fontSize: 13,
  },
  horizontalList: {
    gap: 14,
  },
  campaignCard: {
    width: 280,
    borderRadius: 24,
    backgroundColor: "#fff8ea",
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: "#efd9a2",
  },
  campaignType: {
    color: "#946200",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  campaignTitle: {
    color: "#10213a",
    fontSize: 21,
    fontWeight: "800",
  },
  campaignBody: {
    color: "#4c5868",
    fontSize: 14,
    lineHeight: 20,
  },
  campaignMeta: {
    color: "#7b5c05",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyCard: {
    width: 280,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 18,
    borderWidth: 1,
    borderColor: "#dde3ea",
  },
  emptyTitle: {
    color: "#10213a",
    fontSize: 16,
    fontWeight: "800",
  },
  emptyBody: {
    color: "#6d7888",
    fontSize: 13,
    marginTop: 6,
  },
  transactionsList: {
    gap: 12,
  },
  historyButton: {
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#10213a",
  },
  historyButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  transactionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transactionBody: {
    flex: 1,
    paddingRight: 12,
  },
  transactionBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
  },
  badgeEarn: {
    backgroundColor: "#e7f8ef",
    color: "#157347",
  },
  badgeRedeem: {
    backgroundColor: "#fff1e7",
    color: "#b45309",
  },
  transactionTitle: {
    color: "#10213a",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 10,
  },
  transactionDate: {
    color: "#7b8794",
    fontSize: 12,
    marginTop: 4,
  },
  transactionPoints: {
    fontSize: 18,
    fontWeight: "800",
  },
  pointsEarn: {
    color: "#0f8a4b",
  },
  pointsRedeem: {
    color: "#d46b08",
  },
});
