/* V-Tech Trasporti - Sezione OTD (On Time Delivery)
   File AGGIUNTIVO: si aggancia da solo ad app.js senza modificarlo.
   Va caricato in index.html DOPO app.js e claims.js. */
(function () {
  "use strict";

  if (typeof pageMeta === "undefined" || typeof state === "undefined" || typeof els === "undefined") {
    console.warn("[otd] app.js non disponibile: sezione OTD non attivata.");
    return;
  }

  var PAGE = "otd";
  var ROW_LIMIT = 400;
  var MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
  var TONES = { "OK": "ok", "NO": "ko", "SENZA ESITO": "wait", "NON CONSEGNATA": "ko" };

  var otd = {
    loaded: false,
    loading: false,
    rows: [],
    leadTimes: [],
    contractLeadTimes: [],
    bookedDestinations: [],
    outcomes: [],
    excluded: 0,
    excludedCarriers: [],
    month: "",
    carrier: "",
    outcome: "",
    search: "",
    onlyAlert: false,
    selected: {},
    settingsOpen: false,
    busy: false,
  };

  /* ---------------------------------------------------------------- utils */
  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function esc(value) {
    if (typeof escapeHtml === "function") return escapeHtml(text(value));
    return text(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function toast(message, options) {
    if (typeof showToast === "function") showToast(message, options || {});
    else console.log("[otd]", message);
  }

  function shortDate(value) {
    var match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[3] + "/" + match[2] + "/" + match[1] : text(value);
  }

  function monthLabel(key) {
    var match = text(key).match(/^(\d{4})-(\d{2})$/);
    return match ? MONTHS[parseInt(match[2], 10) - 1] + " " + match[1] : text(key) || "-";
  }

  function pct(value) {
    return value === null || value === undefined ? "-" : (value * 100).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  }

  function num(value, digits) {
    return Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: digits === undefined ? 0 : digits });
  }

  function post(payload) {
    return api("/api/otd", { method: "POST", body: JSON.stringify(payload) });
  }

  function canUse() {
    var auth = state.data && state.data.auth;
    return !(auth && (auth.claimsOnly || auth.billingOnly));
  }

  /* ------------------------------------------------------------- calcolo */
  function summarize(rows) {
    var counts = {};
    var delay = 0;
    var alerts = 0;
    var booked = 0;
    rows.forEach(function (row) {
      counts[row.outcome] = (counts[row.outcome] || 0) + 1;
      if (row.outcome === "NO" && row.delay) delay += row.delay;
      if (row.noStatus10) alerts += 1;
      if (row.booked) booked += 1;
    });
    var ok = counts["OK"] || 0;
    var no = counts["NO"] || 0;
    var noStatus = counts["SENZA ESITO"] || 0;
    return {
      total: rows.length,
      ok: ok,
      no: no,
      noStatus: noStatus,
      other: rows.length - ok - no - noStatus,
      otd: ok + no ? ok / (ok + no) : null,
      avgDelay: no ? delay / no : 0,
      alerts: alerts,
      booked: booked,
    };
  }

  function groupBy(rows, key) {
    var groups = {};
    rows.forEach(function (row) {
      var name = row[key] || "-";
      (groups[name] = groups[name] || []).push(row);
    });
    return Object.keys(groups).sort().map(function (name) {
      return { name: name, sum: summarize(groups[name]) };
    });
  }

  function baseRows() {
    var needle = otd.search.toLowerCase();
    return otd.rows.filter(function (row) {
      if (otd.carrier && row.carrier !== otd.carrier) return false;
      if (otd.outcome && row.outcome !== otd.outcome) return false;
      if (otd.onlyAlert && !row.noStatus10) return false;
      if (!needle) return true;
      return [row.id, row.dn, row.ship, row.dest, row.city, row.prov, row.carrier, row.note].some(function (value) {
        return text(value).toLowerCase().indexOf(needle) !== -1;
      });
    });
  }

  function monthRows() {
    var rows = baseRows();
    return otd.month ? rows.filter(function (row) { return row.month === otd.month; }) : rows;
  }

  /* ----------------------------------------------------------------- css */
  function ensureStyles() {
    if (document.querySelector("#otdStyles")) return;
    var style = document.createElement("style");
    style.id = "otdStyles";
    style.textContent = [
      ".otd-page{display:flex;flex-direction:column;gap:16px}",
      ".otd-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;background:#fff;border-radius:18px;padding:18px 20px;box-shadow:0 10px 30px rgba(15,45,70,.06)}",
      ".otd-head .eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;font-weight:700}",
      ".otd-head h2{margin:4px 0 6px;font-size:24px}",
      ".otd-head p{margin:0;color:#5b6b7b;font-size:13px;max-width:680px}",
      ".otd-actions{display:flex;gap:8px;flex-wrap:wrap}",
      ".otd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}",
      ".otd-kpi{background:#fff;border-radius:16px;padding:14px 16px;box-shadow:0 8px 24px rgba(15,45,70,.06);border-left:4px solid #94a3b8}",
      ".otd-kpi span{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5b6b7b}",
      ".otd-kpi strong{display:block;font-size:26px;margin-top:4px;color:#0f2d46}",
      ".otd-kpi small{color:#5b6b7b}",
      ".otd-kpi.main{border-left-color:#0f766e}.otd-kpi.ok{border-left-color:#16a34a}.otd-kpi.ko{border-left-color:#dc2626}.otd-kpi.wait{border-left-color:#d97706}",
      ".otd-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}",
      ".otd-toolbar input,.otd-toolbar select{padding:10px 12px;border-radius:12px;border:1px solid #dbe3ec;font:inherit;background:#fff}",
      ".otd-toolbar input[type=search]{flex:1;min-width:220px}",
      ".otd-toolbar label.check{display:flex;gap:6px;align-items:center;font-size:13px;color:#334155}",
      ".otd-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}",
      "@media (max-width:1100px){.otd-grid{grid-template-columns:1fr}}",
      ".otd-card{background:#fff;border-radius:18px;padding:16px 18px;box-shadow:0 10px 30px rgba(15,45,70,.06);overflow:auto}",
      ".otd-card h3{margin:0 0 10px;font-size:15px}",
      ".otd-table{width:100%;border-collapse:collapse;font-size:13px}",
      ".otd-table th{position:sticky;top:0;background:#f1f5f9;color:#334155;text-align:left;padding:8px 10px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}",
      ".otd-table td{padding:7px 10px;border-bottom:1px solid #eef2f6;white-space:nowrap}",
      ".otd-table tr.sel td{background:#ecf7f5}",
      ".otd-table tr.late td{background:#fff5f5}",
      ".otd-table tr.clickable{cursor:pointer}",
      ".otd-table td.r,.otd-table th.r{text-align:right}",
      ".otd-table td.wrap{white-space:normal;min-width:180px}",
      ".otd-bar{display:inline-block;height:8px;border-radius:4px;background:#16a34a;vertical-align:middle;margin-right:6px}",
      ".otd-chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#e2e8f0;color:#334155}",
      ".otd-chip.ok{background:#dcfce7;color:#166534}.otd-chip.ko{background:#fee2e2;color:#991b1b}.otd-chip.wait{background:#fef3c7;color:#92400e}",
      ".otd-forced{margin-left:4px;color:#7c3aed;font-weight:700}",
      ".otd-bar-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;background:#0f2d46;color:#fff;border-radius:14px;padding:10px 14px}",
      ".otd-bar-actions select,.otd-bar-actions input{width:auto;flex:0 0 auto;padding:8px 10px;border-radius:10px;border:0;font:inherit}",
      ".otd-bar-actions input{width:260px;max-width:100%}",
      ".otd-toolbar select{width:auto;flex:0 0 auto}",
      ".otd-toolbar input[type=checkbox],.otd-table input[type=checkbox]{width:auto;height:auto;padding:0;margin:0;flex:0 0 auto}",
      ".otd-inline input{width:auto;flex:0 0 auto}",
      ".otd-empty{background:#fff;border-radius:18px;padding:28px;text-align:center;color:#5b6b7b;box-shadow:0 10px 30px rgba(15,45,70,.06)}",
      ".otd-note{font-size:12px;color:#5b6b7b;margin:8px 0 0}",
      ".otd-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}",
      "@media (max-width:1100px){.otd-settings-grid{grid-template-columns:1fr}}",
      ".otd-inline{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}",
      ".otd-inline input{padding:8px 10px;border-radius:10px;border:1px solid #dbe3ec;font:inherit;min-width:90px}",
      ".otd-x{border:0;background:transparent;color:#991b1b;cursor:pointer;font-size:16px}",
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------- sidebar */
  function ensureNavButton() {
    if (document.querySelector('.nav-item[data-page="' + PAGE + '"]')) return;
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var button = document.createElement("button");
    button.className = "nav-item";
    button.dataset.page = PAGE;
    button.textContent = "OTD";
    var billing = nav.querySelector('[data-page="billing"]');
    if (billing) nav.insertBefore(button, billing);
    else nav.appendChild(button);
    button.addEventListener("click", function () {
      if (!canUse()) return;
      state.page = PAGE;
      if (state.selected && state.selected.clear) state.selected.clear();
      if (typeof clearDetail === "function") clearDetail();
      render();
    });
  }

  /* -------------------------------------------------------------- render */
  var baseRender = window.render;
  window.render = function () {
    if (state.page === PAGE && canUse()) {
      try {
        renderOtdPage();
      } catch (error) {
        console.error("[otd]", error);
        if (els.content) els.content.innerHTML = '<div class="otd-empty">Errore nella sezione OTD: ' + esc(error.message) + "</div>";
      }
      return;
    }
    var result = baseRender.apply(this, arguments);
    ensureNavButton();
    return result;
  };

  function hideChrome() {
    [
      els.mailPanel, els.ftlMailPanel, els.ftlReminderPanel, els.plannedFilters,
      els.departedFilters, els.shipmentToolbar, els.operationBar, els.metrics,
      els.detailPanel, els.sourceStrip, els.selectionInfo,
    ].forEach(function (element) { if (element) element.hidden = true; });
    var importBtn = document.querySelector("#importBtn");
    if (importBtn) importBtn.hidden = true;
  }

  function markNav() {
    document.querySelectorAll(".nav-item").forEach(function (button) {
      button.classList.toggle("active", button.dataset.page === state.page);
    });
    if (els.deletedBox) els.deletedBox.classList.remove("active");
  }

  function renderOtdPage() {
    ensureStyles();
    ensureNavButton();
    hideChrome();
    if (els.pageTitle) els.pageTitle.textContent = "OTD - On Time Delivery";
    if (els.pageSubtitle) els.pageSubtitle.textContent = "Puntualita' delle consegne dal report OTM, in giorni lavorativi (festivita' italiane escluse)";
    markNav();
    if (typeof renderSidebarStats === "function") renderSidebarStats();

    if (!otd.loaded && !otd.loading) loadOtd();
    if (!document.querySelector("#otdRoot")) els.content.innerHTML = shellHtml();
    renderSections();
  }

  function shellHtml() {
    return [
      '<section class="otd-page" id="otdRoot">',
      '  <div class="otd-head">',
      "    <div>",
      '      <span class="eyebrow">On Time Delivery</span>',
      '      <h2 id="otdHeadTitle">OTD</h2>',
      "      <p>Carica il report OTM <strong>Order Status Code &amp; Reason Code</strong>: l'esito si calcola in giorni lavorativi (esclusi sabato, domenica e festivita' italiane) confrontando la consegna con il lead time. Le prenotate (BKL) sono OK in automatico quando risultano consegnate; se non lo sono ancora, non entrano nel conteggio. Le tassative (BKV) devono rispettare la data di scarico inserita dal cliente, di solito la Early Delivery Date. L'esito si puo' forzare a mano.</p>",
      "    </div>",
      '    <div class="otd-actions">',
      '      <button class="primary" data-otd="import">Carica report OTM</button>',
      '      <button data-otd="export">Esporta Excel</button>',
      '      <button data-otd="settings">Lead time e prenotate</button>',
      "    </div>",
      '    <input type="file" id="otdFileInput" accept=".xlsx,.xlsm" hidden />',
      '    <input type="file" id="otdLeadFileInput" accept=".xlsx,.xlsm,.csv" hidden />',
      '    <input type="file" id="otdContractFileInput" accept=".xlsx,.xlsm" hidden />',
      "  </div>",
      '  <div id="otdSettings"></div>',
      '  <div class="otd-kpis" id="otdKpis"></div>',
      '  <div class="otd-toolbar">',
      '    <select id="otdMonth"></select>',
      '    <select id="otdCarrier"></select>',
      '    <select id="otdOutcome"></select>',
      '    <input type="search" id="otdSearch" placeholder="Cerca ordine, delivery note, destinatario, citta..." autocomplete="off" />',
      '    <label class="check"><input type="checkbox" id="otdAlert" /> Solo senza esito oltre 10 gg</label>',
      "  </div>",
      '  <div class="otd-grid">',
      '    <div class="otd-card" id="otdMonths"></div>',
      '    <div class="otd-card" id="otdCarriers"></div>',
      "  </div>",
      '  <div id="otdActionBar"></div>',
      '  <div class="otd-card" id="otdList"></div>',
      "</section>",
    ].join("");
  }

  function renderSections() {
    renderHead();
    renderSettings();
    renderKpis();
    renderFilters();
    renderMonths();
    renderCarriers();
    renderActionBar();
    renderList();
  }

  function renderHead() {
    var title = document.querySelector("#otdHeadTitle");
    if (!title) return;
    title.textContent = otd.loading && !otd.rows.length ? "Caricamento..." : num(otd.rows.length) + " ordini" +
      (otd.excluded ? " (esclusi " + num(otd.excluded) + " ordini " + (otd.excludedCarriers || []).join("/") + " - VAS)" : "");
  }

  function kpi(label, value, sub, tone) {
    return '<div class="otd-kpi ' + (tone || "") + '"><span>' + esc(label) + "</span><strong>" + value + "</strong><small>" + esc(sub || "") + "</small></div>";
  }

  function renderKpis() {
    var box = document.querySelector("#otdKpis");
    if (!box) return;
    var s = summarize(monthRows());
    box.innerHTML = [
      kpi("% OTD", pct(s.otd), "OK / (OK + NO)", "main"),
      kpi("Ordini OK", num(s.ok), "incluse prenotate", "ok"),
      kpi("Ordini NO", num(s.no), "consegnati in ritardo", "ko"),
      kpi("Ritardo medio", num(s.avgDelay, 1) + " gg", "solo sui NO", "ko"),
      kpi("Senza esito", num(s.noStatus), "non ancora consegnati", "wait"),
      kpi("Senza esito > 10 gg", num(s.alerts), "non prenotate", "wait"),
      kpi("Prenotate", num(s.booked), "OK se consegnate"),
    ].join("");
  }

  function fillSelect(id, options, current) {
    var select = document.querySelector("#" + id);
    if (!select) return;
    var html = options.map(function (item) {
      return '<option value="' + esc(item[0]) + '"' + (item[0] === current ? " selected" : "") + ">" + esc(item[1]) + "</option>";
    }).join("");
    if (select.dataset.sig !== html) {
      select.innerHTML = html;
      select.dataset.sig = html;
    }
    select.value = current;
  }

  function renderFilters() {
    var months = {};
    var carriers = {};
    otd.rows.forEach(function (row) {
      if (row.month) months[row.month] = true;
      if (row.carrier) carriers[row.carrier] = true;
    });
    fillSelect("otdMonth", [["", "Tutti i mesi"]].concat(Object.keys(months).sort().reverse().map(function (m) { return [m, monthLabel(m)]; })), otd.month);
    fillSelect("otdCarrier", [["", "Tutti i vettori"]].concat(Object.keys(carriers).sort().map(function (c) { return [c, c]; })), otd.carrier);
    var outcomes = ["OK", "NO", "SENZA ESITO", "NON CONSEGNATA"].concat((otd.outcomes || []).filter(function (o) {
      return ["OK", "NO", "SENZA ESITO"].indexOf(o) === -1;
    }));
    fillSelect("otdOutcome", [["", "Tutti gli esiti"]].concat(outcomes.map(function (o) { return [o, o]; })), otd.outcome);
    var search = document.querySelector("#otdSearch");
    if (search && search !== document.activeElement) search.value = otd.search;
    var alertBox = document.querySelector("#otdAlert");
    if (alertBox) alertBox.checked = otd.onlyAlert;
  }

  function summaryRows(groups, labelFn) {
    return groups.map(function (group) {
      var s = group.sum;
      var width = s.otd === null ? 0 : Math.round(s.otd * 44);
      return "<tr><td>" + esc(labelFn(group.name)) + '</td><td class="r">' + num(s.total) + '</td><td class="r">' + num(s.ok) +
        '</td><td class="r">' + num(s.no) + '</td><td class="r">' + num(s.noStatus) +
        '</td><td class="r"><span class="otd-bar" style="width:' + width + 'px"></span>' + pct(s.otd) +
        '</td><td class="r">' + num(s.avgDelay, 1) + "</td></tr>";
    }).join("");
  }

  var SUMMARY_HEAD = '<tr><th></th><th class="r">Ordini</th><th class="r">OK</th><th class="r">NO</th><th class="r">Senza esito</th><th class="r">% OTD</th><th class="r">Rit. medio</th></tr>';

  function renderMonths() {
    var box = document.querySelector("#otdMonths");
    if (!box) return;
    var groups = groupBy(baseRows(), "month").reverse();
    box.innerHTML = "<h3>Per mese di partenza</h3>" + (groups.length
      ? '<table class="otd-table"><thead>' + SUMMARY_HEAD.replace("<th></th>", "<th>Mese</th>") + "</thead><tbody>" + summaryRows(groups, monthLabel) + "</tbody></table>"
      : '<div class="otd-note">Nessun dato.</div>');
  }

  function renderCarriers() {
    var box = document.querySelector("#otdCarriers");
    if (!box) return;
    var groups = groupBy(monthRows(), "carrier");
    box.innerHTML = "<h3>Per vettore" + (otd.month ? " - " + esc(monthLabel(otd.month)) : "") + "</h3>" + (groups.length
      ? '<table class="otd-table"><thead>' + SUMMARY_HEAD.replace("<th></th>", "<th>Vettore</th>") + "</thead><tbody>" + summaryRows(groups, function (n) { return n; }) + "</tbody></table>"
      : '<div class="otd-note">Nessun dato.</div>');
  }

  function selectedIds() {
    return Object.keys(otd.selected).filter(function (id) { return otd.selected[id]; });
  }

  function renderActionBar() {
    var box = document.querySelector("#otdActionBar");
    if (!box) return;
    var count = selectedIds().length;
    if (!count) {
      box.innerHTML = "";
      return;
    }
    var outcomeOptions = (otd.outcomes || []).map(function (o) {
      return '<option value="' + esc(o) + '">' + esc(o) + "</option>";
    }).join("");
    box.innerHTML = [
      '<div class="otd-bar-actions">',
      "  <strong>" + count + " selezionati</strong>",
      '  <select id="otdForceOutcome"><option value="">Esito...</option>' + outcomeOptions + "</select>",
      '  <input id="otdForceNote" placeholder="Motivo / note (facoltativo)" />',
      '  <button class="primary" data-otd="force">Forza esito</button>',
      '  <button data-otd="booked-yes">Segna prenotata</button>',
      '  <button data-otd="booked-no">Togli prenotata</button>',
      '  <button data-otd="reset">Ripristina automatico</button>',
      '  <button data-otd="clear-selection">Deseleziona</button>',
      "</div>",
    ].join("");
  }

  function renderList() {
    var box = document.querySelector("#otdList");
    if (!box) return;
    if (otd.loading && !otd.rows.length) {
      box.innerHTML = '<div class="otd-note">Caricamento ordini...</div>';
      return;
    }
    if (!otd.rows.length) {
      box.innerHTML = '<div class="otd-empty">Nessun ordine importato. Usa <strong>Carica report OTM</strong> per iniziare.</div>';
      return;
    }
    var rows = monthRows();
    var shown = rows.slice(0, ROW_LIMIT);
    var allChecked = shown.length && shown.every(function (row) { return otd.selected[row.id]; });
    var body = shown.map(function (row) {
      var tone = TONES[row.outcome] || "";
      var late = row.outcome === "NO" ? " late" : "";
      var sel = otd.selected[row.id] ? " sel" : "";
      return '<tr class="clickable' + late + sel + '" data-otd-row="' + esc(row.id) + '">' +
        '<td><input type="checkbox" data-otd-check="' + esc(row.id) + '"' + (otd.selected[row.id] ? " checked" : "") + " /></td>" +
        "<td>" + esc(row.id) + "</td><td>" + esc(row.carrier) + '</td><td class="wrap">' + esc(row.dest) + "</td><td>" + esc(row.prov) + "</td>" +
        "<td>" + esc(shortDate(row.shipped)) + "</td><td>" + esc(shortDate(row.delivered)) + "</td>" +
        '<td class="r">' + (row.days === null || row.days === undefined ? "-" : row.days) + '</td><td class="r" title="' + esc(row.target ? "Data di scarico tassativa (" + row.freight + ")" : (row.leadSource || "nessuna regola") + (row.service ? " - " + row.service + " (" + row.serviceSource + ")" : "")) + '">' + (row.target ? esc(shortDate(row.target)) : (row.lead === null || row.lead === undefined ? "-" : row.lead)) + "</td><td>" + esc(row.service) + "</td><td>" + esc(row.rule) + "</td>" +
        "<td>" + (row.booked ? "SI (" + esc(row.bookedSource) + ")" : "NO") + "</td>" +
        '<td><span class="otd-chip ' + tone + '">' + esc(row.outcome) + "</span>" + (row.forced ? '<span class="otd-forced" title="Esito forzato a mano">&#9998;</span>' : "") +
        (row.noStatus10 ? ' <span class="otd-chip wait" title="Senza esito da oltre 10 giorni lavorativi">&gt;10 gg</span>' : "") + "</td>" +
        '<td class="r">' + (row.delay ? row.delay : "") + '</td><td class="wrap">' + esc(row.note || row.reasons) + "</td></tr>";
    }).join("");
    box.innerHTML = [
      "<h3>Ordini (" + num(rows.length) + ")</h3>",
      rows.length > ROW_LIMIT ? '<div class="otd-note">Mostro i primi ' + ROW_LIMIT + " ordini: usa i filtri per restringere. L'export Excel contiene tutto.</div>" : "",
      '<table class="otd-table"><thead><tr><th><input type="checkbox" data-otd-checkall' + (allChecked ? " checked" : "") + ' /></th>',
      "<th>Ordine</th><th>Vettore</th><th>Destinatario</th><th>Prov</th><th>Partenza</th><th>Consegna</th>",
      '<th class="r">Giorni lav.</th><th class="r">Lead time / data</th><th>Servizio</th><th>Regola</th><th>Prenotata</th><th>Esito</th><th class="r">Ritardo</th><th>Note / motivi</th></tr></thead>',
      "<tbody>" + (body || '<tr><td colspan="15" class="otd-note">Nessun ordine con questi filtri.</td></tr>') + "</tbody></table>",
    ].join("");
  }

  function renderSettings() {
    var box = document.querySelector("#otdSettings");
    if (!box) return;
    if (!otd.settingsOpen) {
      box.innerHTML = "";
      return;
    }
    var leadRows = otd.leadTimes.map(function (item) {
      return "<tr><td>" + esc(item.carrier === "*" ? "Tutti" : item.carrier) + "</td><td>" + esc(item.province === "*" ? "Tutte" : item.province) +
        '</td><td class="r">' + item.days + '</td><td><button class="otd-x" data-otd="lead-del" data-id="' + item.id + '" title="Elimina">&times;</button></td></tr>';
    }).join("");
    var bookedRows = otd.bookedDestinations.map(function (item) {
      return "<tr><td>" + esc(item.pattern) + '</td><td><button class="otd-x" data-otd="booked-del" data-id="' + item.id + '" title="Elimina">&times;</button></td></tr>';
    }).join("");
    var contractRows = otd.contractLeadTimes.map(function (item) {
      return "<tr><td>" + esc(item.province) + "</td><td>" + esc(item.region) + '</td><td class="r">' + (item.groupage_days === null ? "-" : item.groupage_days) +
        '</td><td class="r">' + (item.direct_days === null ? "-" : item.direct_days) + "</td></tr>";
    }).join("");
    box.innerHTML = [
      '<div class="otd-card">',
      "  <h3>Lead time contrattuali (giorni lavorativi)</h3>",
      '  <div class="otd-note" style="margin:0 0 10px">Per provincia e servizio: <strong>Groupage</strong> (fino a 8 pallet, spedizioni BRT LTL del gestionale) e <strong>Diretto</strong> (9 pallet o piu\'). Il servizio di ogni ordine si legge dal gestionale; se l\'ordine non c\'e\', BRT e Macsped sono groupage e gli altri vettori diretto. Sono stati caricati da rate card: ' + otd.contractLeadTimes.length + ' province. ' +
        '<button data-otd="contract-upload">Aggiorna da rate card (Excel)</button></div>',
      '  <details><summary>Vedi i lead time per provincia</summary><div style="max-height:260px;overflow:auto;margin-top:8px"><table class="otd-table"><thead><tr><th>Prov</th><th>Regione</th><th class="r">Groupage</th><th class="r">Diretto</th></tr></thead><tbody>' +
        (contractRows || '<tr><td colspan="4" class="otd-note">Nessun lead time contrattuale.</td></tr>') + "</tbody></table></div></details>",
      "</div>",
      '<div class="otd-settings-grid">',
      '  <div class="otd-card">',
      "    <h3>Eccezioni lead time (regole manuali)</h3>",
      '    <div class="otd-note" style="margin:0 0 10px">Hanno la precedenza sul contratto: vettore + provincia, poi solo vettore, poi solo provincia. Senza regole e senza contratto si usa il lead time del file OTM. Per un valore valido per tutto il vettore lascia vuota la provincia.</div>',
      '    <div class="otd-inline">',
      '      <input id="otdLeadCarrier" placeholder="Vettore" />',
      '      <input id="otdLeadProv" placeholder="Prov. (facolt.)" maxlength="2" style="min-width:80px;width:100px" />',
      '      <input id="otdLeadDays" placeholder="Giorni" inputmode="numeric" style="width:80px;min-width:70px" />',
      '      <button class="primary" data-otd="lead-add">Aggiungi</button>',
      '      <button data-otd="lead-upload">Carica da Excel/CSV</button>',
      "    </div>",
      '    <table class="otd-table"><thead><tr><th>Vettore</th><th>Provincia</th><th class="r">Giorni</th><th></th></tr></thead><tbody>' +
        (leadRows || '<tr><td colspan="4" class="otd-note">Nessuna eccezione: valgono i lead time contrattuali.</td></tr>') + "</tbody></table>",
      '    <div class="otd-note">File Excel/CSV con colonne: Vettore, Provincia (facoltativa), Lead time.</div>',
      "  </div>",
      '  <div class="otd-card">',
      "    <h3>Destinatari sempre prenotati</h3>",
      '    <div class="otd-note" style="margin:0 0 10px">Oltre allo stato OTM &laquo;Delivery Appointment Scheduled&raquo; e agli scarichi prenotati nel gestionale, un ordine e\' prenotato se il destinatario contiene uno di questi testi.</div>',
      '    <div class="otd-inline"><input id="otdBookedPattern" placeholder="Es. CONSORZIO M.P." style="min-width:220px" /><button class="primary" data-otd="booked-add">Aggiungi</button></div>',
      '    <table class="otd-table"><tbody>' + (bookedRows || '<tr><td class="otd-note">Nessun destinatario in elenco.</td></tr>') + "</tbody></table>",
      "  </div>",
      "</div>",
    ].join("");
  }

  /* ---------------------------------------------------------------- dati */
  function applyPayload(payload) {
    otd.rows = payload.rows || [];
    otd.leadTimes = payload.leadTimes || [];
    otd.contractLeadTimes = payload.contractLeadTimes || [];
    otd.bookedDestinations = payload.bookedDestinations || [];
    otd.outcomes = payload.outcomes || [];
    otd.excluded = payload.excluded || 0;
    otd.excludedCarriers = payload.excludedCarriers || [];
    otd.loaded = true;
    var valid = {};
    otd.rows.forEach(function (row) { valid[row.id] = true; });
    Object.keys(otd.selected).forEach(function (id) { if (!valid[id]) delete otd.selected[id]; });
  }

  async function loadOtd() {
    otd.loading = true;
    renderHead();
    try {
      applyPayload(await api("/api/otd"));
    } catch (error) {
      toast(error.message || "Caricamento OTD non riuscito.");
    } finally {
      otd.loading = false;
      if (state.page === PAGE) renderSections();
    }
  }

  async function run(payload, successMessage) {
    if (otd.busy) return null;
    otd.busy = true;
    try {
      var result = await post(payload);
      applyPayload(result);
      renderSections();
      if (successMessage) toast(typeof successMessage === "function" ? successMessage(result) : successMessage);
      return result;
    } catch (error) {
      toast(error.message || "Operazione non riuscita.");
      return null;
    } finally {
      otd.busy = false;
    }
  }

  async function importFile(file, action, label) {
    if (!file) return;
    var content = await fileToBase64(file);
    await run({ action: action, filename: file.name, contentBase64: content }, function (result) {
      var s = result.importSummary || {};
      if (action === "import") {
        return "Importati " + num(s.orders) + " ordini (" + num(s.new) + " nuovi, " + num(s.updated) + " aggiornati, " + num(s.delivered) + " consegnati).";
      }
      if (action === "contract_import") return label + ": caricate " + num(s.provinces) + " province.";
      return label + ": " + num(s.saved) + " regole salvate" + (s.skipped ? ", " + s.skipped + " scartate" : "") + ".";
    });
  }

  /* ------------------------------------------------------------- eventi */
  function onClick(event) {
    var target = event.target;
    var check = target.closest && target.closest("[data-otd-check]");
    if (check) {
      otd.selected[check.dataset.otdCheck] = check.checked;
      var tr = check.closest("tr");
      if (tr) tr.classList.toggle("sel", check.checked);
      renderActionBar();
      return;
    }
    if (target.closest && target.closest("[data-otd-checkall]")) {
      var master = target.closest("[data-otd-checkall]");
      monthRows().slice(0, ROW_LIMIT).forEach(function (row) { otd.selected[row.id] = master.checked; });
      renderActionBar();
      renderList();
      return;
    }
    var button = target.closest && target.closest("[data-otd]");
    if (button) {
      handleAction(button);
      return;
    }
    var row = target.closest && target.closest("[data-otd-row]");
    if (row && target.tagName !== "INPUT") {
      var id = row.dataset.otdRow;
      otd.selected[id] = !otd.selected[id];
      renderActionBar();
      renderList();
    }
  }

  function handleAction(button) {
    var action = button.dataset.otd;
    var ids = selectedIds();
    if (action === "import") document.querySelector("#otdFileInput").click();
    else if (action === "lead-upload") document.querySelector("#otdLeadFileInput").click();
    else if (action === "contract-upload") document.querySelector("#otdContractFileInput").click();
    else if (action === "settings") {
      otd.settingsOpen = !otd.settingsOpen;
      renderSettings();
    } else if (action === "export") {
      run({ action: "export", month: otd.month, carrier: otd.carrier }, "Excel OTD generato.").then(function (result) {
        if (result && result.downloadUrl && typeof triggerDownload === "function") triggerDownload(result.downloadUrl);
      });
    } else if (action === "clear-selection") {
      otd.selected = {};
      renderActionBar();
      renderList();
    } else if (action === "force") {
      var outcome = text(document.querySelector("#otdForceOutcome").value);
      if (!outcome) {
        toast("Scegli l'esito da forzare.");
        return;
      }
      run({ action: "override", orderIds: ids, outcome: outcome, note: text(document.querySelector("#otdForceNote").value) },
        "Esito " + outcome + " forzato su " + ids.length + " ordini.");
    } else if (action === "booked-yes" || action === "booked-no") {
      run({ action: "override", orderIds: ids, outcome: "", booked: action === "booked-yes" },
        action === "booked-yes" ? "Segnate come prenotate." : "Prenotazione tolta.");
    } else if (action === "reset") {
      run({ action: "override", orderIds: ids, outcome: "", booked: null }, "Ripristinato il calcolo automatico.");
    } else if (action === "lead-add") {
      run({
        action: "lead_time_set",
        carrier: text(document.querySelector("#otdLeadCarrier").value),
        province: text(document.querySelector("#otdLeadProv").value),
        days: text(document.querySelector("#otdLeadDays").value),
      }, "Lead time salvato.");
    } else if (action === "lead-del") {
      run({ action: "lead_time_delete", id: parseInt(button.dataset.id, 10) }, "Regola eliminata.");
    } else if (action === "booked-add") {
      run({ action: "booked_add", pattern: text(document.querySelector("#otdBookedPattern").value) }, "Destinatario aggiunto.");
    } else if (action === "booked-del") {
      run({ action: "booked_delete", id: parseInt(button.dataset.id, 10) }, "Destinatario rimosso.");
    }
  }

  function onChange(event) {
    var target = event.target;
    if (target.id === "otdFileInput") {
      importFile(target.files[0], "import", "Report OTM");
      target.value = "";
    } else if (target.id === "otdLeadFileInput") {
      importFile(target.files[0], "lead_times_import", "Lead time");
      target.value = "";
    } else if (target.id === "otdContractFileInput") {
      importFile(target.files[0], "contract_import", "Lead time contrattuali");
      target.value = "";
    } else if (target.id === "otdMonth") {
      otd.month = target.value;
      renderKpis(); renderCarriers(); renderList();
    } else if (target.id === "otdCarrier") {
      otd.carrier = target.value;
      renderKpis(); renderMonths(); renderCarriers(); renderList();
    } else if (target.id === "otdOutcome") {
      otd.outcome = target.value;
      renderKpis(); renderMonths(); renderCarriers(); renderList();
    } else if (target.id === "otdAlert") {
      otd.onlyAlert = target.checked;
      renderKpis(); renderMonths(); renderCarriers(); renderList();
    }
  }

  function onInput(event) {
    if (event.target.id === "otdSearch") {
      otd.search = event.target.value;
      renderKpis(); renderMonths(); renderCarriers(); renderList();
    }
  }

  document.addEventListener("click", function (event) {
    if (state.page === PAGE && event.target.closest && event.target.closest("#otdRoot")) onClick(event);
  });
  document.addEventListener("change", function (event) {
    if (state.page === PAGE && event.target.closest && event.target.closest("#otdRoot")) onChange(event);
  });
  document.addEventListener("input", function (event) {
    if (state.page === PAGE && event.target.closest && event.target.closest("#otdRoot")) onInput(event);
  });

  ensureNavButton();
})();
