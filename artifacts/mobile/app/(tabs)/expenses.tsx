import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AddProjectExpenseBodyCategory,
  customFetch,
  useAddProjectExpense,
  useListProjects,
} from "@workspace/api-client-react";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Button,
  Card,
  EmptyState,
  ScreenHeader,
  SelectModal,
  TextField,
  type SelectOption,
} from "@/components/ui";
import { getCurrentToken } from "@/contexts/auth";
import { useColors } from "@/hooks/useColors";
import { formatIDR, formatShortDate, todayYMD } from "@/lib/format";

const MY_EXPENSES_KEY = ["my-expenses", "mobile"] as const;

type ExpenseStatus = "PENDING" | "APPROVED" | "REJECTED";

type MyExpense = {
  id: string;
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  category: string;
  description: string;
  amount: number;
  spentAt: string;
  status: ExpenseStatus;
  rejectionReason: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  hasReceipt: boolean;
};

const CATEGORY_LABELS: Record<AddProjectExpenseBodyCategory, string> = {
  SOFTWARE: "Software",
  HARDWARE: "Hardware",
  LICENSE: "License",
  TRAVEL: "Travel",
  OTHER: "Other",
};

const CATEGORY_OPTIONS: SelectOption[] = (
  Object.keys(CATEGORY_LABELS) as AddProjectExpenseBodyCategory[]
).map((value) => ({ value, label: CATEGORY_LABELS[value] }));

// The shared StatusBadge only knows timesheet statuses, so expenses get a
// small local badge mapping PENDING/APPROVED/REJECTED to status tokens.
function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  const colors = useColors();
  const color =
    status === "APPROVED"
      ? colors.success
      : status === "REJECTED"
        ? colors.destructive
        : colors.warning;
  return (
    <View style={[styles.badge, { backgroundColor: `${color}22` }]}>
      <Text style={[styles.badgeText, { color }]}>{status}</Text>
    </View>
  );
}

// The shared customFetch can't return a binary blob in the React Native
// runtime, so the receipt PDF is fetched directly with the bearer token, then
// written to the cache and handed to the OS share sheet. On web there's no
// share sheet, so we open the PDF in a new browser tab instead.
async function openReceipt(expenseId: string): Promise<void> {
  const base = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  const url = `${base}/api/expenses/${expenseId}/receipt`;
  const token = getCurrentToken();
  // This bypasses customFetch (no RN blob support), so the bearer token and the
  // mobile client header that customFetch normally injects must be set by hand —
  // the front-door site gate rejects /api/* without "x-secureprofit-client".
  const headers: Record<string, string> = { "x-secureprofit-client": "mobile" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const message =
      res.status === 409
        ? "Receipt isn't ready until the claim is approved or rejected."
        : res.status === 403
          ? "You can only view receipts for your own expenses."
          : "Couldn't load the receipt. Please try again.";
    throw new Error(message);
  }

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (Platform.OS === "web") {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank");
    // Give the new tab time to read the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return;
  }

  const file = new File(Paths.cache, `expense-receipt-${expenseId}.pdf`);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: "Expense receipt",
  });
}

export default function ExpensesScreen() {
  const colors = useColors();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);

  const q = useQuery<MyExpense[]>({
    queryKey: MY_EXPENSES_KEY,
    queryFn: () => customFetch<MyExpense[]>("/api/expenses/mine?limit=500"),
  });
  const rows = q.data ?? [];

  async function handleViewReceipt(id: string) {
    if (receiptLoadingId) return;
    setReceiptLoadingId(id);
    try {
      await openReceipt(id);
    } catch (e) {
      Alert.alert(
        "Receipt unavailable",
        e instanceof Error ? e.message : "Couldn't load the receipt.",
      );
    } finally {
      setReceiptLoadingId(null);
    }
  }

  const kpi = useMemo(() => {
    const acc = { total: 0, approved: 0, pending: 0, rejected: 0 };
    for (const e of rows) {
      acc.total += e.amount;
      if (e.status === "APPROVED") acc.approved += e.amount;
      else if (e.status === "PENDING") acc.pending += e.amount;
      else if (e.status === "REJECTED") acc.rejected += e.amount;
    }
    return acc;
  }, [rows]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="My Expenses" subtitle="Claims you've filed" />
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
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
          <View style={{ gap: 12, marginBottom: 4 }}>
            <Button
              label="Submit Expense"
              icon="plus"
              onPress={() => setSubmitOpen(true)}
            />
            <View style={styles.kpiRow}>
              <KpiCard label="Total" value={formatIDR(kpi.total)} color={colors.foreground} />
              <KpiCard label="Approved" value={formatIDR(kpi.approved)} color={colors.success} />
            </View>
            <View style={styles.kpiRow}>
              <KpiCard label="Pending" value={formatIDR(kpi.pending)} color={colors.warning} />
              <KpiCard label="Rejected" value={formatIDR(kpi.rejected)} color={colors.destructive} />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={{ gap: 8 }}>
            <View style={styles.rowTop}>
              <Text
                style={[styles.project, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {item.projectName ?? item.projectCode ?? "Project"}
              </Text>
              <ExpenseStatusBadge status={item.status} />
            </View>
            <View style={styles.rowMeta}>
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                {CATEGORY_LABELS[item.category as AddProjectExpenseBodyCategory] ??
                  item.category}{" "}
                · {formatShortDate(item.spentAt)}
              </Text>
              <Text style={[styles.amount, { color: colors.foreground }]}>
                {formatIDR(item.amount)}
              </Text>
            </View>
            {item.description ? (
              <Text
                style={[styles.meta, { color: colors.mutedForeground }]}
                numberOfLines={2}
              >
                {item.description}
              </Text>
            ) : null}
            {item.status === "REJECTED" && item.rejectionReason ? (
              <Text style={[styles.reject, { color: colors.destructive }]}>
                Rejected: {item.rejectionReason}
              </Text>
            ) : null}
            {item.status === "APPROVED" && item.approvedByName ? (
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                Approved by {item.approvedByName}
              </Text>
            ) : null}
            {item.hasReceipt ? (
              <Pressable
                onPress={() => void handleViewReceipt(item.id)}
                disabled={receiptLoadingId !== null}
                style={({ pressed }) => [
                  styles.receiptBtn,
                  { borderColor: colors.border },
                  pressed && { opacity: 0.6 },
                  receiptLoadingId !== null && receiptLoadingId !== item.id
                    ? { opacity: 0.4 }
                    : null,
                ]}
                hitSlop={8}
                testID={`button-view-receipt-${item.id}`}
              >
                {receiptLoadingId === item.id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Feather name="file-text" size={16} color={colors.primary} />
                )}
                <Text style={[styles.receiptBtnText, { color: colors.primary }]}>
                  {receiptLoadingId === item.id ? "Opening…" : "View receipt"}
                </Text>
              </Pressable>
            ) : null}
          </Card>
        )}
        ListEmptyComponent={
          q.isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <EmptyState
              icon="credit-card"
              title="No expenses yet"
              message="Tap Submit Expense to file your first claim."
            />
          )
        }
      />

      <SubmitExpenseModal
        visible={submitOpen}
        onClose={() => setSubmitOpen(false)}
      />
    </View>
  );
}

