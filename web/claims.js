/* V-Tech Trasporti - Sezione Claim
   File AGGIUNTIVO: si aggancia da solo ad app.js senza modificarlo.
   Va caricato in index.html DOPO app.js. */
(function () {
  "use strict";

  if (typeof pageMeta === "undefined" || typeof state === "undefined" || typeof els === "undefined") {
    console.warn("[claim] app.js non disponibile: sezione claim non attivata.");
    return;
  }

  var PAGE = "claims";
  var STATUS_TONES = {
    "Aperto": "open",
    "Inviato al vettore": "sent",
    "In valutazione": "wait",
    "Documenti richiesti": "wait",
    "Accettato": "ok",
    "Respinto": "ko",
    "Chiuso": "done",
  };

  var claimState = {
    loaded: false,
    loading: false,
    claims: [],
    statuses: [],
    reasons: [],
    reasonGroups: null,
    origins: [],
    kinds: [],
    search: "",
    statusFilter: "",
    selectedId: null,
    pickerQuery: "",
    picked: null,
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
    else console.log("[claim]", message);
  }

  function field(row) {
    var keys = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var value = (row && row.display && row.display[key]) || (row && row.raw && row.raw[key]);
      if (text(value)) return text(value);
    }
    return "";
  }

  function money(value) {
    var number = typeof value === "number" ? value : parseFloat(String(value || "").replace(",", "."));
    if (!isFinite(number)) return "";
    return number.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
  }

  function shortDate(value) {
    var raw = text(value);
    if (!raw) return "";
    var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[3] + "/" + match[2] + "/" + match[1];
    return raw;
  }

  function download(url) {
    if (!url) return;
    if (typeof triggerDownload === "function") triggerDownload(url);
    else window.open(url, "_blank");
  }

  function claimsOnly() {
    return !!(state.data && state.data.auth && state.data.auth.claimsOnly);
  }

  function reasonOptions(selected) {
    var groups = claimState.reasonGroups;
    var current = text(selected);
    var mark = function (value) {
      return '<option value="' + esc(value) + '"' + (current === value ? " selected" : "") + ">" + esc(value) + "</option>";
    };
    if (groups && typeof groups === "object" && Object.keys(groups).length) {
      var known = [];
      var html = Object.keys(groups).map(function (label) {
        var list = groups[label] || [];
        known = known.concat(list);
        return '<optgroup label="' + esc(label) + '">' + list.map(mark).join("") + "</optgroup>";
      }).join("");
      if (current && known.indexOf(current) === -1) html = mark(current) + html;
      return html;
    }
    var flat = claimState.reasons.length ? claimState.reasons : [current];
    if (current && flat.indexOf(current) === -1) flat = [current].concat(flat);
    return flat.map(mark).join("");
  }

  /* ----------------------------------------------------------------- css */
  function ensureStyles() {
    if (document.querySelector("#claimStyles")) return;
    var style = document.createElement("style");
    style.id = "claimStyles";
    style.textContent = [
      ".claims-page{display:flex;flex-direction:column;gap:16px}",
      ".claims-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;background:#fff;border-radius:18px;padding:18px 20px;box-shadow:0 10px 30px rgba(15,45,70,.06)}",
      ".claims-head span.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;font-weight:700}",
      ".claims-head h2{margin:4px 0 6px;font-size:24px}",
      ".claims-head p{margin:0;color:#5b6b7b;font-size:13px;max-width:640px}",
      ".claims-head-actions{display:flex;gap:8px;flex-wrap:wrap}",
      ".claims-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}",
      ".claims-toolbar input,.claims-toolbar select{padding:10px 12px;border-radius:12px;border:1px solid #dbe3ec;font:inherit;background:#fff}",
      ".claims-toolbar input{flex:1;min-width:220px}",
      ".claims-layout{display:grid;grid-template-columns:minmax(320px,1.1fr) minmax(320px,1fr);gap:16px;align-items:start}",
      "@media (max-width:1100px){.claims-layout{grid-template-columns:1fr}}",
      ".claim-card{background:#fff;border-radius:16px;padding:14px 16px;margin-bottom:10px;cursor:pointer;border:1px solid #e6ecf3;transition:box-shadow .15s,border-color .15s}",
      ".claim-card:hover{box-shadow:0 8px 22px rgba(15,45,70,.08)}",
      ".claim-card.active{border-color:#0f766e;box-shadow:0 8px 22px rgba(15,118,110,.15)}",
      ".claim-card-top{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px}",
      ".claim-ref{font-weight:700;color:#0f2d46}",
      ".claim-card-sub{color:#5b6b7b;font-size:13px;display:flex;flex-wrap:wrap;gap:8px}",
      ".claim-chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#eef3f8;color:#41546a}",
      ".claim-chip.open{background:#e0f2fe;color:#0369a1}",
      ".claim-chip.sent{background:#ede9fe;color:#5b21b6}",
      ".claim-chip.wait{background:#fef3c7;color:#92400e}",
      ".claim-chip.ok{background:#dcfce7;color:#166534}",
      ".claim-chip.ko{background:#fee2e2;color:#991b1b}",
      ".claim-chip.done{background:#e2e8f0;color:#334155}",
      ".claim-detail{background:#fff;border-radius:18px;padding:18px 20px;box-shadow:0 10px 30px rgba(15,45,70,.06);position:sticky;top:12px}",
      ".claim-detail h3{margin:0 0 2px;font-size:20px}",
      ".claim-detail .claim-detail-sub{color:#5b6b7b;font-size:13px;margin-bottom:14px}",
      ".claim-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}",
      ".claim-grid label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#41546a;font-weight:600}",
      ".claim-grid.full{grid-template-columns:1fr}",
      ".claim-detail input,.claim-detail select,.claim-detail textarea{padding:9px 11px;border-radius:10px;border:1px solid #dbe3ec;font:inherit;background:#fff;width:100%;box-sizing:border-box}",
      ".claim-detail textarea{resize:vertical;min-height:64px}",
      ".claim-section-title{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#0f766e;font-weight:700;margin:16px 0 8px}",
      ".claim-att{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;border:1px solid #e6ecf3;border-radius:10px;margin-bottom:6px}",
      ".claim-att-name{font-size:13px;color:#0f2d46;word-break:break-all}",
      ".claim-att-meta{font-size:11px;color:#7a8899}",
      ".claim-att-actions{display:flex;gap:6px;flex-shrink:0}",
      ".claim-timeline{list-style:none;margin:0;padding:0}",
      ".claim-timeline li{padding:8px 0 8px 14px;border-left:2px solid #e6ecf3;position:relative;font-size:13px}",
      ".claim-timeline li:before{content:'';position:absolute;left:-5px;top:14px;width:8px;height:8px;border-radius:50%;background:#0f766e}",
      ".claim-timeline .claim-att-meta{display:block}",
      ".claim-empty{background:#fff;border-radius:16px;padding:26px;text-align:center;color:#5b6b7b}",
      ".claim-picker{max-height:210px;overflow:auto;border:1px solid #e6ecf3;border-radius:12px;margin-bottom:10px}",
      ".claim-picker-row{padding:9px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:13px}",
      ".claim-picker-row:hover{background:#f1f7f6}",
      ".claim-picker-row strong{color:#0f2d46}",
      ".claim-picker-row span{color:#5b6b7b}",
      ".claim-chosen{background:#f1f7f6;border:1px solid #b7dedb;border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:13px}",
      ".claim-modal{max-width:560px}",
      ".claim-modal .modal-field{margin-bottom:10px}",
      ".claim-modal textarea{width:100%;box-sizing:border-box;resize:vertical}",
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
    button.textContent = "Claim";
    var billing = nav.querySelector('[data-page="billing"]');
    if (billing) nav.insertBefore(button, billing);
    else nav.appendChild(button);
    button.addEventListener("click", function () {
      if (state.data && state.data.auth && state.data.auth.billingOnly) return;
      if (state.data && state.data.auth && state.data.auth.canClaims === false) return;
      state.page = PAGE;
      if (state.selected && state.selected.clear) state.selected.clear();
      if (typeof clearDetail === "function") clearDetail();
      render();
    });
  }

  /* -------------------------------------------------------------- render */
  function applyClaimsOnlyMode() {
    if (!claimsOnly()) return;
    // L'utente magazzino vede solo i Claim: nascondo il resto della navigazione.
    document.querySelectorAll(".nav-item").forEach(function (button) {
      button.hidden = button.dataset.page !== PAGE;
    });
    if (els.deletedBox) els.deletedBox.hidden = true;
    ["importBtn", "refreshTopBtn", "reportUploadBtn", "activeUploadBtn", "brtUploadBtn"].forEach(function (id) {
      var element = document.querySelector("#" + id);
      if (element) element.hidden = true;
    });
    if (els.currentUser && state.data && state.data.auth && state.data.auth.user) {
      var who = state.data.auth.user;
      els.currentUser.textContent = (who.displayName || who.username || "Utente") + " - Claim / magazzino";
    }
    if (state.page !== PAGE) state.page = PAGE;
  }

  var baseRender = window.render;
  window.render = function () {
    if (claimsOnly()) {
      state.page = PAGE;
      try {
        renderClaimsPage();
        applyClaimsOnlyMode();
      } catch (error) {
        console.error("[claim]", error);
        if (els.content) els.content.innerHTML = '<div class="claim-empty">Errore nella sezione claim: ' + esc(error.message) + "</div>";
      }
      return;
    }
    if (state.page === PAGE) {
      try {
        renderClaimsPage();
      } catch (error) {
        console.error("[claim]", error);
        if (els.content) els.content.innerHTML = '<div class="claim-empty">Errore nella sezione claim: ' + esc(error.message) + "</div>";
      }
      return;
    }
    return baseRender.apply(this, arguments);
  };

  function hide(element) {
    if (element) element.hidden = true;
  }

  function hideChrome() {
    [
      els.mailPanel, els.ftlMailPanel, els.ftlReminderPanel, els.plannedFilters,
      els.departedFilters, els.shipmentToolbar, els.operationBar, els.metrics,
      els.detailPanel, els.sourceStrip, els.selectionInfo,
    ].forEach(hide);
    var importBtn = document.querySelector("#importBtn");
    if (importBtn) importBtn.hidden = true;
  }

  function markNav() {
    document.querySelectorAll(".nav-item").forEach(function (button) {
      button.classList.toggle("active", button.dataset.page === state.page);
    });
    var navClaim = document.querySelector('.nav-item[data-page="' + PAGE + '"]');
    if (navClaim && state.data && state.data.auth && state.data.auth.canClaims === false) navClaim.hidden = true;
    if (els.deletedBox) els.deletedBox.classList.remove("active");
  }

  function renderClaimsPage() {
    ensureStyles();
    ensureNavButton();
    hideChrome();
    if (els.pageTitle) els.pageTitle.textContent = "Claim";
    if (els.pageSubtitle) els.pageSubtitle.textContent = "Reclami vettore: apertura, allegati, avanzamento ed export per il cliente";
    markNav();
    if (typeof renderSidebarStats === "function") renderSidebarStats();

    if (!claimState.loaded && !claimState.loading) {
      loadClaims();
    }
    if (!document.querySelector("#claimsRoot")) {
      els.content.innerHTML = shellHtml();
    }
    renderHead();
    renderList();
    renderDetail();
  }

  function shellHtml() {
    return [
      '<section class="claims-page" id="claimsRoot">',
      '  <div class="claims-head">',
      '    <div>',
      '      <span class="eyebrow">Claim vettore</span>',
      '      <h2 id="claimHeadTitle">Claim</h2>',
      '      <p>Cerca una spedizione groupage o FTL, apri il claim, allega mail e foto, aggiorna lo stato. L\'Excel da mandare al cliente si scarica aggiornato ogni volta.</p>',
      '    </div>',
      '    <div class="claims-head-actions">',
      '      <button class="primary" data-claim="new">Nuovo claim</button>',
      '      <button data-claim="export">Excel interno (IT)</button>',
      '      <button data-claim="export-en">Excel per il cliente (EN)</button>',
      '    </div>',
      '  </div>',
      '  <div class="claims-toolbar">',
      '    <input id="claimSearchInput" placeholder="Cerca claim, spedizione, ordine, cliente, motivo..." autocomplete="off" />',
      '    <select id="claimStatusFilter"></select>',
      '  </div>',
      '  <div class="claims-layout">',
      '    <div id="claimListBox"></div>',
      '    <div id="claimDetailBox"></div>',
      '  </div>',
      '</section>',
    ].join("");
  }

  function renderHead() {
    var title = document.querySelector("#claimHeadTitle");
    if (title) {
      var open = claimState.claims.filter(function (claim) {
        return ["Respinto", "Chiuso"].indexOf(text(claim.status)) === -1;
      }).length;
      title.textContent = claimState.loading
        ? "Caricamento..."
        : claimState.claims.length + " claim - " + open + " aperti";
    }
    var filter = document.querySelector("#claimStatusFilter");
    if (filter && filter.dataset.filled !== "1") {
      var options = ['<option value="">Tutti gli stati</option>'];
      (claimState.statuses.length ? claimState.statuses : Object.keys(STATUS_TONES)).forEach(function (status) {
        options.push('<option value="' + esc(status) + '">' + esc(status) + "</option>");
      });
      filter.innerHTML = options.join("");
      filter.dataset.filled = "1";
    }
    if (filter) filter.value = claimState.statusFilter;
    var search = document.querySelector("#claimSearchInput");
    if (search && search !== document.activeElement) search.value = claimState.search;
  }

  function visibleClaims() {
    var needle = claimState.search.toLowerCase();
    return claimState.claims.filter(function (claim) {
      if (claimState.statusFilter && text(claim.status) !== claimState.statusFilter) return false;
      if (!needle) return true;
      return [
        claim.claim_ref, claim.shipment, claim.orders_text, claim.customer,
        claim.province, claim.carrier, claim.reason, claim.status, claim.description, claim.carrier_ref,
      ].some(function (value) {
        return text(value).toLowerCase().indexOf(needle) !== -1;
      });
    });
  }

  function renderList() {
    var box = document.querySelector("#claimListBox");
    if (!box) return;
    if (claimState.loading && !claimState.claims.length) {
      box.innerHTML = '<div class="claim-empty">Caricamento claim...</div>';
      return;
    }
    var rows = visibleClaims();
    if (!rows.length) {
      box.innerHTML = '<div class="claim-empty">' +
        (claimState.claims.length ? "Nessun claim con questo filtro." : "Nessun claim aperto. Usa <strong>Nuovo claim</strong> per aprirne uno.") +
        "</div>";
      return;
    }
    box.innerHTML = rows.map(function (claim) {
      var tone = STATUS_TONES[text(claim.status)] || "";
      var attachments = (claim.attachments || []).length;
      return [
        '<div class="claim-card' + (claimState.selectedId === claim.id ? " active" : "") + '" data-claim="select" data-id="' + claim.id + '">',
        '  <div class="claim-card-top">',
        '    <span class="claim-ref">' + esc(claim.claim_ref) + " - " + esc(claim.shipment) + "</span>",
        '    <span class="claim-chip ' + tone + '">' + esc(claim.status) + "</span>",
        "  </div>",
        '  <div class="claim-card-sub">',
        "    <span>" + esc(claim.customer || "-") + "</span>",
        "    <span>" + esc(claim.reason || "") + "</span>",
        (claim.origin ? '<span class="claim-chip">' + esc(claim.origin) + "</span>" : ""),
        (claim.province ? "<span>" + esc(claim.province) + "</span>" : ""),
        (attachments ? "<span>" + attachments + " allegati</span>" : ""),
        (claim.amount_claimed ? "<span>" + esc(money(claim.amount_claimed)) + "</span>" : ""),
        "    <span>" + esc(shortDate(claim.opened_at)) + "</span>",
        "  </div>",
        "</div>",
      ].join("");
    }).join("");
  }

  function selectedClaim() {
    for (var i = 0; i < claimState.claims.length; i += 1) {
      if (claimState.claims[i].id === claimState.selectedId) return claimState.claims[i];
    }
    return null;
  }

  function renderDetail() {
    var box = document.querySelector("#claimDetailBox");
    if (!box) return;
    var claim = selectedClaim();
    if (!claim) {
      box.innerHTML = '<div class="claim-empty">Seleziona un claim per vedere il dettaglio, gli allegati e lo storico.</div>';
      return;
    }
    var statuses = claimState.statuses.length ? claimState.statuses : Object.keys(STATUS_TONES);
    var reasons = claimState.reasons.length ? claimState.reasons : [text(claim.reason)];
    if (reasons.indexOf(text(claim.reason)) === -1 && text(claim.reason)) reasons = reasons.concat([text(claim.reason)]);

    box.innerHTML = [
      '<div class="claim-detail">',
      "  <h3>" + esc(claim.claim_ref) + " - " + esc(claim.shipment) + "</h3>",
      '  <div class="claim-detail-sub">' + (claim.origin ? "[" + esc(claim.origin) + "] " : "") + esc(claim.customer || "-") +
        (claim.orders_text ? " - ordini " + esc(claim.orders_text) : "") +
        (claim.carrier ? " - " + esc(claim.carrier) : "") +
        (claim.province ? " (" + esc(claim.province) + ")" : "") + "</div>",
      '  <div class="claim-grid">',
      "    <label>Motivo<select data-claim-field=\"reason\">" + reasonOptions(claim.reason) + "</select></label>",
      "    <label>Stato<select data-claim-field=\"status\">" + statuses.map(function (status) {
        return '<option value="' + esc(status) + '"' + (text(claim.status) === status ? " selected" : "") + ">" + esc(status) + "</option>";
      }).join("") + "</select></label>",
      '    <label>Importo richiesto<input data-claim-field="amountClaimed" inputmode="decimal" value="' + esc(claim.amount_claimed === null || claim.amount_claimed === undefined ? "" : claim.amount_claimed) + '" /></label>',
      '    <label>Importo riconosciuto<input data-claim-field="amountSettled" inputmode="decimal" value="' + esc(claim.amount_settled === null || claim.amount_settled === undefined ? "" : claim.amount_settled) + '" /></label>',
      '    <label>Rif. vettore<input data-claim-field="carrierRef" value="' + esc(claim.carrier_ref) + '" /></label>',
      '    <label>Vettore<input data-claim-field="carrier" value="' + esc(claim.carrier) + '" /></label>',
      "  </div>",
      '  <div class="claim-grid full">',
      '    <label>Descrizione del problema<textarea data-claim-field="description" rows="3">' + esc(claim.description) + "</textarea></label>",
      '    <label>Note KN (nostre, vanno nell\'Excel cliente)<textarea data-claim-field="notes" rows="2">' + esc(claim.notes) + "</textarea></label>",
      '    <label>Note Vtech (quelle che rimanda il cliente)<textarea data-claim-field="customerNotes" rows="2">' + esc(claim.customer_notes) + "</textarea></label>",
      '    <label>Nota da registrare nello storico (facoltativa)<input data-claim-field="eventNote" placeholder="es. sollecito inviato al vettore" /></label>',
      "  </div>",
      '  <div class="claims-head-actions">',
      '    <button class="primary" data-claim="save" data-id="' + claim.id + '">Salva aggiornamento</button>',
      '    <button class="danger ghost-danger" data-claim="delete" data-id="' + claim.id + '">Elimina claim</button>',
      "  </div>",
      '  <div class="claim-section-title">Allegati (' + (claim.attachments || []).length + ")</div>",
      (claim.attachments || []).map(function (attachment) {
        return [
          '<div class="claim-att">',
          "  <div><div class=\"claim-att-name\">" + esc(attachment.filename) + "</div>",
          '  <div class="claim-att-meta">' + esc(attachment.kind) + " - " +
            Math.max(1, Math.round((attachment.size_bytes || 0) / 1024)) + " KB - " + esc(shortDate(attachment.uploaded_at)) + "</div></div>",
          '  <div class="claim-att-actions">',
          '    <button data-claim="download-att" data-att="' + attachment.id + '">Apri</button>',
          '    <button class="danger ghost-danger" data-claim="delete-att" data-att="' + attachment.id + '">X</button>',
          "  </div>",
          "</div>",
        ].join("");
      }).join("") || '<div class="claim-att-meta">Nessun allegato.</div>',
      '  <div class="claims-head-actions" style="margin-top:10px">',
      '    <select id="claimAttachKind">' + (claimState.kinds.length ? claimState.kinds : ["Mail", "Foto", "Documento", "Altro"]).map(function (kind) {
        return '<option value="' + esc(kind) + '">' + esc(kind) + "</option>";
      }).join("") + "</select>",
      '    <button data-claim="pick-file" data-id="' + claim.id + '">Aggiungi mail o foto</button>',
      '    <input type="file" id="claimFileInput" multiple hidden />',
      "  </div>",
      '  <div class="claim-section-title">Storico</div>',
      '  <ul class="claim-timeline">' + (claim.events || []).map(function (event) {
        return "<li><strong>" + esc(event.status) + "</strong> - " + esc(event.note) +
          '<span class="claim-att-meta">' + esc(event.created_at) + (event.author ? " - " + esc(event.author) : "") + "</span></li>";
      }).join("") + "</ul>",
      "</div>",
    ].join("");
  }

  /* ----------------------------------------------------------------- api */
  async function loadClaims(options) {
    claimState.loading = true;
    try {
      var payload = await api("/api/claims");
      claimState.claims = payload.claims || [];
      claimState.statuses = payload.statuses || [];
      claimState.reasons = payload.reasons || [];
      claimState.reasonGroups = payload.reasonGroups || null;
      claimState.origins = payload.origins || [];
      claimState.kinds = payload.attachmentKinds || [];
      claimState.loaded = true;
      if (options && options.select) claimState.selectedId = options.select;
      if (claimState.selectedId && !selectedClaim()) claimState.selectedId = null;
    } catch (error) {
      toast(error.message || "Claim non disponibili.");
    } finally {
      claimState.loading = false;
      if (state.page === PAGE) {
        renderHead();
        renderList();
        renderDetail();
      }
    }
  }

  async function claimAction(body) {
    return api("/api/claims", { method: "POST", body: JSON.stringify(body) });
  }

  /* -------------------------------------------------------------- modale */
  function ensureModal() {
    if (document.querySelector("#claimModal")) return document.querySelector("#claimModal");
    var dialog = document.createElement("dialog");
    dialog.id = "claimModal";
    dialog.innerHTML = [
      '<form method="dialog" class="modal claim-modal">',
      "  <h2>Nuovo claim</h2>",
      "  <p>Cerca la spedizione (groupage o FTL), selezionala e indica il motivo.</p>",
      '  <label class="modal-field"><span>Cerca spedizione</span>',
      '    <input id="claimPickerInput" placeholder="Shipment, ordine, cliente, provincia..." autocomplete="off" /></label>',
      '  <div class="claim-chosen" id="claimPickedBox" hidden></div>',
      '  <div class="claim-picker" id="claimPickerResults"></div>',
      '  <label class="modal-field"><span>Motivo</span><select id="claimNewReason"></select></label>',
      '  <label class="modal-field"><span>Stato iniziale</span><select id="claimNewStatus"></select></label>',
      '  <label class="modal-field"><span>Importo richiesto (EUR)</span><input id="claimNewAmount" inputmode="decimal" placeholder="es. 450,00" /></label>',
      '  <label class="modal-field"><span>Riferimento vettore</span><input id="claimNewCarrierRef" placeholder="es. numero pratica BRT" /></label>',
      '  <label class="modal-field"><span>Descrizione</span><textarea id="claimNewDescription" rows="3" placeholder="Cosa e successo"></textarea></label>',
      "  <menu>",
      '    <button type="button" data-claim="modal-cancel">Annulla</button>',
      '    <button type="button" class="primary" data-claim="modal-save">Apri claim</button>',
      "  </menu>",
      "</form>",
    ].join("");
    document.body.appendChild(dialog);
    return dialog;
  }

  function shipmentRows() {
    try {
      return typeof allRows === "function" ? allRows() : [];
    } catch (error) {
      return [];
    }
  }

  function renderPicker() {
    var box = document.querySelector("#claimPickerResults");
    if (!box) return;
    var needle = claimState.pickerQuery.toLowerCase();
    var rows = shipmentRows();
    if (needle) {
      rows = rows.filter(function (row) {
        return [
          row.shipment, field(row, "Orders"), field(row, "Route to Customer"),
          field(row, "Provincia"), field(row, "Route To Address"), field(row, "Carrier Scelto"),
        ].some(function (value) {
          return text(value).toLowerCase().indexOf(needle) !== -1;
        });
      });
    }
    rows = rows.slice(0, 40);
    if (!rows.length) {
      box.innerHTML = '<div class="claim-picker-row"><span>Nessuna spedizione trovata.</span></div>';
      return;
    }
    box.innerHTML = rows.map(function (row) {
      return [
        '<div class="claim-picker-row" data-claim="pick" data-shipment="' + esc(row.shipment) + '">',
        "  <strong>" + esc(row.shipment) + "</strong> <span>" + esc(field(row, "Route to Customer") || "-") + "</span><br>",
        "  <span>" + esc(field(row, "Orders")) + " - " + esc(field(row, "Provincia")) +
          " - " + esc(field(row, "Service Level")) + " - " + esc(field(row, "Carrier Scelto") || "vettore da assegnare") + "</span>",
        "</div>",
      ].join("");
    }).join("");
  }

  function pickShipment(shipment) {
    var rows = shipmentRows();
    var found = null;
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].shipment === shipment) { found = rows[i]; break; }
    }
    if (!found) return;
    claimState.picked = {
      shipment: found.shipment,
      ordersText: field(found, "Orders"),
      customer: field(found, "Route to Customer"),
      province: field(found, "Provincia"),
      carrier: field(found, "Carrier Scelto"),
      shipmentDate: field(found, "Data Partenza", "Late Ship Date", "Partenza Pianificata"),
    };
    var box = document.querySelector("#claimPickedBox");
    if (box) {
      box.hidden = false;
      box.innerHTML = "<strong>" + esc(claimState.picked.shipment) + "</strong> - " +
        esc(claimState.picked.customer || "-") +
        (claimState.picked.ordersText ? " - ordini " + esc(claimState.picked.ordersText) : "") +
        (claimState.picked.carrier ? " - " + esc(claimState.picked.carrier) : "");
    }
  }

  function openModal() {
    var dialog = ensureModal();
    claimState.picked = null;
    claimState.pickerQuery = "";
    var reason = dialog.querySelector("#claimNewReason");
    var status = dialog.querySelector("#claimNewStatus");
    reason.innerHTML = reasonOptions("");
    status.innerHTML = (claimState.statuses.length ? claimState.statuses : ["Aperto"])
      .map(function (item) { return '<option value="' + esc(item) + '">' + esc(item) + "</option>"; }).join("");
    dialog.querySelector("#claimPickerInput").value = "";
    dialog.querySelector("#claimNewAmount").value = "";
    dialog.querySelector("#claimNewCarrierRef").value = "";
    dialog.querySelector("#claimNewDescription").value = "";
    var picked = dialog.querySelector("#claimPickedBox");
    picked.hidden = true;
    picked.innerHTML = "";
    renderPicker();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "open");
    window.setTimeout(function () { dialog.querySelector("#claimPickerInput").focus(); }, 0);
  }

  function closeModal() {
    var dialog = document.querySelector("#claimModal");
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  async function saveNewClaim() {
    if (claimState.busy) return;
    if (!claimState.picked) { toast("Seleziona prima la spedizione."); return; }
    var dialog = document.querySelector("#claimModal");
    var body = Object.assign({}, claimState.picked, {
      action: "create",
      reason: dialog.querySelector("#claimNewReason").value,
      status: dialog.querySelector("#claimNewStatus").value,
      amountClaimed: dialog.querySelector("#claimNewAmount").value,
      carrierRef: dialog.querySelector("#claimNewCarrierRef").value,
      description: dialog.querySelector("#claimNewDescription").value,
    });
    claimState.busy = true;
    try {
      var payload = await claimAction(body);
      closeModal();
      await loadClaims({ select: payload.claim ? payload.claim.id : null });
      toast("Claim " + (payload.claim ? payload.claim.claim_ref : "") + " aperto.");
    } catch (error) {
      toast(error.message);
    } finally {
      claimState.busy = false;
    }
  }

  /* ------------------------------------------------------------ allegati */
  function readFileBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || "");
        resolve(result.indexOf(",") !== -1 ? result.split(",")[1] : result);
      };
      reader.onerror = function () { reject(new Error("Lettura del file non riuscita.")); };
      reader.readAsDataURL(file);
    });
  }

  async function uploadFiles(claimId, files) {
    var kindSelect = document.querySelector("#claimAttachKind");
    var kind = kindSelect ? kindSelect.value : "";
    for (var i = 0; i < files.length; i += 1) {
      var file = files[i];
      try {
        toast("Carico " + file.name + "...");
        var content = await readFileBase64(file);
        await claimAction({ action: "attach", claimId: claimId, filename: file.name, kind: kind, contentBase64: content });
      } catch (error) {
        toast(error.message || ("Allegato non caricato: " + file.name));
      }
    }
    await loadClaims({ select: claimId });
    toast("Allegati aggiornati.");
  }

  /* ------------------------------------------------------------ handlers */
  document.addEventListener("click", function (event) {
    var target = event.target.closest ? event.target.closest("[data-claim]") : null;
    if (!target) return;
    var action = target.dataset.claim;
    if (action === "modal-cancel") { event.preventDefault(); closeModal(); return; }
    if (action === "modal-save") { event.preventDefault(); saveNewClaim(); return; }
    if (action === "pick") { event.preventDefault(); pickShipment(target.dataset.shipment); return; }
    if (state.page !== PAGE) return;
    event.preventDefault();

    if (action === "new") { openModal(); return; }
    if (action === "select") {
      claimState.selectedId = Number(target.dataset.id);
      renderList();
      renderDetail();
      return;
    }
    if (action === "save") { saveClaim(Number(target.dataset.id)); return; }
    if (action === "delete") { removeClaim(Number(target.dataset.id)); return; }
    if (action === "export") { exportExcel("it"); return; }
    if (action === "export-en") { exportExcel("en"); return; }
    if (action === "pick-file") {
      var input = document.querySelector("#claimFileInput");
      if (input) {
        input.dataset.claimId = target.dataset.id;
        input.click();
      }
      return;
    }
    if (action === "download-att") { download("/api/claim-attachment?id=" + encodeURIComponent(target.dataset.att)); return; }
    if (action === "delete-att") { removeAttachment(Number(target.dataset.att)); return; }
  });

  document.addEventListener("input", function (event) {
    if (event.target.id === "claimPickerInput") {
      claimState.pickerQuery = event.target.value.trim();
      renderPicker();
      return;
    }
    if (state.page !== PAGE) return;
    if (event.target.id === "claimSearchInput") {
      claimState.search = event.target.value.trim();
      renderList();
    }
  });

  document.addEventListener("change", function (event) {
    if (state.page !== PAGE) return;
    if (event.target.id === "claimStatusFilter") {
      claimState.statusFilter = event.target.value;
      renderList();
      return;
    }
    if (event.target.id === "claimFileInput" && event.target.files && event.target.files.length) {
      var claimId = Number(event.target.dataset.claimId || claimState.selectedId);
      var files = Array.prototype.slice.call(event.target.files);
      event.target.value = "";
      uploadFiles(claimId, files);
    }
  });

  async function saveClaim(claimId) {
    if (claimState.busy) return;
    var box = document.querySelector("#claimDetailBox");
    if (!box) return;
    var body = { action: "update", claimId: claimId };
    box.querySelectorAll("[data-claim-field]").forEach(function (input) {
      body[input.dataset.claimField] = input.value;
    });
    claimState.busy = true;
    try {
      await claimAction(body);
      await loadClaims({ select: claimId });
      toast("Claim aggiornato.");
    } catch (error) {
      toast(error.message);
    } finally {
      claimState.busy = false;
    }
  }

  async function removeClaim(claimId) {
    var claim = selectedClaim();
    var label = claim ? claim.claim_ref : "questo claim";
    if (!window.confirm("Eliminare definitivamente " + label + " con tutti i suoi allegati?")) return;
    try {
      await claimAction({ action: "delete", claimId: claimId });
      claimState.selectedId = null;
      await loadClaims();
      toast("Claim eliminato.");
    } catch (error) {
      toast(error.message);
    }
  }

  async function removeAttachment(attachmentId) {
    if (!window.confirm("Eliminare questo allegato?")) return;
    try {
      await claimAction({ action: "detach", attachmentId: attachmentId });
      await loadClaims({ select: claimState.selectedId });
      toast("Allegato eliminato.");
    } catch (error) {
      toast(error.message);
    }
  }

  async function exportExcel(language) {
    var lang = language === "en" ? "en" : "it";
    try {
      toast(lang === "en" ? "Genero l'Excel in inglese per il cliente..." : "Genero l'Excel dei claim...");
      var payload = await claimAction({ action: "export", language: lang });
      if (payload.downloadUrl) download(payload.downloadUrl);
      toast("Excel claim pronto: " + (payload.file || ""), {
        openPath: payload.path || "",
        downloadUrl: payload.downloadUrl || "",
      });
    } catch (error) {
      toast(error.message);
    }
  }

  /* ---------------------------------------------------------------- init */
  pageMeta[PAGE] = {
    title: "Claim",
    subtitle: "Reclami vettore: apertura, allegati, avanzamento ed export per il cliente",
    sections: [],
  };

  ensureStyles();
  ensureNavButton();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      ensureStyles();
      ensureNavButton();
    });
  }
})();
