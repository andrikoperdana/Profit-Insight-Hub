import {
  useListNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Card, EmptyState, ScreenHeader } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { formatRelative } from "@/lib/format";

export default function NotificationsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const q = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const rows = q.data ?? [];
  const unread = rows.filter((n) => !n.readAt).length;

  const onTap = (id: string, alreadyRead: boolean) => {
    if (alreadyRead) return;
    markRead.mutate(
      { id },
      { onSuccess: () => void queryClient.invalidateQueries() },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Alerts"
        subtitle={unread > 0 ? `${unread} unread` : "You're up to date"}
        right={
          unread > 0 ? (
            <Pressable
              onPress={() =>
                markAll.mutate(undefined, {
                  onSuccess: () => void queryClient.invalidateQueries(),
                })
              }
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 6 })}
            >
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                Mark all
              </Text>
            </Pressable>
          ) : null
        }
      />
      <FlatList
        data={rows}
        keyExtractor={(n) => n.id}
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
          const isRead = !!item.readAt;
          return (
            <Pressable onPress={() => onTap(item.id, isRead)}>
              <Card style={{ gap: 6, opacity: isRead ? 0.6 : 1 }}>
                <View style={styles.rowTop}>
                  {!isRead ? (
                    <View
                      style={[styles.dot, { backgroundColor: colors.primary }]}
                    />
                  ) : null}
                  <Text
                    style={[styles.title, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={[styles.time, { color: colors.mutedForeground }]}>
                    {formatRelative(item.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.message, { color: colors.mutedForeground }]}>
                  {item.message}
                </Text>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          q.isLoading ? null : (
            <EmptyState
              icon="bell"
              title="No notifications"
              message="Updates about your timesheets will show up here."
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 120 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  message: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 19 },
});
