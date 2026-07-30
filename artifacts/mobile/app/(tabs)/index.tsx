import { Feather } from "@expo/vector-icons";
import {
  useCreateTimesheet,
  useListMyTasks,
  useListProjects,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  Button,
  Card,
  EmptyState,
  ScreenHeader,
  SelectModal,
  TextField,
  type SelectOption,
} from "@/components/ui";
import { useAuth } from "@/contexts/auth";
import { useColors } from "@/hooks/useColors";
import { canLogHours, roleLabel } from "@/lib/roles";
import { formatTimer, lastNDays, todayYMD } from "@/lib/format";

const TIMER_KEY_PREFIX = "active_timer:";

type ActiveTimer = {
  projectId: string;
  taskId: string | null;
  startedAt: number;
};

export default function TrackScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const role = user?.role;
  // Delivery roles must clock hours against an assigned task (server enforces
  // with code TASK_REQUIRED); mirror it client-side for a clear UX.
  const taskRequired = ["KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT"].includes(role ?? "");
  const allowed = canLogHours(role);
  // Namespace the timer per user so a running timer can never bleed across
  // accounts on a shared phone (phone-only timer, no server session).
  const timerKey = user?.id ? `${TIMER_KEY_PREFIX}${user.id}` : null;

  const [mode, setMode] = useState<"timer" | "manual">("timer");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [manualDate, setManualDate] = useState(todayYMD());
  const [manualHours, setManualHours] = useState("");

  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const projectsQ = useListProjects({ status: "ACTIVE" });
  const tasksQ = useListMyTasks();
  const createTs = useCreateTimesheet();

  const projectOptions: SelectOption[] = (projectsQ.data ?? []).map((p) => ({
    label: `${p.projectId ?? p.code ?? "No ID"} — ${p.name}`,
    value: p.id,
  }));
  const taskOptions: SelectOption[] = (tasksQ.data ?? [])
    .filter((t) => t.projectId === projectId && t.status !== "DONE")
    .map((t) => ({ label: t.title, value: t.id }));

  // Restore this user's running timer when the screen mounts / user changes.
  useEffect(() => {
    if (!timerKey) return;
    (async () => {
      const raw = await AsyncStorage.getItem(timerKey);
      if (!raw) return;
      try {
        const saved = JSON.parse(raw) as ActiveTimer;
        setProjectId(saved.projectId);
        setTaskId(saved.taskId);
        setStartedAt(saved.startedAt);
        setRunning(true);
      } catch {
        await AsyncStorage.removeItem(timerKey);
      }
    })();
  }, [timerKey]);

  // Drive the live counter while running.
  useEffect(() => {
    if (running && startedAt) {
      const update = () =>
        setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      update();
      tick.current = setInterval(update, 1000);
      return () => {
        if (tick.current) clearInterval(tick.current);
      };
    }
    setElapsed(0);
    return undefined;
  }, [running, startedAt]);

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="SecureProfit" subtitle={roleLabel(role)} />
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState
            icon="bell"
            title="No time logging for your role"
            message="Time tracking is for delivery roles. Check the Alerts tab for your notifications."
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

  const startTimer = async () => {
    if (!projectId) {
      Alert.alert("Pick a project", "Choose a project before clocking in.");
      return;
    }
    if (taskRequired && !taskId) {
      Alert.alert("Pick a task", "Your role must clock hours against an assigned task.");
      return;
    }
    if (!timerKey) return;
    const now = Date.now();
    const payload: ActiveTimer = { projectId, taskId, startedAt: now };
    await AsyncStorage.setItem(timerKey, JSON.stringify(payload));
    setStartedAt(now);
    setRunning(true);
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const cancelTimer = async () => {
    if (timerKey) await AsyncStorage.removeItem(timerKey);
    setRunning(false);
    setStartedAt(null);
    setElapsed(0);
  };

  const stopTimer = () => {
    if (!startedAt || !projectId) return;
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    const hours = Math.max(0.01, Math.round((seconds / 3600) * 100) / 100);
    const proj = projectOptions.find((p) => p.value === projectId);
    Alert.alert(
      "Log this session?",
      `${proj?.label ?? "Project"}\n${formatTimer(seconds)} = ${hours}h\n\nThis will be submitted for approval.`,
      [
        { text: "Keep running", style: "cancel" },
        {
          text: "Log & Submit",
          onPress: () => submitEntry(hours, todayYMD(), () => cancelTimer()),
        },
      ],
    );
  };

  const submitManual = () => {
    if (!projectId) {
      Alert.alert("Pick a project", "Choose a project first.");
      return;
    }
    if (taskRequired && !taskId) {
      Alert.alert("Pick a task", "Your role must clock hours against an assigned task.");
      return;
    }
    const hours = Number(manualHours.replace(",", "."));
    if (!isFinite(hours) || hours <= 0) {
      Alert.alert("Invalid hours", "Enter a number of hours greater than 0.");
      return;
    }
    submitEntry(hours, manualDate, () => {
      setManualHours("");
      setDescription("");
    });
  };

  const submitEntry = (hours: number, workDate: string, onDone: () => void) => {
    if (!projectId) return;
    createTs.mutate(
      {
        data: {
          projectId,
          taskId: taskId ?? undefined,
          workDate,
          hours,
          description: description.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          if (Platform.OS !== "web") {
            void Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
          }
          void queryClient.invalidateQueries();
          onDone();
          Alert.alert("Submitted", `${hours}h logged and sent for approval.`);
        },
        onError: (err) => {
          const msg =
            err instanceof Error ? err.message : "Could not save entry.";
          Alert.alert("Could not save", msg);
        },
      },
    );
  };

  const dayChips = lastNDays(7);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Track Time"
        subtitle={user?.name}
        right={
          <Pressable
            onPress={() => void signOut()}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 6 })}
          >
            <Feather name="log-out" size={20} color={colors.mutedForeground} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Mode switch */}
        <View
          style={[
            styles.segment,
            { backgroundColor: colors.secondary, borderRadius: colors.radius },
          ]}
        >
          {(["timer", "manual"] as const).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                disabled={running && m === "manual"}
                style={[
                  styles.segmentItem,
                  {
                    backgroundColor: active ? colors.primary : "transparent",
                    borderRadius: colors.radius - 3,
                    opacity: running && m === "manual" ? 0.4 : 1,
                  },
                ]}
              >
                <Feather
                  name={m === "timer" ? "clock" : "edit-3"}
                  size={16}
                  color={active ? colors.primaryForeground : colors.mutedForeground}
                />
                <Text
                  style={{
                    color: active
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 14,
                  }}
                >
                  {m === "timer" ? "Timer" : "Manual"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Project + task pickers */}
        <Card style={{ gap: 14 }}>
          <SelectModal
            label="Project"
            placeholder={
              projectsQ.isLoading ? "Loading projects…" : "Select a project"
            }
            value={projectId}
            options={projectOptions}
            onChange={(v) => {
              setProjectId(v);
              setTaskId(null);
            }}
            disabled={running}
            testID="project-select"
          />
          <SelectModal
            label={taskRequired ? "Task (required)" : "Task (optional)"}
            placeholder={
              !projectId
                ? "Pick a project first"
                : taskOptions.length === 0
                  ? "No tasks assigned"
                  : "Select a task"
            }
            value={taskId}
            options={taskOptions}
            onChange={setTaskId}
            disabled={running || !projectId || taskOptions.length === 0}
            testID="task-select"
          />
        </Card>

        {mode === "timer" ? (
          <Card style={{ alignItems: "center", gap: 18, paddingVertical: 28 }}>
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
                letterSpacing: 1,
              }}
            >
              {running ? "RECORDING" : "READY"}
            </Text>
            <Text
              style={{
                color: running ? colors.primary : colors.foreground,
                fontSize: 52,
                fontFamily: "Inter_700Bold",
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatTimer(elapsed)}
            </Text>
            {running ? (
              <View style={{ width: "100%", gap: 10 }}>
                <Button
                  label="Clock Out & Log"
                  icon="square"
                  variant="destructive"
                  onPress={stopTimer}
                  loading={createTs.isPending}
                  testID="clock-out"
                />
                <Button
                  label="Discard"
                  variant="ghost"
                  onPress={cancelTimer}
                />
              </View>
            ) : (
              <View style={{ width: "100%" }}>
                <Button
                  label="Clock In"
                  icon="play"
                  onPress={startTimer}
                  disabled={!projectId}
                  testID="clock-in"
                />
              </View>
            )}
          </Card>
        ) : (
          <Card style={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Date
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {dayChips.map((d) => {
                  const active = manualDate === d.ymd;
                  return (
                    <Pressable
                      key={d.ymd}
                      onPress={() => setManualDate(d.ymd)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: colors.radius,
                        backgroundColor: active
                          ? colors.primary
                          : colors.secondary,
                      }}
                    >
                      <Text
                        style={{
                          color: active
                            ? colors.primaryForeground
                            : colors.foreground,
                          fontFamily: "Inter_500Medium",
                          fontSize: 13,
                        }}
                      >
                        {d.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <TextField
              label="Hours"
              value={manualHours}
              onChangeText={setManualHours}
              placeholder="e.g. 8"
              keyboardType="decimal-pad"
              testID="manual-hours"
            />
            <TextField
              label="Notes (optional)"
              value={description}
              onChangeText={setDescription}
              placeholder="What did you work on?"
              autoCapitalize="sentences"
              multiline
            />
            <Button
              label="Log & Submit"
              icon="send"
              onPress={submitManual}
              loading={createTs.isPending}
              disabled={!projectId}
              testID="manual-submit"
            />
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 120 },
  segment: { flexDirection: "row", padding: 4 },
  segmentItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
