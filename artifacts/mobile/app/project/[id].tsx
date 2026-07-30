import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useUpdateProject,
  getGetProjectQueryOptions,
  getListProjectsQueryOptions,
} from "@workspace/api-client-react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, TextField } from "@/components/ui";
import { useAuth } from "@/contexts/auth";
import { useColors } from "@/hooks/useColors";
import { formatShortDate } from "@/lib/format";
import { canEditProjectCode } from "@/lib/roles";

function InfoRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[styles.infoValue, { color: colors.foreground }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const q = useGetProject(String(id));
  const project = q.data;

  const canEdit = canEditProjectCode(user?.role);
  const [codeDraft, setCodeDraft] = useState("");
  useEffect(() => {
    setCodeDraft(project?.code ?? "");
  }, [project?.code]);

  const update = useUpdateProject({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getGetProjectQueryOptions(String(id)).queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: getListProjectsQueryOptions().queryKey.slice(0, 1),
          }),
        ]);
        Alert.alert("Saved", "SPK / PO Number updated.");
      },
      onError: (err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Could not save the SPK / PO Number.";
        Alert.alert("Save failed", message);
      },
    },
  });

  const dirty = (project?.code ?? "") !== codeDraft.trim();

  const save = () => {
    const trimmed = codeDraft.trim();
    update.mutate({
      id: String(id),
      data: { code: trimmed === "" ? null : trimmed },
    });
  };

  const topPad = (Platform.OS === "web" ? 67 : insets.top) + 8;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          testID="project-back"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {project?.name ?? "Project"}
        </Text>
      </View>

      {q.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !project ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>
            Project not found or you don't have access.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Card style={{ gap: 14 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Identifiers
            </Text>
            <View style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Project ID
              </Text>
              <View
                style={[
                  styles.readonlyBox,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.input,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <Text
                  testID="project-id-value"
                  style={{
                    color: project.projectId
                      ? colors.foreground
                      : colors.mutedForeground,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 16,
                  }}
                >
                  {project.projectId ?? "Not assigned"}
                </Text>
                <Feather name="lock" size={14} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Auto-assigned, read-only.
              </Text>
            </View>

            {canEdit ? (
              <>
                <TextField
                  label="SPK / PO Number"
                  value={codeDraft}
                  onChangeText={setCodeDraft}
                  placeholder="Optional, e.g. SPK/2026/041"
                  autoCapitalize="characters"
                  testID="project-code-input"
                />
                <Button
                  label={update.isPending ? "Saving…" : "Save SPK / PO"}
                  onPress={save}
                  loading={update.isPending}
                  disabled={!dirty}
                  testID="project-code-save"
                />
              </>
            ) : (
              <InfoRow label="SPK / PO Number" value={project.code ?? "—"} />
            )}
          </Card>

          <Card style={{ gap: 12 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Details
            </Text>
            <InfoRow label="Status" value={project.status.replace(/_/g, " ")} />
            {project.clientName ? (
              <InfoRow label="Client" value={project.clientName} />
            ) : null}
            {project.pmName ? (
              <InfoRow label="Project Manager" value={project.pmName} />
            ) : null}
            {project.startDate ? (
              <InfoRow label="Start" value={formatShortDate(project.startDate)} />
            ) : null}
            {project.endDate ? (
              <InfoRow label="End" value={formatShortDate(project.endDate)} />
            ) : null}
            {project.description ? (
              <View style={{ gap: 4 }}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                  Description
                </Text>
                <Text style={[styles.description, { color: colors.foreground }]}>
                  {project.description}
                </Text>
              </View>
            ) : null}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { padding: 16, gap: 16, paddingBottom: 60 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  readonlyBox: {
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  infoLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  infoValue: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flexShrink: 1,
    textAlign: "right",
  },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
