import React, { createContext, useContext, useState, useEffect } from "react";
import { User } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { markSessionExpired } from "@/lib/session";

// Auto-logout after this much inactivity. Keeps an unattended session from
// staying open indefinitely on a shared/unlocked machine.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Read persisted credentials synchronously so the very first render already
// knows whether the user is signed in. Reading them in an effect (the old
// approach) meant render #1 always saw user=null, so ProtectedRoute bounced
// every hard-refreshed deep link through /login and the user landed back on
// the dashboard instead of the page they refreshed.
function readStoredAuth(): { token: string | null; user: User | null } {
  try {
    const storedToken = localStorage.getItem("auth_token");
    const storedUser = localStorage.getItem("auth_user");
    if (storedToken && storedUser) {
      return { token: storedToken, user: JSON.parse(storedUser) as User };
    }
  } catch (e) {
    console.error("Failed to parse stored user", e);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  }
  return { token: null, user: null };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState(readStoredAuth);
  const [user, setUser] = useState<User | null>(initial.user);
  const [token, setToken] = useState<string | null>(initial.token);
  const [, setLocation] = useLocation();

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("auth_token", newToken);
    localStorage.setItem("auth_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const updateUser = (next: User) => {
    localStorage.setItem("auth_user", JSON.stringify(next));
    setUser(next);
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setToken(null);
    setUser(null);
    setLocation("/login");
  };

  // Idle auto-logout. When signed in, log the user out after a stretch of no
  // interaction, flagging the session as expired (same UX as a server 401) so
  // the login page shows a message and returns them to where they were.
  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expire = () => {
      markSessionExpired(window.location.pathname + window.location.search);
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      setToken(null);
      setUser(null);
      setLocation("/login");
    };
    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(expire, IDLE_TIMEOUT_MS);
    };
    // Throttle: push the timer forward at most once per second so high-frequency
    // events (mousemove/scroll) don't reset it on every tick.
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      reset();
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    reset();
    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [token, setLocation]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
