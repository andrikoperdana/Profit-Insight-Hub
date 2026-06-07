import { useListTimesheets } from "@workspace/api-client-react";
import React from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { Card, EmptyState, ScreenHeader, StatusBadge } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { formatHours, formatShortDate, isThisWeek } from "@/lib/format";

export default function TimesheetsScreen() {
  const colors = useColors();
  const q = useListTimesheets({ scope: "mine" });
  const rows = q.data ?? [];

  const weekHours = rows
    .filter((t) => isThisWeek(t.workDate) && t.status !== "REJECTED")
    .reduce((sum, t) => sum + t.hours, 0);
  const pendingCount = rows.filter((t) => t.status === "SUBMITTED").length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="My Timesheets" subtitle="Hours you've logged" />
      <FlatList
        data={rows}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={q.isFetching}
            onRefresh={() => void q.refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.summary}>
            <Card style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {formatHours(weekHours)}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
                This week
              </Text>
            </Card>
            <Card style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.summaryValue, { color: colors.warning }]}>
                {pendingCount}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
                Awaiting approval
              </Text>
            </Card>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={{ gap: 8 }}>
            <View style={styles.rowTop}>
              <Text
                style={[styles.project, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {item.projectName ?? "Project"}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            <View style={styles.rowMeta}>
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                {formatShortDate(item.workDate)}
              </Text>
              <Text style={[styles.hours, { color: colors.foreground }]}>
                {formatHours(item.hours)}
              </Text>
            </View>
            {item.taskTitle ? (
              <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {item.taskTitle}
              </Text>
            ) : null}
            {item.status === "REJECTED" && item.rejectionReason ? (
              <Text style={[styles.reject, { color: colors.destructive }]}>
                Rejected: {item.rejectionReason}
              </Text>
            ) : null}
          </Card>
        )}
        ListEmptyComponent={
          q.isLoading ? null : (
            <EmptyState
              icon="clock"
              title="No timesheets yet"
              message="Log your first hours from the Track tab."
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 120 },
  summary: { flexDirection: "row", gap: 12, marginBottom: 4 },
  summaryValue: { fontSize: 26, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  project: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  rowMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  meta: { fontSize: 14, fontFamily: "Inter_400Regular" },
  hours: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  reject: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
});
