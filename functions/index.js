/* ============================================================
   PUSH FAN-OUT

   This is the half a browser cannot do. Sending through FCM needs a
   service-account credential, so it lives in a function that reacts to
   new message documents.

   Requires the Blaze plan — Cloud Functions will not deploy on Spark.
   ============================================================ */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

const trim = (s, n) => {
  const text = String(s || "");
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
};

exports.notifyOnMessage = onDocumentCreated(
  "chats/{chatId}/messages/{messageId}",
  async (event) => {
    const msg = event.data && event.data.data();
    if (!msg) return;

    // The one-time demo import writes ~20 messages in a single batch.
    // Nobody wants twenty notifications for that.
    if (String(msg.senderId || "").startsWith("seed:")) return;

    const { chatId } = event.params;
    const chatSnap = await db.doc(`chats/${chatId}`).get();
    const chat = chatSnap.data() || {};

    /* No membership model in this clone, so every registered device
       that isn't the sender's gets the message. Once chats carry a
       `members` array, filter on that instead. */
    const devices = await db.collection("devices").get();
    const targets = devices.docs.filter((d) => d.get("uid") !== msg.senderId);
    if (!targets.length) return;

    const sender = msg.senderName || "Someone";
    const body = msg.kind === "call" ? msg.text : trim(msg.text, 180);

    const res = await getMessaging().sendEachForMulticast({
      tokens: targets.map((d) => d.id),
      // Data-only: the service worker decides how it looks, which
      // keeps one message from producing two notifications.
      data: {
        title: chat.group ? chat.name || "Group" : sender,
        body: chat.group ? `${sender}: ${body}` : body,
        chat: chat.name || "",
        chatId,
      },
      webpush: { headers: { Urgency: "high", TTL: "600" } },
    });

    // A token dies with the browser profile that minted it. Clear the
    // ones FCM rejects so the collection doesn't fill with corpses.
    const dead = [];
    res.responses.forEach((r, i) => {
      const code = r.error && r.error.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-argument"
      ) {
        dead.push(targets[i].ref.delete());
      }
    });
    await Promise.all(dead);

    logger.info("notifyOnMessage", {
      chatId,
      sent: res.successCount,
      failed: res.failureCount,
      pruned: dead.length,
    });
  },
);