function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const colors = useColors();
  return (
    <Card style={{ flex: 1, gap: 4 }}>
      <Text style={[styles.kpiValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </Card>
  );
}

function SubmitExpenseModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [projectId, setProjectId] = useState<string | null>(null);
  const [category, setCategory] = useState<AddProjectExpenseBodyCategory>("SOFTWARE");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(todayYMD());
  const [error, setError] = useState<string | null>(null);

  // Role-scoped on the server: only the projects this user is involved in.
  const projectsQuery = useListProjects(undefined, {
    query: { enabled: visible, queryKey: ["projects", "mobile-expense-submit"] },
  });
  const projectOptions: SelectOption[] = (projectsQuery.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.code} — ${p.name}`,
  }));

  const reset = () => {
    setProjectId(null);
    setCategory("SOFTWARE");
    setDescription("");
    setAmount("");
    setSpentAt(todayYMD());
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const addMutation = useAddProjectExpense({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: MY_EXPENSES_KEY });
        close();
      },
      onError: (e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to submit expense."),
    },
  });

  function handleSubmit() {
    setError(null);
    if (!projectId) {
      setError("Please select a project.");
      return;
    }
    if (!description.trim()) {
      setError("Please enter a description.");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (spentAt && Number.isNaN(new Date(spentAt).getTime())) {
      setError("Enter a valid date (YYYY-MM-DD).");
      return;
    }
    addMutation.mutate({
      id: projectId,
      data: {
        category,
        description: description.trim(),
        amount: amt,
        spentAt: spentAt || undefined,
      },
    });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      presentationStyle="pageSheet"
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={[
            styles.modalHeader,
            {
              // iOS pageSheet floats below the status bar, so it doesn't need
              // the safe-area inset; Android renders full-screen and does.
              paddingTop: Platform.OS === "ios" ? 16 : insets.top + 12,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            Submit Expense
          </Text>
          <Pressable onPress={close} hitSlop={12}>
            <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>
              Cancel
            </Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
          >
            <SelectModal
              label="Project"
              placeholder={
                projectsQuery.isLoading
                  ? "Loading projects…"
                  : projectOptions.length === 0
                    ? "No projects available"
                    : "Select project"
              }
              value={projectId}
              options={projectOptions}
              onChange={setProjectId}
              testID="select-expense-project"
            />
            <SelectModal
              label="Category"
              value={category}
              options={CATEGORY_OPTIONS}
              onChange={(v) =>
                setCategory((v as AddProjectExpenseBodyCategory) ?? "SOFTWARE")
              }
              testID="select-expense-category"
            />
            <TextField
              label="Amount (IDR)"
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="numeric"
              testID="input-expense-amount"
            />
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Travel to client site, taxi fare"
              autoCapitalize="sentences"
              multiline
              testID="input-expense-description"
            />
            <TextField
              label="Date"
              value={spentAt}
              onChangeText={setSpentAt}
              placeholder="YYYY-MM-DD"
              testID="input-expense-date"
            />

            {error ? (
              <Text style={[styles.error, { color: colors.destructive }]}>
                {error}
              </Text>
            ) : null}

            <Button
              label="Submit Expense"
              onPress={handleSubmit}
              loading={addMutation.isPending}
              testID="button-confirm-expense"
            />
            <Text style={[styles.note, { color: colors.mutedForeground }]}>
              Submitted expenses are sent to the project manager for approval.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 120 },
  kpiRow: { flexDirection: "row", gap: 12 },
  kpiValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  kpiLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  project: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  rowMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  meta: { fontSize: 14, fontFamily: "Inter_400Regular", flexShrink: 1 },
  amount: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  reject: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  receiptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 2,
  },
  receiptBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  loading: { paddingVertical: 48, alignItems: "center" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modalCancel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  modalBody: { padding: 20, gap: 16, paddingBottom: 48 },
  error: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 19 },
  note: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});
