import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { MemberPortalProvider } from "../lib/store";

export default function RootLayout() {
  return (
    <MemberPortalProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: "#f4f1ea",
          },
        }}
      />
    </MemberPortalProvider>
  );
}
