(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Elements ---------- */
  const sidebar = $(".sidebar");
  const chatPane = $(".chat");
  const chatList = $(".chat-list");
  const chatSearch = $("#chatSearch");
  const chatSearchClear = $("#chatSearchClear");
  const filters = $(".filters");
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
    applySearch();
    msgInput.focus({ preventScroll: true });
  }

  chatList.addEventListener("click", (e) => {
    const item = e.target.closest(".chat-item");
    if (!item) return;

    const kebab = e.target.closest(".row-menu");
    if (kebab) {
      e.stopPropagation();
      rowMenu(kebab, item);
      return;
    }
    openChat(item);
  });

  chatList.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest(".chat-item");
    if (!item) return;
    e.preventDefault();
    openChat(item);
  });

  $("#btnBack").addEventListener("click", () => showPane("list"));

  /* ============================================================
    SEARCHING EXISTING CONVERSATIONS
    ============================================================ */

  /* Each row keeps its own plain text in datasets, so the list can be
       repainted with highlights and restored without losing anything. */
  function indexItem(item) {
    const msgEl = item.querySelector(".ci-msg");
    const icon = msgEl.querySelector(".material-symbols-outlined");
    const textSpan = $$("span", msgEl).find(
      (s) => !s.classList.contains("material-symbols-outlined"),
    );
    item.dataset.icon = icon ? icon.textContent.trim() : "";
    item.dataset.preview = (textSpan ? textSpan.textContent : "")
      .replace(/\s+/g, " ")
      .trim();

    if (!item.querySelector(".row-menu")) {
      const kebab = document.createElement("button");
      kebab.type = "button";
      kebab.className = "row-menu";
      kebab.setAttribute("aria-label", `Options for ${item.dataset.name}`);
      kebab.setAttribute("aria-haspopup", "menu");
      kebab.setAttribute("aria-expanded", "false");
      kebab.innerHTML =
        '<span class="material-symbols-outlined">more_vert</span>';
      item.appendChild(kebab);
    }
  }

  $$(".chat-item", chatList).forEach(indexItem);

  function setPreview(item, text, icon) {
    item.dataset.preview = text;
    item.dataset.icon = icon || "";
  }

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

    const html = name === current ? thread.innerHTML : threads.get(name);
    let hits = 0;
    if (html) {
      const box = document.createElement("div");
      box.innerHTML = html;
      hits = $$(".text", box).filter((t) =>
        t.textContent.toLowerCase().includes(q),
      ).length;
    }
    hitCache.map.set(name, hits);
    return hits;
  }

  function paintItem(item, q, hits) {
    const msgEl = item.querySelector(".ci-msg");
    const preview = item.dataset.preview || "";
    const inPreview = q && preview.toLowerCase().includes(q);

    item.querySelector(".ci-name").innerHTML = highlight(item.dataset.name, q);

    if (q && !inPreview && hits) {
      msgEl.innerHTML = `<span class="ci-hits">${hits} pesan cocok</span>`;
      return;
    }
    const icon = item.dataset.icon
      ? `<span class="material-symbols-outlined">${esc(item.dataset.icon)}</span>`
      : "";
    msgEl.innerHTML = `${icon}<span>${highlight(preview, q)}</span>`;
  }

  const emptyRow = document.createElement("div");
  emptyRow.className = "list-empty";
  emptyRow.style.display = "none";
  chatList.appendChild(emptyRow);

  let activeFilter = "All";

  function applySearch() {
    const raw = chatSearch.value.trim();
    const q = raw.toLowerCase();
    const unreadOnly = activeFilter === "Unread";
    chatSearchClear.style.display = chatSearch.value ? "grid" : "none";

    let shown = 0;
    $$(".chat-item", chatList).forEach((item) => {
      const hits = q ? messageHits(item.dataset.name, q) : 0;
      const matches =
        !q ||
        item.dataset.name.toLowerCase().includes(q) ||
        (item.dataset.preview || "").toLowerCase().includes(q) ||
        hits > 0;
      const passesFilter = !unreadOnly || item.classList.contains("is-unread");
      const visible = matches && passesFilter;

      item.style.display = visible ? "flex" : "none";
      if (visible) {
        paintItem(item, q, hits);
        shown++;
      }
    });

    if (shown) {
      emptyRow.style.display = "none";
      emptyRow.innerHTML = "";
    } else {
      emptyRow.style.display = "block";
      emptyRow.innerHTML = q
        ? `Tidak ada chat yang cocok dengan <b>${esc(raw)}</b>.
                   <br />Cari nama lain, atau mulai percakapan baru.
                   <br /><button type="button" id="emptyNewChat">Start a new chat</button>`
        : "Belum ada chat yang belum dibaca.";
    }
    // The empty row must always sit last, even after chats are reordered.
    chatList.appendChild(emptyRow);
  }

  chatSearch.addEventListener("input", applySearch);

  chatSearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      chatSearch.value = "";
      applySearch();
      return;
    }
    if (e.key === "Enter") {
      // Jump straight into the top result.
      const first = $$(".chat-item", chatList).find(
        (el) => el.style.display !== "none",
      );
      if (first) openChat(first);
    }
  });

  chatSearchClear.addEventListener("click", () => {
    chatSearch.value = "";
    applySearch();
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
    activeFilter = chip.textContent.trim();
    applySearch();
  });

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
    indexItem(item);
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
      setPreview(item, text, "done_all");
      item.querySelector(".ci-time").textContent = time;
      chatList.prepend(item);
    }

    hitCache = { q: null, map: new Map() }; // thread changed
    applySearch(); // repaint previews / re-run any live search

    msgInput.value = "";
    msgInput.focus({ preventScroll: true });
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

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !menuAnchor) return;
    const anchor = menuAnchor;
    closeMenu();
    anchor.focus({ preventScroll: true });
    e.stopImmediatePropagation(); // don't also hang up a call
  });

  window.addEventListener("resize", closeMenu);
  chatList.addEventListener("scroll", closeMenu);

  /* Spin the button while the "fetch" is in flight. This is where a
       real reload would await the server. */
  function busy(anchor, run) {
    const icon = anchor.querySelector(".material-symbols-outlined");
    const was = icon.textContent;
    icon.textContent = "progress_activity";
    icon.classList.add("spin");
    anchor.disabled = true;
    setTimeout(() => {
      icon.textContent = was;
      icon.classList.remove("spin");
      anchor.disabled = false;
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
            threads.set(current, thread.innerHTML);
            thread.innerHTML = threads.get(current) || emptyThread(current);
            thread.scrollTop = thread.scrollHeight;
            hitCache = { q: null, map: new Map() };
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
            $$(".chat-item", chatList).forEach(indexItem);
            hitCache = { q: null, map: new Map() };
            applySearch();
            say("Daftar chat dimuat ulang");
          }),
      },
    ]);
  });

  /* --- One conversation row --- */
  function rowMenu(anchor, item) {
    openMenu(anchor, [
      {
        ...REFRESH,
        run: (a) =>
          busy(a, () => {
            indexItem(item);
            hitCache = { q: null, map: new Map() };
            applySearch();
            say(`${item.dataset.name} dimuat ulang`);
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
    const item = byName(name);
    if (item) {
      const av = item.querySelector(".avatar");
      return {
        av: (av.className.match(/a[1-6]/) || ["a1"])[0],
        initials: av.textContent.trim(),
      };
    }
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
    at(connect, 4200);
  }

  /* ---------- Incoming ---------- */
  function ringIncoming(name, kind) {
    if (call) return;
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
    connect();
  }

  function connect() {
    clearStage();
    call.connected = true;
    call.secs = 0;
    setStatus(duration(0));
    clearInterval(ticker);
    ticker = setInterval(() => {
      call.secs++;
      setStatus(duration(call.secs));
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
    call = null;
    logCall(name, {
      kind,
      missed: !connected,
      text: connected
        ? `${kind === "video" ? "Video" : "Voice"} call · ${duration(secs)}`
        : `Cancelled ${kind} call`,
      preview: connected ? duration(secs) : "",
    });
    at(closeOverlay, reduceMotion.matches ? 0 : 850);
  }

  /* ---------- Call log in the thread + chat list ---------- */
  function logCall(name, { kind, text, missed, preview }) {
    const icon = missed
      ? "phone_missed"
      : kind === "video"
        ? "videocam"
        : "call";
    const html = `<div class="pill call-log${missed ? " missed" : ""}">
                <span class="material-symbols-outlined">${icon}</span>${esc(text)} · ${now()}
            </div>`;

    if (name === current) {
      const note = thread.querySelector(".empty-note");
      if (note) note.remove();
      thread.insertAdjacentHTML("beforeend", html);
      thread.scrollTop = thread.scrollHeight;
    } else {
      const box = document.createElement("div");
      box.innerHTML = threads.get(name) || emptyThread(name);
      const note = box.querySelector(".empty-note");
      if (note) note.remove();
      box.insertAdjacentHTML("beforeend", html);
      threads.set(name, box.innerHTML);
    }

    const item = byName(name);
    if (item) {
      setPreview(item, preview || text, icon);
      item.querySelector(".ci-time").textContent = now();
      chatList.prepend(item);
      if (missed) markUnread(item);
    }
    hitCache = { q: null, map: new Map() };
    applySearch();
  }

  function markUnread(item) {
    if (item.classList.contains("is-active")) return;
    item.classList.add("is-unread");
    const meta = item.querySelector(".ci-meta");
    let badge = meta.querySelector(".badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "0";
      meta.appendChild(badge);
    }
    badge.textContent = String((Number(badge.textContent) || 0) + 1);
    item.querySelector(".ci-time").style.color = "var(--accent)";
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
    const rows = $$(".chat-item", chatList);
    const from =
      (rows[Math.floor(Math.random() * rows.length)] || {}).dataset?.name ||
      current;
    ringIncoming(from, Math.random() < 0.3 ? "video" : "voice");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !call) return;
    endCall(call.direction === "in" && !call.answered ? "declined" : "hangup");
  });

  applySearch();
  thread.scrollTop = thread.scrollHeight;
})();
