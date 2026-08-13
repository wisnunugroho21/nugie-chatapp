(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Elements ---------- */
  const paneToggle = $("#pane-toggle");
  const chatList = $(".chat-list");
  const thread = $("#chat_thread");
  const headName = $(".ch-name");
  const headSub = $(".ch-sub");
  const headAvatar = $("#chatAvatar");
  const msgInput = $(".msg-input");
  const sendBtn = $(".btn-send");

  const panel = $("#newChat");
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
    paneToggle.checked = true; // shows the chat pane on narrow screens
    msgInput.focus({ preventScroll: true });
  }

  chatList.addEventListener("click", (e) => {
    const item = e.target.closest(".chat-item");
    if (item) openChat(item);
  });

  $("#btnBack").addEventListener("click", () => (paneToggle.checked = false));

  /* ---------- Create / reuse a chat list item ---------- */
  function ensureChatItem({ name, av, sub, preview }) {
    let item = byName(name);
    if (item) {
      chatList.prepend(item);
      return item;
    }
    item = document.createElement("label");
    item.className = "chat-item";
    item.setAttribute("role", "listitem");
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
  const selected = new Map(); // name -> contact

  function openPanel(group) {
    groupMode = !!group;
    selected.clear();
    ncSearch.value = "";
    ncGroupName.value = "";
    panel.classList.toggle("group-mode", groupMode);
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    ncTitle.textContent = groupMode ? "New group" : "New chat";
    ncSub.textContent = groupMode
      ? "Add members, then name the group"
      : "Pick someone to message";
    renderChips();
    renderContacts();
    setTimeout(() => ncSearch.focus({ preventScroll: true }), 180);
  }

  function closePanel() {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
  }

  $("#btnNewChat").addEventListener("click", () => openPanel(false));
  $("#ncBack").addEventListener("click", () => {
    if (groupMode) openPanel(false);
    else closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) closePanel();
  });

  function contactRow(c) {
    const sel = selected.has(c.name) ? " sel" : "";
    return `
            <button class="contact${sel}" type="button" data-contact="${esc(c.name)}">
                <div class="avatar ${c.av}">${esc(initials(c.name))}</div>
                <div class="c-body">
                    <div class="c-name">${esc(c.name)}</div>
                    <div class="c-about">${esc(c.about)}</div>
                </div>
                <span class="c-check material-symbols-outlined">check</span>
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
      btn.classList.toggle("sel", selected.has(c.name));
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
  function renderChips() {
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
    ncSub.textContent = groupMode
      ? selected.size
        ? `${selected.size} of ${CONTACTS.length} selected`
        : "Add members, then name the group"
      : "Pick someone to message";
    ncCreate.disabled = selected.size < 1;
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
