import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { TransactionItem } from "../../lib/types";
import { useMemberPortal } from "../../lib/store";

const PAGE_SIZE = 8;
const typeFilters = ["all", "earned", "redeemed", "pending", "gifted", "expired"] as const;
const dateFilters = ["all", "7d", "30d", "90d"] as const;

type TypeFilter = (typeof typeFilters)[number];
type DateFilter = (typeof dateFilters)[number];

function formatTransactionDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSignedPoints(transaction: TransactionItem) {
  if (transaction.type === "redeemed" || transaction.type === "gifted" || transaction.type === "expired") {
    return `-${Math.abs(transaction.points)}`;
  }

  return `+${Math.abs(transaction.points)}`;
}

function getDateCutoff(filter: DateFilter) {
  if (filter === "all") return null;

  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export default function TransactionsScreen() {
  const { member, refreshing, refresh } = useMemberPortal();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filteredTransactions = useMemo(() => {
    const cutoff = getDateCutoff(dateFilter);

    return member.transactions.filter((transaction) => {
      const matchesType = typeFilter === "all" ? true : transaction.type === typeFilter;
      const matchesDate = cutoff === null ? true : new Date(transaction.date).getTime() >= cutoff;
      return matchesType && matchesDate;
    });
  }, [dateFilter, member.transactions, typeFilter]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [dateFilter, typeFilter]);

  const visibleTransactions = useMemo(
    () => filteredTransactions.slice(0, visibleCount),
    [filteredTransactions, visibleCount]
  );

  const hasMore = visibleCount < filteredTransactions.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={visibleTransactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasMore) {
            setVisibleCount((current) => current + PAGE_SIZE);
          }
        }}
        onEndReachedThreshold={0.35}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.heroCard}>
              <Text style={styles.eyebrow}>Transaction History</Text>
              <Text style={styles.title}>Points Activity</Text>
              <Text style={styles.subtitle}>
                Browse the full earning and redemption log with mobile-friendly filtering and incremental loading.
              </Text>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Type</Text>
              <FlatList
                horizontal
                data={typeFilters}
                keyExtractor={(item) => item}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setTypeFilter(item)}
                    style={[styles.chip, typeFilter === item && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, typeFilter === item && styles.chipTextActive]}>
                      {item === "all" ? "All" : item.charAt(0).toUpperCase() + item.slice(1)}
                    </Text>
                  </Pressable>
                )}
              />
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Date</Text>
              <FlatList
                horizontal
                data={dateFilters}
                keyExtractor={(item) => item}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setDateFilter(item)}
                    style={[styles.chip, dateFilter === item && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, dateFilter === item && styles.chipTextActive]}>
                      {item === "all" ? "All time" : `Last ${item}`}
                    </Text>
                  </Pressable>
                )}
              />
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Showing</Text>
                <Text style={styles.summaryValue}>{visibleTransactions.length}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Results</Text>
                <Text style={styles.summaryValue}>{filteredTransactions.length}</Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.transactionCard}>
            <View style={styles.transactionMain}>
              <Text
                style={[
                  styles.transactionType,
                  item.type === "redeemed" || item.type === "gifted" || item.type === "expired"
                    ? styles.typeNegative
                    : styles.typePositive,
                ]}
              >
                {item.type.toUpperCase()}
              </Text>
              <Text style={styles.transactionTitle}>{item.description}</Text>
              <Text style={styles.transactionMeta}>
                {formatTransactionDate(item.date)}
                {item.category ? ` | ${item.category}` : ""}
              </Text>
            </View>
            <View style={styles.transactionAside}>
              <Text
                style={[
                  styles.transactionPoints,
                  item.type === "redeemed" || item.type === "gifted" || item.type === "expired"
                    ? styles.pointsNegative
                    : styles.pointsPositive,
                ]}
              >
                {formatSignedPoints(item)}
              </Text>
              <Text style={styles.balanceText}>{item.balance} pts</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No matching transactions</Text>
            <Text style={styles.emptyBody}>Adjust the current filters to see more activity.</Text>
          </View>
        }
        ListFooterComponent={
          filteredTransactions.length > 0 ? (
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {hasMore
                  ? `Scroll for more transactions (${filteredTransactions.length - visibleCount} remaining)`
                  : "You've reached the end of the transaction history."}
              </Text>
            </View>
          ) : null
        }
      />
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
    gap: 14,
  },
  header: {
    gap: 16,
  },
  heroCard: {
    backgroundColor: "#10213a",
    borderRadius: 28,
    padding: 20,
    gap: 10,
  },
  eyebrow: {
    color: "#8fd9dc",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  title: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "900",
  },
  subtitle: {
    color: "#d8e2ee",
    fontSize: 14,
    lineHeight: 21,
  },
  filterSection: {
    gap: 8,
  },
  filterLabel: {
    color: "#43526a",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  chipRow: {
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: "#10213a",
  },
  chipText: {
    color: "#425168",
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#ffffff",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
  },
  summaryLabel: {
    color: "#6d7888",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  summaryValue: {
    color: "#10213a",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 6,
  },
  transactionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transactionMain: {
    flex: 1,
    paddingRight: 12,
  },
  transactionType: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "800",
  },
  typePositive: {
    backgroundColor: "#e7f8ef",
    color: "#157347",
  },
  typeNegative: {
    backgroundColor: "#fff1e7",
    color: "#b45309",
  },
  transactionTitle: {
    color: "#10213a",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 10,
  },
  transactionMeta: {
    color: "#728093",
    fontSize: 12,
    marginTop: 5,
  },
  transactionAside: {
    alignItems: "flex-end",
    gap: 4,
  },
  transactionPoints: {
    fontSize: 18,
    fontWeight: "900",
  },
  pointsPositive: {
    color: "#0f8a4b",
  },
  pointsNegative: {
    color: "#d46b08",
  },
  balanceText: {
    color: "#7d8897",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
  },
  emptyTitle: {
    color: "#10213a",
    fontSize: 17,
    fontWeight: "800",
  },
  emptyBody: {
    color: "#6d7888",
    fontSize: 13,
    marginTop: 6,
  },
  footer: {
    paddingVertical: 8,
  },
  footerText: {
    color: "#6d7888",
    fontSize: 12,
    textAlign: "center",
  },
});
