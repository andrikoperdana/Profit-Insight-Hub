import {
  getListTimesheetsQueryKey,
  useApproveTimesheet,
  useListTimesheets,
  useRejectTimesheet,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button, Card, EmptyState, ScreenHeader, TextField } from "@/components/ui";
import { useAuth } from "@/contexts/auth";
import { useColors } from "@/hooks/useColors";
import { canApproveTimesheets } from "@/lib/roles";
import { formatHours, formatShortDate } from "@/lib/format";

export default function ApprovalsScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const allowed = canApproveTimesheets(user?.role);
  const q = useListTimesheets(
    { scope: "approval", status: "SUBMITTED" },
    {
      query: {
        enabled: allowed,
        queryKey: getListTimesheetsQueryKey({
          scope: "approval",
          status: "SUBMITTED",
        }),
      },
    },
  );
  const approve = useApproveTimesheet();
  const reject = useRejectTimesheet();

  const rows = q.data ?? [];
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const buzz = () => {
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const onApprove = (id: string) => {
    approve.mutate(
      { id },
      {
        onSuccess: () => {
          buzz();
          void queryClient.invalidateQueries();
        },
      },
    );
  };

  const submitReject = () => {
    if (!rejectId) return;
    const r = reason.trim();
    if (!r) return;
    reject.mutate(
      { id: rejectId, data: { reason: r } },
      {
        onSuccess: () => {
          buzz();
          setRejectId(null);
          setReason("");
          void queryClient.invalidateQueries();
        },
      },
    );
  };

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Approvals" subtitle="Not available" />
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState
            icon="lock"
            title="Approvals are for Project Managers"
            message="Only Project Managers review timesheets. Check the Alerts tab for your notifications."
          />
          <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
            <Button
              label="Go to Alerts"
              icon="bell"
              variant="ghost"
              onPress={() => router.replace("/notifications")}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Approvals"
        subtitle={`${rows.length} awaiting your review`}
      />
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
        renderItem={({ item }) => {
          const busy =
            (approve.isPending && approve.variables?.id === item.id) ||
            (reject.isPending && reject.variables?.id === item.id);
          return (
            <Card style={{ gap: 12 }}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.name, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {item.userName ?? "Team member"}
                  </Text>
                  <Pressable
                    onPress={() => router.push(`/project/${item.projectId}`)}
                    hitSlop={8}
                    testID={`link-approval-project-${item.id}`}
                  >
                    <Text
                      style={[styles.project, { color: colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {item.projectName ?? "Project"}
                    </Text>
                  </Pressable>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.hours, { color: colors.primary }]}>
                    {formatHours(item.hours)}
                  </Text>
                  <Text style={[styles.date, { color: colors.mutedForeground }]}>
                    {formatShortDate(item.workDate)}
                  </Text>
                </View>
              </View>
              {item.taskTitle ? (
                <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.taskTitle}
                </Text>
              ) : null}
              {item.description ? (
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  {item.description}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Reject"
                    variant="ghost"
                    icon="x"
                    onPress={() => {
                      setRejectId(item.id);
                      setReason("");
                    }}
                    disabled={busy}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Approve"
                    icon="check"
                    onPress={() => onApprove(item.id)}
                    loading={busy}
                  />
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          q.isLoading ? null : (
            <EmptyState
              icon="check-circle"
              title="All caught up"
              message="No timesheets are waiting for your approval."
            />
          )
        }
      />

      {/* Reject reason modal */}
      <Modal
        visible={!!rejectId}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectId(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setRejectId(null)}>
          <Pressable
            style={[
              styles.modal,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Reject timesheet
            </Text>
            <TextField
              label="Reason"
              value={reason}
              onChangeText={setReason}
              placeholder="Why is this being rejected?"
              autoCapitalize="sentences"
              multiline
            />
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={() => setRejectId(null)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Confirm Reject"
                  variant="destructive"
                  onPress={submitReject}
                  loading={reject.isPending}
                  disabled={!reason.trim()}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 120 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  project: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  hours: { fontSize: 18, fontFamily: "Inter_700Bold" },
  date: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  meta: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 19 },
  actions: { flexDirection: "row", gap: 10 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  modal: { borderWidth: 1, padding: 20, gap: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
});
