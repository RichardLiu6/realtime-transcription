import type { CapacitorConfig } from "@capacitor/cli";

// The app shows the live site (so web updates reach the app at once); the
// native layer adds what a web page can't do: recording with the screen
// locked (plugin NativeStt in ios/App/App and android/app/src/main/java).
const config: CapacitorConfig = {
  appId: "com.americanbestlife.translate",
  appName: "ABL Translate",
  webDir: "www",
  server: {
    // CAP_SERVER_URL=http://localhost:3000 to try a local dev server
    url: process.env.CAP_SERVER_URL ?? "https://translate.americanbestlife.com",
    // Shown when the site can't be reached (offline)
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "never",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
