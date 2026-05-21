function todayIso() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const state = {
  data: null,
  page: "dashboard",
  selected: new Set(),
  search: "",
  autoScanRunning: false,
  autoScanWarningShown: false,
  copyShipment: "",
  copyColumn: "",
  copySelectedText: "",
  billingMonth: "",
  columnOrder: [],
  dragColumnKey: "",
  detailShipment: "",
  departedDate: todayIso(),
  departedSearch: "",
  unloadReminderShownKey: "",
  adminUsers: [],
  adminUsersLoaded: false,
  actionDockDrag: null,
  actionDockSuppressClick: false,
};

const COLUMN_ORDER_STORAGE_KEY = "vtech.columnOrder.v1";
const ACTION_DOCK_STORAGE_KEY = "vtech.actionDockPosition.v1";
const PRIMARY_GROUP_KEYS = [
  "verify",
  "openGroupage",
  "openDirect",
  "plannedCustomer",
  "plannedGroupage",
  "departed",
  "confirmedFtl",
  "delivered",
  "deleted",
];
const BILLING_GROUP_KEYS = PRIMARY_GROUP_KEYS.filter(key => key !== "deleted");

const pageMeta = {
  dashboard: {
    title: "Dashboard operativa",
    subtitle: "Oggi cosa devo fare",
    sections: [],
  },
  planning: {
    title: "Pianificazione",
    subtitle: "Da verificare, da pianificare e richieste pronte",
    sections: [
      ["verify", "Da verificare"],
      ["openGroupage", "Groupage BRT da pianificare"],
      ["openDirect", "FTL/LTL da pianificare"],
      ["plannedGroupage", "Groupage pianificato"],
      ["plannedCustomer", "FTL pianificato / richiesta inviata"],
    ],
  },
  groupage: {
    title: "Groupage",
    subtitle: "Comunicazioni Bartolini da inviare e gia inviate",
    sections: [
      ["plannedGroupage", "Da comunicare a Bartolini"],
      ["departed", "Comunicate a Bartolini"],
    ],
  },
  ftl: {
    title: "FTL",
    subtitle: "Richieste vettore da seguire e FTL confermati",
    sections: [
      ["plannedCustomer", "Da comunicare / richiesta vettore"],
      ["confirmedFtl", "Confermati / scarichi da seguire"],
      ["delivered", "Consegnate / XML generati"],
    ],
  },
  deleted: {
    title: "Spedizioni eliminate",
    subtitle: "Righe cancellate definitivamente, recuperabili se servono di nuovo",
    sections: [["deleted", "Spedizioni eliminate"]],
  },
  registry: {
    title: "Anagrafica clienti",
    subtitle: "Clienti classificati GDO per consegne e calcolo extra BRT",
    sections: [],
  },
  billing: {
    title: "Fatturazione",
    subtitle: "Andamento attivo, passivo e GP mese per mese",
    sections: [],
  },
  admin: {
    title: "Admin",
    subtitle: "Profili, ruoli e accessi al gestionale online",
    sections: [],
  },
};

const metricConfig = [
  ["verify", "Da verificare", "DV", "wave da verificare", "#6366f1"],
  ["planning", "Da pianificare", "SP", "groupage e FTL aperti", "#2f7cff"],
  ["mailReady", "Mail groupage", "MG", "pronte per BRT", "#8b5cf6"],
  ["ftlAwaiting", "FTL attesa", "FT", "richieste vettore inviate", "#06b6d4"],
  ["unloadToday", "Scarichi oggi", "SC", "FTL da seguire oggi", "#f59e0b"],
  ["slaBreaches", "Alert SLA", "SL", "spedizioni fuori contratto", "#ef4444"],
  ["margin", "Margine stimato", "EU", "attivo meno passivo", "#14b8a6"],
];

const els = {
  content: document.querySelector("#content"),
  metrics: document.querySelector("#metrics"),
  pageTitle: document.querySelector("#pageTitle"),
  pageSubtitle: document.querySelector("#pageSubtitle"),
  selectionInfo: document.querySelector("#selectionInfo"),
  actionMenuCount: document.querySelector("#actionMenuCount"),
  searchInput: document.querySelector("#searchInput"),
  refreshTopBtn: document.querySelector("#refreshTopBtn"),
  toast: document.querySelector("#toast"),
  carrierDialog: document.querySelector("#carrierDialog"),
  carrierSelect: document.querySelector("#carrierSelect"),
  serviceLevelBtn: document.querySelector("#serviceLevelBtn"),
  serviceLevelDialog: document.querySelector("#serviceLevelDialog"),
  serviceLevelSelect: document.querySelector("#serviceLevelSelect"),
  activeUrgentBtn: document.querySelector("#activeUrgentBtn"),
  activeUrgentDialog: document.querySelector("#activeUrgentDialog"),
  manualPassiveBtn: document.querySelector("#manualPassiveBtn"),
  manualPassiveDialog: document.querySelector("#manualPassiveDialog"),
  manualPassiveInput: document.querySelector("#manualPassiveInput"),
  manualPalletsBtn: document.querySelector("#manualPalletsBtn"),
  manualPalletsDialog: document.querySelector("#manualPalletsDialog"),
  manualPalletsInput: document.querySelector("#manualPalletsInput"),
  unloadDateBtn: document.querySelector("#unloadDateBtn"),
  unloadDateDialog: document.querySelector("#unloadDateDialog"),
  unloadDateInput: document.querySelector("#unloadDateInput"),
  mailPanel: document.querySelector("#mailPanel"),
  mailDate: document.querySelector("#mailDate"),
  mailBtn: document.querySelector("#mailBtn"),
  ftlMailPanel: document.querySelector("#ftlMailPanel"),
  ftlMailBtn: document.querySelector("#ftlMailBtn"),
  ftlReminderPanel: document.querySelector("#ftlReminderPanel"),
  confirmedBtn: document.querySelector("#confirmedBtn"),
  departedBtn: document.querySelector("#departedBtn"),
  deliveredBtn: document.querySelector("#deliveredBtn"),
  restoreDeletedBtn: document.querySelector("#restoreDeletedBtn"),
  purgeDeletedBtn: document.querySelector("#purgeDeletedBtn"),
  shipmentToolbar: document.querySelector("#shipmentToolbar"),
  operationBar: document.querySelector("#operationBar"),
  detailPanel: document.querySelector("#detailPanel"),
  heroTrend: document.querySelector("#heroTrend"),
  sourceStrip: document.querySelector(".source-strip"),
  departedFilters: document.querySelector("#departedFilters"),
  departedDateFilter: document.querySelector("#departedDateFilter"),
  departedSearchInput: document.querySelector("#departedSearchInput"),
  todayDepartedFilter: document.querySelector("#todayDepartedFilter"),
  clearDepartedFilters: document.querySelector("#clearDepartedFilters"),
  departedSelectionInfo: document.querySelector("#departedSelectionInfo"),
  vtechPath: document.querySelector("#vtechPath"),
  activePath: document.querySelector("#activePath"),
  brtPath: document.querySelector("#brtPath"),
  reportUpload: document.querySelector("#reportUpload"),
  activeUpload: document.querySelector("#activeUpload"),
  brtUpload: document.querySelector("#brtUpload"),
  reportUploadBtn: document.querySelector("#reportUploadBtn"),
  activeUploadBtn: document.querySelector("#activeUploadBtn"),
  brtUploadBtn: document.querySelector("#brtUploadBtn"),
  deletedBox: document.querySelector("#deletedBox"),
  deletedCount: document.querySelector("#deletedCount"),
  currentUser: document.querySelector("#currentUser"),
  logoutBtn: document.querySelector("#logoutBtn"),
};

const copyMenu = document.createElement("div");
copyMenu.className = "copy-menu";
copyMenu.hidden = true;
document.body.appendChild(copyMenu);

function showToast(message, options = {}) {
  els.toast.dataset.openPath = options.openPath || "";
  els.toast.dataset.downloadUrl = options.downloadUrl || "";
  const hasAction = Boolean(options.openPath || options.downloadUrl);
  els.toast.classList.toggle("clickable", hasAction);
  els.toast.innerHTML = hasAction
    ? `<span>${escapeHtml(message)}</span><strong>${options.downloadUrl ? "Scarica" : "Apri Download"}</strong>`
    : `<span>${escapeHtml(message)}</span>`;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show", "clickable");
    els.toast.dataset.openPath = "";
    els.toast.dataset.downloadUrl = "";
  }, hasAction ? 9000 : 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  if (response.status === 401) {
    window.location.href = "/login.html";
    throw new Error("Accesso richiesto.");
  }
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (_error) {
    throw new Error("Il server web locale non e aggiornato: chiudi la finestra di avvio e riapri avvia_vtech_web.bat.");
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "Operazione non riuscita.");
  }
  return payload;
}

async function loadData({ renderPage = true } = {}) {
  const response = await fetch("/api/shipments", { cache: "no-store" });
  if (response.status === 401) {
    window.location.href = "/login.html";
    return;
  }
  const raw = await response.text();
  try {
    applyData(JSON.parse(raw), { renderPage });
  } catch (_error) {
    throw new Error("Il server web locale non e aggiornato: chiudi la finestra di avvio e riapri avvia_vtech_web.bat.");
  }
}

function applyData(data, { renderPage = true, keepSelection = true } = {}) {
  state.data = data;
  const user = state.data.auth?.user || {};
  document.body.dataset.role = user.role || "";
  if (els.currentUser) {
    const roleLabel = state.data.auth?.billingOnly ? "Fatturazione" : "Accesso completo";
    els.currentUser.textContent = `${user.displayName || user.username || "Utente"} - ${roleLabel}`;
  }
  const autoChip = document.querySelector(".auto-chip span");
  if (autoChip && state.data.auth?.cloudMode) {
    autoChip.textContent = "upload manuale";
  }
  if (state.data.auth?.billingOnly) {
    state.page = "billing";
  }
  els.vtechPath.value = state.data.paths.vtech || "";
  els.activePath.value = state.data.paths.active || "";
  els.brtPath.value = state.data.paths.brt || "";
  state.columnOrder = normalizeColumnOrder(state.columnOrder.length ? state.columnOrder : readColumnOrder());
  state.selected = keepSelection ? new Set(existingShipments(selectedShipments())) : new Set();
  if (renderPage) render();
}

function render() {
  if (!state.data) return;
  if (state.data.auth?.billingOnly && state.page !== "billing") {
    state.page = "billing";
  }
  if (!pageMeta[state.page]) state.page = "dashboard";
  const meta = pageMeta[state.page];
  const isBilling = state.page === "billing";
  const isDashboard = state.page === "dashboard";
  const isGroupage = state.page === "groupage";
  const isPlanning = state.page === "planning";
  const isDeleted = state.page === "deleted";
  const isRegistry = state.page === "registry";
  const isFtl = state.page === "ftl";
  const isAdmin = state.page === "admin";
  els.pageTitle.textContent = meta.title;
  els.pageSubtitle.textContent = meta.subtitle;
  els.sourceStrip.hidden = true;
  els.mailPanel.hidden = !isGroupage;
  els.ftlMailPanel.hidden = !isFtl;
  els.ftlReminderPanel.hidden = !isFtl;
  els.departedFilters.hidden = !(isGroupage || isFtl);
  els.departedDateFilter.value = state.departedDate;
  els.departedSearchInput.value = state.departedSearch;
  els.shipmentToolbar.hidden = isBilling || isDashboard || isAdmin;
  els.selectionInfo.hidden = isRegistry || isAdmin;
  els.operationBar.hidden = isBilling || isRegistry || isAdmin || isDashboard;
  els.confirmedBtn.hidden = !isFtl;
  els.departedBtn.hidden = !isGroupage;
  els.deliveredBtn.hidden = !isFtl;
  els.restoreDeletedBtn.hidden = !isDeleted;
  els.purgeDeletedBtn.hidden = !isDeleted;
  document.querySelector("#carrierBtn").hidden = isDeleted || isRegistry;
  els.serviceLevelBtn.hidden = isDeleted || isRegistry;
  els.activeUrgentBtn.hidden = isDeleted || isRegistry;
  els.manualPassiveBtn.hidden = isDeleted || isRegistry;
  els.manualPalletsBtn.hidden = !isGroupage;
  els.unloadDateBtn.hidden = !isFtl;
  document.querySelector('[data-action="planned"]').hidden = isDeleted || isRegistry;
  document.querySelector('[data-action="unplanned"]').hidden = isDeleted || isRegistry;
  document.querySelector('[data-action="delete"]').hidden = isDeleted || isRegistry;
  els.metrics.hidden = !isDashboard;
  els.detailPanel.hidden = true;
  document.querySelector("#importBtn").hidden = true;
  renderSidebarStats();
  renderHeroTrend();
  renderMetrics();
  if (isDashboard) {
    renderDashboard();
  } else if (isBilling) {
    renderBilling();
  } else if (isRegistry) {
    renderRegistry();
  } else if (isAdmin) {
    renderAdmin();
  } else if (isPlanning) {
    renderPlanningWorkspace();
  } else {
    renderFtlReminderPanel();
    renderSections();
  }
  notifyUnloadDueToday();
  updateSelection();
  renderSidebarBadges();
  document.querySelectorAll(".nav-item").forEach((button) => {
    const adminOnly = button.dataset.page === "admin";
    button.hidden = Boolean(
      (state.data.auth?.billingOnly && button.dataset.page !== "billing") ||
      (adminOnly && !state.data.auth?.canAdmin)
    );
    button.classList.toggle("active", button.dataset.page === state.page);
  });
  els.deletedBox.hidden = Boolean(state.data.auth?.billingOnly);
  els.deletedBox.classList.toggle("active", isDeleted);
}

function renderSidebarStats() {
  if (!els.deletedCount) return;
  els.deletedCount.textContent = String(state.data?.kpis?.deleted || 0);
}

function sidebarBadgeCount(page) {
  const groups = state.data?.groups || {};
  if (page === "planning") return rowsCount("verify") + rowsCount("openGroupage") + rowsCount("openDirect");
  if (page === "groupage") return rowsCount("plannedGroupage");
  if (page === "ftl") return rowsCount("plannedCustomer") + rowsCount("unloadToday");
  if (page === "dashboard") return rowsCount("verify") + rowsCount("openGroupage") + rowsCount("openDirect") + rowsCount("slaBreaches");
  return 0;
}

function renderSidebarBadges() {
  document.querySelectorAll(".nav-item").forEach(button => {
    const count = sidebarBadgeCount(button.dataset.page);
    button.querySelector(".nav-badge")?.remove();
    button.classList.toggle("has-alert", count > 0);
    if (count > 0) {
      button.insertAdjacentHTML("beforeend", `<span class="nav-badge">${escapeHtml(String(count))}</span>`);
    }
  });
}

