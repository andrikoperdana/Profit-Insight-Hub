import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { openReceipt } from "@/lib/receipt";

// Self-contained "View receipt" action. Manages its own loading state so it can
// drop into any expense row — the staffer's "My Expenses" list or a PM's team
// expense review — without the parent screen threading shared loading flags.
export function ReceiptButton({
  expenseId,
  testID,
}: {
  expenseId: string;
  testID?: string;
}) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);

  async function handlePress() {
    if (loading) return;
    setLoading(true);
    try {
      await openReceipt(expenseId);
    } catch (e) {
      Alert.alert(
        "Receipt unavailable",
        e instanceof Error ? e.message : "Couldn't load the receipt.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Pressable
      onPress={() => void handlePress()}
      disabled={loading}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: colors.border },
        pressed && { opacity: 0.6 },
      ]}
      hitSlop={8}
      testID={testID ?? `button-view-receipt-${expenseId}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Feather name="file-text" size={16} color={colors.primary} />
      )}
      <Text style={[styles.btnText, { color: colors.primary }]}>
        {loading ? "Opening…" : "View receipt"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
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
  btnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
