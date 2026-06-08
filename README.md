# Manhunt

Real-world GPS manhunt game. Works as an add-to-homescreen PWA — no App Store needed.

## Setup (one-time, ~10 minutes)

### 1. Firebase
1. Go to [console.firebase.google.com](https://console.firebase.google.com) → New Project
2. Add a Web App → copy the config values
3. Enable **Anonymous Authentication**: Authentication → Sign-in method → Anonymous
4. Enable **Firestore**: Firestore Database → Create (start in test mode, then apply rules below)
5. Deploy security rules: paste `firestore.rules` content into Firestore → Rules

### 2. Maps
No setup needed. Maps use **OpenStreetMap + Leaflet** — completely free, no API key, no credit card.

### 3. Environment
```bash
cp .env.example .env
# Fill in all values in .env
```

### 4. Run locally
```bash
npm install
npm run dev
```

### 5. Deploy (Firebase Hosting)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # public dir: dist, SPA: yes
npm run build
firebase deploy
```

Share the deployed URL with friends. On iPhone: Safari → Share → Add to Home Screen.

## Game Flow

1. **Host** opens app → Create Game → picks dispersal time
2. Friends open app → Join Game → enter the 6-letter room code
3. Host draws boundary polygon on the map → selects "It" players → Start
4. **Runners** scatter for the dispersal timer. **It** players wait.
5. Timer hits zero → live game begins
6. **It** chases runners. Get within 10m → Tag button appears → runner must confirm
7. Tagged runners become "It" with 3 reveals
8. Power-up pins appear on map every 3 min — walk over to collect
9. Last runner standing wins

## Power-ups

| Power-up | Who | Effect |
|---|---|---|
| 🛡️ Immunity | Runner | Untag gable for 30s |
| 👁️ Reveal It | Runner | All "It" positions visible to runners for 15s |
| 📍 Reveal Runner | It | A random runner's location shown for 15s |
| 👥 Cluster Scan | It | Runner clusters shown on map for 15s |

Each "It" also starts with **3 built-in reveals** (Reveal Runner or Cluster Scan), separate from collected power-ups.
