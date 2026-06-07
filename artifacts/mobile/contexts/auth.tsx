import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "@workspace/api-client-react";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

/**
 * Module-level token mirror. `setAuthTokenGetter` (wired in app/_layout.tsx)
 * reads this synchronously before every API request. Kept in sync with the
 * React state below.
 */
let currentToken: string | null = null;
export function getCurrentToken(): string | null {
  return currentToken;
}

type AuthState = {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [t, u] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (!mounted) return;
        if (t) {
          currentToken = t;
          setToken(t);
        }
        if (u) {
          try {
            setUser(JSON.parse(u) as User);
          } catch {
            // Corrupt cache — ignore and stay logged out.
          }
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      isLoading,
      signIn: async (t: string, u: User) => {
        currentToken = t;
        setToken(t);
        setUser(u);
        await AsyncStorage.multiSet([
          [TOKEN_KEY, t],
          [USER_KEY, JSON.stringify(u)],
        ]);
      },
      signOut: async () => {
        currentToken = null;
        setToken(null);
        setUser(null);
        await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
      },
    }),
    [token, user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
