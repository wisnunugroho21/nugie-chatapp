/* ============================================================
   CLOUD MESSAGING (client half)

   A web client cannot push to another web client. All this half does
   is earn a token and file it in `devices/{token}`; the Cloud Function
   in functions/index.js is what actually sends, because delivery needs
   a service-account credential that must never reach a browser.

   Two delivery paths, and both are handled:
     tab focused   → onMessage() here, no OS notification
     tab elsewhere → onBackgroundMessage() in firebase-messaging-sw.js
   ============================================================ */
import { getApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging.js";

import { firebaseConfig, VAPID_KEY } from "./firebase-config.js";
import { registerDevice } from "./firebase-chat.js";

const placeholder = (v) => !v || /^(YOUR_|<|xxx)/i.test(String(v));

export const configured = !placeholder(VAPID_KEY);

let messaging = null;
let worker = null;

/** Browser support, secure context, and a VAPID key — all three. */
export async function available() {
  if (!configured) return false;
  if (!("serviceWorker" in navigator) || !("Notification" in window))
    return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export const permission = () =>
  "Notification" in window ? Notification.permission : "unsupported";

/* The worker gets the project config through its query string rather
   than a second copy of firebase-config.js — importScripts can't read
   an ES module, and two configs drift. */
function registerWorker() {
  if (worker) return Promise.resolve(worker);
  const qs = new URLSearchParams(firebaseConfig).toString();
  return navigator.serviceWorker
    .register(`./firebase-messaging-sw.js?${qs}`, { scope: "./" })
    .then((reg) => (worker = reg));
}

/**
 * Ask for permission (once), mint a token, and file it.
 * `ask: false` refreshes the token silently for a browser that has
 * already granted permission — no prompt on a cold load.
 */
export async function enable({ ask = true } = {}) {
  if (!(await available())) return { ok: false, reason: "unsupported" };

  let state = Notification.permission;
  if (state === "default") {
    if (!ask) return { ok: false, reason: "default" };
    state = await Notification.requestPermission();
  }
  if (state !== "granted") return { ok: false, reason: state };

  const reg = await registerWorker();
  messaging = getMessaging(getApp());

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: reg,
  });
  if (!token) return { ok: false, reason: "no-token" };

  await registerDevice(token);
  return { ok: true, token };
}

/** Messages that land while this tab has focus. */
export function onPush(cb) {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => cb(payload.data || {}));
}

/** The worker forwards notification clicks here so we can open the chat. */
export function onNotificationClick(cb) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "open-chat") cb(e.data.chat || "");
  });
}
