import { useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useMemberPortal } from "../../lib/store";

const categories = ["all", "food", "beverage", "merchandise", "voucher"] as const;

function formatCountdown(targetDate?: string | null) {
  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return "Ended";

  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m left`;
}

export default function RewardsScreen() {
  const { member, rewards, refreshing, refresh } = useMemberPortal();
  const [activeCategory, setActiveCategory] = useState<(typeof categories)[number]>("all");
  const [query, setQuery] = useState("");

  const filteredRewards = useMemo(() => {
    const loweredQuery = query.trim().toLowerCase();

    return rewards.filter((reward) => {
      const matchesCategory = activeCategory === "all" ? true : reward.category === activeCategory;
      const matchesQuery =
        loweredQuery.length === 0 ||
        reward.name.toLowerCase().includes(loweredQuery) ||
        reward.description.toLowerCase().includes(loweredQuery);
      return reward.available && matchesCategory && matchesQuery;
    });
  }, [activeCategory, query, rewards]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Rewards Catalog</Text>
          <Text style={styles.heroTitle}>Redeem Rewards</Text>
          <Text style={styles.heroSubtitle}>
            Browse rewards, open the detail screen, and complete the redemption confirmation flow.
          </Text>
          <View style={styles.pointsPill}>
            <Text style={styles.pointsPillText}>{member.points.toLocaleString()} available points</Text>
          </View>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search rewards..."
          placeholderTextColor="#7d8897"
          style={styles.searchInput}
        />

        <FlatList
          data={categories}
          horizontal
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setActiveCategory(item)}
              style={[styles.filterChip, activeCategory === item && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, activeCategory === item && styles.filterTextActive]}>
                {item === "all" ? "All" : item.charAt(0).toUpperCase() + item.slice(1)}
              </Text>
            </Pressable>
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        />

        <View style={styles.grid}>
          {filteredRewards.map((reward) => {
            const soldOut =
              reward.flashSaleQuantityLimit !== null &&
              reward.flashSaleQuantityLimit !== undefined &&
              (reward.flashSaleClaimedCount || 0) >= reward.flashSaleQuantityLimit;
            const canAfford = member.points >= reward.pointsCost;

            return (
              <Pressable
                key={reward.id}
                onPress={() => router.push(`/reward/${reward.id}`)}
                style={styles.rewardCard}
              >
                {reward.imageUrl ? <Image source={{ uri: reward.imageUrl }} style={styles.rewardImage} /> : null}
                <View style={styles.rewardContent}>
                  <View style={styles.rewardTopRow}>
                    <Text style={styles.rewardCategory}>{reward.category.toUpperCase()}</Text>
                    {reward.activeFlashSaleId ? (
                      <Text style={styles.flashPill}>{soldOut ? "Sold out" : formatCountdown(reward.flashSaleEndsAt)}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.rewardName}>{reward.name}</Text>
                  <Text style={styles.rewardDescription}>{reward.description}</Text>
                  <View style={styles.rewardFooter}>
                    <Text style={styles.rewardPoints}>{reward.pointsCost} pts</Text>
                    <Text style={[styles.affordLabel, canAfford ? styles.affordYes : styles.affordNo]}>
                      {canAfford ? "Can redeem" : "Insufficient points"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
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
    paddingBottom: 120,
    gap: 16,
  },
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 20,
    gap: 10,
  },
  eyebrow: {
    color: "#8b5b00",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: "#10213a",
    fontSize: 32,
    fontWeight: "900",
  },
  heroSubtitle: {
    color: "#65748a",
    fontSize: 14,
    lineHeight: 21,
  },
  pointsPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#fff3cf",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pointsPillText: {
    color: "#8c6200",
    fontSize: 12,
    fontWeight: "800",
  },
  searchInput: {
    borderRadius: 18,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#10213a",
    fontSize: 15,
  },
  filtersRow: {
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#e6eaef",
  },
  filterChipActive: {
    backgroundColor: "#10213a",
  },
  filterText: {
    color: "#425168",
    fontSize: 13,
    fontWeight: "700",
  },
  filterTextActive: {
    color: "#ffffff",
  },
  grid: {
    gap: 14,
  },
  rewardCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    overflow: "hidden",
  },
  rewardImage: {
    width: "100%",
    height: 180,
    backgroundColor: "#ddd",
  },
  rewardContent: {
    padding: 16,
    gap: 10,
  },
  rewardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rewardCategory: {
    color: "#65748a",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  flashPill: {
    color: "#ffffff",
    backgroundColor: "#d9480f",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "800",
  },
  rewardName: {
    color: "#10213a",
    fontSize: 20,
    fontWeight: "800",
  },
  rewardDescription: {
    color: "#65748a",
    fontSize: 14,
    lineHeight: 20,
  },
  rewardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rewardPoints: {
    color: "#10213a",
    fontSize: 18,
    fontWeight: "800",
  },
  affordLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  affordYes: {
    color: "#157347",
  },
  affordNo: {
    color: "#b45309",
  },
});
