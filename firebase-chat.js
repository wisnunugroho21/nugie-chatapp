/* ============================================================
   FIRESTORE TRANSPORT
   Everything that talks to Firebase lives here. The UI never sees a
   DocumentSnapshot: this module hands back plain objects in exactly
   the shape main.js already renders — the chat rows of CHATS and the
   bubble entries of MESSAGES.

   Layout in Firestore:
     chats/{chatId}                     one conversation
     chats/{chatId}/messages/{msgId}    one bubble

   chatId is derived from the conversation name, so both sides land on
   the same document without a lookup table.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

import { firebaseConfig, PROFILE } from "./firebase-config.js";

/* ---------- Is the project wired up yet? ---------- */
const placeholder = (v) => !v || /^(YOUR_|<|xxx)/i.test(String(v));

export const configured = !(
  placeholder(firebaseConfig.apiKey) || placeholder(firebaseConfig.projectId)
);

let db = null;
let me = null; // { uid, name, av }

export const whoami = () => me;

/** Sign in anonymously and open the Firestore handle. */
export async function connect() {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  const cred = await signInAnonymously(getAuth(app));
  me = { uid: cred.user.uid, name: PROFILE.name, av: PROFILE.av };
  return me;
}

/* ---------- Ids ---------- */
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* Same name in, same document out — on every device. The hash keeps
   names that slugify to nothing (or to the same slug) apart. */
