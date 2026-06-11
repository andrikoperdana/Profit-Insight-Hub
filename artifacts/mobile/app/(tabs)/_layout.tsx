import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { useAuth } from "@/contexts/auth";
import { useColors } from "@/hooks/useColors";
import { canApproveTimesheets, canLogHours } from "@/lib/roles";

function NativeTabLayout() {
  const { user } = useAuth();
  const role = user?.role;
  const logs = canLogHours(role);
  const approves = canApproveTimesheets(role);

  return (
    <NativeTabs>
      {logs ? (
        <NativeTabs.Trigger name="index">
          <Icon sf={{ default: "clock", selected: "clock.fill" }} />
          <Label>Track</Label>
        </NativeTabs.Trigger>
      ) : (
        <NativeTabs.Trigger name="index" hidden />
      )}
      {logs ? (
        <NativeTabs.Trigger name="timesheets">
          <Icon sf="list.bullet.rectangle" />
          <Label>Timesheets</Label>
        </NativeTabs.Trigger>
      ) : (
        <NativeTabs.Trigger name="timesheets" hidden />
      )}
      {logs ? (
        <NativeTabs.Trigger name="expenses">
          <Icon sf={{ default: "creditcard", selected: "creditcard.fill" }} />
          <Label>Expenses</Label>
        </NativeTabs.Trigger>
      ) : (
        <NativeTabs.Trigger name="expenses" hidden />
      )}
      {approves ? (
        <NativeTabs.Trigger name="approvals">
          <Icon
            sf={{ default: "checkmark.seal", selected: "checkmark.seal.fill" }}
          />
          <Label>Approvals</Label>
        </NativeTabs.Trigger>
      ) : (
        <NativeTabs.Trigger name="approvals" hidden />
      )}
      <NativeTabs.Trigger name="notifications">
        <Icon sf={{ default: "bell", selected: "bell.fill" }} />
        <Label>Alerts</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const { user } = useAuth();
  const role = user?.role;
  const logs = canLogHours(role);
  const approves = canApproveTimesheets(role);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Track",
          href: logs ? "/" : null,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="clock" tintColor={color} size={24} />
            ) : (
              <Feather name="clock" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="timesheets"
        options={{
          title: "Timesheets",
          href: logs ? "/timesheets" : null,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="list.bullet.rectangle" tintColor={color} size={24} />
            ) : (
              <Feather name="list" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: "Expenses",
          href: logs ? "/expenses" : null,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="creditcard" tintColor={color} size={24} />
            ) : (
              <Feather name="credit-card" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: "Approvals",
          href: approves ? "/approvals" : null,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="checkmark.seal" tintColor={color} size={24} />
            ) : (
              <Feather name="check-circle" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bell" tintColor={color} size={24} />
            ) : (
              <Feather name="bell" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