function clearDetail() {
  state.detailShipment = "";
  els.detailPanel.innerHTML = `
    <strong>Dettaglio spedizione</strong>
    <p>Seleziona una riga per vedere extra, note e tariffa applicata.</p>
  `;
}

function renderMetrics() {
  const kpis = state.data.kpis;
  els.metrics.innerHTML = metricConfig.map(([key, label, icon, hint, accent]) => `
    <article class="metric" style="--accent:${accent}">
      <div class="icon">${icon}</div>
      <div class="label">${label}</div>
      <div class="value">${kpis[key]}</div>
      <div class="hint">${hint}</div>
      <div class="bar"></div>
    </article>
  `).join("");
}

function rowsCount(groupKey) {
  return (state.data?.groups?.[groupKey] || []).length;
}

function renderDashboardMiniRows(rows, emptyText = "Nessuna spedizione.") {
  const sample = rows.slice(0, 5);
  if (!sample.length) return `<div class="dashboard-empty">${escapeHtml(emptyText)}</div>`;
  return `
    <div class="dashboard-mini-list">
      ${sample.map(row => `
        <div class="dashboard-mini-row">
          <strong>${escapeHtml(row.display["Shipment"] || row.raw["Shipment"] || row.shipment)}</strong>
          <span>${escapeHtml(row.display["Route to Customer"] || row.raw["Route to Customer"] || "-")}</span>
          <em>${escapeHtml(row.display["Provincia"] || row.raw["Provincia"] || "")}</em>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDashboard() {
  const groups = state.data?.groups || {};
  const kpis = state.data?.kpis || {};
  const report = state.data?.dashboard?.lastReport || {};
  const currentMonth = monthKey(new Date());
  const monthRows = billingRows().filter(item => item.month === currentMonth);
  const monthSummary = summarizeBilling(monthRows);
  const todoCards = [
    ["Nuovi ordini da verificare", rowsCount("verify"), "Wave da verificare", "#6366f1", "planning", groups.verify || []],
    ["Spedizioni da pianificare", rowsCount("openGroupage") + rowsCount("openDirect"), "Groupage + FTL/LTL aperti", "#2563eb", "planning", [...(groups.openGroupage || []), ...(groups.openDirect || [])]],
    ["Groupage da mandare in mail", rowsCount("plannedGroupage"), "Pronte per BRT", "#8b5cf6", "groupage", groups.plannedGroupage || []],
    ["FTL in attesa conferma", rowsCount("plannedCustomer"), "Richieste vettore inviate", "#06b6d4", "ftl", groups.plannedCustomer || []],
    ["FTL con scarico oggi", rowsCount("unloadToday"), "Da seguire fino a consegna/XML", "#f59e0b", "ftl", groups.unloadToday || []],
    ["Alert SLA non rispettati", rowsCount("slaBreaches"), "Da controllare subito", "#ef4444", "planning", groups.slaBreaches || []],
  ];
  els.content.innerHTML = `
    <section class="dashboard-page">
      <div class="dashboard-command">
        <div>
          <span>Control tower di oggi</span>
          <h2>${escapeHtml(state.data?.dashboard?.today || "")}</h2>
          <p>Questa pagina deve rispondere a una domanda sola: cosa devo fare adesso?</p>
        </div>
        <div class="dashboard-report-card">
          <span>Ultimo report BO importato</span>
          <strong>${escapeHtml(report.name || "Nessun report")}</strong>
          <small>${escapeHtml(report.updatedAt || "Carica un report da Pianificazione")}</small>
        </div>
        <div class="dashboard-margin-card">
          <span>Margine stimato mese</span>
          <strong>${escapeHtml(kpis.monthMargin || moneyText(monthSummary.margin))}</strong>
          <small>Attivo ${escapeHtml(moneyText(monthSummary.active))} · Passivo ${escapeHtml(moneyText(monthSummary.passive))}</small>
        </div>
      </div>
      <div class="dashboard-todo-grid">
        ${todoCards.map(([title, value, hint, accent, page, rows]) => `
          <article class="dashboard-todo-card" style="--accent:${accent}">
            <button type="button" data-dashboard-page="${page}" aria-label="Apri ${escapeHtml(title)}">
              <span>${escapeHtml(hint)}</span>
              <strong>${escapeHtml(title)}</strong>
              <em>${value}</em>
            </button>
            ${renderDashboardMiniRows(rows)}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDashboardVerifyQueue(rows) {
  const sample = rows.slice(0, 8);
  if (!sample.length) {
    return `
      <div class="tower-clear">
        <strong>Nessun ordine da verificare</strong>
        <span>La coda principale e pulita. Puoi passare alla pianificazione o controllare gli alert.</span>
      </div>
    `;
  }
  return `
    <div class="tower-queue-list">
      ${sample.map(row => `
        <button type="button" class="tower-queue-row" data-dashboard-page="planning">
          <span class="tower-queue-id">${escapeHtml(row.shipment)}</span>
          <span class="tower-queue-main">
            <strong>${escapeHtml(rowValue(row, "Route to Customer", "Cliente non indicato"))}</strong>
            <small>${escapeHtml(rowValue(row, "Route To Address", "Indirizzo non indicato"))}</small>
          </span>
          <span class="tower-queue-facts">
            <em>${escapeHtml(rowValue(row, "Wave", "Wave n/d"))}</em>
            <em>${escapeHtml(rowValue(row, "Provincia", "Prov. n/d"))}</em>
            <em>${escapeHtml(rowValue(row, "Theoretical Pallets", "Pallet n/d"))} plt</em>
          </span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderDashboard() {
  const groups = state.data?.groups || {};
  const kpis = state.data?.kpis || {};
  const report = state.data?.dashboard?.lastReport || {};
  const currentMonth = monthKey(new Date());
  const monthRows = billingRows().filter(item => item.month === currentMonth);
  const monthSummary = summarizeBilling(monthRows);
  const verifyRows = groups.verify || [];
  const planningRows = [...(groups.openGroupage || []), ...(groups.openDirect || [])];
  const mailRows = groups.plannedGroupage || [];
  const ftlRows = groups.plannedCustomer || [];
  const slaRows = groups.slaBreaches || [];
  const todoCards = [
    ["Da pianificare", planningRows.length, "Groupage + FTL/LTL aperti", "#2563eb", "planning", planningRows],
    ["Mail BRT pronta", mailRows.length, "Groupage da inviare", "#7c3aed", "groupage", mailRows],
    ["FTL da seguire", ftlRows.length, "Richieste vettore inviate", "#0891b2", "ftl", ftlRows],
    ["Scarichi oggi", rowsCount("unloadToday"), "Conferma consegna/XML", "#d97706", "ftl", groups.unloadToday || []],
    ["Alert SLA", slaRows.length, "Da controllare subito", "#dc2626", "planning", slaRows],
  ];
  els.content.innerHTML = `
    <section class="dashboard-page">
      <div class="tower-grid">
        <section class="tower-primary">
          <div class="tower-section-head">
            <div>
              <span>Centro operativo</span>
              <h2>Ordini da verificare adesso</h2>
            </div>
            <button type="button" data-dashboard-page="planning">Apri pianificazione</button>
          </div>
          <div class="tower-primary-count">
            <strong>${verifyRows.length}</strong>
            <span>${verifyRows.length === 1 ? "ordine richiede" : "ordini richiedono"} controllo prima di assegnare vettore e stato</span>
          </div>
          ${renderDashboardVerifyQueue(verifyRows)}
        </section>

        <aside class="tower-next tower-margin-box">
          <div class="tower-section-head compact">
            <div>
              <span>Margini del mese</span>
              <h2>${escapeHtml(kpis.monthMargin || moneyText(monthSummary.margin))}</h2>
            </div>
          </div>
          <div class="tower-margin-lines">
            <div><span>Attivo</span><strong>${escapeHtml(moneyText(monthSummary.active))}</strong></div>
            <div><span>Passivo</span><strong>${escapeHtml(moneyText(monthSummary.passive))}</strong></div>
            <div><span>Report</span><strong>${escapeHtml(report.name || "Nessun report")}</strong></div>
          </div>
        </aside>
      </div>

      <div class="tower-todo-grid">
        ${todoCards.map(([title, value, hint, accent, page, rows]) => `
          <article class="tower-todo-card" style="--accent:${accent}">
            <button type="button" data-dashboard-page="${page}" aria-label="Apri ${escapeHtml(title)}">
              <span>${escapeHtml(hint)}</span>
              <strong>${escapeHtml(title)}</strong>
              <em>${value}</em>
            </button>
            ${renderDashboardMiniRows(rows)}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function unloadDateKey(row) {
  const parsed = parseDateValue(row.raw["Data Scarico Prenotato"] || row.display["Data Scarico Prenotato"]);
  if (!parsed) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function confirmedUnloadReminders() {
  const today = todayIso();
  const rows = state.data?.groups?.confirmedFtl || [];
  const dueToday = [];
  const overdue = [];
  rows.forEach(row => {
    const key = unloadDateKey(row);
    if (!key) return;
    if (key === today) dueToday.push(row);
    if (key < today) overdue.push(row);
  });
  return { dueToday, overdue };
}

function renderFtlReminderPanel() {
  if (!els.ftlReminderPanel || state.page !== "ftl") return;
  const { dueToday, overdue } = confirmedUnloadReminders();
  if (!dueToday.length && !overdue.length) {
    els.ftlReminderPanel.hidden = true;
    els.ftlReminderPanel.innerHTML = "";
    return;
  }
  els.ftlReminderPanel.hidden = false;
  const chips = [
    dueToday.length ? `<span class="today">${dueToday.length} scaric${dueToday.length === 1 ? "o" : "hi"} oggi</span>` : "",
    overdue.length ? `<span class="overdue">${overdue.length} scadut${overdue.length === 1 ? "o" : "i"}</span>` : "",
  ].filter(Boolean).join("");
  const previewRows = [...overdue, ...dueToday].slice(0, 5);
  els.ftlReminderPanel.innerHTML = `
    <div>
      <strong>Promemoria scarichi FTL</strong>
      <p>Quando il mezzo ha scaricato, seleziona la riga e premi <b>Consegnata / XML</b>.</p>
    </div>
    <div class="reminder-chips">${chips}</div>
    <ul>
      ${previewRows.map(row => `
        <li>
          <b>${escapeHtml(row.shipment)}</b>
          <span>${escapeHtml(row.display["Route to Customer"] || row.raw["Route to Customer"] || "")}</span>
          <em>${escapeHtml(row.display["Data Scarico Prenotato"] || "")}</em>
        </li>
      `).join("")}
    </ul>
  `;
}

function notifyUnloadDueToday() {
  if (state.page !== "ftl" || !state.data) return;
  const { dueToday, overdue } = confirmedUnloadReminders();
  if (!dueToday.length && !overdue.length) return;
  const reminderKey = `${todayIso()}-${dueToday.map(row => row.shipment).join("|")}-${overdue.map(row => row.shipment).join("|")}`;
  if (state.unloadReminderShownKey === reminderKey) return;
  state.unloadReminderShownKey = reminderKey;
  const pieces = [];
  if (dueToday.length) pieces.push(`${dueToday.length} scaric${dueToday.length === 1 ? "o" : "hi"} FTL oggi`);
  if (overdue.length) pieces.push(`${overdue.length} scaric${overdue.length === 1 ? "o" : "hi"} FTL scadut${overdue.length === 1 ? "o" : "i"}`);
  showToast(`${pieces.join(" e ")}: controlla FTL CONFERMATI.`);
}

function monthlyBillingSummaries() {
  const monthMap = new Map();
  billingRows().forEach(item => {
    const current = monthMap.get(item.month) || [];
    current.push(item);
    monthMap.set(item.month, current);
  });
  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, items]) => ({
      month,
      label: monthLabel(month),
      labelShort: monthLabel(month).replace(/\s+\d{4}$/, "").slice(0, 3),
      ...summarizeBilling(items),
    }));
}

function renderHeroTrend() {
  if (!els.heroTrend) return;
  const months = monthlyBillingSummaries();
  if (!months.length) {
    els.heroTrend.innerHTML = `
      <div class="hero-trend-copy">
        <span>Fatturato mensile</span>
        <strong>In attesa dati</strong>
        <small>Importa le spedizioni per generare il trend.</small>
      </div>
    `;
    return;
  }
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const year = current.month.slice(0, 4);
  const yearTotal = months
    .filter(item => item.month.startsWith(`${year}-`))
    .reduce((total, item) => total + item.active, 0);
  const changePct = previous && previous.active
    ? ((current.active - previous.active) / previous.active) * 100
    : NaN;
  const changeClass = Number.isFinite(changePct) && changePct < 0 ? "negative" : "positive";
  const changeText = Number.isFinite(changePct) ? `${changePct >= 0 ? "+" : ""}${percentText(changePct)}` : "nuovo mese";
  els.heroTrend.innerHTML = `
    <div class="hero-trend-copy">
      <span>Fatturato mensile</span>
      <strong>${escapeHtml(moneyText(current.active))}</strong>
      <small>Anno ${escapeHtml(year)} - ${escapeHtml(moneyText(yearTotal))} fatturato</small>
    </div>
    ${renderHeroRevenueSvg(months)}
    <div class="hero-trend-footer">
      <span class="${changeClass}">${escapeHtml(changeText)}</span>
      <small>${escapeHtml(current.label)}</small>
    </div>
  `;
}

function renderHeroRevenueSvg(months) {
  const visibleMonths = months.slice(-10);
  const width = 980;
  const height = 142;
  const top = 18;
  const bottom = 108;
  const left = 6;
  const right = width - 6;
  const sampleMonths = visibleMonths.length > 1 ? visibleMonths : [
    { labelShort: "gen", active: 1 },
    { labelShort: "feb", active: 1.2 },
    { labelShort: "mar", active: 1.05 },
    { labelShort: "apr", active: 1.38 },
    { labelShort: "mag", active: 1.66 },
    { labelShort: "giu", active: 1.62 },
    { labelShort: "lug", active: 2.05 },
    { labelShort: "ago", active: 2.16 },
    { labelShort: "set", active: 2.55 },
    { labelShort: visibleMonths[0]?.labelShort || "mese", active: 3.05 },
  ];
  const values = sampleMonths.map(item => item.active);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const range = maxValue - minValue || 1;
  const x = (index) => sampleMonths.length === 1
    ? (left + right) / 2
    : left + ((right - left) * index) / (sampleMonths.length - 1);
  const y = (value) => bottom - ((value - minValue) / range) * (bottom - top);
  const coordinates = sampleMonths.map((item, index) => ({ x: x(index), y: y(item.active), label: item.labelShort }));
  const curvePath = smoothCurvePath(coordinates);
  const areaPath = `${curvePath} L ${right},${bottom} L ${left},${bottom} Z`;
  const labelStep = Math.max(1, Math.ceil(coordinates.length / 5));
  return `
    <svg viewBox="0 0 ${width} ${height}" class="hero-trend-svg" role="img" aria-label="Andamento fatturato mensile">
      <defs>
        <linearGradient id="heroTrendArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0ea5e9" stop-opacity=".22" />
          <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0" />
        </linearGradient>
        <path id="heroRevenuePath" d="${curvePath}" />
      </defs>
      <path d="${areaPath}" class="hero-trend-area" />
      <use href="#heroRevenuePath" class="hero-trend-line glow" />
      <use href="#heroRevenuePath" class="hero-trend-line" />
      <use href="#heroRevenuePath" class="hero-trend-line energy" />
      <circle r="5.2" class="hero-trend-runner">
        <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto">
          <mpath href="#heroRevenuePath" />
        </animateMotion>
      </circle>
      ${coordinates.map((point, index) => `
        <circle cx="${point.x}" cy="${point.y}" r="${index === coordinates.length - 1 ? 5 : 3.5}" class="hero-trend-dot" />
        ${index % labelStep === 0 && index < coordinates.length - 1 ? `<text x="${point.x}" y="136" text-anchor="middle" class="hero-trend-month">${escapeHtml(point.label)}</text>` : ""}
      `).join("")}
    </svg>
  `;
}

function smoothCurvePath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  const commands = [`M ${points[0].x},${points[0].y}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] || next;
    const c1x = current.x + (next.x - previous.x) / 6;
    const c1y = current.y + (next.y - previous.y) / 6;
    const c2x = next.x - (afterNext.x - current.x) / 6;
    const c2y = next.y - (afterNext.y - current.y) / 6;
    commands.push(`C ${c1x},${c1y} ${c2x},${c2y} ${next.x},${next.y}`);
  }
  return commands.join(" ");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .replace("EUR", "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");
  const dotCount = (cleaned.match(/\./g) || []).length;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : (dotCount === 1 && /\.\d{1,3}$/.test(cleaned) ? cleaned : cleaned.replace(/\./g, ""));
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseDateValue(value) {
  if (!value) return null;
  const text = String(value).trim().replace("T", " ");
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return new Date(year, Number(match[2]) - 1, Number(match[1]));
  }
  return null;
}

function billingDate(row) {
  return parseDateValue(row.raw["Late Ship Date"])
    || parseDateValue(row.raw["Data Consegna"])
    || parseDateValue(row.raw["Early Delivery Date"])
    || parseDateValue(row.raw["Integration Date"]);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  if (!key) return "";
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function moneyText(value) {
  const number = Number(value || 0);
  return `EUR ${number.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percentText(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function billingRows() {
  return billingSourceRows()
    .map(row => {
      const date = billingDate(row);
      const active = toNumber(row.raw["Costo Attivo"]);
      const passive = toNumber(row.raw["Costo Passivo"]);
      const marginRaw = toNumber(row.raw["Margine"]);
      const margin = marginRaw ?? ((active !== null && passive !== null) ? active - passive : 0);
      return {
        row,
        date,
        month: date ? monthKey(date) : "",
        active: active || 0,
        passive: passive || 0,
        margin: margin || 0,
        hasFinancialData: active !== null || passive !== null || marginRaw !== null,
      };
    })
    .filter(item => item.date && item.hasFinancialData);
}

function summarizeBilling(rows) {
  const active = rows.reduce((total, item) => total + item.active, 0);
  const passive = rows.reduce((total, item) => total + item.passive, 0);
  const margin = rows.reduce((total, item) => total + item.margin, 0);
  const gp = active ? (margin / active) * 100 : NaN;
  return { active, passive, margin, gp, count: rows.length };
}

function renderTrendSvg(months, selectedMonth, selectedRows = []) {
  const width = 840;
  const height = 250;
  const chartTop = 24;
  const chartBottom = 198;
  const chartLeft = 58;
  const chartRight = width - 24;
  const displayMonths = months.length > 1 ? months : buildSingleMonthTrend(selectedRows, months[0]);
  const values = displayMonths.flatMap(item => [item.active, item.passive, item.margin]);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const range = maxValue - minValue || 1;
  const x = (index) => displayMonths.length === 1
    ? (chartLeft + chartRight) / 2
    : chartLeft + ((chartRight - chartLeft) * index) / (displayMonths.length - 1);
  const y = (value) => chartBottom - ((value - minValue) / range) * (chartBottom - chartTop);
  const coordinates = (key) => displayMonths.map((item, index) => ({ x: x(index), y: y(item[key]) }));
  const path = (key) => smoothCurvePath(coordinates(key));
  const zeroY = y(0);
  const labelStep = Math.max(1, Math.ceil(displayMonths.length / 8));

  return `
    <svg viewBox="0 0 ${width} ${height}" class="billing-svg" role="img" aria-label="Andamento fatturazione">
      <line x1="${chartLeft}" y1="${chartTop}" x2="${chartLeft}" y2="${chartBottom}" class="chart-axis" />
      <line x1="${chartLeft}" y1="${zeroY}" x2="${chartRight}" y2="${zeroY}" class="chart-zero" />
      <text x="${chartLeft}" y="14" class="chart-scale">${escapeHtml(moneyText(maxValue))}</text>
      <text x="${chartLeft}" y="${height - 8}" class="chart-scale">${escapeHtml(moneyText(minValue))}</text>
      <path d="${path("active")}" class="chart-line active glow" />
      <path d="${path("active")}" class="chart-line active" />
      <path d="${path("passive")}" class="chart-line passive" />
      <path d="${path("margin")}" class="chart-line margin" />
      ${displayMonths.map((item, index) => `
        <circle cx="${x(index)}" cy="${y(item.active)}" r="${item.current || item.month === selectedMonth ? 5 : 3}" class="chart-dot active" />
        <circle cx="${x(index)}" cy="${y(item.passive)}" r="${item.current || item.month === selectedMonth ? 5 : 3}" class="chart-dot passive" />
        <circle cx="${x(index)}" cy="${y(item.margin)}" r="${item.current || item.month === selectedMonth ? 5 : 3}" class="chart-dot margin" />
        ${item.labelShort && (months.length === 1 || index % labelStep === 0 || item.current) ? `<text x="${x(index)}" y="228" text-anchor="middle" class="chart-month">${escapeHtml(item.labelShort)}</text>` : ""}
      `).join("")}
    </svg>
  `;
}

function buildSingleMonthTrend(rows, month) {
  const sortedRows = [...rows]
    .filter(item => item.date)
    .sort((a, b) => a.date - b.date || String(a.row.shipment).localeCompare(String(b.row.shipment)));
  const baseMonth = month?.month || monthKey(new Date());
  if (!sortedRows.length) {
    return [{
      month: baseMonth,
      labelShort: month?.labelShort || "",
      active: month?.active || 0,
      passive: month?.passive || 0,
      margin: month?.margin || 0,
      current: true,
    }];
  }

  let active = 0;
  let passive = 0;
  let margin = 0;
  let previousDay = "";
  const points = [{
    month: `${baseMonth}-start`,
    labelShort: "",
    active: 0,
    passive: 0,
    margin: 0,
  }];

  sortedRows.forEach((item, index) => {
    active += item.active;
    passive += item.passive;
    margin += item.margin;
    const dayLabel = item.date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
    const showDay = dayLabel !== previousDay || index === sortedRows.length - 1;
    points.push({
      month: `${baseMonth}-${index}`,
      labelShort: showDay ? dayLabel : "",
      active,
      passive,
      margin,
      current: index === sortedRows.length - 1,
    });
    previousDay = dayLabel;
  });

  return points;
}

function renderMonthBars(summary) {
  const bars = [
    ["Attivo", summary.active, "active"],
    ["Passivo", summary.passive, "passive"],
    ["GP", summary.margin, summary.margin < 0 ? "negative" : "margin"],
  ];
  const maxValue = Math.max(1, ...bars.map(([, value]) => Math.abs(value)));
  return bars.map(([label, value, className]) => `
    <div class="month-bar-row">
      <span>${label}</span>
      <div class="month-bar-track">
        <div class="month-bar ${className}" style="width:${Math.max(4, Math.abs(value) / maxValue * 100)}%"></div>
      </div>
      <strong>${escapeHtml(moneyText(value))}</strong>
    </div>
  `).join("");
}

function parseExtraCategories(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  return text.split("|")
    .map(part => part.trim())
    .map(part => {
      const match = part.match(/^(.+?):\s*EUR\s*([+-]?\d+(?:[.,]\d+)?)/i);
      if (!match) return null;
      return {
        name: match[1].trim(),
        amount: toNumber(match[2]) || 0,
      };
    })
    .filter(Boolean);
}

function summarizePassiveBreakdown(rows) {
  const categories = new Map();
  let passive = 0;
  let transport = 0;
  let extras = 0;

  rows.forEach(item => {
    const row = item.row;
    const passiveValue = item.passive || 0;
    const explicitExtra = toNumber(row.raw["Extra BRT Totale"]) || 0;
    const parsedExtras = parseExtraCategories(row.raw["Extra BRT Applicati"]);
    const parsedExtraTotal = parsedExtras.reduce((total, extra) => total + extra.amount, 0);
    const extraValue = explicitExtra || parsedExtraTotal;
    let baseValue = toNumber(row.raw["Costo Passivo Base BRT"]);
    if (baseValue === null && passiveValue > 0) {
      baseValue = Math.max(0, passiveValue - extraValue);
    }

    passive += passiveValue;
    transport += baseValue || 0;
    extras += extraValue;

    parsedExtras.forEach(extra => {
      categories.set(extra.name, (categories.get(extra.name) || 0) + extra.amount);
    });
    const missingExtraDetail = extraValue - parsedExtraTotal;
    if (missingExtraDetail > 0.01) {
      categories.set("Extra non dettagliati", (categories.get("Extra non dettagliati") || 0) + missingExtraDetail);
    }
  });

  const other = Math.max(0, passive - transport - extras);
  return {
    passive,
    transport,
    extras,
    other,
    transportPct: passive ? (transport / passive) * 100 : 0,
    extrasPct: passive ? (extras / passive) * 100 : 0,
    otherPct: passive ? (other / passive) * 100 : 0,
    categories: [...categories.entries()]
      .map(([name, amount]) => ({
        name,
        amount,
        pctOfPassive: passive ? (amount / passive) * 100 : 0,
        pctOfExtras: extras ? (amount / extras) * 100 : 0,
      }))
      .filter(item => item.amount > 0)
      .sort((a, b) => b.amount - a.amount),
  };
}

function renderPassiveSplit(breakdown) {
  const transportDeg = Math.max(0, breakdown.transportPct * 3.6);
  const extrasDeg = Math.max(transportDeg, (breakdown.transportPct + breakdown.extrasPct) * 3.6);
  const otherDeg = Math.max(extrasDeg, 360);
  return `
    <div class="passive-split">
      <div class="passive-donut" style="--transport-deg:${transportDeg}deg; --extras-deg:${extrasDeg}deg; --other-deg:${otherDeg}deg">
        <div>
          <strong>${escapeHtml(percentText(breakdown.extrasPct))}</strong>
          <span>extra sul passivo</span>
        </div>
      </div>
      <div class="passive-legend-list">
        <div><span class="dot transport"></span><strong>Trasporto effettivo</strong><em>${escapeHtml(moneyText(breakdown.transport))}</em><small>${escapeHtml(percentText(breakdown.transportPct))}</small></div>
        <div><span class="dot extras"></span><strong>Extra</strong><em>${escapeHtml(moneyText(breakdown.extras))}</em><small>${escapeHtml(percentText(breakdown.extrasPct))}</small></div>
        <div><span class="dot other"></span><strong>Altro / non classificato</strong><em>${escapeHtml(moneyText(breakdown.other))}</em><small>${escapeHtml(percentText(breakdown.otherPct))}</small></div>
      </div>
    </div>
  `;
}

function renderExtraCategoryChart(breakdown) {
  if (!breakdown.categories.length) {
    return `<div class="billing-empty compact">Nessun extra dettagliato nel mese selezionato.</div>`;
  }
  const maxAmount = Math.max(1, ...breakdown.categories.map(item => item.amount));
  return `
    <div class="extra-category-list">
      ${breakdown.categories.slice(0, 8).map(item => `
        <div class="extra-category-row">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(percentText(item.pctOfPassive))} del passivo | ${escapeHtml(percentText(item.pctOfExtras))} degli extra</span>
          </div>
          <div class="extra-category-track">
            <div style="width:${Math.max(4, item.amount / maxAmount * 100)}%"></div>
          </div>
          <em>${escapeHtml(moneyText(item.amount))}</em>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCustomerBreakdown(rows) {
  const byCustomer = new Map();
  rows.forEach(item => {
    const customer = item.row.display["Route to Customer"] || item.row.raw["Route to Customer"] || "Cliente non indicato";
    const current = byCustomer.get(customer) || { active: 0, passive: 0, margin: 0, count: 0 };
    current.active += item.active;
    current.passive += item.passive;
    current.margin += item.margin;
    current.count += 1;
    byCustomer.set(customer, current);
  });
  const rowsHtml = [...byCustomer.entries()]
    .sort((a, b) => b[1].active - a[1].active)
    .slice(0, 8)
    .map(([customer, item]) => `
      <tr>
        <td>${escapeHtml(customer)}</td>
        <td>${item.count}</td>
        <td>${escapeHtml(moneyText(item.active))}</td>
        <td>${escapeHtml(moneyText(item.passive))}</td>
        <td class="${item.margin < 0 ? "negative" : "positive"}">${escapeHtml(moneyText(item.margin))}</td>
      </tr>
    `).join("");
  return rowsHtml || `<tr><td colspan="5">Nessun dato disponibile per il mese selezionato.</td></tr>`;
}

function renderBilling() {
  const rows = billingRows();
  const monthMap = new Map();
  rows.forEach(item => {
    const current = monthMap.get(item.month) || [];
    current.push(item);
    monthMap.set(item.month, current);
  });
  const months = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, items]) => ({
      month,
      label: monthLabel(month),
      labelShort: monthLabel(month).replace(/\s+\d{4}$/, "").slice(0, 3),
      ...summarizeBilling(items),
    }));

  if (!months.length) {
    state.billingMonth = "";
    els.content.innerHTML = `<section class="billing-empty">Nessun dato economico disponibile.</section>`;
    return;
  }

  if (!state.billingMonth || !monthMap.has(state.billingMonth)) {
    state.billingMonth = months[months.length - 1].month;
  }
  const selectedRows = monthMap.get(state.billingMonth) || [];
  const selectedSummary = summarizeBilling(selectedRows);
  const passiveBreakdown = summarizePassiveBreakdown(selectedRows);
  const selectedLabel = monthLabel(state.billingMonth);
  const trendTitle = months.length > 1 ? "Andamento mese per mese" : "Andamento del mese";
  const fuelSettings = state.data?.fuelSettings?.[state.billingMonth] || {};
  const activeFuel = fuelSettings.active ?? 0;
  const passiveFuel = fuelSettings.passive ?? 2;

  els.content.innerHTML = `
    <section class="billing-page">
      <div class="billing-head">
        <div>
          <span>Fatturazione aggiornata</span>
          <h2>${escapeHtml(selectedLabel)}</h2>
          <p>Valori calcolati dalle spedizioni presenti nello storico locale.</p>
        </div>
        <div class="billing-actions">
          <label class="billing-filter">
            <span>Mese</span>
            <select id="billingMonthSelect">
              ${months.map(item => `<option value="${item.month}" ${item.month === state.billingMonth ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
            </select>
          </label>
          <label class="billing-filter fuel-field">
            <span>Fuel attivo %</span>
            <input id="billingActiveFuel" inputmode="decimal" value="${escapeHtml(String(activeFuel).replace(".", ","))}" />
          </label>
          <label class="billing-filter fuel-field">
            <span>Fuel passivo %</span>
            <input id="billingPassiveFuel" inputmode="decimal" value="${escapeHtml(String(passiveFuel).replace(".", ","))}" />
          </label>
          <button id="saveFuelBtn" type="button">Salva fuel</button>
          <button class="primary" id="exportActiveBtn" type="button">Scarica fatturazione attiva</button>
          <button class="primary" id="exportPassiveBtn" type="button">Scarica passivo vettori</button>
        </div>
      </div>

      <div class="billing-kpis">
        <article><span>Fatturato attivo</span><strong>${escapeHtml(moneyText(selectedSummary.active))}</strong><small>${selectedSummary.count} spedizioni</small></article>
        <article><span>Costi passivi</span><strong>${escapeHtml(moneyText(selectedSummary.passive))}</strong><small>vettori e extra</small></article>
        <article class="${selectedSummary.margin < 0 ? "negative" : "positive"}"><span>GP</span><strong>${escapeHtml(moneyText(selectedSummary.margin))}</strong><small>${escapeHtml(percentText(selectedSummary.gp))}</small></article>
        <article><span>Extra passivo</span><strong>${escapeHtml(moneyText(passiveBreakdown.extras))}</strong><small>${escapeHtml(percentText(passiveBreakdown.extrasPct))} del passivo</small></article>
      </div>

      <div class="billing-grid">
        <article class="billing-card trend-card">
          <div class="card-title">
            <h3>${escapeHtml(trendTitle)}</h3>
            <div class="legend"><span class="active">Attivo</span><span class="passive">Passivo</span><span class="margin">GP</span></div>
          </div>
          ${renderTrendSvg(months, state.billingMonth, selectedRows)}
        </article>
        <article class="billing-card">
          <div class="card-title">
            <h3>Dettaglio mese</h3>
            <span>${escapeHtml(selectedLabel)}</span>
          </div>
          <div class="month-bars">${renderMonthBars(selectedSummary)}</div>
        </article>
      </div>

      <div class="billing-grid passive-breakdown-grid">
        <article class="billing-card passive-breakdown-card">
          <div class="card-title">
            <h3>Composizione passivo</h3>
            <span>${escapeHtml(selectedLabel)}</span>
          </div>
          ${renderPassiveSplit(passiveBreakdown)}
        </article>
        <article class="billing-card">
          <div class="card-title">
            <h3>Extra per categoria</h3>
            <span>peso sul passivo</span>
          </div>
          ${renderExtraCategoryChart(passiveBreakdown)}
        </article>
      </div>

      <article class="billing-card">
        <div class="card-title">
          <h3>Top clienti del mese</h3>
          <span>ordinati per fatturato attivo</span>
        </div>
        <div class="billing-table-wrap">
          <table class="billing-table">
            <thead>
              <tr><th>Cliente</th><th>Sped.</th><th>Attivo</th><th>Passivo</th><th>GP</th></tr>
            </thead>
            <tbody>${renderCustomerBreakdown(selectedRows)}</tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function registryRows() {
  const rows = Array.isArray(state.data?.customers) && state.data.customers.length
    ? state.data.customers
    : (Array.isArray(state.data?.gdoCustomers) ? state.data.gdoCustomers : []);
  const search = state.search.toLowerCase();
  return rows
    .filter(row => {
      if (!search) return true;
      return Object.values(row).join(" ").toLowerCase().includes(search);
    })
    .sort((a, b) => (a["Ragione Sociale"] || "").localeCompare(b["Ragione Sociale"] || ""));
}

function renderRegistry() {
  const rows = registryRows();
  const total = (state.data?.customers?.length || state.data?.gdoCustomers?.length || 0);
  const gdoTotal = rows.filter(row => String(row.GDO || "").toUpperCase() === "SI").length;
  els.content.innerHTML = `
    <section class="registry-page">
      <div class="registry-head">
        <div>
          <span>Anagrafica operativa</span>
          <h2>${total} clienti</h2>
          <p>Clienti, indirizzi e contatti scarico. I clienti GDO restano evidenziati per i calcoli automatici.</p>
        </div>
        <div class="registry-badge">
          <strong>${gdoTotal}</strong>
          <span>record GDO</span>
        </div>
      </div>
      <div class="registry-table-wrap">
        <table class="registry-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Codice</th>
              <th>Ship-to</th>
              <th>Indirizzo consegna</th>
              <th>Responsabile</th>
              <th>Mail</th>
              <th>Telefono</th>
              <th>Info scarico</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(row => `
              <tr>
                <td><strong>${escapeHtml(row["Ragione Sociale"] || "")}</strong>${row.GDO ? `<span>${escapeHtml(row.GDO)}</span>` : ""}</td>
                <td>${escapeHtml(row["Codice Cliente"] || "")}</td>
                <td>${escapeHtml(row["Ship To Location"] || "")}</td>
                <td>${escapeHtml(row["Indirizzo Consegna"] || "")}</td>
                <td>${escapeHtml(row["Responsabile Scarico"] || "-")}</td>
                <td>${escapeHtml(row.Mail || "-")}</td>
                <td>${escapeHtml(row.Telefono || "-")}</td>
                <td>${escapeHtml(row["Shipping Information"] || "-")}</td>
                <td>${escapeHtml(row["Note Scarico"] || "-")}</td>
              </tr>
            `).join("") : `<tr><td colspan="9">Nessun cliente trovato con questo filtro.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

async function loadAdminUsers() {
  const payload = await api("/api/users");
  state.adminUsers = payload.users || [];
  state.adminUsersLoaded = true;
  if (state.page === "admin") renderAdmin();
}

function renderAdmin() {
  if (!state.data?.auth?.canAdmin) {
    els.content.innerHTML = `
      <section class="admin-page">
        <article class="admin-card">
          <h2>Accesso non autorizzato</h2>
          <p>Solo l'admin puo gestire profili e ruoli.</p>
        </article>
      </section>
    `;
    return;
  }
  const roles = state.data?.auth?.roles || {};
  const rows = state.adminUsers || [];
  els.content.innerHTML = `
    <section class="admin-page">
      <article class="admin-card admin-form-card">
        <span class="admin-kicker">Gestione accessi</span>
        <h2>Crea o modifica profilo</h2>
        <p>Admin vede tutto, backup/operativo lavorano sulle spedizioni, fatturazione entra solo nella chiusura mese.</p>
        <form id="adminUserForm" class="admin-form">
          <label>
            <span>Utente</span>
            <input id="adminUsername" autocomplete="off" placeholder="es. mario" />
          </label>
          <label>
            <span>Nome visualizzato</span>
            <input id="adminDisplayName" autocomplete="off" placeholder="es. Mario Rossi" />
          </label>
          <label>
            <span>Ruolo</span>
            <select id="adminRole">
              ${Object.entries(roles).map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Password</span>
            <input id="adminPassword" type="password" autocomplete="new-password" placeholder="minimo 8 caratteri" />
          </label>
          <div class="admin-form-actions">
            <button type="submit" class="primary">Salva profilo</button>
            <button type="button" id="adminClearForm">Nuovo profilo</button>
          </div>
        </form>
      </article>
      <article class="admin-card">
        <span class="admin-kicker">Profili attivi</span>
        <h2>${rows.length} utenti</h2>
        <div class="admin-users">
          ${state.adminUsersLoaded ? rows.map(user => `
            <div class="admin-user-row">
              <div>
                <strong>${escapeHtml(user.displayName || user.username)}</strong>
                <span>${escapeHtml(user.username)} - ${escapeHtml(user.roleLabel || user.role)}</span>
              </div>
              <div class="admin-user-actions">
                <button type="button" data-admin-edit="${escapeHtml(user.username)}">Modifica</button>
                <button type="button" class="danger" data-admin-delete="${escapeHtml(user.username)}">Elimina</button>
              </div>
            </div>
          `).join("") : `<p>Carico profili...</p>`}
        </div>
      </article>
    </section>
  `;
  if (!state.adminUsersLoaded) {
    loadAdminUsers().catch(error => showToast(error.message));
  }
}

function clearAdminForm() {
  document.querySelector("#adminUsername").value = "";
  document.querySelector("#adminDisplayName").value = "";
  document.querySelector("#adminRole").value = "operator";
  document.querySelector("#adminPassword").value = "";
  document.querySelector("#adminUsername").disabled = false;
}

function fillAdminForm(username) {
  const user = (state.adminUsers || []).find(item => item.username === username);
  if (!user) return;
  document.querySelector("#adminUsername").value = user.username || "";
  document.querySelector("#adminDisplayName").value = user.displayName || "";
  document.querySelector("#adminRole").value = user.role || "operator";
  document.querySelector("#adminPassword").value = "";
  document.querySelector("#adminUsername").disabled = true;
}

function readColumnOrder() {
  try {
    const raw = window.localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveColumnOrder() {
  try {
    window.localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(state.columnOrder));
  } catch (_error) {
    // Non bloccare il lavoro se il browser nega localStorage.
  }
}

function normalizeColumnOrder(order) {
  const currentKeys = state.data?.columns?.map(column => column.key) || [];
  const currentSet = new Set(currentKeys);
  const ordered = order.filter(key => currentSet.has(key));
  currentKeys.forEach(key => {
    if (!ordered.includes(key)) ordered.push(key);
  });
  return ordered;
}

function orderedColumns() {
  const columnByKey = new Map((state.data?.columns || []).map(column => [column.key, column]));
  return normalizeColumnOrder(state.columnOrder).map(key => columnByKey.get(key)).filter(Boolean);
}

function displayColumnsForCurrentPage() {
  const columns = orderedColumns();
  if (state.page === "deleted") {
    return columns.some(column => column.key === "Data Eliminazione")
      ? columns
      : [{ key: "Data Eliminazione", title: "Data eliminazione" }, ...columns];
  }
  if (state.page === "ftl") {
    const output = [...columns];
    if (!output.some(column => column.key === "Data Scarico Prenotato")) {
      const insertAfterIndex = output.findIndex(column => column.key === "Early Delivery Date");
      const insertIndex = insertAfterIndex >= 0 ? insertAfterIndex + 1 : Math.min(1, output.length);
      output.splice(insertIndex, 0, { key: "Data Scarico Prenotato", title: "Scarico prenotato" });
    }
    if (!output.some(column => column.key === "Data Consegna")) {
      output.push({ key: "Data Consegna", title: "Data consegna" });
    }
    if (!output.some(column => column.key === "XML Consegna")) {
      output.push({ key: "XML Consegna", title: "XML consegna" });
    }
    return output;
  }
  if (state.page !== "groupage" || columns.some(column => column.key === "Data Partenza")) {
    return columns;
  }
  const output = [...columns];
  const insertAfterIndex = output.findIndex(column => column.key === "Early Delivery Date");
  const insertIndex = insertAfterIndex >= 0 ? insertAfterIndex + 1 : Math.min(1, output.length);
  output.splice(insertIndex, 0, { key: "Data Partenza", title: "Data spedito" });
  return output;
}

function moveColumn(sourceKey, targetKey) {
  if (!sourceKey || !targetKey || sourceKey === targetKey) return false;
  const keys = normalizeColumnOrder(state.columnOrder);
  const fromIndex = keys.indexOf(sourceKey);
  const toIndex = keys.indexOf(targetKey);
  if (fromIndex < 0 || toIndex < 0) return false;
  keys.splice(fromIndex, 1);
  keys.splice(toIndex, 0, sourceKey);
  state.columnOrder = keys;
  saveColumnOrder();
  return true;
}

function rowMatches(row, sectionKey = "") {
  if (state.page === "groupage" && sectionKey === "departed") return departedRowMatches(row);
  if (state.page === "ftl" && sectionKey === "confirmedFtl") return ftlFollowupRowMatches(row);
  if (!state.search) return true;
  const haystack = Object.values(row.display).join(" ").toLowerCase();
  return haystack.includes(state.search.toLowerCase());
}

function departedDateKey(row) {
  const parsed = parseDateValue(row.raw["Data Partenza"] || row.display["Data Partenza"]);
  if (!parsed) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function departedRowMatches(row) {
  if (state.departedDate && departedDateKey(row) !== state.departedDate) {
    return false;
  }
  if (!state.departedSearch) return true;
  const haystack = [
    row.display["Shipment"] || row.raw["Shipment"],
    row.display["Orders"] || row.raw["Orders"],
    row.display["Route to Customer"] || row.raw["Route to Customer"],
    row.display["Provincia"] || row.raw["Provincia"],
  ].join(" ").toLowerCase();
  return haystack.includes(state.departedSearch.toLowerCase());
}

function ftlFollowupRowMatches(row) {
  if (state.departedDate && unloadDateKey(row) !== state.departedDate) {
    return false;
  }
  if (!state.departedSearch) return true;
  const haystack = [
    row.display["Shipment"] || row.raw["Shipment"],
    row.display["Orders"] || row.raw["Orders"],
    row.display["Route to Customer"] || row.raw["Route to Customer"],
    row.display["Provincia"] || row.raw["Provincia"],
  ].join(" ").toLowerCase();
  return haystack.includes(state.departedSearch.toLowerCase());
}

function rowTone(row) {
  const margin = Number(String(row.raw["Margine"] || "0").replace(",", "."));
  const slaStatus = String(row.raw["SLA Contratto"] || row.display["SLA Contratto"] || "").toLowerCase();
  const classes = [
    state.selected.has(row.shipment) ? "selected" : "",
    margin < 0 ? "loss-row" : "",
    slaStatus.includes("non rispettato") ? "sla-breach-row" : "",
  ];
  return classes.filter(Boolean).join(" ");
}

function rowValue(row, key, fallback = "-") {
  const value = row.display?.[key] || row.raw?.[key] || "";
  return value === "" || value === null || value === undefined ? fallback : String(value);
}

function planningSectionAccent(key) {
  return {
    verify: "#6366f1",
    openGroupage: "#2563eb",
    openDirect: "#06b6d4",
    plannedGroupage: "#8b5cf6",
    plannedCustomer: "#f59e0b",
  }[key] || "#14b8a6";
}

function planningNextLabel(key) {
  return {
    verify: "Controlla wave",
    openGroupage: "Pianifica groupage",
    openDirect: "Scegli vettore",
    plannedGroupage: "Pronta per mail BRT",
    plannedCustomer: "Attesa conferma vettore",
  }[key] || "Gestisci";
}

function renderPlanningWorkspace() {
  const sections = pageMeta.planning.sections.map(([key, title]) => {
    const rows = (state.data.groups[key] || []).filter(row => rowMatches(row, key));
    return { key, title, rows };
  });
  const sectionByKey = Object.fromEntries(sections.map(section => [section.key, section]));
  const verifySection = sectionByKey.verify;
  const groupageSections = [sectionByKey.openGroupage, sectionByKey.plannedGroupage].filter(Boolean);
  const ftlSections = [sectionByKey.openDirect, sectionByKey.plannedCustomer].filter(Boolean);
  const totalRows = sections.reduce((total, section) => total + section.rows.length, 0);
  els.content.innerHTML = `
    <section class="planning-workspace">
      <div class="planning-command">
        <div>
          <span>Flusso BO → Wave → Vettore</span>
          <h2>Pianifica senza perdere il filo</h2>
          <p>Qui vedi le spedizioni come decisioni operative: wave, cliente, date, bancali, costi, margine e SLA gia ordinati per lavorare veloce.</p>
        </div>
        <div class="planning-command-kpis">
          <article><strong>${rowsCount("verify")}</strong><span>da verificare</span></article>
          <article><strong>${rowsCount("openGroupage") + rowsCount("openDirect")}</strong><span>da pianificare</span></article>
          <article><strong>${rowsCount("plannedGroupage") + rowsCount("plannedCustomer")}</strong><span>richieste pronte</span></article>
        </div>
      </div>
      <div class="planning-flow">
        ${sections.map((section, index) => `
          <div class="planning-step" style="--accent:${planningSectionAccent(section.key)}">
            <em>${index + 1}</em>
            <strong>${escapeHtml(section.title)}</strong>
            <span>${section.rows.length}</span>
          </div>
        `).join("")}
      </div>
      ${totalRows ? sections.map(section => renderPlanningLane(section.key, section.title, section.rows)).join("") : `<div class="empty big-empty">Nessuna spedizione da pianificare con i filtri attuali.</div>`}
    </section>
  `;
  syncBulkCheckboxes();
}

function renderPlanningLane(key, title, rows) {
  return `
    <section class="planning-lane shipment-section" data-section="${escapeHtml(key)}" style="--accent:${planningSectionAccent(key)}">
      <div class="planning-lane-head">
        <div>
          <span>${escapeHtml(planningNextLabel(key))}</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <label class="planning-bulk">
          <input class="bulk-check" type="checkbox" data-section="${escapeHtml(key)}" />
          <span>Seleziona visibili</span>
        </label>
      </div>
      <div class="planning-card-list">
        ${rows.length ? rows.map(row => renderPlanningCard(row, key)).join("") : `<div class="empty">Nessuna spedizione in questa corsia.</div>`}
      </div>
    </section>
  `;
}

function renderPlanningCard(row, sectionKey) {
  const selected = state.selected.has(row.shipment);
  const margin = Number(String(row.raw["Margine"] || "0").replace(",", "."));
  const marginClass = margin < 0 ? "negative" : "positive";
  const slaBad = String(row.raw["SLA Contratto"] || "").toLowerCase().includes("non rispettato");
  const isGroupage = row.isGroupage;
  const service = rowValue(row, "Service Level");
  const carrier = rowValue(row, "Carrier Scelto");
  const quickActions = [];
  if (["verify", "openGroupage", "openDirect"].includes(sectionKey)) {
    quickActions.push(`<button type="button" data-card-action="planned" data-shipment="${escapeHtml(row.shipment)}">Segna pianificata</button>`);
  }
  if (sectionKey === "plannedGroupage") {
    quickActions.push(`<button type="button" data-card-page="groupage">Vai a mail BRT</button>`);
  }
  if (sectionKey === "plannedCustomer") {
    quickActions.push(`<button type="button" data-card-page="ftl">Vai a FTL</button>`);
  }
  return `
    <article class="planning-card ${rowTone(row)}" data-shipment="${escapeHtml(row.shipment)}">
      <div class="planning-card-select">
        <input class="row-check" type="checkbox" ${selected ? "checked" : ""} aria-label="Seleziona ${escapeHtml(row.shipment)}" />
      </div>
      <div class="planning-card-main">
        <header class="planning-card-header">
          <div>
            <span>${escapeHtml(rowValue(row, "Orders", "Ordine non indicato"))}</span>
            <h3>${escapeHtml(row.shipment)} · ${escapeHtml(rowValue(row, "Route to Customer", "Cliente non indicato"))}</h3>
          </div>
          <div class="planning-pills">
            <span class="pill ${isGroupage ? "blue" : "cyan"}">${escapeHtml(isGroupage ? "BRT groupage" : "FTL/LTL")}</span>
            <span class="pill">${escapeHtml(carrier)} · ${escapeHtml(service)}</span>
            <span class="pill ${slaBad ? "red" : "green"}">${escapeHtml(rowValue(row, "SLA Contratto", "SLA n/d"))}</span>
          </div>
        </header>

        <div class="planning-card-grid">
          <div class="planning-block decision">
            <span>Decisione wave</span>
            <strong>${escapeHtml(rowValue(row, "Wave", "Wave non indicata"))}</strong>
            <div>
              <small>Partenza</small><em>${escapeHtml(rowValue(row, "Data Partenza Wave", "-"))}</em>
              <small>Tipo</small><em>${escapeHtml(rowValue(row, "Tipo Wave", rowValue(row, "Tipo Servizio")))}</em>
              <small>Freight</small><em>${escapeHtml(rowValue(row, "Freight Code"))}</em>
              <small>Prenotazione</small><em>${escapeHtml(rowValue(row, "Prenotazione Scarico"))}</em>
            </div>
          </div>
          <div class="planning-block customer">
            <span>Consegna</span>
            <strong>${escapeHtml(rowValue(row, "Route To Address", "Indirizzo non indicato"))}</strong>
            <div>
              <small>Prov.</small><em>${escapeHtml(rowValue(row, "Provincia"))}</em>
              <small>Late ship</small><em>${escapeHtml(rowValue(row, "Late Ship Date"))}</em>
              <small>Early delivery</small><em>${escapeHtml(rowValue(row, "Early Delivery Date"))}</em>
            </div>
          </div>
          <div class="planning-block qty">
            <span>Merce</span>
            <div>
              <small>Pallet</small><em>${escapeHtml(rowValue(row, "Theoretical Pallets"))}</em>
              <small>Fatt.</small><em>${escapeHtml(rowValue(row, "Pallet Fatturati"))}</em>
              <small>Peso kg</small><em>${escapeHtml(rowValue(row, "Grand Total Shipment Ftp Wgt Kg"))}</em>
              <small>Volume</small><em>${escapeHtml(rowValue(row, "Grand Total Shipment Ftp Vol m3"))}</em>
            </div>
          </div>
          <div class="planning-block money">
            <span>Economics</span>
            <div>
              <small>Attivo</small><em>${escapeHtml(rowValue(row, "Costo Attivo"))}</em>
              <small>Passivo</small><em>${escapeHtml(rowValue(row, "Costo Passivo"))}</em>
              <small>Margine</small><em class="${marginClass}">${escapeHtml(rowValue(row, "Margine"))}</em>
            </div>
          </div>
        </div>

        <footer class="planning-card-footer">
          <p>${escapeHtml(rowValue(row, "Note Text", "Nessuna nota"))}</p>
          <div>${quickActions.join("")}</div>
        </footer>
      </div>
    </article>
  `;
}

function renderPlanningFact(label, value, tone = "") {
  return `
    <div class="planning-fact ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `;
}

function renderPlanningWorkspace() {
  const groups = state.data.groups || {};
  const verifyRows = groups.verify || [];
  const groupageRows = [...verifyRows.filter(row => row.isGroupage), ...(groups.openGroupage || [])]
    .filter((row, index, list) => list.findIndex(item => item.shipment === row.shipment) === index)
    .filter(row => rowMatches(row, "openGroupage"));
  const ftlRows = [...verifyRows.filter(row => !row.isGroupage), ...(groups.openDirect || [])]
    .filter((row, index, list) => list.findIndex(item => item.shipment === row.shipment) === index)
    .filter(row => rowMatches(row, "openDirect"));
  const totalRows = groupageRows.length + ftlRows.length;
  els.content.innerHTML = `
    <section class="planning-workspace tower-planning planning-clean">
      <div class="planning-split">
        <div class="planning-half">
          <div class="planning-mode-title">
            <span>Groupage</span>
            <strong>${groupageRows.length} spedizion${groupageRows.length === 1 ? "e" : "i"} da pianificare</strong>
          </div>
          ${renderPlanningLane("openGroupage", "Groupage BRT da pianificare", groupageRows)}
        </div>
        <div class="planning-half">
          <div class="planning-mode-title">
            <span>FTL / Dirette</span>
            <strong>${ftlRows.length} spedizion${ftlRows.length === 1 ? "e" : "i"} da pianificare</strong>
          </div>
          ${renderPlanningLane("openDirect", "FTL / LTL da pianificare", ftlRows)}
        </div>
      </div>
      ${totalRows ? "" : `<div class="empty big-empty">Nessuna spedizione da pianificare con i filtri attuali.</div>`}
    </section>
  `;
  syncBulkCheckboxes();
}

function renderPlanningLane(key, title, rows) {
  return `
    <section id="lane-${escapeHtml(key)}" class="planning-lane shipment-section control-lane" data-section="${escapeHtml(key)}" style="--accent:${planningSectionAccent(key)}">
      <div class="planning-lane-head">
        <div>
          <span>${escapeHtml(planningNextLabel(key))}</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <label class="planning-bulk">
          <input class="bulk-check" type="checkbox" data-section="${escapeHtml(key)}" />
          <span>Seleziona corsia</span>
        </label>
      </div>
      <div class="planning-card-list control-card-list">
        ${rows.length ? rows.map(row => renderPlanningCard(row, key)).join("") : `<div class="empty">Nessuna spedizione in questa corsia.</div>`}
      </div>
    </section>
  `;
}

function renderPlanningCard(row, sectionKey) {
  const selected = state.selected.has(row.shipment);
  const margin = Number(String(row.raw["Margine"] || "0").replace(",", "."));
  const marginClass = margin < 0 ? "negative" : "positive";
  const slaBad = String(row.raw["SLA Contratto"] || "").toLowerCase().includes("non rispettato");
  const service = rowValue(row, "Service Level", row.isGroupage ? "LTL" : "FTL");
  const carrier = rowValue(row, "Carrier Scelto", row.isGroupage ? "BRT" : "Da scegliere");
  const note = rowValue(row, "Note Text", "");
  const quickActions = [];
  if (["verify", "openGroupage", "openDirect"].includes(sectionKey)) {
    quickActions.push(`<button type="button" data-card-action="planned" data-shipment="${escapeHtml(row.shipment)}">Pianificata</button>`);
  }
  if (sectionKey === "plannedGroupage") {
    quickActions.push(`<button type="button" data-card-page="groupage">Mail BRT</button>`);
  }
  if (sectionKey === "plannedCustomer") {
    quickActions.push(`<button type="button" data-card-page="ftl">Vai a FTL</button>`);
  }
  return `
    <article class="planning-card control-shipment-card ${rowTone(row)} ${selected ? "selected" : ""}" data-shipment="${escapeHtml(row.shipment)}">
      <div class="control-card-select">
        <input class="row-check" type="checkbox" ${selected ? "checked" : ""} aria-label="Seleziona ${escapeHtml(row.shipment)}" />
      </div>
      <div class="control-card-body">
        <header class="control-card-header">
          <div>
            <span>${escapeHtml(rowValue(row, "Orders", "Ordine n/d"))}</span>
            <h3>${escapeHtml(row.shipment)}</h3>
            <p>${escapeHtml(rowValue(row, "Route to Customer", "Cliente non indicato"))}</p>
          </div>
          <div class="control-status-stack">
            <span class="pill ${row.isGroupage ? "blue" : "cyan"}">${escapeHtml(row.isGroupage ? "Groupage BRT" : "FTL/LTL")}</span>
            <span class="pill">${escapeHtml(carrier)} / ${escapeHtml(service)}</span>
            <span class="pill ${slaBad ? "red" : "green"}">${escapeHtml(rowValue(row, "SLA Contratto", "SLA n/d"))}</span>
          </div>
        </header>

        <div class="control-route">
          <div>
            <span>Consegna</span>
            <strong>${escapeHtml(rowValue(row, "Route To Address", "Indirizzo non indicato"))}</strong>
          </div>
          <em>${escapeHtml(rowValue(row, "Provincia", "Prov. n/d"))}</em>
        </div>

        <div class="control-facts">
          ${renderPlanningFact("Wave", rowValue(row, "Wave", "N/d"))}
          ${renderPlanningFact("Partenza", rowValue(row, "Data Partenza Wave", "-"))}
          ${renderPlanningFact("Late ship", rowValue(row, "Late Ship Date", "-"))}
          ${renderPlanningFact("Early delivery", rowValue(row, "Early Delivery Date", "-"))}
          ${renderPlanningFact("Pallet", rowValue(row, "Theoretical Pallets", "-"))}
          ${renderPlanningFact("Fatturati", rowValue(row, "Pallet Fatturati", "-"))}
          ${renderPlanningFact("Peso kg", rowValue(row, "Grand Total Shipment Ftp Wgt Kg", "-"))}
          ${renderPlanningFact("Volume", rowValue(row, "Grand Total Shipment Ftp Vol m3", "-"))}
          ${renderPlanningFact("Attivo", rowValue(row, "Costo Attivo", "-"), "money")}
          ${renderPlanningFact("Passivo", rowValue(row, "Costo Passivo", "-"), "money")}
          ${renderPlanningFact("Margine", rowValue(row, "Margine", "-"), marginClass)}
          ${renderPlanningFact("Freight", rowValue(row, "Freight Code", "-"))}
        </div>

        <footer class="control-card-footer">
          <p>${escapeHtml(note || "Nessuna nota spedizione.")}</p>
          <div>${quickActions.join("")}</div>
        </footer>
        ${state.detailShipment === row.shipment ? renderDetailMarkup(row, { inline: true }) : ""}
      </div>
    </article>
  `;
}

function renderSections() {
  const meta = pageMeta[state.page];
  els.content.innerHTML = meta.sections.map(([key, title]) => {
    const rows = (state.data.groups[key] || []).filter(row => rowMatches(row, key));
    return renderSection(key, title, rows);
  }).join("");
  syncBulkCheckboxes();
}

function renderSection(key, title, rows) {
  const countLabel = `${rows.length} spedizion${rows.length === 1 ? "e" : "i"}`;
  return `
    <section class="shipment-section" data-section="${key}">
      <div class="section-title">
        <h2>${escapeHtml(title)}</h2>
        <span>${countLabel}</span>
      </div>
      ${rows.length ? renderTable(rows, key) : `<div class="empty">Nessuna spedizione in questa sezione.</div>`}
    </section>
  `;
}

function renderTable(rows, sectionKey) {
  const columns = displayColumnsForCurrentPage();
  const canReorder = state.page === "planning";
  const selectedRows = rows.filter(row => state.selected.has(row.shipment)).length;
  const allSelected = rows.length > 0 && selectedRows === rows.length;
  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th class="check-cell">
              <input
                class="bulk-check"
                type="checkbox"
                data-section="${escapeHtml(sectionKey)}"
                ${allSelected ? "checked" : ""}
                aria-label="Seleziona tutte le spedizioni visibili"
              />
            </th>
            ${columns.map(column => `
              <th
                class="${canReorder ? "draggable-column" : ""}"
                data-column="${escapeHtml(column.key)}"
                draggable="${canReorder ? "true" : "false"}"
                title="${canReorder ? "Trascina per riordinare le colonne" : ""}"
              >${escapeHtml(column.title)}</th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => renderRow(row, columns)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function syncBulkCheckboxes() {
  document.querySelectorAll(".shipment-section").forEach(section => {
    const bulk = section.querySelector(".bulk-check");
    if (!bulk) return;
    const shipments = [...section.querySelectorAll("tbody tr[data-shipment], .planning-card[data-shipment]")]
      .map(row => row.dataset.shipment)
      .filter(Boolean);
    const selectedCount = shipments.filter(shipment => state.selected.has(shipment)).length;
    bulk.checked = shipments.length > 0 && selectedCount === shipments.length;
    bulk.indeterminate = selectedCount > 0 && selectedCount < shipments.length;
    bulk.disabled = shipments.length === 0;
  });
}

function renderRow(row, columns) {
  const shipment = row.shipment;
  const selected = state.selected.has(shipment);
  const margin = Number(String(row.raw["Margine"] || "0").replace(",", "."));
  const slaStatus = String(row.raw["SLA Contratto"] || row.display["SLA Contratto"] || "").toLowerCase();
  const unloadKey = unloadDateKey(row);
  const todayKey = todayIso();
  const classes = [
    selected ? "selected" : "",
    margin < 0 ? "loss-row" : "",
    slaStatus.includes("non rispettato") ? "sla-breach-row" : "",
    state.page === "ftl" && unloadKey === todayKey ? "unload-today-row" : "",
    state.page === "ftl" && unloadKey && unloadKey < todayKey ? "unload-overdue-row" : "",
  ].filter(Boolean).join(" ");
  const detailRow = state.detailShipment === shipment ? `
    <tr class="inline-detail-row">
      <td colspan="${columns.length + 1}">
        ${renderDetailMarkup(row, { inline: true })}
      </td>
    </tr>
  ` : "";
  return `
    <tr class="${classes}" data-shipment="${escapeHtml(shipment)}">
      <td class="check-cell">
        <input class="row-check" type="checkbox" ${selected ? "checked" : ""} aria-label="Seleziona ${escapeHtml(shipment)}" />
      </td>
      ${columns.map(column => `<td data-column="${escapeHtml(column.key)}">${escapeHtml(row.display[column.key] || "")}</td>`).join("")}
    </tr>
    ${detailRow}
  `;
}

function updateSelection() {
  const count = state.selected.size;
  els.selectionInfo.textContent = `${count} selezionat${count === 1 ? "a" : "e"}`;
  if (els.actionMenuCount) {
    els.actionMenuCount.textContent = String(count);
    els.actionMenuCount.hidden = count === 0;
  }
  if (els.departedSelectionInfo) {
    els.departedSelectionInfo.textContent = `${count} selezionat${count === 1 ? "a" : "e"}`;
  }
}

function selectedShipments() {
  return [...state.selected];
}

function allRows() {
  return rowsFromGroupKeys(state.data, PRIMARY_GROUP_KEYS);
}

function rowsFromData(data) {
  return rowsFromGroupKeys(data, BILLING_GROUP_KEYS);
}

function billingSourceRows() {
  return rowsFromGroupKeys(state.data, BILLING_GROUP_KEYS);
}

function rowsFromGroupKeys(data, groupKeys) {
  const groups = data?.groups || {};
  const byShipment = new Map();
  groupKeys.forEach(key => {
    (groups[key] || []).forEach(row => {
      const shipment = row.shipment || row.raw?.Shipment || row.display?.Shipment;
      if (shipment && !byShipment.has(shipment)) {
        byShipment.set(shipment, row);
      }
    });
  });
  return [...byShipment.values()];
}

function shipmentSetFromData(data) {
  return new Set(rowsFromData(data).map(row => row.shipment).filter(Boolean));
}

function newShipmentsBetween(previousData, nextData) {
  const previous = shipmentSetFromData(previousData);
  return [...shipmentSetFromData(nextData)].filter(shipment => !previous.has(shipment));
}

function existingShipments(shipments) {
  const currentShipments = new Set(allRows().map(row => row.shipment));
  return shipments.filter(shipment => currentShipments.has(shipment));
}

async function reloadAfterMutation(previousSelection, { keepSelection = false } = {}) {
  await loadData({ renderPage: false });
  const stillVisible = existingShipments(previousSelection);
  state.selected = keepSelection ? new Set(stillVisible) : new Set();
  render();
  if (keepSelection && stillVisible.length) {
    renderDetail(stillVisible[0]);
  } else {
    clearDetail();
  }
}

async function performAction(action, extra = {}) {
  const shipments = selectedShipments();
  if (!shipments.length) {
    showToast("Seleziona almeno una spedizione.");
    return;
  }
  if (action === "delivered" && state.page !== "ftl") {
    showToast("Consegnata / XML e disponibile solo in FTL CONFERMATI.");
    return;
  }
  if (action === "departed" && state.page !== "groupage") {
    showToast("Groupage caricato si usa solo dalla pagina Groupage pianificato.");
    return;
  }
  if (action === "manual_pallets" && state.page !== "groupage") {
    showToast("I bancali manuali si modificano dalla pagina Groupage.");
    return;
  }
  if (action === "unload_date" && state.page !== "ftl") {
    showToast("La data scarico si imposta dalla pagina FTL.");
    return;
  }
  if (action === "restore_deleted" && state.page !== "deleted") {
    showToast("Apri Spedizioni eliminate per ripristinare le righe.");
    return;
  }
  if (action === "purge_deleted" && state.page !== "deleted") {
    showToast("Apri Spedizioni eliminate per cancellare definitivamente.");
    return;
  }
  if (action === "delete" && !confirm(`Eliminare definitivamente ${shipments.length} spedizioni?`)) {
    return;
  }
  if (action === "purge_deleted" && !confirm(`Cancellare per sempre ${shipments.length} spedizioni eliminate? Non potrai piu ripristinarle.`)) {
    return;
  }
  const payload = await api("/api/action", {
    method: "POST",
    body: JSON.stringify({ action, shipments, ...extra }),
  });
  await reloadAfterMutation(shipments, { keepSelection: ["carrier", "service_level", "manual_passive", "manual_pallets", "unload_date", "active_urgent"].includes(action) });
  if (action === "delivered" && payload.xmlFiles?.length) {
    if (payload.downloadUrl) triggerDownload(payload.downloadUrl);
    showToast(`XML creato in Download: ${payload.xmlFiles.join(", ")}. Clicca qui per aprirlo.`, {
      openPath: payload.xmlPaths?.[0] || "",
      downloadUrl: payload.downloadUrl || "",
    });
  } else if (action === "departed") {
    showToast("Spedizioni spostate in Groupage caricato.");
  } else {
    showToast("Operazione completata. Dati aggiornati.");
  }
}

function rowText(row) {
  const extraColumns = [
    "Costo Attivo",
    "Extra Attivi Totale",
    "Extra Attivi Applicati",
    "Costo Passivo Base BRT",
    "Extra BRT Totale",
    "Costo Passivo Manuale",
    "Pallet Manuali",
    "Costo Passivo",
    "Margine",
    "SLA Contratto",
    "Data Scarico Prenotato",
    "Data Ship Minima SLA",
    "Prima Consegna SLA",
    "Dettaglio SLA",
    "Tariffa Attiva Applicata",
    "Tariffa Passiva Applicata",
    "Extra BRT Applicati",
  ];
  const columns = [
    ...displayColumnsForCurrentPage().map(column => column.key),
    ...extraColumns,
  ];
  const titleMap = {
    ...Object.fromEntries(displayColumnsForCurrentPage().map(column => [column.key, column.title])),
    "Costo Attivo": "Attivo",
    "Costo Passivo Base BRT": "Passiva base",
    "Extra BRT Totale": "Extra BRT",
    "Costo Passivo Manuale": "Passiva manuale",
    "Pallet Manuali": "Pallet manuali",
    "Costo Passivo": "Passiva totale",
    "Margine": "Margine",
    "SLA Contratto": "SLA",
    "Data Scarico Prenotato": "Scarico prenotato",
    "Data Ship Minima SLA": "Min. ship SLA",
    "Prima Consegna SLA": "Min. consegna SLA",
    "Dettaglio SLA": "Dettaglio SLA",
    "Tariffa Attiva Applicata": "Tariffa attiva",
    "Extra Attivi Totale": "Extra attivi",
    "Extra Attivi Applicati": "Extra attivi applicati",
    "Tariffa Passiva Applicata": "Tariffa passiva",
    "Extra BRT Applicati": "Extra BRT applicati",
  };
  const uniqueColumns = [...new Set(columns)].filter(column => {
    const value = row.display[column] || row.raw[column];
    return value !== undefined && String(value).trim() !== "";
  });
  return uniqueColumns
    .map(column => `${titleMap[column] || column}: ${row.display[column] || row.raw[column]}`)
    .join("\n");
}

function cellText(row, column) {
  return String(row.display[column] || row.raw[column] || "");
}

function selectedTextInside(element) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return "";
  const text = selection.toString().trim();
  if (!text) return "";
  const anchorInside = element.contains(selection.anchorNode);
  const focusInside = element.contains(selection.focusNode);
  return anchorInside && focusInside ? text : "";
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function showCopyMenu(event, shipment, cell = null) {
  state.copyShipment = shipment;
  state.copyColumn = cell?.dataset.column || "";
  state.copySelectedText = cell ? selectedTextInside(cell) : "";
  const isRowSelected = state.selected.has(shipment);
  const hasCellText = Boolean(state.copySelectedText || state.copyColumn);
  const actions = [];
  if (hasCellText) {
    actions.push(`
      <button type="button" data-copy-action="cell">
        ${state.copySelectedText ? "Copia testo selezionato" : "Copia testo cella"}
      </button>
    `);
  }
  if (isRowSelected) {
    actions.push(`<button type="button" data-copy-action="row">Copia tutta la riga</button>`);
  }
  if (!actions.length) {
    return;
  }
  copyMenu.innerHTML = actions.join("");
  copyMenu.hidden = false;
  const menuWidth = 190;
  const menuHeight = 82;
  const left = Math.min(event.clientX + 8, window.innerWidth - menuWidth - 12);
  const top = Math.min(event.clientY + 8, window.innerHeight - menuHeight - 12);
  copyMenu.style.left = `${Math.max(12, left)}px`;
  copyMenu.style.top = `${Math.max(12, top)}px`;
}

function hideCopyMenu() {
  copyMenu.hidden = true;
  state.copyShipment = "";
  state.copyColumn = "";
  state.copySelectedText = "";
}

async function notifyNewShipments(count, fileName = "") {
  const label = `${count} nuov${count === 1 ? "a" : "e"} spedizion${count === 1 ? "e" : "i"}`;
  const message = fileName
    ? `${label} importat${count === 1 ? "a" : "e"} da ${fileName}.`
    : `${label} importat${count === 1 ? "a" : "e"}.`;
  showToast(message);
  if (!("Notification" in window)) return;
  try {
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission === "granted") {
      new Notification("V-Tech Trasporti", {
        body: message,
        tag: "vtech-new-shipments",
        renotify: true,
      });
    }
  } catch (_error) {
    // La notifica browser e un extra: il toast resta sempre visibile nell'app.
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",", 2)[1] : result);
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("Lettura file non riuscita.")));
    reader.readAsDataURL(file);
  });
}

function triggerDownload(url) {
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function copyMailToClipboard(html, text) {
  const plainText = text || html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (navigator.clipboard && window.ClipboardItem && html) {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plainText], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    return "html";
  }
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(plainText);
    return "text";
  }
  const textarea = document.createElement("textarea");
  textarea.value = plainText;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return "text";
}

async function uploadOperationalFile(kind, file) {
  if (!file) return;
  const labels = {
    report: "Report V-Tech",
    active: "tariffe attive",
    brt: "passiva BRT",
  };
  showToast(`Carico ${labels[kind] || "file"}...`);
  const payload = await api("/api/upload-file", {
    method: "POST",
    body: JSON.stringify({
      kind,
      filename: file.name,
      contentBase64: await fileToBase64(file),
    }),
  });
  applyData(payload.data, { renderPage: true, keepSelection: false });
  showToast(kind === "report" ? "Report caricato e importato." : `${labels[kind]} caricata. Calcoli aggiornati.`);
}

function clampActionDockPosition(left, top) {
  const dock = els.operationBar;
  const margin = 8;
  const width = Math.max(dock?.offsetWidth || 52, 44);
  const height = Math.max(dock?.offsetHeight || 52, 44);
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  return {
    left: Math.min(Math.max(margin, left), maxLeft),
    top: Math.min(Math.max(margin, top), maxTop),
  };
}

function setActionDockPosition(left, top, { save = false } = {}) {
  const dock = els.operationBar;
  if (!dock) return;
  const position = clampActionDockPosition(left, top);
  dock.classList.add("is-positioned");
  dock.style.setProperty("--action-dock-left", `${Math.round(position.left)}px`);
  dock.style.setProperty("--action-dock-top", `${Math.round(position.top)}px`);
  if (save) {
    try {
      window.localStorage.setItem(ACTION_DOCK_STORAGE_KEY, JSON.stringify(position));
    } catch (_error) {
      // Se il browser blocca localStorage, il drag continua comunque a funzionare.
    }
  }
}

function restoreActionDockPosition() {
  if (!els.operationBar) return;
  try {
    const raw = window.localStorage.getItem(ACTION_DOCK_STORAGE_KEY);
    if (!raw) return;
    const position = JSON.parse(raw);
    const left = Number(position.left ?? position.x);
    const top = Number(position.top ?? position.y);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      setActionDockPosition(left, top);
    }
  } catch (_error) {
    window.localStorage.removeItem(ACTION_DOCK_STORAGE_KEY);
  }
}

function initActionDockDrag() {
  const dock = els.operationBar;
  const summary = dock?.querySelector(".action-menu summary");
  if (!dock || !summary) return;

  summary.title = "Clicca per aprire le azioni. Tieni premuto e trascina per spostarlo.";
  restoreActionDockPosition();

  summary.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const rect = dock.getBoundingClientRect();
    state.actionDockDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    };
    state.actionDockSuppressClick = false;
    try {
      summary.setPointerCapture(event.pointerId);
    } catch (_error) {
      // Alcuni browser non catturano pointer touch sul summary: il drag resta gestito dal documento.
    }
  });

  summary.addEventListener("click", (event) => {
    if (!state.actionDockSuppressClick) return;
    event.preventDefault();
    state.actionDockSuppressClick = false;
  });

  document.addEventListener("pointermove", (event) => {
    const drag = state.actionDockDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      state.actionDockSuppressClick = true;
      const menu = dock.querySelector(".action-menu");
      if (menu) menu.open = false;
      dock.classList.add("is-dragging");
    }
    event.preventDefault();
    setActionDockPosition(drag.left + deltaX, drag.top + deltaY);
  });

  const finishDrag = (event) => {
    const drag = state.actionDockDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dock.classList.remove("is-dragging");
    state.actionDockDrag = null;
    if (drag.moved) {
      const rect = dock.getBoundingClientRect();
      setActionDockPosition(rect.left, rect.top, { save: true });
    }
    try {
      summary.releasePointerCapture(event.pointerId);
    } catch (_error) {
      // No-op.
    }
  };

  document.addEventListener("pointerup", finishDrag);
  document.addEventListener("pointercancel", finishDrag);

  window.addEventListener("resize", () => {
    if (!dock.classList.contains("is-positioned")) return;
    const rect = dock.getBoundingClientRect();
    setActionDockPosition(rect.left, rect.top, { save: true });
  });
}

initActionDockDrag();

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.data?.auth?.billingOnly && button.dataset.page !== "billing") return;
    if (button.dataset.page === "admin" && !state.data?.auth?.canAdmin) return;
    state.page = button.dataset.page;
    state.selected.clear();
    render();
    clearDetail();
  });
});

els.deletedBox.addEventListener("click", () => {
  if (state.data?.auth?.billingOnly) return;
  state.page = "deleted";
  state.selected.clear();
  render();
  clearDetail();
});

if (els.logoutBtn) {
  els.logoutBtn.addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST", body: "{}" });
    } finally {
      window.location.href = "/login.html";
    }
  });
}

els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  if (state.page === "planning") {
    renderPlanningWorkspace();
  } else {
    renderSections();
  }
});

els.departedDateFilter.addEventListener("input", (event) => {
  state.departedDate = event.target.value;
  state.selected.clear();
  renderSections();
  updateSelection();
  clearDetail();
});

els.departedSearchInput.addEventListener("input", (event) => {
  state.departedSearch = event.target.value.trim();
  state.selected.clear();
  renderSections();
  updateSelection();
  clearDetail();
});

els.todayDepartedFilter.addEventListener("click", () => {
  state.departedDate = todayIso();
  state.selected.clear();
  render();
  clearDetail();
});

els.clearDepartedFilters.addEventListener("click", () => {
  state.departedDate = "";
  state.departedSearch = "";
  state.selected.clear();
  render();
  clearDetail();
});

[
  [els.reportUploadBtn, els.reportUpload, "report"],
  [els.activeUploadBtn, els.activeUpload, "active"],
  [els.brtUploadBtn, els.brtUpload, "brt"],
].forEach(([button, input, kind]) => {
  if (!button || !input) return;
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      await uploadOperationalFile(kind, file);
    } catch (error) {
      showToast(error.message);
    }
  });
});

els.content.addEventListener("change", (event) => {
  if (event.target.matches("#billingMonthSelect")) {
    state.billingMonth = event.target.value;
    renderBilling();
  }
});

els.content.addEventListener("submit", async (event) => {
  if (!event.target.matches("#adminUserForm")) return;
  event.preventDefault();
  try {
    const payload = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        action: "save",
        username: document.querySelector("#adminUsername")?.value || "",
        displayName: document.querySelector("#adminDisplayName")?.value || "",
        role: document.querySelector("#adminRole")?.value || "operator",
        password: document.querySelector("#adminPassword")?.value || "",
      }),
    });
    state.adminUsers = payload.users || [];
    state.adminUsersLoaded = true;
    renderAdmin();
    showToast("Profilo salvato.");
  } catch (error) {
    showToast(error.message);
  }
});

els.content.addEventListener("click", async (event) => {
  const dashboardTarget = event.target.closest("[data-dashboard-page]");
  if (dashboardTarget) {
    state.page = dashboardTarget.dataset.dashboardPage;
    state.selected.clear();
    render();
    clearDetail();
    return;
  }
  const clearAdmin = event.target.closest("#adminClearForm");
  if (clearAdmin) {
    clearAdminForm();
    return;
  }
  const editAdmin = event.target.closest("[data-admin-edit]");
  if (editAdmin) {
    fillAdminForm(editAdmin.dataset.adminEdit);
    return;
  }
  const deleteAdmin = event.target.closest("[data-admin-delete]");
  if (deleteAdmin) {
    const username = deleteAdmin.dataset.adminDelete;
    if (!window.confirm(`Eliminare il profilo ${username}?`)) return;
    try {
      const payload = await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ action: "delete", username }),
      });
      state.adminUsers = payload.users || [];
      state.adminUsersLoaded = true;
      renderAdmin();
      showToast("Profilo eliminato.");
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (event.target.matches("#saveFuelBtn")) {
    try {
      const payload = await api("/api/fuel-settings", {
        method: "POST",
        body: JSON.stringify({
          month: state.billingMonth,
          activeFuel: document.querySelector("#billingActiveFuel")?.value || "0",
          passiveFuel: document.querySelector("#billingPassiveFuel")?.value || "2",
        }),
      });
      applyData(payload.data, { renderPage: true, keepSelection: false });
      showToast("Fuel mensile salvato. Tariffe e grafici ricalcolati.");
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (!event.target.matches("#exportPassiveBtn, #exportActiveBtn")) return;
  const isActiveExport = event.target.matches("#exportActiveBtn");
  try {
    const payload = await api(isActiveExport ? "/api/active-export" : "/api/passive-export", {
      method: "POST",
      body: JSON.stringify({ month: state.billingMonth }),
    });
    showToast(`${isActiveExport ? "Excel fatturazione attiva" : "Excel passivo"} creato in Download: ${payload.file}. Clicca qui per aprirlo.`, {
      openPath: payload.path,
      downloadUrl: payload.downloadUrl || "",
    });
  } catch (error) {
    showToast(error.message);
  }
});

els.content.addEventListener("dragstart", (event) => {
  const header = event.target.closest("th[data-column]");
  if (!header || state.page !== "planning") return;
  state.dragColumnKey = header.dataset.column;
  header.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.dragColumnKey);
});

els.content.addEventListener("dragover", (event) => {
  const header = event.target.closest("th[data-column]");
  if (!header || !state.dragColumnKey || state.page !== "planning") return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".drop-target").forEach(item => item.classList.remove("drop-target"));
  header.classList.add("drop-target");
});

els.content.addEventListener("drop", (event) => {
  const header = event.target.closest("th[data-column]");
  if (!header || !state.dragColumnKey || state.page !== "planning") return;
  event.preventDefault();
  const moved = moveColumn(state.dragColumnKey, header.dataset.column);
  document.querySelectorAll(".drop-target, .dragging").forEach(item => item.classList.remove("drop-target", "dragging"));
  state.dragColumnKey = "";
  if (moved) {
    renderSections();
    showToast("Ordine colonne salvato.");
  }
});

els.content.addEventListener("dragend", () => {
  document.querySelectorAll(".drop-target, .dragging").forEach(item => item.classList.remove("drop-target", "dragging"));
  state.dragColumnKey = "";
});

els.content.addEventListener("click", (event) => {
  const cardAction = event.target.closest("[data-card-action]");
  if (cardAction) {
    event.preventDefault();
    state.selected = new Set([cardAction.dataset.shipment]);
    performAction(cardAction.dataset.cardAction).catch(error => showToast(error.message));
    return;
  }
  const cardPage = event.target.closest("[data-card-page]");
  if (cardPage) {
    event.preventDefault();
    state.page = cardPage.dataset.cardPage;
    state.selected.clear();
    render();
    clearDetail();
    return;
  }

  const bulkCheck = event.target.closest(".bulk-check");
  if (bulkCheck) {
    hideCopyMenu();
    const section = bulkCheck.closest(".shipment-section");
    const shipments = section
      ? [...section.querySelectorAll("tbody tr[data-shipment], .planning-card[data-shipment]")]
          .map(row => row.dataset.shipment)
          .filter(Boolean)
      : [];
    shipments.forEach(shipment => {
      bulkCheck.checked ? state.selected.add(shipment) : state.selected.delete(shipment);
    });
    if (state.page === "planning") {
      renderPlanningWorkspace();
    } else {
      renderSections();
    }
    updateSelection();
    clearDetail();
    return;
  }

  const planningCard = event.target.closest(".planning-card[data-shipment]");
  if (planningCard) {
    hideCopyMenu();
    const shipment = planningCard.dataset.shipment;
    if (event.target.matches(".row-check")) {
      event.target.checked ? state.selected.add(shipment) : state.selected.delete(shipment);
      renderPlanningWorkspace();
      updateSelection();
      return;
    }
    state.detailShipment = state.detailShipment === shipment ? "" : shipment;
    renderPlanningWorkspace();
    return;
  }

  const row = event.target.closest("tr[data-shipment]");
  const cell = event.target.closest("td[data-column]");
  if (row && cell && selectedTextInside(cell)) {
    event.preventDefault();
    showCopyMenu(event, row.dataset.shipment, cell);
    return;
  }
  if (row && event.detail > 1) {
    event.preventDefault();
    showCopyMenu(event, row.dataset.shipment, cell);
    return;
  }

  hideCopyMenu();
  if (!row) return;
  const shipment = row.dataset.shipment;
  if (event.target.matches(".row-check")) {
    event.target.checked ? state.selected.add(shipment) : state.selected.delete(shipment);
    renderSections();
    updateSelection();
    return;
  }

  state.detailShipment = state.detailShipment === shipment ? "" : shipment;
  renderSections();
});

els.content.addEventListener("dblclick", (event) => {
  const row = event.target.closest("tr[data-shipment]");
  if (!row) return;
  event.preventDefault();
  const cell = event.target.closest("td[data-column]");
  window.setTimeout(() => showCopyMenu(event, row.dataset.shipment, cell), 0);
});

els.content.addEventListener("contextmenu", (event) => {
  const row = event.target.closest("tr[data-shipment]");
  if (!row) return;
  event.preventDefault();
  showCopyMenu(event, row.dataset.shipment, event.target.closest("td[data-column]"));
});

copyMenu.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-action]");
  if (!button || !state.copyShipment) return;
  const row = allRows().find(item => item.shipment === state.copyShipment);
  if (!row) {
    hideCopyMenu();
    return;
  }
  try {
    const text = button.dataset.copyAction === "row"
      ? rowText(row)
      : (state.copySelectedText || cellText(row, state.copyColumn));
    await copyText(text);
    showToast(button.dataset.copyAction === "row" ? `Riga ${state.copyShipment} copiata.` : "Testo copiato.");
  } catch (_error) {
    showToast("Copia non riuscita.");
  } finally {
    hideCopyMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideCopyMenu();
});

document.addEventListener("click", (event) => {
  if (!copyMenu.hidden && !event.target.closest(".copy-menu") && !event.target.closest("tr[data-shipment]")) {
    hideCopyMenu();
  }
});

els.toast.addEventListener("click", async () => {
  const openPath = els.toast.dataset.openPath;
  const downloadUrl = els.toast.dataset.downloadUrl;
  if (downloadUrl) {
    window.open(downloadUrl, "_blank", "noopener");
    return;
  }
  if (!openPath) return;
  try {
    await api("/api/open-path", {
      method: "POST",
      body: JSON.stringify({ path: openPath }),
    });
  } catch (error) {
    showToast(error.message);
  }
});

function renderDetailMarkup(row, options = {}) {
  const money = (key) => row.display[key] || "-";
  const text = (key) => row.raw[key] || row.display[key] || "-";
  const marginNumber = Number(String(row.raw["Margine"] || "0").replace(",", "."));
  const marginClass = marginNumber < 0 ? "negative" : "positive";
  const manualPassive = row.display["Costo Passivo Manuale"] || "";
  const manualService = row.raw["Service Level Manuale"] || "";
  const manualPallets = row.display["Pallet Manuali"] || row.raw["Pallet Manuali"] || "";
  const activeUrgent = String(row.raw["Attiva Urgente"] || "").toUpperCase() === "SI";
  return `
    <div class="detail-inline ${options.inline ? "inside-card" : ""}">
      <div class="detail-header">
      <div>
        <h3>${escapeHtml(row.shipment)} - ${escapeHtml(row.display["Route to Customer"] || "")}</h3>
        <p>${escapeHtml(row.display["Route To Address"] || "")}</p>
      </div>
      <div class="detail-badge">${escapeHtml(row.display["Carrier Scelto"] || row.raw["Carrier Scelto"] || "")} - ${escapeHtml(row.display["Service Level"] || "")}${manualService ? " · SERVICE MANUALE" : ""}${manualPassive ? " · PASSIVA MANUALE" : ""}</div>
    </div>
    <div class="finance-grid">
      <div class="finance-card finance-active">
        <span>Costo attivo</span>
        <strong>${escapeHtml(money("Costo Attivo"))}</strong>
      </div>
      <div class="finance-card finance-extra-active">
        <span>Extra attivi</span>
        <strong>${escapeHtml(money("Extra Attivi Totale"))}</strong>
      </div>
      <div class="finance-card finance-passive-base">
        <span>Passiva base</span>
        <strong>${escapeHtml(money("Costo Passivo Base BRT"))}</strong>
      </div>
      <div class="finance-card finance-extra">
        <span>Extra BRT</span>
        <strong>${escapeHtml(money("Extra BRT Totale"))}</strong>
      </div>
      <div class="finance-card finance-passive-total">
        <span>Passiva totale</span>
        <strong>${escapeHtml(money("Costo Passivo"))}</strong>
      </div>
      <div class="finance-card finance-margin ${marginClass}">
        <span>Margine</span>
        <strong>${escapeHtml(money("Margine"))}</strong>
      </div>
    </div>
    <div class="detail-columns">
      <div class="detail-box">
        <span>Extra attivi applicati</span>
        <p>${escapeHtml(text("Extra Attivi Applicati") || "Nessun extra attivo")}</p>
      </div>
      <div class="detail-box">
        <span>Tariffa attiva applicata</span>
        <p>${escapeHtml(text("Tariffa Attiva Applicata"))}</p>
      </div>
      ${manualPassive ? `
      <div class="detail-box manual-passive-box">
        <span>Passiva manuale</span>
        <p>Prezzo concordato: ${escapeHtml(manualPassive)}. Questo valore sostituisce la passiva da tariffario nel calcolo del margine.</p>
      </div>
      ` : ""}
      ${manualService ? `
      <div class="detail-box manual-passive-box">
        <span>Service level manuale</span>
        <p>${escapeHtml(manualService)} applicato manualmente. ${manualService === "LTL" ? "La spedizione viene gestita nel groupage BRT." : "La spedizione viene gestita come diretta FTL."}</p>
      </div>
      ` : ""}
      ${manualPallets ? `
      <div class="detail-box manual-passive-box">
        <span>Bancali manuali</span>
        <p>Valore forzato: ${escapeHtml(manualPallets)} pallet. Attivo, passivo e margine vengono ricalcolati con questo valore dove il tariffario lo prevede.</p>
      </div>
      ` : ""}
      ${activeUrgent ? `
      <div class="detail-box manual-passive-box">
        <span>Extra attiva urgente</span>
        <p>Urgent delivery applicato manualmente: 15 euro per pallet fatturato.</p>
      </div>
      ` : ""}
      <div class="detail-box">
        <span>Tariffa passiva applicata</span>
        <p>${escapeHtml(text("Tariffa Passiva Applicata"))}</p>
      </div>
      <div class="detail-box ${unloadDateKey(row) === todayIso() ? "unload-alert" : ""}">
        <span>Scarico prenotato</span>
        <p>${escapeHtml(text("Data Scarico Prenotato"))}</p>
      </div>
      <div class="detail-box">
        <span>Extra BRT applicati</span>
        <p>${escapeHtml(text("Extra BRT Applicati") || "Nessun extra BRT")}</p>
      </div>
      <div class="detail-box ${String(row.raw["SLA Contratto"] || "").toLowerCase().includes("non rispettato") ? "sla-alert" : ""}">
        <span>SLA contratto</span>
        <p>${escapeHtml(text("Dettaglio SLA"))}</p>
      </div>
      <div class="detail-box">
        <span>Note spedizione</span>
        <p>${escapeHtml(text("Note Text"))}</p>
      </div>
      <div class="detail-box">
        <span>XML consegna</span>
        <p>${escapeHtml(text("XML Consegna"))}</p>
      </div>
    </div>
    </div>
  `;
}

function renderDetail(shipment) {
  const row = allRows().find(item => item.shipment === shipment);
  if (!row) return;
  state.detailShipment = shipment;
  document.querySelector("#detailPanel").innerHTML = renderDetailMarkup(row);
}

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await performAction(button.dataset.action);
    } catch (error) {
      showToast(error.message);
    }
  });
});

document.querySelector("#selectAllBtn").addEventListener("click", () => {
  const meta = pageMeta[state.page];
  meta.sections.forEach(([key]) => {
    (state.data.groups[key] || []).filter(row => rowMatches(row, key)).forEach(row => state.selected.add(row.shipment));
  });
  if (state.page === "planning") {
    renderPlanningWorkspace();
  } else {
    renderSections();
  }
  updateSelection();
});

document.querySelector("#refreshBtn").addEventListener("click", async () => {
  await loadData();
  showToast("Dati aggiornati.");
});

els.refreshTopBtn.addEventListener("click", async () => {
  await loadData();
  showToast("Dati aggiornati.");
});

async function scanDownloadsSilently() {
  if (state.data?.auth?.cloudMode) return;
  if (state.data?.auth?.billingOnly) return;
  if (state.autoScanRunning) return;
  state.autoScanRunning = true;
  try {
    const previousData = state.data;
    const payload = await api("/api/scan-downloads", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const nextData = payload.data || state.data;
    const newShipments = newShipmentsBetween(previousData, nextData);
    const inserted = Math.max(Number(payload.result?.inserted || 0), newShipments.length);
    if (payload.result?.imported || payload.sent?.departed || newShipments.length) {
      applyData(nextData, { renderPage: false, keepSelection: false });
      state.autoScanWarningShown = false;
      render();
      if (inserted > 0) {
        await notifyNewShipments(inserted, payload.result?.file || "");
      } else if (payload.result?.imported) {
        showToast(`File aggiornato automaticamente: ${payload.result.file}`);
      } else if (payload.sent?.departed) {
        showToast(`${payload.sent.departed} spedizioni spostate in Groupage caricato dopo invio mail.`);
      }
    } else if (payload.result && payload.result.error && !state.autoScanWarningShown) {
      state.autoScanWarningShown = true;
      showToast(payload.result.error);
    }
  } catch (error) {
    if (!state.autoScanWarningShown) {
      state.autoScanWarningShown = true;
      showToast(error.message);
    }
  } finally {
    state.autoScanRunning = false;
  }
}

document.querySelector("#importBtn").addEventListener("click", async () => {
  try {
    await api("/api/import", {
      method: "POST",
      body: JSON.stringify({
        vtechPath: els.vtechPath.value,
        activeRatesPath: els.activePath.value,
        brtPassivePath: els.brtPath.value,
      }),
    });
    await loadData({ renderPage: false });
    state.selected.clear();
    render();
    showToast("Importazione completata.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#carrierBtn").addEventListener("click", () => {
  if (!state.selected.size) {
    showToast("Seleziona almeno una spedizione.");
    return;
  }
  els.carrierSelect.innerHTML = state.data.carriers.map(carrier => `<option>${escapeHtml(carrier)}</option>`).join("");
  els.carrierDialog.showModal();
});

els.serviceLevelBtn.addEventListener("click", () => {
  if (!state.selected.size) {
    showToast("Seleziona almeno una spedizione.");
    return;
  }
  const shipments = selectedShipments();
  const row = shipments.length === 1 ? allRows().find(item => item.shipment === shipments[0]) : null;
  const current = String(row?.raw["Service Level"] || row?.display["Service Level"] || "LTL").toUpperCase();
  els.serviceLevelSelect.value = current === "FTL" ? "FTL" : "LTL";
  els.serviceLevelDialog.showModal();
});

els.manualPassiveBtn.addEventListener("click", () => {
  if (!state.selected.size) {
    showToast("Seleziona almeno una spedizione.");
    return;
  }
  const shipments = selectedShipments();
  const row = shipments.length === 1 ? allRows().find(item => item.shipment === shipments[0]) : null;
  const current = row?.display["Costo Passivo Manuale"] || row?.raw["Costo Passivo Manuale"] || "";
  els.manualPassiveInput.value = String(current).replace(/^EUR\s*/i, "").trim();
  els.manualPassiveDialog.showModal();
  window.setTimeout(() => els.manualPassiveInput.focus(), 0);
});

els.manualPalletsBtn.addEventListener("click", () => {
  if (!state.selected.size) {
    showToast("Seleziona almeno una spedizione.");
    return;
  }
  if (state.page !== "groupage") {
    showToast("I bancali manuali si modificano dalla pagina Groupage.");
    return;
  }
  const shipments = selectedShipments();
  const row = shipments.length === 1 ? allRows().find(item => item.shipment === shipments[0]) : null;
  const current = row?.display["Pallet Manuali"]
    || row?.raw["Pallet Manuali"]
    || row?.display["Theoretical Pallets"]
    || row?.raw["Theoretical Pallets"]
    || "";
  els.manualPalletsInput.value = String(current).trim();
  els.manualPalletsDialog.showModal();
  window.setTimeout(() => els.manualPalletsInput.focus(), 0);
});

els.unloadDateBtn.addEventListener("click", () => {
  if (!state.selected.size) {
    showToast("Seleziona almeno una spedizione.");
    return;
  }
  if (state.page !== "ftl") {
    showToast("La data scarico si imposta dalla pagina FTL.");
    return;
  }
  const shipments = selectedShipments();
  const row = shipments.length === 1 ? allRows().find(item => item.shipment === shipments[0]) : null;
  els.unloadDateInput.value = unloadDateKey(row || {});
  els.unloadDateDialog.showModal();
  window.setTimeout(() => els.unloadDateInput.focus(), 0);
});

els.activeUrgentBtn.addEventListener("click", () => {
  if (!state.selected.size) {
    showToast("Seleziona almeno una spedizione.");
    return;
  }
  els.activeUrgentDialog.showModal();
});

document.querySelector("#applyCarrierBtn").addEventListener("click", async (event) => {
  event.preventDefault();
  const carrier = els.carrierSelect.value;
  els.carrierDialog.close();
  try {
    await performAction("carrier", { carrier });
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#applyServiceLevelBtn").addEventListener("click", async (event) => {
  event.preventDefault();
  const serviceLevel = els.serviceLevelSelect.value;
  els.serviceLevelDialog.close();
  try {
    await performAction("service_level", { serviceLevel });
    showToast(serviceLevel === "LTL"
      ? "Service level LTL applicato. Spedizione spostata nel groupage BRT."
      : "Service level FTL applicato. Spedizione spostata tra le dirette.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#applyManualPassiveBtn").addEventListener("click", async (event) => {
  event.preventDefault();
  const passiveCost = els.manualPassiveInput.value.trim();
  if (!passiveCost) {
    showToast("Inserisci il costo passivo concordato.");
    return;
  }
  els.manualPassiveDialog.close();
  try {
    await performAction("manual_passive", { passiveCost });
    showToast("Passiva manuale applicata. Margini aggiornati.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#clearManualPassiveBtn").addEventListener("click", async (event) => {
  event.preventDefault();
  els.manualPassiveDialog.close();
  try {
    await performAction("manual_passive", { clear: true });
    showToast("Passiva manuale rimossa. Calcolo tornato al tariffario.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#applyManualPalletsBtn").addEventListener("click", async (event) => {
  event.preventDefault();
  const pallets = els.manualPalletsInput.value.trim();
  if (!pallets) {
    showToast("Inserisci i bancali da usare nel calcolo.");
    return;
  }
  els.manualPalletsDialog.close();
  try {
    await performAction("manual_pallets", { pallets });
    showToast("Bancali manuali applicati. Tariffe e margini aggiornati.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#clearManualPalletsBtn").addEventListener("click", async (event) => {
  event.preventDefault();
  els.manualPalletsDialog.close();
  try {
    await performAction("manual_pallets", { clear: true });
    showToast("Bancali manuali rimossi. Calcolo tornato al valore del report.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#applyUnloadDateBtn").addEventListener("click", async (event) => {
  event.preventDefault();
  const unloadDate = els.unloadDateInput.value;
  if (!unloadDate) {
    showToast("Scegli il giorno dello scarico.");
    return;
  }
  els.unloadDateDialog.close();
  try {
    await performAction("unload_date", { unloadDate });
    showToast("Data scarico salvata. Promemoria aggiornato.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#clearUnloadDateBtn").addEventListener("click", async (event) => {
  event.preventDefault();
  els.unloadDateDialog.close();
  try {
    await performAction("unload_date", { clear: true });
    showToast("Data scarico rimossa.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#applyActiveUrgentBtn").addEventListener("click", async (event) => {
  event.preventDefault();
  els.activeUrgentDialog.close();
  try {
    await performAction("active_urgent");
    showToast("Extra attiva urgente applicata. Attivo e margine aggiornati.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#clearActiveUrgentBtn").addEventListener("click", async (event) => {
  event.preventDefault();
  els.activeUrgentDialog.close();
  try {
    await performAction("active_urgent", { clear: true });
    showToast("Extra attiva urgente rimossa. Attivo e margine aggiornati.");
  } catch (error) {
    showToast(error.message);
  }
});

loadData()
  .then(() => window.setInterval(scanDownloadsSilently, 15000))
  .catch(error => showToast(error.message));

els.mailBtn.addEventListener("click", async () => {
  try {
    const payload = await api("/api/groupage-mail", {
      method: "POST",
      body: JSON.stringify({ date: els.mailDate.value }),
    });
    const copyMode = await copyMailToClipboard(payload.result.clipboardHtml, payload.result.clipboardText);
    const cloudFile = payload.result.downloadUrl ? ` Ho lasciato anche il file ${payload.result.mailFile || "mail"} scaricabile.` : "";
    showToast(`Mail groupage copiata: apri Outlook, nuova mail e fai Incolla.${copyMode === "html" ? " Tabella inclusa." : ""}${cloudFile}`, {
      downloadUrl: payload.result.downloadUrl || "",
    });
  } catch (error) {
    showToast(error.message);
  }
});

els.ftlMailBtn.addEventListener("click", async () => {
  const shipments = selectedShipments();
  if (!shipments.length) {
    showToast("Seleziona una o piu spedizioni FTL pianificate.");
    return;
  }
  try {
    const payload = await api("/api/ftl-mail", {
      method: "POST",
      body: JSON.stringify({ shipments }),
    });
    const copyMode = await copyMailToClipboard(payload.result.clipboardHtml, payload.result.clipboardText);
    const cloudFile = payload.result.downloadUrl ? ` Ho lasciato anche il file ${payload.result.mailFile || "mail"} scaricabile.` : "";
    showToast(`Mail FTL copiata: apri Outlook, nuova mail e fai Incolla.${copyMode === "html" ? " Tabella inclusa." : ""}${cloudFile}`, {
      downloadUrl: payload.result.downloadUrl || "",
    });
  } catch (error) {
    showToast(error.message);
  }
});

els.mailDate.value = new Date().toISOString().slice(0, 10);
