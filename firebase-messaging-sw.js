/* ============================================================
   BACKGROUND MESSAGE WORKER

   Runs with no page attached, so it can't be an ES module sharing
   firebase-config.js — it uses the compat build and reads the project
   config out of its own registration URL (see registerWorker() in
   firebase-push.js).

   The Cloud Function sends data-only payloads on purpose: a payload
   with a `notification` block is displayed by the browser itself AND
   still wakes this handler, which is how you end up with every message
   notified twice.
   ============================================================ */
importScripts(
  "https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js",
);

firebase.initializeApp(
  Object.fromEntries(new URL(location).searchParams.entries()),
);

firebase.messaging().onBackgroundMessage((payload) => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || "New message", {
    body: d.body || "",
    // One notification per conversation, replaced as it goes.
    tag: d.chatId || "chat",
    renotify: true,
    data: { chat: d.chat || "" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const chat = (event.notification.data || {}).chat || "";

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Prefer a tab that is already running the app.
      for (const client of open) {
        if (!client.url.startsWith(self.registration.scope)) continue;
        client.postMessage({ type: "open-chat", chat });
        return client.focus();
      }

      await self.clients.openWindow(
        `./main.html?chat=${encodeURIComponent(chat)}`,
      );
    })(),
  );
});
