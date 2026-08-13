# Firebase setup

The UI runs without any of this — with the placeholders still in
`firebase-config.js` the app falls back to the in-memory seed data and
behaves exactly as it did before. Fill the config in and it starts
sending and receiving through Firestore.

## 1. Create the project

1. <https://console.firebase.google.com> → **Add project**.
2. **Build → Firestore Database → Create database** (production mode is
   fine; the rules below replace the defaults).
3. **Build → Authentication → Get started → Anonymous → Enable.**
   Every browser gets a stable uid, which is what tells your own
   messages apart from the other side's.
4. **Project settings → Your apps → Web (`</>`)** → register the app and
   copy the `firebaseConfig` object.

## 2. Fill in the config

Paste it into [firebase-config.js](firebase-config.js) and set the
display name other people will see:

```js
export const PROFILE = { name: "Nugie", av: "a1" };
```

Those config values are identifiers, not secrets — the rules are what
protect the data.

## 3. Publish the rules

Paste [firestore.rules](firestore.rules) into **Firestore → Rules →
Publish**, or push them with the CLI:

```bash
firebase deploy --only firestore:rules
```

## 4. Run it

`main.js` is now an ES module, so it needs a real origin — opening
`main.html` from the filesystem will fail on CORS.

```bash
python3 -m http.server 5500
```

Then open <http://localhost:5500/main.html>.

To watch a message travel: open that URL in two different browsers (or
one normal and one private window — anonymous auth gives each its own
uid), change `PROFILE.name` between them, and type in the same chat.

## Data model

```
chats/{chatId}                name, av, initials, group, sub,
                              preview, icon, updatedAt, lastFrom, count
chats/{chatId}/messages/{id}  text, senderId, senderName,
                              createdAt, serverAt,
                              kind? quote? photo? icon? missed?
```

`chatId` is derived from the conversation name
(`chatIdFor("Ibu") → "ibu-1a2b3c"`), so both sides reach the same
document without a lookup table. Names therefore have to stay unique,
which the original code already assumed via `chatByName`.

## Notes and trade-offs

- **First run seeds the project.** If the `chats` collection is empty,
  the six demo conversations are uploaded once so the app doesn't open
  onto a blank screen. If two browsers hit a fresh project at the exact
  same moment they can both seed it and you'll get duplicates — clear
  the collection and reload one of them.
- **`createdAt` is the client's clock,** with the server's time kept
  alongside in `serverAt`. A pending `serverTimestamp()` reads back as
  `null`, and `null` sorts first, so ordering by it would make a message
  you just sent jump to the top of the thread until the server
  acknowledged it. The cost is that two devices with badly skewed clocks
  can interleave oddly.
- **Unread counts are local.** Each chat document counts its messages;
  `localStorage` remembers how many you had seen. No per-user fan-out in
  Firestore just to draw a badge — but the badges are per-browser and a
  cleared profile resets them.
- **Only the open conversation has a message listener.** Switching chats
  drops the previous one. Previews in the list come from the chat
  document, not from listening to every thread.
- **Search still only covers the open thread's messages** (plus every
  name and preview). Message-level search across all chats would need a
  server-side index.
- **Calls are still simulated,** but their log lines are written as real
  messages so a snapshot doesn't erase them from the thread.
- **Typing indicators are not wired up.** `setTyping()` is still local
  only; it wants a presence document rather than a message.
