// Firebase client config is public by design. Protect data with the included Firestore rules.
// Public Web Push config for the free Cloudflare reminders worker.
const spiderFirebaseConfig = {
  apiKey: "AIzaSyDhzN0itylZZfDDYzk7NFqs578GegBQw94",
  authDomain: "spidy-list.firebaseapp.com",
  projectId: "spidy-list",
  storageBucket: "spidy-list.firebasestorage.app",
  messagingSenderId: "615498553625",
  appId: "1:615498553625:web:dcbce9c0be1d422774cd88",
  measurementId: "G-Z797PE1258",
  webPushPublicKey: "BGGExbLGCU2LXbLtvh8B7nmiOuyEOD3zm03-j6MTb9mSBhQFl0bLq01Jj_HZWuWH_uJ3BLRzMYRVI_ldJr_gIrM",
  pushWorkerUrl: "https://spider-tasks-reminders.spidy-list-boshk.workers.dev"
};

if (typeof self !== "undefined") self.SPIDER_FIREBASE_CONFIG = spiderFirebaseConfig;
