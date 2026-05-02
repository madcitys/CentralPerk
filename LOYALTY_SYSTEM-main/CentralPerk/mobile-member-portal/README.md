# Sprint 6 Member Portal

Expo mobile app for the Sprint 6 member portal scope:

- dashboard with points and animated tier progress
- horizontal campaign cards
- recent transactions list
- pull-to-refresh
- rewards catalog
- reward detail page
- redemption confirmation and success flow
- insufficient-points error state

## Run it on your phone

1. Copy `.env.example` to `.env`
2. Set `EXPO_PUBLIC_API_BASE_URL` to your computer's LAN IP, not `localhost`
3. In terminal 1, start the web/API app from the repo root:

```powershell
cd path\to\CentralPerk
npm run dev
```

4. In terminal 2, start the mobile app:

```powershell
cd path\to\CentralPerk\mobile-member-portal
npm start -- --lan
```

5. Wait for Expo to start `Metro Bundler`
6. Open `Expo Go` on your phone and scan the QR code

## QR code notes

- The QR code appears in the terminal or in the Expo DevTools page
- If you only see the app in the browser, you opened the web preview instead of the Expo QR flow
- If Expo shows options in the terminal, press `s` and choose `Expo Go`
- Do not press `w` if your goal is to open the app on your phone. `w` opens the web version in the browser
- If the QR does not appear, restart Expo with:

```bash
npx expo start --lan --clear
```

## Troubleshooting

- Your phone and laptop must be on the same Wi-Fi
- Test the API from your phone browser using `http://YOUR_LAPTOP_IP:3000`
- If your laptop IP changes, update `.env` and restart Expo
- If the API is unreachable, the app falls back to demo data so UI work can continue
- If the dashboard still shows fallback/mock values after load, the phone likely could not reach the backend

## Important

- Example API URL: `http://192.168.1.10:3000`
- Expo Go must scan the QR from the running Expo terminal or Expo DevTools page

## Screenshot notes

- `Pull-to-refresh spinner` means the loading indicator that appears when you drag the `Dashboard` or `Rewards` screen downward from the top and hold for a moment
- To capture it, open `Dashboard`, scroll to the top, swipe downward, and screenshot while the loading spinner is visible
- For the best proof, a short screen recording is better than a static screenshot if your instructor allows it

## Main files

- `app/(tabs)/index.tsx`: dashboard
- `app/(tabs)/rewards.tsx`: rewards catalog
- `app/reward/[id].tsx`: reward detail
- `app/redeem/[id].tsx`: redemption flow
- `lib/api.ts`: live API + fallback data mapping
- `lib/store.tsx`: shared app state
