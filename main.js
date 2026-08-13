import * as fb from "./firebase-chat.js";
import * as push from "./firebase-push.js";

(function () {
  "use strict";

  /* Flipped on once Firebase is connected. Until then — and forever, if
     firebase-config.js is still holding placeholders — every path below
     falls back to the in-memory seed data. */
  let remote = false;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Elements ---------- */
  const sidebar = $(".sidebar");
  const chatPane = $(".chat");
  const chatList = $(".chat-list");
  const chatSearch = $("#chatSearch");
  const chatSearchClear = $("#chatSearchClear");
  const filters = $(".filters");
  const announcer = $("#announcer");
  const thread = $("#chat_thread");
  const headName = $(".ch-name");
  const headSub = $(".ch-sub");
  const headAvatar = $("#chatAvatar");
  const msgInput = $(".msg-input");
  const sendBtn = $(".btn-send");

  const panel = $("#newChat");
  const ncFoot = $("#ncFoot");
  const ncList = $("#ncList");
  const ncSearch = $("#ncSearch");
  const ncTitle = $("#ncTitle");
  const ncSub = $("#ncSub");
  const ncChips = $("#ncChips");
  const ncGroupName = $("#ncGroupName");
  const ncCreate = $("#ncCreate");

  /* ---------- Contact book ---------- */
  const CONTACTS = [
    { name: "Andre — QA", about: "QA engineer, tim TMS", av: "a5" },
    { name: "Citra Halim", about: "Finance & billing", av: "a3" },
    { name: "Dimas Prakoso", about: "Di jalan, jangan telepon 🚚", av: "a6" },
    { name: "Fajar Nugraha", about: "Panel dispatch 24/7", av: "a4" },
    { name: "Ibu", about: "Sudah makan?", av: "a4" },
    { name: "Pak Budi", about: "Koordinator armada utara", av: "a1" },
    { name: "Rina Prasetyo", about: "Ops support", av: "a3" },
    { name: "Slamet Riyadi", about: "Driver — B 9021 FF", av: "a2" },
    { name: "Tono Hermawan", about: "Gudang Marunda", av: "a5" },
    { name: "Warung Bu Sri", about: "Buka 07.00 – 21.00", av: "a6" },
    { name: "Yuni Kartika", about: "HRD", av: "a2" },
  ];

  /* ---------- Helpers ---------- */
  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );

  /** Announce something that happened outside the user's focus. */
  function announce(text) {
    announcer.textContent = text;
  }

  const now = () =>
    new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  function initials(name) {
    const parts = name
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || name).slice(0, 2).toUpperCase();
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- Which pane is on screen (narrow layout) ---------- */
  const narrow = window.matchMedia("(max-width: 900px)");
  let pane = "list"; // "list" | "chat"

  function applyPane() {
    if (narrow.matches) {
      sidebar.style.display = pane === "list" ? "flex" : "none";
      chatPane.style.display = pane === "chat" ? "flex" : "none";
    } else {
      // Wide layout: both panes stay side by side.
      sidebar.style.display = "flex";
      chatPane.style.display = "flex";
    }
  }

  function showPane(which) {
    pane = which;
    applyPane();
  }

  narrow.addEventListener("change", applyPane);
  applyPane();

  /* ============================================================
    CONVERSATION DATA
    The list is a projection of this array — no chat detail lives in
    the markup. Point CHATS at a fetch and the UI follows.
    ============================================================ */
  const CHATS = [
    {
      name: "Dispatch Armada",
      av: "a1",
      initials: "DA",
      group: true,
      sub: "You, Pak Budi, Rina, Fajar, +6",
      time: "14:12",
      preview: "Pak Budi: ETA Cikampek 14.30",
      icon: "",
      unread: 3,
    },
    {
      name: "Rina Prasetyo",
      av: "a3",
      sub: "online",
      time: "13:48",
      preview: "Laporan stamina driver sudah aku kirim",
      icon: "",
      unread: 0,
    },
    {
      name: "Andre — QA",
      av: "a5",
      sub: "last seen today at 12:24",
      time: "12:20",
      preview: "Deploy staging jam 5 ya",
      icon: "done_all",
      unread: 0,
    },
    {
      name: "Ibu",
      av: "a4",
      sub: "last seen today at 11:06",
      time: "11:05",
      preview: "Sudah makan siang belum?",
      icon: "",
      unread: 1,
    },
    {
      name: "Warung Bu Sri",
      av: "a6",
      initials: "WS",
      sub: "last seen today at 09:31",
      time: "09:30",
      preview: "0:12",
      icon: "call",
      unread: 0,
    },
    {
      name: "Info Kost Melati",
      av: "a4",
      initials: "KI",
      group: true,
      sub: "You, Pak Herman, Dewi, +12",
      time: "Friday",
      preview: "Photo",
      icon: "photo",
      unread: 0,
    },
  ];

  // Working copy, so the seed data stays untouched.
  const chats = CHATS.map((c) => ({ ...c }));

  const chatByName = (name) => chats.find((c) => c.name === name);
  const faceInitials = (chat) => chat.initials || initials(chat.name);

  /* Newest first: every update funnels through here so the ordering
       rule lives in one place. */
  function bumpToTop(chat) {
    const i = chats.indexOf(chat);
    if (i > 0) chats.splice(i, 1);
    if (i !== 0) chats.unshift(chat);
  }

  function ensureChat({ name, av, sub, preview, icon, group }) {
    let chat = chatByName(name);
    if (!chat) {
      chat = {
        name,
        av: av || "a2",
        group: !!group,
        sub: sub || "online",
        time: now(),
        preview: preview || "Draft",
        icon: icon || "",
        unread: 0,
      };
      chats.unshift(chat);
      return chat;
    }
    // Refresh metadata the caller knows more about than we do.
    if (av) chat.av = av;
    if (sub) chat.sub = sub;
    if (group !== undefined) chat.group = group;
    bumpToTop(chat);
    return chat;
  }

  function setPreview(name, text, icon) {
    const chat = chatByName(name);
    if (!chat) return;
    chat.preview = text;
    chat.icon = icon || "";
    chat.time = now();
    bumpToTop(chat);
  }

  function bumpUnread(name) {
    const chat = chatByName(name);
    if (!chat || name === current) return;
    chat.unread = (chat.unread || 0) + 1;
  }

  /* ============================================================
    MESSAGE DATA
    One entry per bubble. Plain objects with no markup in them, so
    the same seed could just as well arrive from an API.
      { text, time }                     — incoming
      { out: true, text, time }          — outgoing (ticks added)
      { from }                           — sender label in groups
      { quote: { author, text } }        — replied-to snippet
      { photo: true }                    — image attachment
      { kind: "day" | "call" | "typing" }
    Use **double asterisks** inside text for bold.
    ============================================================ */
  const MESSAGES = {
    "Dispatch Armada": [
      { kind: "day", label: "Today" },
      {
        from: "Pak Budi",
        text: "Unit B 9021 FF selesai loading di gudang Marunda. Segel sudah dipasang.",
        time: "14:02",
      },
      {
        from: "Pak Budi",
        text: "Surat jalan sudah discan, tolong dicek di sistem ya.",
        time: "14:03",
      },
      {
        out: true,
        text: "Sudah masuk, Pak. Statusnya otomatis pindah ke **IN TRANSIT** begitu surat jalan tervalidasi.",
        time: "14:05",
      },
      {
        from: "Rina Prasetyo",
        quote: {
          author: "You",
          text: "Statusnya otomatis pindah ke IN TRANSIT…",
        },
        text: "Drivernya siapa? Perlu aku update di dashboard stamina.",
        time: "14:08",
      },
      {
        out: true,
        text: "Pak Slamet. Istirahat terakhir 11:40, jadi jam kerjanya masih aman sampai sore.",
        time: "14:09",
      },
      {
        from: "Fajar",
        text: "Noted. Aku pantau dari panel dispatch.",
        time: "14:11",
      },
      {
        from: "Pak Budi",
        text: "Siap. ETA Cikampek 14:30, nanti saya kabari lagi kalau sudah lewat tol.",
        time: "14:12",
      },
      { kind: "typing", from: "Rina Prasetyo" },
    ],
    "Rina Prasetyo": [
      { kind: "day", label: "Today" },
      {
        out: true,
        text: "Rin, rekap stamina driver minggu ini sudah ada?",
        time: "13:41",
      },
      { text: "Laporan stamina driver sudah aku kirim", time: "13:48" },
    ],
    "Andre — QA": [
      { kind: "day", label: "Today" },
      { text: "Regression build TMS sudah hijau semua.", time: "12:14" },
      { out: true, text: "Deploy staging jam 5 ya", time: "12:20" },
    ],
    Ibu: [
      { kind: "day", label: "Today" },
      { text: "Sudah makan siang belum?", time: "11:05" },
    ],
    "Warung Bu Sri": [
      { kind: "day", label: "Today" },
      { kind: "call", text: "Voice call · 0:12", icon: "call", time: "09:30" },
    ],
    "Info Kost Melati": [
      { kind: "day", label: "Friday" },
      {
        from: "Pak Herman",
        photo: true,
        text: "Kamar 3B kosong mulai minggu depan, monggo kalau ada yang cari.",
        time: "20:14",
      },
    ],
  };

  /* ---------- Thread store ---------- */
  const threads = new Map(
    Object.entries(MESSAGES).map(([name, msgs]) => [
      name,
      // Nested objects (quote) get their own copy too, so the
      // seed constant can never be mutated through a thread.
      msgs.map((m) => ({
        ...m,
        ...(m.quote ? { quote: { ...m.quote } } : {}),
      })),
    ]),
  );

  function threadOf(name) {
    if (!threads.has(name)) threads.set(name, []);
    return threads.get(name);
  }

  let current = chats[0].name;

  /* ---------- Rendering a thread ---------- */
  const bold = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  const NOTICE = `<div class="pill notice">Messages are end-to-end encrypted. No one outside this chat can read them.</div>`;

  const emptyNote = (name) => `
        <div class="empty-note">
            <span class="material-symbols-outlined">forum</span>
            <p>Belum ada pesan dengan <b>${esc(name)}</b>. Tulis sesuatu di bawah untuk memulai.</p>
        </div>`;

  function entryHTML(m, { group, first, senderClass }) {
    if (m.kind === "call") {
      return `<div class="pill call-log${m.missed ? " missed" : ""}">
                    <span class="material-symbols-outlined">${esc(m.icon || "call")}</span>${esc(m.text)} · ${esc(m.time)}
                </div>`;
    }
    if (m.kind === "typing") {
      return `<div class="row in first">
                    <div class="bubble">
                        <div class="typing" aria-label="${esc(m.from || "Someone")} is typing"><i></i><i></i><i></i></div>
                    </div>
                </div>`;
    }

    const sender =
      group && !m.out && m.from && first
        ? `<div class="sender ${senderClass}">${esc(m.from)}</div>`
        : "";
    const quote = m.quote
      ? `<div class="quote"><b>${esc(m.quote.author)}</b><span>${esc(m.quote.text)}</span></div>`
      : "";
    const photo = m.photo
      ? `<div class="photo-ph"><span class="material-symbols-outlined">image</span></div>`
      : "";
    const ticks = m.out
      ? `<span class="material-symbols-outlined">done_all</span>`
      : "";

    return `<div class="row ${m.out ? "out" : "in"}${first ? " first" : ""}">
                <div class="bubble">${sender}${quote}${photo}
                    <div class="text">${bold(m.text)}<span class="meta">${esc(m.time)}${ticks}</span></div>
                </div>
            </div>`;
  }

  const isMessage = (m) => !m.kind || m.kind === "call";

  function renderThread(name) {
    const chat = chatByName(name);
    const group = !!(chat && chat.group);
    const msgs = threadOf(name);

    // Sender colours are assigned in order of appearance.
    const palette = ["s1", "s2", "s3"];
    const colors = new Map();
    const colorFor = (who) => {
      if (!colors.has(who))
        colors.set(who, palette[colors.size % palette.length]);
      return colors.get(who);
    };

    const out = [];
    let noticed = false;
    let lastKey = null; // drives bubble grouping and tails

    // Typing is transient presence, not history: render it after
    // everything else no matter where it sits in the array.
    const typing = msgs.filter((m) => m.kind === "typing");

    const notice = () => {
      if (!noticed) {
        out.push(NOTICE);
        noticed = true;
      }
    };

    msgs.forEach((m) => {
      if (m.kind === "typing") return;
      if (m.kind === "day") {
        out.push(`<div class="pill">${esc(m.label)}</div>`);
        notice();
        lastKey = null;
        return;
      }
      notice();
      if (m.kind) {
        out.push(entryHTML(m, {}));
        lastKey = null;
        return;
      }
      const key = m.out ? "out" : `in:${m.from || ""}`;
      const first = key !== lastKey;
      lastKey = key;
      out.push(
        entryHTML(m, {
          group,
          first,
          // Outgoing bubbles have no label, so they must not
          // consume a colour from the palette.
          senderClass: !m.out && m.from ? colorFor(m.from) : "",
        }),
      );
    });

    notice();
    if (!msgs.some(isMessage)) out.push(emptyNote(name));
    typing.forEach((m) => out.push(entryHTML(m, {})));

    thread.innerHTML = out.join("");
    thread.scrollTop = thread.scrollHeight;
  }

  /**
   * Show or clear the "… is typing" bubble for a conversation.
   * Wire this to a presence event; nothing else should push or
   * remove typing entries by hand.
   */
  function setTyping(name, from) {
    const msgs = threadOf(name);
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].kind === "typing") msgs.splice(i, 1);
    }
    if (from) msgs.push({ kind: "typing", from });
    if (name === current) renderThread(name);
  }

  /* ---------- Chat switching ---------- */
  function paintHeader(chat) {
    headName.textContent = chat.name;
    headSub.textContent = chat.sub || "online";
    headAvatar.className = "avatar " + chat.av;
    headAvatar.textContent = faceInitials(chat);
  }

  /* Only the open conversation carries a message listener; switching
     chats drops the previous one. */
  let unwatchThread = null;

  function watchCurrent() {
    if (unwatchThread) {
      unwatchThread();
      unwatchThread = null;
    }
    if (!remote) return;

    const name = current;
    const chat = chatByName(name);
    const id = (chat && chat.id) || fb.chatIdFor(name);
    fb.setOpenChat(id);

    unwatchThread = fb.watchMessages(id, (entries) => {
      threads.set(name, entries);
      dropHits(); // thread contents changed under the search index
      // Looking at a conversation is what marks it read.
      fb.markRead(id, entries.filter((e) => e.kind !== "day").length);
      if (name === current) renderThread(name);
    });
  }

  function openChat(name) {
    const chat = chatByName(name);
    if (!chat) return;

    chat.unread = 0;
    current = name;

    paintHeader(chat);
    watchCurrent();
    renderThread(name);
    renderChats();
    showPane("chat");
    msgInput.focus({ preventScroll: true });
  }

  chatList.addEventListener("click", (e) => {
    const row = e.target.closest(".chat-item");
    if (!row) return;

    const kebab = e.target.closest(".row-menu");
    if (kebab) {
      e.stopPropagation();
      rowMenu(kebab, row.dataset.name);
      return;
    }
    openChat(row.dataset.name);
  });

  chatList.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest(".chat-item");
    if (!row || e.target.closest(".row-menu")) return;
    e.preventDefault();
    openChat(row.dataset.name);
  });

  $("#btnBack").addEventListener("click", () => showPane("list"));

  /* ============================================================
    RENDERING + SEARCHING THE LIST
    ============================================================ */
  function highlight(text, q) {
    if (!q) return esc(text);
    const hay = text.toLowerCase();
    let out = "";
    let i = 0;
    for (;;) {
      const at = hay.indexOf(q, i);
      if (at < 0) return out + esc(text.slice(i));
      out +=
        esc(text.slice(i, at)) +
        '<span class="hl">' +
        esc(text.slice(at, at + q.length)) +
        "</span>";
      i = at + q.length;
    }
  }

  /* Message-level search runs over the stored thread HTML, so a chat
       still surfaces when the hit is buried in the conversation. */
  let hitCache = { q: null, map: new Map() };

  function messageHits(name, q) {
    if (hitCache.q !== q) hitCache = { q, map: new Map() };
    if (hitCache.map.has(name)) return hitCache.map.get(name);

    const hits = threadOf(name).filter(
      (m) => isMessage(m) && (m.text || "").toLowerCase().includes(q),
    ).length;
    hitCache.map.set(name, hits);
    return hits;
  }

  const dropHits = () => (hitCache = { q: null, map: new Map() });

  /* One chat model in, one row of markup out. */
  function chatRow(chat, q, hits) {
    const preview = chat.preview || "";
    const inPreview = q && preview.toLowerCase().includes(q);
    const icon = chat.icon
      ? `<span class="material-symbols-outlined">${esc(chat.icon)}</span>`
      : "";
    const body =
      q && !inPreview && hits
        ? `<span class="ci-hits">${hits} pesan cocok</span>`
        : `${icon}<span>${highlight(preview, q)}</span>`;

    const active = chat.name === current;
    return `
            <div class="chat-item${active ? " is-active" : ""}${
              chat.unread ? " is-unread" : ""
            }"
                 role="option" tabindex="0" aria-selected="${active}"
                 data-name="${esc(chat.name)}">
                <div class="avatar ${chat.av}">${esc(faceInitials(chat))}</div>
                <div class="ci-body">
                    <div class="ci-name">${highlight(chat.name, q)}</div>
                    <div class="ci-time"${
                      chat.unread ? ' style="color: var(--accent)"' : ""
                    }>${esc(chat.time)}</div>
                    <div class="ci-msg">${body}</div>
                    <div class="ci-meta">${
                      chat.unread
                        ? `<span class="badge">${chat.unread}</span>`
                        : ""
                    }</div>
                </div>
                <button class="row-menu" type="button"
                        aria-label="Options for ${esc(chat.name)}"
                        aria-haspopup="menu" aria-expanded="false">
                    <span class="material-symbols-outlined">more_vert</span>
                </button>
            </div>`;
  }

  let activeFilter = "all";

  function matchesQuery(chat, q) {
    if (!q) return true;
    return (
      chat.name.toLowerCase().includes(q) ||
      (chat.preview || "").toLowerCase().includes(q) ||
      messageHits(chat.name, q) > 0
    );
  }

  function renderChats() {
    // A repaint detaches the row an open menu is anchored to.
    if (menuAnchor && chatList.contains(menuAnchor)) closeMenu();

    const raw = chatSearch.value.trim();
    const q = raw.toLowerCase();
    const unreadOnly = activeFilter === "unread";
    chatSearchClear.style.display = chatSearch.value ? "grid" : "none";

    const visible = chats.filter(
      (c) => (!unreadOnly || c.unread) && matchesQuery(c, q),
    );

    // A full repaint resets scrollTop; put the user back where
    // they were.
    const scrolled = chatList.scrollTop;

    if (visible.length) {
      chatList.innerHTML = visible
        .map((c) => chatRow(c, q, q ? messageHits(c.name, q) : 0))
        .join("");
      chatList.scrollTop = Math.min(scrolled, chatList.scrollHeight);
      return;
    }

    chatList.innerHTML = q
      ? `<div class="list-empty">
                   Tidak ada chat yang cocok dengan <b>${esc(raw)}</b>.
                   <br />Cari nama lain, atau mulai percakapan baru.
                   <br /><button type="button" id="emptyNewChat">Start a new chat</button>
               </div>`
      : `<div class="list-empty">Belum ada chat yang belum dibaca.</div>`;
  }

  chatSearch.addEventListener("input", renderChats);

  chatSearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      chatSearch.value = "";
      renderChats();
      return;
    }
    if (e.key === "Enter") {
      // Jump straight into the top result.
      const first = chatList.querySelector(".chat-item");
      if (first) openChat(first.dataset.name);
    }
  });

  chatSearchClear.addEventListener("click", () => {
    chatSearch.value = "";
    renderChats();
    chatSearch.focus({ preventScroll: true });
  });

  // Hand an unmatched search over to the contact picker.
  chatList.addEventListener("click", (e) => {
    if (!e.target.closest("#emptyNewChat")) return;
    const carried = chatSearch.value.trim();
    openPanel(false);
    if (carried) {
      ncSearch.value = carried;
      renderContacts();
    }
  });

  filters.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$(".chip", filters).forEach((c) =>
      c.setAttribute("aria-pressed", String(c === chip)),
    );
    activeFilter = chip.dataset.filter || "all";
    renderChats();
  });

  /* ---------- New chat panel ---------- */
  let groupMode = false;
  let panelOpen = false;
  let slide = null;
  const SLIDE_MS = 220;
  const selected = new Map(); // name -> contact

  // The slide in/out, and the final resting state, come from here —
  // no state classes, no :checked, no transition rules.
  function slidePanel(open) {
    if (slide) slide.cancel();
    const from = open ? "translateX(-102%)" : "translateX(0)";
    const to = open ? "translateX(0)" : "translateX(-102%)";

    panel.style.visibility = "visible";
    slide = panel.animate([{ transform: from }, { transform: to }], {
      duration: reduceMotion.matches ? 0 : SLIDE_MS,
      easing: "ease",
    });
    slide.onfinish = () => {
      panel.style.transform = to;
      panel.style.visibility = open ? "visible" : "hidden";
      slide = null;
    };
  }

  function openPanel(group) {
    groupMode = !!group;
    selected.clear();
    ncSearch.value = "";
    ncGroupName.value = "";
    ncFoot.style.display = groupMode ? "flex" : "none";
    ncTitle.textContent = groupMode ? "New group" : "New chat";
    ncSub.textContent = groupMode
      ? "Add members, then name the group"
      : "Pick someone to message";
    renderChips();
    renderContacts();

    if (!panelOpen) {
      panelOpen = true;
      slidePanel(true);
    }
    panel.setAttribute("aria-hidden", "false");
    setTimeout(
      () => ncSearch.focus({ preventScroll: true }),
      reduceMotion.matches ? 0 : SLIDE_MS,
    );
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    slidePanel(false);
    panel.setAttribute("aria-hidden", "true");
  }

  $("#btnNewChat").addEventListener("click", () => openPanel(false));
  $("#ncBack").addEventListener("click", () => {
    if (groupMode) openPanel(false);
    else closePanel();
  });
  // Escape is handled once, centrally — see the chain near the
  // bottom of this file.

  function contactRow(c) {
    const picked = groupMode && selected.has(c.name);
    // A div, not a button: it now contains its own menu button,
    // and nesting buttons is invalid.
    return `
            <div class="contact${picked ? " sel" : ""}" role="button" tabindex="0"
                 aria-pressed="${picked}" data-contact="${esc(c.name)}">
                <div class="avatar ${c.av}">${esc(initials(c.name))}</div>
                <div class="c-body">
                    <div class="c-name">${esc(c.name)}</div>
                    <div class="c-about">${esc(c.about)}</div>
                </div>
                ${picked ? '<span class="c-check material-symbols-outlined">check</span>' : ""}
                <button class="row-menu contact-menu" type="button"
                        aria-label="Options for ${esc(c.name)}"
                        aria-haspopup="menu" aria-expanded="false">
                    <span class="material-symbols-outlined">more_vert</span>
                </button>
            </div>`;
  }

  function renderContacts() {
    const q = ncSearch.value.trim().toLowerCase();
    const found = CONTACTS.filter((c) => c.name.toLowerCase().includes(q));
    let html = "";

    if (!groupMode && !q) {
      html += `
                <button class="contact" type="button" data-action="group">
                    <span class="c-icon material-symbols-outlined">group</span>
                    <div class="c-body">
                        <div class="c-name">New group</div>
                        <div class="c-about">Kumpulkan tim dispatch dalam satu chat</div>
                    </div>
                </button>`;
    }

    if (!found.length) {
      html += `<div class="np-empty">Tidak ada kontak bernama “${esc(
        ncSearch.value.trim(),
      )}”. Coba nama lain.</div>`;
    } else {
      let letter = "";
      found.forEach((c) => {
        const first = c.name[0].toUpperCase();
        if (first !== letter) {
          letter = first;
          html += `<div class="np-section">${esc(letter)}</div>`;
        }
        html += contactRow(c);
      });
    }
    ncList.innerHTML = html;
  }

  ncSearch.addEventListener("input", renderContacts);
  ncList.addEventListener("scroll", () => closeMenu());

  ncList.addEventListener("click", (e) => {
    const btn = e.target.closest(".contact");
    if (!btn) return;

    const kebab = e.target.closest(".contact-menu");
    if (kebab) {
      e.stopPropagation();
      contactMenu(kebab, btn.dataset.contact);
      return;
    }

    if (btn.dataset.action === "group") {
      openPanel(true);
      return;
    }

    const c = CONTACTS.find((x) => x.name === btn.dataset.contact);
    if (!c) return;

    if (groupMode) {
      if (selected.has(c.name)) selected.delete(c.name);
      else selected.set(c.name, c);
      markRow(btn, selected.has(c.name));
      renderChips();
    } else {
      startChat(c);
    }
  });

  // Contact rows are divs now, so Enter and Space need handling.
  ncList.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest(".contact");
    if (!row || e.target.closest(".contact-menu")) return;
    e.preventDefault();
    row.click();
  });

  function startChat(c) {
    const chat = ensureChat({
      name: c.name,
      av: c.av,
      sub: c.about,
      preview: "Draft",
    });
    publishChat(chat);
    closePanel();
    openChat(c.name);
  }

  /* A conversation the user just created has to exist server-side too,
     or the first snapshot drops it off the list again. */
  function publishChat(chat) {
    if (!remote || !chat) return;
    fb.upsertChat(chat).catch((err) => console.error("[firebase] chat", err));
  }

  /* ---------- Group mode ---------- */
  function markRow(btn, picked) {
    btn.classList.toggle("sel", picked);
    btn.setAttribute("aria-pressed", String(picked));
    const check = btn.querySelector(".c-check");
    if (picked && !check) {
      const span = document.createElement("span");
      span.className = "c-check material-symbols-outlined";
      span.textContent = "check";
      btn.insertBefore(span, btn.querySelector(".row-menu"));
      return;
    } else if (!picked && check) {
      check.remove();
    }
  }

  function renderChips() {
    if (!selected.size) {
      ncChips.innerHTML = '<span class="np-hint">Pick the people to add</span>';
      ncSub.textContent = groupMode
        ? "Add members, then name the group"
        : "Pick someone to message";
      ncCreate.disabled = true;
      return;
    }
    ncChips.innerHTML = Array.from(selected.values())
      .map(
        (c) => `
                <span class="np-chip">
                    <span class="dot avatar ${c.av}">${esc(initials(c.name))}</span>
                    ${esc(c.name)}
                    <button type="button" data-remove="${esc(c.name)}" aria-label="Remove ${esc(
                      c.name,
                    )}"><span class="material-symbols-outlined">close</span></button>
                </span>`,
      )
      .join("");
    ncSub.textContent = `${selected.size} of ${CONTACTS.length} selected`;
    ncCreate.disabled = false;
  }

  ncChips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    selected.delete(btn.dataset.remove);
    renderChips();
    renderContacts();
  });

  ncCreate.addEventListener("click", () => {
    if (!selected.size) return;
    const members = Array.from(selected.values());
    const name =
      ncGroupName.value.trim() ||
      members
        .map((m) => m.name.split(" ")[0])
        .slice(0, 3)
        .join(", ");
    const chat = ensureChat({
      name,
      av: "a2",
      group: true,
      sub: "You, " + members.map((m) => m.name.split(" ")[0]).join(", "),
      preview: "You created this group",
    });
    publishChat(chat);
    closePanel();
    openChat(name);
  });

  ncGroupName.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !ncCreate.disabled) ncCreate.click();
  });

  /* ---------- Sending ---------- */
  function send() {
    const text = msgInput.value.trim();
    if (!text) return;

    msgInput.value = "";
    msgInput.focus({ preventScroll: true });

    // Firestore echoes the write back through the open listener before
    // it reaches the network, so the bubble appears immediately and
    // there is nothing local to reconcile.
    if (remote) {
      const chat = chatByName(current);
      fb.sendMessage(chat || { name: current }, text).catch((err) => {
        console.error("[firebase] send", err);
        say("Pesan gagal terkirim");
      });
      return;
    }

    threadOf(current).push({ out: true, text, time: now() });
    renderThread(current);

    setPreview(current, text, "done_all");
    dropHits(); // thread changed
    renderChats();
  }

  sendBtn.addEventListener("click", send);
  msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });

  /* ============================================================
    KEBAB MENUS + REFRESH
    ============================================================ */
  const menu = $("#menu");
  const snack = $("#snack");
  let menuAnchor = null;
  let menuItems = [];
  let snackTimer = null;

  function say(text) {
    snack.textContent = text;
    snack.style.display = "block";
    snack.animate(
      [
        { opacity: 0, transform: "translate(-50%, 8px)" },
        { opacity: 1, transform: "translate(-50%, 0)" },
      ],
      { duration: reduceMotion.matches ? 0 : 160, easing: "ease-out" },
    );
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => {
      const out = snack.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: reduceMotion.matches ? 0 : 200,
      });
      out.onfinish = () => (snack.style.display = "none");
    }, 1900);
  }

  function closeMenu() {
    if (!menuAnchor) return;
    menuAnchor.setAttribute("aria-expanded", "false");
    menuAnchor = null;
    menuItems = [];
    menu.style.display = "none";
  }

  function openMenu(anchor, items) {
    if (menuAnchor === anchor) {
      closeMenu(); // second click on the same button closes it
      return;
    }
    closeMenu();
    menuItems = items;
    menu.innerHTML = items
      .map(
        (it, i) => `
                <button class="menu-item" type="button" role="menuitem" data-i="${i}">
                    <span class="material-symbols-outlined">${esc(it.icon)}</span>${esc(it.label)}
                </button>`,
      )
      .join("");

    // Measure first, then place: flip up or clamp when near an edge.
    menu.style.visibility = "hidden";
    menu.style.display = "block";
    menu.style.left = "0px";
    menu.style.top = "0px";

    const box = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    let left = Math.min(box.right - w, window.innerWidth - w - 8);
    let top = box.bottom + 6;
    if (left < 8) left = 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, box.top - h - 6);

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = "visible";
    menu.animate(
      [
        { opacity: 0, transform: "scale(.96)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: reduceMotion.matches ? 0 : 120, easing: "ease-out" },
    );

    menuAnchor = anchor;
    anchor.setAttribute("aria-expanded", "true");
    menu.querySelector(".menu-item").focus({ preventScroll: true });
  }

  menu.addEventListener("click", (e) => {
    const btn = e.target.closest(".menu-item");
    if (!btn) return;
    const item = menuItems[Number(btn.dataset.i)];
    const anchor = menuAnchor;
    closeMenu();
    if (item) item.run(anchor);
  });

  document.addEventListener("click", (e) => {
    if (!menuAnchor) return;
    if (e.target.closest("#menu") || e.target.closest("[aria-haspopup='menu']"))
      return;
    closeMenu();
  });

  // Escape for menus is part of the central chain below.

  window.addEventListener("resize", closeMenu);
  chatList.addEventListener("scroll", closeMenu);

  /* Spin the button while the "fetch" is in flight. This is where a
       real reload would await the server. */
  function busy(anchor, run) {
    const icon = anchor.querySelector(".material-symbols-outlined");
    if (!icon) return run();
    const was = icon.textContent;
    const button = anchor instanceof HTMLButtonElement ? anchor : null;

    icon.textContent = "progress_activity";
    icon.classList.add("spin");
    if (button) button.disabled = true;

    setTimeout(() => {
      icon.textContent = was;
      icon.classList.remove("spin");
      if (button) button.disabled = false;
      run();
    }, 650);
  }

  const REFRESH = { icon: "refresh", label: "Refresh" };

  /* --- Chat header: reload the open conversation --- */
  $("#btnChatMenu").addEventListener("click", (e) => {
    e.stopPropagation();
    openMenu(e.currentTarget, [
      {
        ...REFRESH,
        run: (anchor) =>
          busy(anchor, () => {
            renderThread(current);
            dropHits();
            say(`Chat dengan ${current} dimuat ulang`);
          }),
      },
    ]);
  });

  /* --- Chat list header: reload every conversation --- */
  $("#btnListMenu").addEventListener("click", (e) => {
    e.stopPropagation();
    openMenu(e.currentTarget, [
      {
        ...REFRESH,
        run: (anchor) =>
          busy(anchor, () => {
            dropHits();
            renderChats();
            say("Daftar chat dimuat ulang");
          }),
      },
      ...notifyItem(),
    ]);
  });

  /* --- One conversation row --- */
  function rowMenu(anchor, name) {
    openMenu(anchor, [
      {
        ...REFRESH,
        run: (a) =>
          busy(a, () => {
            dropHits();
            renderChats();
            say(`${name} dimuat ulang`);
          }),
      },
    ]);
  }

  /* --- One contact row --- */
  function contactMenu(anchor, name) {
    openMenu(anchor, [
      {
        ...REFRESH,
        run: (a) =>
          busy(a, () => {
            renderContacts();
            say(`Kontak ${name} dimuat ulang`);
          }),
      },
    ]);
  }

  /* ============================================================
    CALLS
    ============================================================ */
  const overlay = $("#callOverlay");
  const callCard = $("#callCard");
  const callStage = $("#callStage");
  const callStageAvatar = $("#callStageAvatar");
  const callAvatar = $("#callAvatar");
  const callName = $("#callName");
  const callStatus = $("#callStatus");
  const callFlags = $("#callFlags");
  const callMute = $("#callMute");
  const callCam = $("#callCam");
  const callSpeaker = $("#callSpeaker");
  const toast = $("#callToast");
  const ctAvatar = $("#ctAvatar");
  const ctName = $("#ctName");
  const ctSub = $("#ctSub");

  let call = null; // the one call in flight, or null
  let callSeq = 0; // increments per call, so stale timers can tell
  let ticker = null;
  let stage = []; // pending timeouts standing in for the far end

  const at = (fn, ms) => stage.push(setTimeout(fn, ms));
  const clearStage = () => {
    stage.forEach(clearTimeout);
    stage = [];
  };

  const duration = (s) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  /* Avatar colour + initials for whoever is on the other end. */
  function faceOf(name) {
    const chat = chatByName(name);
    if (chat) return { av: chat.av, initials: faceInitials(chat) };
    const c = CONTACTS.find((x) => x.name === name);
    return { av: c ? c.av : "a1", initials: initials(name) };
  }

  function paintCall() {
    callName.textContent = call.name;
    callAvatar.className = "avatar " + call.face.av;
    callAvatar.textContent = call.face.initials;
    callStageAvatar.className = "avatar " + call.face.av;
    callStageAvatar.textContent = call.face.initials;

    // The stage follows the camera, so killing video mid-call
    // falls back to the voice layout.
    callStage.style.display = call.cam ? "grid" : "none";
    callAvatar.style.display = call.cam ? "none" : "grid";
    setFlags();
  }

  function setStatus(text) {
    callStatus.textContent = text;
  }

  function setFlags() {
    const flags = [];
    if (call.muted) flags.push("Muted");
    if (call.kind === "video" && !call.cam) flags.push("Camera off");
    if (call.speaker) flags.push("Speaker");
    callFlags.textContent = flags.join(" · ");
  }

  function openOverlay() {
    overlay.style.display = "grid";
    const ms = reduceMotion.matches ? 0 : 170;
    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms });
    callCard.animate(
      [
        { transform: "scale(.94)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: ms, easing: "cubic-bezier(.2,.8,.3,1)" },
    );
    $("#callEnd").focus({ preventScroll: true });
  }

  function closeOverlay() {
    const anim = overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduceMotion.matches ? 0 : 170,
    });
    anim.onfinish = () => (overlay.style.display = "none");
  }

  function showToast(show) {
    const ms = reduceMotion.matches ? 0 : 200;
    if (show) {
      toast.style.display = "flex";
      toast.animate(
        [
          { transform: "translateY(14px)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: ms, easing: "cubic-bezier(.2,.8,.3,1)" },
      );
      ctAvatar.classList.add("ringing");
      $("#ctAccept").focus({ preventScroll: true });
      return;
    }
    ctAvatar.classList.remove("ringing");
    const anim = toast.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: "translateY(14px)", opacity: 0 },
      ],
      { duration: ms },
    );
    anim.onfinish = () => (toast.style.display = "none");
  }

  /* ---------- Outgoing ---------- */
  function startCall(kind) {
    if (call) return; // one line at a time
    clearStage(); // drop anything still pending from the last call
    callSeq++;
    call = {
      name: current,
      face: faceOf(current),
      kind,
      direction: "out",
      secs: 0,
      muted: false,
      cam: kind === "video",
      speaker: false,
      answered: true,
    };
    syncToggles();
    paintCall();
    setStatus("Calling…");
    openOverlay();

    // Stand-in for the far end — replace with hub events.
    at(() => setStatus("Ringing…"), 1300);
    at(() => call && connect(call), 4200);
  }

  /* ---------- Incoming ---------- */
  function ringIncoming(name, kind) {
    if (call) return;
    clearStage();
    callSeq++;
    call = {
      name,
      face: faceOf(name),
      kind,
      direction: "in",
      secs: 0,
      muted: false,
      cam: kind === "video",
      speaker: false,
      answered: false,
    };
    ctAvatar.className = "avatar " + call.face.av;
    ctAvatar.textContent = call.face.initials;
    ctName.textContent = name;
    ctSub.textContent = `Incoming ${kind} call`;
    announce(`Incoming ${kind} call from ${name}`);
    showToast(true);

    at(() => endCall("no-answer"), 25000); // nobody picked up
  }

  function acceptCall() {
    if (!call || call.direction !== "in" || call.answered) return;
    clearStage();
    call.answered = true;
    showToast(false);
    syncToggles();
    paintCall();
    openOverlay();
    connect(call);
  }

  function connect(live) {
    clearStage();
    live.connected = true;
    live.secs = 0;
    setStatus(duration(0));
    clearInterval(ticker);
    // Closes over its own call, so a stale interval can never
    // mutate whichever call happens to be live later.
    ticker = setInterval(() => {
      live.secs++;
      setStatus(duration(live.secs));
    }, 1000);
  }

  /* ---------- Hanging up ---------- */
  function endCall(reason) {
    if (!call) return;
    clearStage();
    clearInterval(ticker);
    ticker = null;

    const { name, kind, direction, secs, connected, answered } = call;

    // Never picked up: no call screen was ever shown.
    if (direction === "in" && !answered) {
      showToast(false);
      call = null;
      logCall(name, {
        kind,
        missed: true,
        text:
          reason === "declined"
            ? `Declined ${kind} call`
            : `Missed ${kind} call`,
      });
      return;
    }

    setStatus(connected ? "Call ended" : "Call cancelled");
    const closing = callSeq;
    call = null;
    logCall(name, {
      kind,
      missed: !connected,
      text: connected
        ? `${kind === "video" ? "Video" : "Voice"} call · ${duration(secs)}`
        : `Cancelled ${kind} call`,
      preview: connected ? duration(secs) : "",
    });
    at(
      () => callSeq === closing && closeOverlay(),
      reduceMotion.matches ? 0 : 850,
    );
  }

  /* ---------- Call log in the thread + chat list ---------- */
  function logCall(name, { kind, text, missed, preview }) {
    const icon = missed
      ? "phone_missed"
      : kind === "video"
        ? "videocam"
        : "call";

    const chat = ensureChat({ name, av: faceOf(name).av });

    // Calls are still simulated, but the log line is a real message so
    // that the next snapshot doesn't erase it from the thread.
    if (remote) {
      fb.logCall(chat, { text, icon, missed, preview }).catch((err) =>
        console.error("[firebase] call log", err),
      );
      if (name !== current) announce(`${name}: ${text}`);
      return;
    }

    // Works whether or not that chat is on screen.
    threadOf(name).push({ kind: "call", text, icon, missed, time: now() });
    if (name === current) renderThread(name);

    setPreview(name, preview || text, icon);
    if (missed) bumpUnread(name);
    if (name !== current) announce(`${name}: ${text}`);
    dropHits();
    renderChats();
  }

  /* ---------- In-call toggles ---------- */
  function syncToggles() {
    callMute.classList.toggle("on", call.muted);
    callMute.setAttribute("aria-pressed", String(call.muted));
    callMute.querySelector("span").textContent = call.muted ? "mic_off" : "mic";

    callCam.classList.toggle("on", call.cam);
    callCam.setAttribute("aria-pressed", String(call.cam));
    callCam.querySelector("span").textContent = call.cam
      ? "videocam"
      : "videocam_off";

    callSpeaker.classList.toggle("on", call.speaker);
    callSpeaker.setAttribute("aria-pressed", String(call.speaker));
  }

  callMute.addEventListener("click", () => {
    if (!call) return;
    call.muted = !call.muted;
    syncToggles();
    setFlags();
  });

  callCam.addEventListener("click", () => {
    if (!call) return;
    call.cam = !call.cam;
    if (call.cam) call.kind = "video"; // camera on upgrades the call
    syncToggles();
    paintCall();
  });

  callSpeaker.addEventListener("click", () => {
    if (!call) return;
    call.speaker = !call.speaker;
    syncToggles();
    setFlags();
  });

  $("#callEnd").addEventListener("click", () => endCall("hangup"));
  $("#ctAccept").addEventListener("click", acceptCall);
  $("#ctDecline").addEventListener("click", () => endCall("declined"));

  $("#btnVoiceCall").addEventListener("click", () => startCall("voice"));
  $("#btnVideoCall").addEventListener("click", () => startCall("video"));

  // Stub for the ringing side — swap for a SignalR "IncomingCall" handler.
  $("#btnSimIncoming").addEventListener("click", () => {
    if (call) return;
    const from =
      chats[Math.floor(Math.random() * chats.length)].name || current;
    ringIncoming(from, Math.random() < 0.3 ? "video" : "voice");
  });

  /* ============================================================
    ESCAPE
    One listener, one explicit order. Three separate listeners used
    to race: the panel's ran before the menu's, so Escape on an open
    menu tore down the whole panel with it.
    ============================================================ */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    // 1. innermost first
    if (menuAnchor) {
      const anchor = menuAnchor;
      closeMenu();
      anchor.focus({ preventScroll: true });
      return;
    }
    // 2. the new-chat panel
    if (panelOpen) {
      closePanel();
      return;
    }
    // 3. a live call — but never from inside a text field, where
    //    Escape means "clear this input"
    const inField =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement;
    if (call && !inField) {
      endCall(
        call.direction === "in" && !call.answered ? "declined" : "hangup",
      );
    }
  });

  /* ============================================================
    FIREBASE
    The conversation list becomes a projection of the chats
    collection, and the open thread a projection of its messages
    subcollection. Everything above keeps rendering the same shapes it
    always did.
    ============================================================ */
  function onChats(list) {
    // Replace in place: `chats` is closed over all over this file.
    chats.length = 0;
    list.forEach((c) => chats.push(c));

    if (chats.length) {
      let chat = chatByName(current);
      if (!chat) {
        // Whatever we were looking at is not in the collection —
        // fall back to the newest conversation.
        chat = chats[0];
        current = chat.name;
        watchCurrent();
      }
      chat.unread = 0;
      paintHeader(chat);
    }

    dropHits();
    renderChats();
  }

  /* ============================================================
    CLOUD MESSAGING
    The token half only. Sending is a Cloud Function — see
    functions/index.js — because FCM will not deliver on a credential
    a browser is allowed to hold.
    ============================================================ */
  let pushReady = false; // supported, configured, secure context

  /* Extra entry on the chat-list menu. A permission prompt needs a user
     gesture, and the menu is the only one the sidebar has. */
  function notifyItem() {
    if (!pushReady) return [];

    const state = push.permission();

    if (state === "granted")
      return [
        {
          icon: "notifications_active",
          label: "Notifikasi aktif",
          run: () => say("Notifikasi sudah aktif untuk perangkat ini"),
        },
      ];

    if (state === "denied")
      return [
        {
          icon: "notifications_off",
          label: "Notifikasi diblokir",
          run: () => say("Izinkan notifikasi lewat setelan situs di browser"),
        },
      ];

    return [
      {
        icon: "notifications",
        label: "Aktifkan notifikasi",
        // No busy() spinner here: the prompt needs the click's user
        // activation, and that does not survive a timeout.
        run: askPush,
      },
    ];
  }

  async function askPush() {
    try {
      const res = await push.enable();
      say(
        res.ok
          ? "Notifikasi aktif untuk perangkat ini"
          : res.reason === "denied"
            ? "Notifikasi ditolak"
            : "Notifikasi tidak tersedia di browser ini",
      );
      if (res.ok) listenPush();
    } catch (err) {
      console.error("[fcm] enable", err);
      say("Gagal mengaktifkan notifikasi");
    }
  }

  /* A push that lands while the tab is focused shows no OS notification,
     so surface it here — unless the user is already reading that very
     conversation, where the message is on screen anyway. */
  let pushBound = false;

  function listenPush() {
    if (pushBound) return;
    pushBound = true;

    push.onPush((data) => {
      if (data.chat && data.chat === current) return;
      say(`${data.title || "Pesan baru"}: ${data.body || ""}`);
      announce(`${data.title || "Pesan baru"}: ${data.body || ""}`);
    });
  }

  async function bootPush() {
    pushReady = await push.available();
    if (!pushReady) return;

    // Already granted on a previous visit: refresh the token quietly.
    // Tokens rotate, and a stale one is a silent delivery failure.
    if (push.permission() !== "granted") return;
    const res = await push.enable({ ask: false });
    if (res.ok) listenPush();
  }

  /* Opened from a notification click. */
  function openFromLink(name) {
    if (!name) return;
    const chat = chatByName(name);
    if (chat) openChat(chat.name);
  }

  async function boot() {
    if (!fb.configured) {
      say("Mode lokal — isi firebase-config.js untuk sinkronisasi");
      return;
    }
    try {
      await fb.connect();
      await fb.seedIfEmpty(CHATS, MESSAGES);
      remote = true;
      watchCurrent(); // registers the open chat before the list arrives
      fb.watchChats(onChats);
      say(`Terhubung sebagai ${fb.whoami().name}`);
    } catch (err) {
      console.error("[firebase] connect", err);
      remote = false;
      say("Firebase tidak tersambung — memakai data lokal");
      return;
    }

    push.onNotificationClick(openFromLink);
    bootPush().catch((err) => console.error("[fcm] boot", err));

    // A cold start from a notification arrives as ?chat=…
    const wanted = new URLSearchParams(location.search).get("chat");
    if (wanted) setTimeout(() => openFromLink(wanted), 0);
  }

  renderChats();
  renderThread(current);
  boot();
})();
