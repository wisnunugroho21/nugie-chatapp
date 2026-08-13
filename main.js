(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Elements ---------- */
  const sidebar = $(".sidebar");
  const chatPane = $(".chat");
  const chatList = $(".chat-list");
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

  const byName = (n) =>
    chatList.querySelector(`.chat-item[data-name="${CSS.escape(n)}"]`);

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

  /* ---------- Thread store ---------- */
  let current = "Dispatch Armada";
  const threads = new Map([[current, thread.innerHTML]]);

  const emptyThread = (name) => `
        <div class="pill">Today</div>
        <div class="pill notice">Messages are end-to-end encrypted. No one outside this chat can read them.</div>
        <div class="empty-note">
            <span class="material-symbols-outlined">forum</span>
            <p>Belum ada pesan dengan <b>${esc(name)}</b>. Tulis sesuatu di bawah untuk memulai.</p>
        </div>`;

  /* ---------- Chat switching ---------- */
  function openChat(item) {
    if (!item) return;
    threads.set(current, thread.innerHTML);

    const name = item.dataset.name;
    const av = item.querySelector(".avatar");

    $$(".chat-item", chatList).forEach((el) =>
      el.classList.remove("is-active"),
    );
    item.classList.add("is-active", "was-read");
    item.classList.remove("is-unread");
    const badge = item.querySelector(".badge");
    if (badge) badge.remove();
    item.querySelector(".ci-time").style.color = "";

    headName.textContent = name;
    headSub.textContent = item.dataset.sub || "online";
    headAvatar.className =
      "avatar " + (av.className.match(/a[1-6]/) || ["a1"])[0];
    headAvatar.textContent = av.textContent.trim();

    thread.innerHTML = threads.get(name) || emptyThread(name);
    thread.scrollTop = thread.scrollHeight;

    current = name;
    showPane("chat");
    msgInput.focus({ preventScroll: true });
  }

  chatList.addEventListener("click", (e) => {
    const item = e.target.closest(".chat-item");
    if (item) openChat(item);
  });

  chatList.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest(".chat-item");
    if (!item) return;
    e.preventDefault();
    openChat(item);
  });

  $("#btnBack").addEventListener("click", () => showPane("list"));

  /* ---------- Create / reuse a chat list item ---------- */
  function ensureChatItem({ name, av, sub, preview }) {
    let item = byName(name);
    if (item) {
      chatList.prepend(item);
      return item;
    }
    item = document.createElement("div");
    item.className = "chat-item";
    item.setAttribute("role", "listitem");
    item.tabIndex = 0;
    item.dataset.name = name;
    item.dataset.sub = sub || "online";
    item.innerHTML = `
            <div class="avatar ${av}">${esc(initials(name))}</div>
            <div class="ci-body">
                <div class="ci-name">${esc(name)}</div>
                <div class="ci-time">${now()}</div>
                <div class="ci-msg"><span>${esc(preview || "Draft")}</span></div>
                <div class="ci-meta"></div>
            </div>`;
    chatList.prepend(item);
    return item;
  }

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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panelOpen) closePanel();
  });

  function contactRow(c) {
    const picked = groupMode && selected.has(c.name);
    return `
            <button class="contact${picked ? " sel" : ""}" type="button"
                    aria-pressed="${picked}" data-contact="${esc(c.name)}">
                <div class="avatar ${c.av}">${esc(initials(c.name))}</div>
                <div class="c-body">
                    <div class="c-name">${esc(c.name)}</div>
                    <div class="c-about">${esc(c.about)}</div>
                </div>
                ${picked ? '<span class="c-check material-symbols-outlined">check</span>' : ""}
            </button>`;
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

  ncList.addEventListener("click", (e) => {
    const btn = e.target.closest(".contact");
    if (!btn) return;

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

  function startChat(c) {
    const item = ensureChatItem({
      name: c.name,
      av: c.av,
      sub: c.about,
      preview: "Draft",
    });
    closePanel();
    openChat(item);
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
      btn.appendChild(span);
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
    const item = ensureChatItem({
      name,
      av: "a2",
      sub: "You, " + members.map((m) => m.name.split(" ")[0]).join(", "),
      preview: "You created this group",
    });
    closePanel();
    openChat(item);
  });

  ncGroupName.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !ncCreate.disabled) ncCreate.click();
  });

  /* ---------- Sending ---------- */
  function send() {
    const text = msgInput.value.trim();
    if (!text) return;

    const note = thread.querySelector(".empty-note");
    if (note) note.remove();

    const rows = thread.querySelectorAll(".row");
    const last = rows[rows.length - 1];
    const first = !last || !last.classList.contains("out");
    const time = now();

    const row = document.createElement("div");
    row.className = "row out" + (first ? " first" : "");
    row.innerHTML = `
            <div class="bubble">
                <div class="text">${esc(text)}
                    <span class="meta">${time}
                        <span class="material-symbols-outlined">done_all</span>
                    </span>
                </div>
            </div>`;
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;

    const item = byName(current);
    if (item) {
      item.querySelector(".ci-msg").innerHTML =
        `<span class="material-symbols-outlined">done_all</span><span>${esc(text)}</span>`;
      item.querySelector(".ci-time").textContent = time;
      chatList.prepend(item);
    }

    msgInput.value = "";
    msgInput.focus({ preventScroll: true });
  }

  sendBtn.addEventListener("click", send);
  msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });

  thread.scrollTop = thread.scrollHeight;
})();
