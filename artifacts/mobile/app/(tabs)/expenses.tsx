import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AddProjectExpenseBodyCategory,
  customFetch,
  getListExpensesQueryKey,
  useAddProjectExpense,
  useApproveProjectExpense,
  useListExpenses,
  useListProjects,
  useRejectProjectExpense,
} from "@workspace/api-client-react";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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

import { ReceiptButton } from "@/components/ReceiptButton";
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
import { formatIDR, formatShortDate, todayYMD } from "@/lib/format";
import { canDecideExpenses, canViewTeamExpenses, expensesAutoApproved } from "@/lib/roles";
import { shrinkImageIfNeeded } from "@/lib/shrinkImage";

const MY_EXPENSES_KEY = ["my-expenses", "mobile"] as const;

type ExpenseView = "mine" | "team";

// Mirror the server's evidence validation (routes/expenses.ts): accept a PDF or
// an image (png/jpeg/webp) up to ~8MB raw, sent as a base64 data URL.
const ALLOWED_EVIDENCE_MIME = /^(application\/pdf|image\/(png|jpe?g|webp))$/i;
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

type EvidenceFile = { url: string; name: string };

// Resolve a usable MIME type from the picker's reported type, falling back to
// the file extension so camera/document results without a mimeType still pass.
function resolveEvidenceMime(
  name: string | null | undefined,
  mimeType: string | null | undefined,
): string | null {
  if (mimeType && ALLOWED_EVIDENCE_MIME.test(mimeType)) return mimeType.toLowerCase();
  const ext = name?.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return null;
  }
}

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
  CASH_ADVANCE: "Cash Advance",
  PURCHASE_ORDER: "Purchase Order",
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