export function chatIdFor(name) {
  const slug = String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "chat"}-${hash(String(name))}`;
}

const chatRef = (id) => doc(db, "chats", id);
const msgsRef = (id) => collection(chatRef(id), "messages");
const idOf = (chat) => chat.id || chatIdFor(chat.name);

/* ---------- Time ---------- */
const toDate = (ts) =>
  ts && typeof ts.toDate === "function" ? ts.toDate() : null;

const clock = (d) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

const dayKey = (d) => d.toDateString();

/** "14:12" for today, "Friday" this week, "12/08/2025" beyond that. */
function listStamp(d) {
  if (!d) return "";
  const today = new Date();
  if (dayKey(d) === dayKey(today)) return clock(d);
  const days = Math.round((today - d) / 86400000);
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString();
}

function dayLabel(d) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "Today";
  if (dayKey(d) === dayKey(yesterday)) return "Yesterday";
  const days = Math.round((today - d) / 86400000);
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString();
}

/* ---------- Read state ----------
   Unread lives in the browser, not in the document: each chat counts
   its messages, and we remember how many of them we had seen. No
   per-user fan-out in Firestore just to draw a badge. */
const READ_KEY = "nugie.read.v1";

function readMap() {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY)) || {};
  } catch {
    return {};
  }
}

function writeRead(map) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(map));
  } catch {
    /* private mode — badges just won't survive a reload */
  }
}

/* Forward-only: the message listener counts what it can see (capped at
   the page size), the chat document knows the true total, and neither
   may walk the pointer backwards. */
export function markRead(chatId, count) {
  const map = readMap();
  const next = Math.max(map[chatId] || 0, count);
  if (map[chatId] === next) return;
  map[chatId] = next;
  writeRead(map);
}

/* The chat the user is looking at is read by definition. */
let openChatId = null;
export const setOpenChat = (id) => (openChatId = id);

/* ---------- The conversation list ---------- */
export function watchChats(onChats) {
  const q = query(
    collection(db, "chats"),
    orderBy("updatedAt", "desc"),
    limit(100),
  );

  return onSnapshot(
    q,
    (snap) => {
      const seen = readMap();
      let touched = false;

      const list = snap.docs.map((d) => {
        const v = d.data();
        const count = v.count || 0;
        const mine = v.lastFrom === me.uid;

        // Anything I sent, or anything in the open chat, is read.
        if ((mine || d.id === openChatId) && seen[d.id] !== count) {
          seen[d.id] = count;
          touched = true;
        }

        return {
          id: d.id,
          name: v.name || d.id,
          av: v.av || "a2",
          initials: v.initials || "",
          group: !!v.group,
          sub: v.sub || "",
          preview: v.preview || "",
          icon: v.icon || "",
          time: listStamp(toDate(v.updatedAt)),
          unread: Math.max(0, count - (seen[d.id] || 0)),
        };
      });

      if (touched) writeRead(seen);
      onChats(list);
    },
    (err) => console.error("[firebase] chats", err),
  );
}

/* ---------- One conversation's messages ---------- */
export function watchMessages(chatId, onMessages) {
  // Newest N, then flipped: an old chat stays cheap to open.
  const q = query(msgsRef(chatId), orderBy("createdAt", "desc"), limit(200));

  return onSnapshot(
    q,
    (snap) => {
      const entries = [];
      let lastDay = null;

      snap.docs
        .slice()
        .reverse()
        .forEach((d) => {
          const v = d.data();
          const when = toDate(v.createdAt) || new Date();

          if (dayKey(when) !== lastDay) {
            lastDay = dayKey(when);
            entries.push({ kind: "day", label: dayLabel(when) });
          }

          const out = v.senderId === me.uid;
          entries.push({
            id: d.id,
            ...(v.kind ? { kind: v.kind } : {}),
            ...(out ? { out: true } : { from: v.senderName || "" }),
            text: v.text || "",
            time: clock(when),
            ...(v.quote ? { quote: v.quote } : {}),
            ...(v.photo ? { photo: true } : {}),
            ...(v.icon ? { icon: v.icon } : {}),
            ...(v.missed ? { missed: true } : {}),
          });
        });

      onMessages(entries);
    },
    (err) => console.error("[firebase] messages", err),
  );
}

/* ---------- Writing ----------
   createdAt is the client's clock rather than serverTimestamp(): a
   pending server timestamp reads back as null, and a null sorts to the
   front, so a message you just sent would jump to the top of the thread
   until the server acknowledged it. serverAt keeps the authoritative
   time alongside it. */
function appendMessage(chat, fields, { preview, icon }) {
  const id = idOf(chat);
  const stamp = Timestamp.now();
  const batch = writeBatch(db);

  batch.set(doc(msgsRef(id)), {
    ...fields,
    senderId: me.uid,
    senderName: me.name,
    createdAt: stamp,
    serverAt: serverTimestamp(),
  });

  batch.set(
    chatRef(id),
    {
      name: chat.name,
      av: chat.av || "a2",
      initials: chat.initials || "",
      group: !!chat.group,
      sub: chat.sub || "",
      preview,
      icon,
      updatedAt: stamp,
      lastFrom: me.uid,
      count: increment(1),
    },
    { merge: true },
  );

  return batch.commit();
}

export function sendMessage(chat, text) {
  return appendMessage(chat, { text }, { preview: text, icon: "done_all" });
}

/** Calls are still simulated, but their log lines are real messages —
    otherwise the next snapshot would wipe them out of the thread. */
export function logCall(chat, { text, icon, missed, preview }) {
  return appendMessage(
    chat,
    { kind: "call", text, icon, missed: !!missed },
    { preview: preview || text, icon },
  );
}

/** Create or refresh a conversation document without posting to it. */
export function upsertChat(chat) {
  return setDoc(
    chatRef(idOf(chat)),
    {
      name: chat.name,
      av: chat.av || "a2",
      initials: chat.initials || "",
      group: !!chat.group,
      sub: chat.sub || "",
      preview: chat.preview || "",
      icon: chat.icon || "",
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

/* ---------- First run ----------
   An empty project would open on an empty screen. Push the seed
   conversations up once so there is something to talk to; after that
   this is a no-op forever. */
export async function seedIfEmpty(chatSeed, msgSeed) {
  const existing = await getDocs(query(collection(db, "chats"), limit(1)));
  if (!existing.empty) return false;

  const today = new Date();
  const atTime = (hhmm, nudge) => {
    const [h, m] = String(hhmm || "09:00").split(":").map(Number);
    const d = new Date(today);
    d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, nudge, 0);
    return Timestamp.fromDate(d);
  };

  const batch = writeBatch(db);
  const seen = readMap();

  chatSeed.forEach((c) => {
    const id = chatIdFor(c.name);
    const msgs = (msgSeed[c.name] || []).filter(
      (m) => m.kind !== "day" && m.kind !== "typing",
    );

    let last = null;
    msgs.forEach((m, i) => {
      last = atTime(m.time, i);
      batch.set(doc(msgsRef(id)), {
        ...(m.kind ? { kind: m.kind } : {}),
        text: m.text || "",
        // Outgoing seed messages belong to whoever seeded the project.
        senderId: m.out ? me.uid : `seed:${id}`,
        senderName: m.out ? me.name : m.from || c.name,
        createdAt: last,
        serverAt: serverTimestamp(),
        ...(m.quote ? { quote: m.quote } : {}),
        ...(m.photo ? { photo: true } : {}),
        ...(m.icon ? { icon: m.icon } : {}),
        ...(m.missed ? { missed: true } : {}),
      });
    });

    const tail = msgs[msgs.length - 1];
    batch.set(chatRef(id), {
      name: c.name,
      av: c.av || "a2",
      initials: c.initials || "",
      group: !!c.group,
      sub: c.sub || "",
      preview: c.preview || "",
      icon: c.icon || "",
      count: msgs.length,
      lastFrom: tail && tail.out ? me.uid : `seed:${id}`,
      updatedAt: last || Timestamp.now(),
    });

    // Keep the badges the design shipped with instead of marking
    // every seeded message unread.
    seen[id] = Math.max(0, msgs.length - (c.unread || 0));
  });

  await batch.commit();
  writeRead(seen);
  return true;
}
