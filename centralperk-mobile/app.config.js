const fs = require("fs");
const os = require("os");
const path = require("path");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((env, line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return env;
      env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      return env;
    }, {});
}

const envFiles = [
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../centralperk-frontend/.env"),
  path.resolve(__dirname, "../centralperk-frontend/.envlocal"),
  path.resolve(__dirname, "../centralperk-frontend/.env.local"),
  path.resolve(__dirname, ".env"),
  path.resolve(__dirname, ".envlocal"),
  path.resolve(__dirname, ".env.local"),
];

const fileEnv = envFiles.reduce(
  (env, filePath) => ({
    ...env,
    ...readEnvFile(filePath),
  }),
  {},
);

const readEnv = (...keys) => keys.map((key) => process.env[key] || fileEnv[key]).find(Boolean);

const supabaseUrl =
  readEnv("EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "MEMBER_SUPABASE_URL");
const supabaseAnonKey =
  readEnv(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "MEMBER_SUPABASE_ANON_KEY",
  );
const configuredApiBaseUrl = readEnv("EXPO_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_APP_URL");

function localNetworkHost() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("172.")) {
        return entry.address;
      }
    }
  }
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

const apiBaseUrl =
  configuredApiBaseUrl && !configuredApiBaseUrl.includes("localhost")
    ? configuredApiBaseUrl
    : `http://${localNetworkHost()}:3000`;

module.exports = {
  expo: {
    name: "CentralPerk Mobile",
    slug: "centralperk-mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    extra: {
      supabaseUrl,
      supabaseAnonKey,
      apiBaseUrl,
      enableDemoAuth: readEnv("NEXT_PUBLIC_ENABLE_DEMO_AUTH", "EXPO_PUBLIC_ENABLE_DEMO_AUTH") !== "false",
      allowProfileLogin: readEnv("EXPO_PUBLIC_ALLOW_PROFILE_LOGIN", "NEXT_PUBLIC_ALLOW_PROFILE_LOGIN") !== "false",
    },
  },
};