// A single expense row. Shows the submitter (team view only) and a "View
// receipt" action whenever the claim is APPROVED/REJECTED — the server only
// generates the receipt PDF once a claim is closed.
function ExpenseCard({
  projectLabel,
  projectId,
  submitterName,
  category,
  spentAt,
  amount,
  description,
  status,
  rejectionReason,
  approvedByName,
  hasReceipt,
  expenseId,
  onApprove,
  onReject,
  deciding,
}: {
  projectLabel: string;
  projectId?: string | null;
  submitterName?: string | null;
  category: string;
  spentAt: string;
  amount: number;
  description?: string | null;
  status: ExpenseStatus;
  rejectionReason?: string | null;
  approvedByName?: string | null;
  hasReceipt: boolean;
  expenseId: string;
  onApprove?: () => void;
  onReject?: () => void;
  deciding?: boolean;
}) {
  const colors = useColors();
  const router = useRouter();
  return (
    <Card style={{ gap: 8 }}>
      <View style={styles.rowTop}>
        <Pressable
          style={{ flex: 1 }}
          onPress={
            projectId ? () => router.push(`/project/${projectId}`) : undefined
          }
          disabled={!projectId}
          hitSlop={8}
          testID={`link-expense-project-${expenseId}`}
        >
          <Text
            style={[styles.project, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {projectLabel}
          </Text>
        </Pressable>
        <ExpenseStatusBadge status={status} />
      </View>
      {submitterName ? (
        <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {submitterName}
        </Text>
      ) : null}
      <View style={styles.rowMeta}>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {CATEGORY_LABELS[category as AddProjectExpenseBodyCategory] ?? category}{" "}
          · {formatShortDate(spentAt)}
        </Text>
        <Text style={[styles.amount, { color: colors.foreground }]}>
          {formatIDR(amount)}
        </Text>
      </View>
      {description ? (
        <Text
          style={[styles.meta, { color: colors.mutedForeground }]}
          numberOfLines={2}
        >
          {description}
        </Text>
      ) : null}
      {status === "REJECTED" && rejectionReason ? (
        <Text style={[styles.reject, { color: colors.destructive }]}>
          Rejected: {rejectionReason}
        </Text>
      ) : null}
      {status === "APPROVED" && approvedByName ? (
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          Approved by {approvedByName}
        </Text>
      ) : null}
      {hasReceipt ? <ReceiptButton expenseId={expenseId} /> : null}
      {status === "PENDING" && onApprove && onReject ? (
        <View style={styles.decisionRow}>
          <View style={{ flex: 1 }}>
            <Button
              label="Reject"
              variant="ghost"
              icon="x"
              onPress={onReject}
              disabled={deciding}
              testID={`button-reject-expense-${expenseId}`}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Approve"
              icon="check"
              onPress={onApprove}
              loading={deciding}
              testID={`button-approve-expense-${expenseId}`}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

export default function ExpensesScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const canSeeTeam = canViewTeamExpenses(user?.role);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [view, setView] = useState<ExpenseView>("mine");

  const q = useQuery<MyExpense[]>({
    queryKey: MY_EXPENSES_KEY,
    queryFn: () => customFetch<MyExpense[]>("/api/expenses/mine?limit=500"),
  });
  const rows = q.data ?? [];

  // Cross-project expenses the user reviews (PM own projects / MGMT all /
  // SALES own). Only fetched once the Team view is opened by an allowed role.
  const teamEnabled = canSeeTeam && view === "team";
  const teamQuery = useListExpenses({
    query: { enabled: teamEnabled, queryKey: getListExpensesQueryKey() },
  });
  const teamRows = teamQuery.data ?? [];

  // PM / MGMT decide pending claims straight from the Team view, mirroring the
  // timesheet approval flow. The server re-checks the role and (for PMs) that
  // the claim belongs to one of their projects.
  const qc = useQueryClient();
  const canDecide = canDecideExpenses(user?.role);
  const approveMutation = useApproveProjectExpense();
  const rejectMutation = useRejectProjectExpense();
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const buzz = () => {
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const approveExpense = (expenseId: string) => {
    approveMutation.mutate(
      { expenseId },
      {
        onSuccess: () => {
          buzz();
          void qc.invalidateQueries();
        },
        onError: (e: unknown) =>
          Alert.alert(
            "Approve failed",
            e instanceof Error ? e.message : "Could not approve this claim.",
          ),
      },
    );
  };

  const submitRejectExpense = () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) return;
    rejectMutation.mutate(
      { expenseId: rejectTarget, data: { reason } },
      {
        onSuccess: () => {
          buzz();
          setRejectTarget(null);
          setRejectReason("");
          void qc.invalidateQueries();
        },
        onError: (e: unknown) =>
          Alert.alert(
            "Reject failed",
            e instanceof Error ? e.message : "Could not reject this claim.",
          ),
      },
    );
  };

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

  if (canSeeTeam && view === "team") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Expenses" subtitle="Claims across your projects" />
        <FlatList
          data={teamRows}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={teamQuery.isFetching}
              onRefresh={() => void teamQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <ViewToggle view={view} onChange={setView} />
          }
          renderItem={({ item }) => (
            <ExpenseCard
              projectLabel={item.projectName ?? item.projectCode ?? "Project"}
              projectId={item.projectId}
              submitterName={item.createdByName}
              category={item.category}
              spentAt={item.spentAt}
              amount={item.amount}
              description={item.description}
              status={item.status}
              rejectionReason={item.rejectionReason}
              approvedByName={item.approvedByName}
              hasReceipt={item.status === "APPROVED" || item.status === "REJECTED"}
              expenseId={item.id}
              onApprove={
                canDecide && item.status === "PENDING"
                  ? () => approveExpense(item.id)
                  : undefined
              }
              onReject={
                canDecide && item.status === "PENDING"
                  ? () => {
                      setRejectTarget(item.id);
                      setRejectReason("");
                    }
                  : undefined
              }
              deciding={
                (approveMutation.isPending &&
                  approveMutation.variables?.expenseId === item.id) ||
                (rejectMutation.isPending &&
                  rejectMutation.variables?.expenseId === item.id)
              }
            />
          )}
          ListEmptyComponent={
            teamQuery.isLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <EmptyState
                icon="credit-card"
                title="No expenses to review"
                message="Claims filed on your projects will show up here."
              />
            )
          }
        />

        {/* Reject reason modal — a decision needs a written reason, same as
            timesheet rejections. */}
        <Modal
          visible={!!rejectTarget}
          transparent
          animationType="fade"
          onRequestClose={() => setRejectTarget(null)}
        >
          <Pressable style={styles.overlay} onPress={() => setRejectTarget(null)}>
            <Pressable
              style={[
                styles.rejectModal,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[styles.rejectModalTitle, { color: colors.foreground }]}>
                Reject expense claim
              </Text>
              <TextField
                label="Reason"
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Why is this claim being rejected?"
                autoCapitalize="sentences"
                multiline
                testID="input-reject-expense-reason"
              />
              <View style={styles.decisionRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Cancel"
                    variant="ghost"
                    onPress={() => setRejectTarget(null)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Confirm Reject"
                    variant="destructive"
                    onPress={submitRejectExpense}
                    loading={rejectMutation.isPending}
                    disabled={!rejectReason.trim()}
                    testID="button-confirm-reject-expense"
                  />
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

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
            {canSeeTeam ? <ViewToggle view={view} onChange={setView} /> : null}
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
          <ExpenseCard
            projectLabel={item.projectName ?? item.projectCode ?? "Project"}
            projectId={item.projectId}
            category={item.category}
            spentAt={item.spentAt}
            amount={item.amount}
            description={item.description}
            status={item.status}
            rejectionReason={item.rejectionReason}
            approvedByName={item.approvedByName}
            hasReceipt={item.hasReceipt}
            expenseId={item.id}
          />
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

// Segmented control switching between the user's own claims and the
// cross-project claims they review. Shown only to roles that can see team
// expenses (PM / MGMT / Sales).
function ViewToggle({
  view,
  onChange,
}: {
  view: ExpenseView;
  onChange: (v: ExpenseView) => void;
}) {
  const colors = useColors();
  const options: { value: ExpenseView; label: string }[] = [
    { value: "mine", label: "My Expenses" },
    { value: "team", label: "Team" },
  ];
  return (
    <View style={[styles.toggle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      {options.map((opt) => {
        const active = opt.value === view;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.toggleItem,
              active && { backgroundColor: colors.card },
            ]}
            testID={`toggle-expenses-${opt.value}`}
          >
            <Text
              style={[
                styles.toggleText,
                { color: active ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
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
  const { user } = useAuth();
  const autoApproved = expensesAutoApproved(user?.role);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [category, setCategory] = useState<AddProjectExpenseBodyCategory>("SOFTWARE");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(todayYMD());
  const [evidence, setEvidence] = useState<EvidenceFile | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Role-scoped on the server: only the projects this user is involved in.
  const projectsQuery = useListProjects(undefined, {
    query: { enabled: visible, queryKey: ["projects", "mobile-expense-submit"] },
  });
  const projectOptions: SelectOption[] = (projectsQuery.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.projectId ?? p.code ?? "No ID"} — ${p.name}`,
  }));

  const reset = () => {
    setProjectId(null);
    setCategory("SOFTWARE");
    setDescription("");
    setAmount("");
    setSpentAt(todayYMD());
    setEvidence(null);
    setAttaching(false);
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
        evidenceUrl: evidence?.url,
        evidenceFileName: evidence?.name,
      },
    });
  }

  // Read a picked file into a base64 data URL, validating type and size against
  // the server's limits so we fail fast with a friendly message on the phone.
  async function attachFromAsset(asset: {
    uri: string;
    name: string | null | undefined;
    mimeType: string | null | undefined;
    size: number | null | undefined;
    width?: number | null;
    height?: number | null;
  }) {
    setError(null);
    const mime = resolveEvidenceMime(asset.name, asset.mimeType);
    if (!mime) {
      setError("Unsupported file. Attach a PDF or image (PNG, JPEG, or WebP).");
      return;
    }
    const isImage = mime !== "application/pdf";
    // Oversized PDFs are rejected outright; oversized photos are shrunk below.
    if (!isImage && typeof asset.size === "number" && asset.size > MAX_EVIDENCE_BYTES) {
      setError("File too large. The receipt must be 8 MB or smaller.");
      return;
    }
    setAttaching(true);
    try {
      let fileUri = asset.uri;
      let fileMime = mime;
      let fileName = asset.name?.trim() || "";
      if (isImage) {
        // Large photos are downscaled and re-encoded as JPEG so they upload
        // fast and never trip the server's 8 MB evidence cap.
        const shrunk = await shrinkImageIfNeeded({
          uri: asset.uri,
          mime,
          name: fileName || `receipt-${Date.now()}.${mime.split("/")[1]}`,
          size: asset.size,
          width: asset.width,
          height: asset.height,
        });
        fileUri = shrunk.uri;
        fileMime = shrunk.mime;
        fileName = shrunk.name;
      }
      const base64 = await new File(fileUri).base64();
      // Roughly recover the raw byte count from the base64 string length.
      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes > MAX_EVIDENCE_BYTES) {
        setError("File too large. The receipt must be 8 MB or smaller.");
        return;
      }
      const fallbackExt = fileMime === "application/pdf" ? "pdf" : fileMime.split("/")[1];
      setEvidence({
        url: `data:${fileMime};base64,${base64}`,
        name: fileName || `receipt.${fallbackExt}`,
      });
    } catch {
      setError("Could not read the selected file. Please try again.");
    } finally {
      setAttaching(false);
    }
  }

  async function handleTakePhoto() {
    setError(null);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain && Platform.OS !== "web") {
          Alert.alert(
            "Camera access needed",
            "Enable camera access in Settings to take a receipt photo.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => {
                  void Linking.openSettings().catch(() => {});
                },
              },
            ],
          );
        } else {
          setError("Camera permission is required to take a photo.");
        }
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });
      if (result.canceled) return;
      const a = result.assets[0];
      await attachFromAsset({
        uri: a.uri,
        name: a.fileName ?? `receipt-${Date.now()}.jpg`,
        mimeType: a.mimeType ?? "image/jpeg",
        size: a.fileSize,
        width: a.width,
        height: a.height,
      });
    } catch {
      setError("Could not open the camera. Please try again.");
    }
  }

  async function handlePickFile() {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const a = result.assets[0];
      await attachFromAsset({
        uri: a.uri,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
      });
    } catch {
      setError("Could not open the file picker. Please try again.");
    }
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

            <View style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Receipt (optional)
              </Text>
              {evidence ? (
                <View
                  style={[
                    styles.evidenceRow,
                    { borderColor: colors.border, borderRadius: colors.radius },
                  ]}
                >
                  <Feather name="paperclip" size={16} color={colors.primary} />
                  <Text
                    style={[styles.evidenceName, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {evidence.name}
                  </Text>
                  <Pressable
                    onPress={() => setEvidence(null)}
                    hitSlop={10}
                    testID="button-remove-receipt"
                  >
                    <Feather name="x" size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : attaching ? (
                <View
                  style={[
                    styles.evidenceRow,
                    { borderColor: colors.border, borderRadius: colors.radius },
                  ]}
                >
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.evidenceName, { color: colors.mutedForeground }]}>
                    Reading file…
                  </Text>
                </View>
              ) : (
                <View style={styles.evidenceButtons}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Take Photo"
                      icon="camera"
                      variant="ghost"
                      onPress={handleTakePhoto}
                      testID="button-take-photo"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Choose File"
                      icon="upload"
                      variant="ghost"
                      onPress={handlePickFile}
                      testID="button-choose-file"
                    />
                  </View>
                </View>
              )}
              <Text style={[styles.evidenceHint, { color: colors.mutedForeground }]}>
                PDF or image (PNG, JPEG, WebP), up to 8 MB. Large photos are
                shrunk automatically.
              </Text>
            </View>

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
              {autoApproved
                ? "Expenses you submit are approved automatically."
                : "Submitted expenses are sent to the project manager for approval."}
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
  project: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  rowMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  meta: { fontSize: 14, fontFamily: "Inter_400Regular", flexShrink: 1 },
  amount: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  reject: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  loading: { paddingVertical: 48, alignItems: "center" },
  toggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    marginBottom: 4,
  },
  toggleItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 9,
  },
  toggleText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  evidenceButtons: { flexDirection: "row", gap: 12 },
  evidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  evidenceName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  evidenceHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  decisionRow: { flexDirection: "row", gap: 10, marginTop: 2 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  rejectModal: { borderWidth: 1, padding: 20, gap: 16 },
  rejectModalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
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
