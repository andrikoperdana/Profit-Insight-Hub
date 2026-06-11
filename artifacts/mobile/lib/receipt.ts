import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { getCurrentToken } from "@/contexts/auth";

// The shared customFetch can't return a binary blob in the React Native
// runtime, so the receipt PDF is fetched directly with the bearer token, then
// written to the cache and handed to the OS share sheet. On web there's no
// share sheet, so we open the PDF in a new browser tab instead.
//
// The server (GET /api/expenses/:id/receipt) grants access to the submitter,
// the project's PM, and MANAGEMENT, so this same helper backs both the
// staffer's "My Expenses" list and a PM's team expense review.
export async function openReceipt(expenseId: string): Promise<void> {
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
          ? "You don't have access to this receipt."
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
