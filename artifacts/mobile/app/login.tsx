import { Feather } from "@expo/vector-icons";
import { useLogin } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
   Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextField } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/auth";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn } = useAuth();
  const login = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = () => {
    setError(null);
    const e = email.trim();
    if (!e || !password) {
      setError("Enter your email and password.");
      return;
    }
    login.mutate(
      { data: { email: e, password } },
      {
        onSuccess: async (res) => {
          await signIn(res.token, res.user);
          router.replace("/");
        },
        onError: (err) => {
          const msg =
            err instanceof Error ? err.message : "Login failed. Try again.";
          setError(
            msg.includes("401") ? "Incorrect email or password." : msg,
          );
        },
      },
    );
  };

  const topPad = (Platform.OS === "web" ? 67 : insets.top) + 40;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: topPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.logo,
            { backgroundColor: `${colors.primary}1A`, borderRadius: colors.radius },
          ]}
        >
          <Feather name="shield" size={36} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          SecureProfit Hub
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Track your hours on the go.
        </Text>

        <View style={styles.form}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@secureprofit.id"
            keyboardType="email-address"
            testID="login-email"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            testID="login-password"
          />

          {error ? (
            <Text style={[styles.error, { color: colors.destructive }]}>
              {error}
            </Text>
          ) : null}

          <Button
            label="Sign In"
            onPress={onSubmit}
            loading={login.isPending}
            icon="log-in"
            testID="login-submit"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: "center",
  },
  logo: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    marginBottom: 32,
  },
  form: { width: "100%", maxWidth: 420, gap: 16 },
  error: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
