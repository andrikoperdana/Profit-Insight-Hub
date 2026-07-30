import { useListProjects, type Project } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Card, EmptyState, ScreenHeader } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

function statusColor(status: string, colors: ReturnType<typeof useColors>) {
  switch (status) {
    case "ACTIVE":
      return colors.success ?? colors.primary;
    case "DRAFT":
      return colors.mutedForeground;
    case "ON_HOLD":
      return colors.warning;
    case "CANCELLED":
      return colors.destructive;
    default:
      return colors.mutedForeground;
  }
}

const STATUS_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "DRAFT", label: "Draft" },
  { key: "COMPLETE", label: "Completed" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

function recencyMs(p: Project): number {
  const d = p.startDate ?? p.createdAt;
  const t = d ? Date.parse(d) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export default function ProjectsScreen() {
  const colors = useColors();
  const router = useRouter();
  const q = useListProjects();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const rows = useMemo(() => {
    let all = (q.data ?? []).slice();
    // Active first, then newest (start date, falling back to created date).
    all.sort((a: Project, b: Project) => {
      const aActive = a.status === "ACTIVE" ? 0 : 1;
      const bActive = b.status === "ACTIVE" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return recencyMs(b) - recencyMs(a);
    });
    if (statusFilter !== "ALL") {
      all = all.filter((p: Project) => p.status === statusFilter);
    }
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((p: Project) => {
      return (
        p.name.toLowerCase().includes(term) ||
        (p.projectId ?? "").toLowerCase().includes(term) ||
        (p.code ?? "").toLowerCase().includes(term) ||
        (p.clientName ?? "").toLowerCase().includes(term)
      );
    });
  }, [q.data, search, statusFilter]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Projects" subtitle="Browse your projects" />
      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, Project ID or SPK/PO…"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          testID="project-search"
          style={[
            styles.searchInput,
            {
              color: colors.foreground,
              backgroundColor: colors.card,
              borderColor: colors.input,
              borderRadius: colors.radius,
            },
          ]}
        />
      </View>
      <View style={styles.chipRow}>
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setStatusFilter(f.key)}
              testID={`project-filter-${f.key.toLowerCase()}`}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.input,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: active
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                  },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={q.isFetching}
            onRefresh={() => void q.refetch()}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => {
          const sColor = statusColor(item.status, colors);
          return (
            <Pressable
              onPress={() => router.push(`/project/${item.id}`)}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              testID={`project-row-${item.id}`}
            >
              <Card style={{ gap: 6 }}>
                <View style={styles.rowTop}>
                  <Text
                    style={[styles.name, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: `${sColor}22` }]}>
                    <Text style={[styles.badgeText, { color: sColor }]}>
                      {item.status.replace(/_/g, " ")}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.projectId, { color: colors.primary }]}>
                  {item.projectId ?? "No Project ID"}
                </Text>
                <View style={styles.rowMeta}>
                  {item.clientName ? (
                    <Text
                      style={[styles.meta, { color: colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {item.clientName}
                    </Text>
                  ) : null}
                  {item.code ? (
                    <Text
                      style={[styles.meta, { color: colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      SPK/PO: {item.code}
                    </Text>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          q.isLoading ? null : (
            <EmptyState
              icon="briefcase"
              title={
                search || statusFilter !== "ALL"
                  ? "No matching projects"
                  : "No projects"
              }
              message={
                search
                  ? "Try a different name, Project ID or SPK/PO."
                  : statusFilter !== "ALL"
                    ? "No projects with this status. Try another filter."
                    : "Projects you can access will appear here."
              }
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  searchInput: {
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  content: { padding: 16, gap: 12, paddingBottom: 120 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  projectId: { fontSize: 13, fontFamily: "Inter_500Medium" },
  rowMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  meta: { fontSize: 13, fontFamily: "Inter_400Regular", flexShrink: 1 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
});
