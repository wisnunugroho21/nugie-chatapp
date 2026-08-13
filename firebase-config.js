/* ============================================================
   FIREBASE CONFIG
   Paste the web app config from the Firebase console:
   Project settings → Your apps → SDK setup and configuration → Config.

   These values are not secrets — they identify the project, they do
   not grant access. Access is controlled by firestore.rules.

   While the placeholders below are still in place the app runs in
   local mode with the built-in seed data, exactly as it did before.
   ============================================================ */
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

/* How you appear to the other side. Anonymous auth gives every browser
   its own uid, so open the app in two browsers with two different names
   here to watch messages travel. */
export const PROFILE = {
  name: "Nugie",
  av: "a1",
};
