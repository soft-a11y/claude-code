/*
 * Couche interface : rendu, formulaire, menus.
 * Toute la logique de calcul vit dans ledger.js.
 */
(function () {
  "use strict";

  var L = window.Ledger;

  /* ------------------------------------------------------------ stockage */

  // Dans l'application, `window.compta` vient du preload Electron. Ouvert
  // directement dans un navigateur, on retombe sur le stockage local et sur
  // les téléchargements du navigateur : la page reste utilisable.
  var api = window.compta || browserFallback();

  var IS_APP = Boolean(window.compta);

  function notionUnavailable() {
    return Promise.resolve({
      ok: false,
      message: "L'envoi vers Notion n'est disponible que dans l'application."
    });
  }

  function browserFallback() {
    var KEY = "livre-de-comptes.v1";

    function download(name, text, mime) {
      var blob = new Blob([text], { type: mime + ";charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return Promise.resolve({ ok: true, path: name });
    }

    function pick(accept) {
      return new Promise(function (resolve) {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.addEventListener("change", function () {
          var file = input.files && input.files[0];
          if (!file) return resolve({ ok: false });
          var reader = new FileReader();
          reader.onload = function () {
            var text = String(reader.result || "");
            if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
            resolve({ ok: true, path: file.name, text: text });
          };
          reader.readAsText(file, "utf-8");
        });
        input.click();
      });
    }

    return {
      load: function () {
        try {
          var raw = localStorage.getItem(KEY);
          var parsed = raw ? JSON.parse(raw) : null;
          if (parsed && Array.isArray(parsed.entries)) return Promise.resolve(parsed);
        } catch (e) { /* stockage indisponible : on repart d'un livre vide */ }
        return Promise.resolve({ version: 1, entries: [] });
      },
      save: function (data) {
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignoré */ }
        return Promise.resolve("navigateur");
      },
      dataPath: function () { return Promise.resolve(""); },
      revealData: function () { return Promise.resolve(); },
      saveCsv: function (name, text) { return download(name, "﻿" + text, "text/csv"); },
      openCsv: function () { return pick(".csv,text/csv"); },
      saveJson: function (name, text) { return download(name, text, "application/json"); },
      openJson: function () { return pick(".json,application/json"); },
      // L'envoi vers Notion demande le processus principal : il porte le
      // jeton et fait les appels réseau. Hors application, tout est inerte.
      notion: {
        load: function () { return Promise.resolve({ hasToken: false, databaseId: "" }); },
        save: notionUnavailable,
        forget: notionUnavailable,
        check: notionUnavailable,
        useDatabase: notionUnavailable,
        createDatabase: notionUnavailable,
        sync: notionUnavailable,
        onProgress: function () { /* pas de progression hors application */ }
      },

      confirm: function (o) { return Promise.resolve(window.confirm(o.message + (o.detail ? "\n\n" + o.detail : ""))); },
      info: function (o) { window.alert(o.message + (o.detail ? "\n\n" + o.detail : "")); return Promise.resolve(); },
      onMenu: function () { /* pas de menus hors application */ }
    };
  }

  /* --------------------------------------------------------------- outils */

  var eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  var eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  var monthLong = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  var monthShort = new Intl.DateTimeFormat("fr-FR", { month: "short" });
  var dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });

  function $(id) { return document.getElementById(id); }
  function money(cents) { return eur.format(L.toEuros(cents)); }
  function moneyRound(cents) { return eur0.format(L.toEuros(cents)); }
  function signed(cents) { return (cents > 0 ? "+" : cents < 0 ? "−" : "") + money(Math.abs(cents)); }
  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function monthName(key) { return titleCase(monthLong.format(L.dateOfKey(key))); }

  function newId() {
    return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------------------------------------------------------------- état */

  var today = new Date();
  var state = { version: 1, entries: [], categories: L.defaultCategories() };
  var view = L.isoOf(today).slice(0, 7);
  var draftType = "d";
  var editingId = null;
  var query = "";
  var demo = false;

  // Ce que les fonctions de ledger.js attendent : les écritures et les listes.
  function book() {
    return { entries: state.entries, categories: state.categories };
  }

  function persist() {
    return api.save({ version: 1, entries: state.entries, categories: state.categories, demo: demo });
  }

  /* ------------------------------------------------------------- rendu */

  function render() {
    var all = L.sortByDateDesc(L.inMonth(state.entries, view));
    var shown = L.search(all, query);
    var t = L.totals(all);

    var label = monthName(view);
    $("monthLabel").textContent = label;
    $("soldeMonth").textContent = label.toLowerCase();
    $("today").hidden = view === L.isoOf(today).slice(0, 7);

    var solde = $("soldeValue");
    solde.textContent = t.solde > 0 ? "+" + money(t.solde) : money(t.solde);
    solde.className = "figure-xl " + (t.solde > 0 ? "is-pos" : t.solde < 0 ? "is-neg" : "");

    var cumul = L.totals(state.entries).solde;
    $("soldeCumule").textContent = cumul > 0 ? "+" + money(cumul) : money(cumul);

    $("sumRec").textContent = money(t.rec);
    $("sumDep").textContent = money(t.dep);
    $("sumCount").textContent = String(t.count);
    $("ledgerMeta").textContent = query
      ? shown.length + " sur " + t.count
      : t.count + (t.count > 1 ? " lignes" : " ligne");

    renderLedger(shown, all.length);
    renderCategories(all, t.dep);
    renderEvolution();
    fillCategoryOptions();
    $("demoBanner").hidden = !demo;
  }

  function renderLedger(list, totalInMonth) {
    var body = $("ledgerBody");
    body.textContent = "";
    $("ledgerEmpty").hidden = list.length > 0;

    if (!list.length) {
      if (query) {
        $("emptyTitle").textContent = "Aucun résultat";
        $("emptyHint").textContent = "Aucune écriture de ce mois ne correspond à « " + query + " ».";
      } else if (totalInMonth === 0 && state.entries.length === 0) {
        $("emptyTitle").textContent = "Votre livre est vide";
        $("emptyHint").textContent = "Ajoutez votre première écriture avec le formulaire ci-dessus.";
      } else {
        $("emptyTitle").textContent = "Aucune écriture ce mois-ci";
        $("emptyHint").textContent = "Ajoutez une dépense ou une recette avec le formulaire ci-dessus.";
      }
    }

    list.forEach(function (e) {
      var tr = document.createElement("tr");
      if (e.id === editingId) tr.className = "is-editing";

      var tdDate = document.createElement("td");
      tdDate.className = "date";
      tdDate.textContent = dayFmt.format(new Date(e.date + "T12:00:00"));

      var tdLabel = document.createElement("td");
      tdLabel.className = "label";
      tdLabel.appendChild(document.createTextNode(e.label));
      tdLabel.appendChild(document.createElement("br"));
      var chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = e.category;
      tdLabel.appendChild(chip);

      var tdAmount = document.createElement("td");
      tdAmount.className = "amount " + (e.type === "r" ? "is-rec" : "is-dep");
      tdAmount.textContent = (e.type === "r" ? "+" : "−") + money(e.amount);

      var tdAct = document.createElement("td");
      tdAct.className = "act";
      tdAct.appendChild(rowButton("edit", "✎", "Modifier l'écriture « " + e.label + " »", function () { startEdit(e.id); }));
      tdAct.appendChild(rowButton("del", "×", "Supprimer l'écriture « " + e.label + " »", function () { removeEntry(e.id); }));

      tr.appendChild(tdDate);
      tr.appendChild(tdLabel);
      tr.appendChild(tdAmount);
      tr.appendChild(tdAct);
      body.appendChild(tr);
    });
  }

  function rowButton(kind, glyph, label, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rowbtn " + kind;
    b.textContent = glyph;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", onClick);
    return b;
  }

  function renderCategories(list, depTotal) {
    var host = $("catList");
    host.textContent = "";
    $("catEmpty").hidden = depTotal > 0;
    $("catMeta").textContent = depTotal > 0 ? moneyRound(depTotal) + " au total" : "";
    if (!depTotal) return;

    var rows = L.byCategory(list, 7);
    var max = rows[0].value;

    rows.forEach(function (r) {
      var share = Math.round((r.value / depTotal) * 100);
      var row = document.createElement("div");
      row.className = "catrow";

      var name = document.createElement("span");
      name.className = "catrow__name";
      name.textContent = r.name;

      var val = document.createElement("span");
      val.className = "catrow__val";
      val.textContent = moneyRound(r.value);
      var pct = document.createElement("span");
      pct.textContent = share + " %";
      val.appendChild(pct);

      var track = document.createElement("div");
      track.className = "catrow__track";
      var fill = document.createElement("div");
      fill.className = "catrow__fill";
      fill.style.width = Math.max(2, (r.value / max) * 100) + "%";
      track.appendChild(fill);

      row.appendChild(name);
      row.appendChild(val);
      row.appendChild(track);
      attachTip(row, [
        ["", r.name],
        ["Montant", money(r.value)],
        ["Part", share + " % des dépenses"]
      ]);
      host.appendChild(row);
    });
  }

  function renderEvolution() {
    var host = $("evo");
    host.textContent = "";

    var keys = [];
    for (var i = 5; i >= 0; i--) keys.push(L.shiftMonth(view, -i));

    var data = keys.map(function (k) {
      var t = L.totals(L.inMonth(state.entries, k));
      return { key: k, rec: t.rec, dep: t.dep, solde: t.solde };
    });

    var max = data.reduce(function (m, d) { return Math.max(m, d.rec, d.dep); }, 0);
    $("evoMax").textContent = max > 0 ? "Échelle jusqu'à " + moneyRound(max) : "";

    data.forEach(function (d) {
      var col = document.createElement("div");
      col.className = "evocol" + (d.key === view ? " is-current" : "");

      var tag = document.createElement("span");
      tag.className = "evocol__tag";
      tag.textContent = d.key === view && (d.rec || d.dep)
        ? (d.solde >= 0 ? "+" : "−") + moneyRound(Math.abs(d.solde))
        : "";

      var bars = document.createElement("div");
      bars.className = "evocol__bars";
      [["rec", d.rec], ["dep", d.dep]].forEach(function (pair) {
        var bar = document.createElement("div");
        bar.className = "evocol__bar " + pair[0];
        bar.style.height = (max > 0 ? Math.max(2, (pair[1] / max) * 121) : 2) + "px";
        bars.appendChild(bar);
      });

      var lab = document.createElement("div");
      lab.className = "evocol__label";
      lab.textContent = monthShort.format(L.dateOfKey(d.key)).replace(".", "");

      col.appendChild(tag);
      col.appendChild(bars);
      col.appendChild(lab);
      attachTip(col, [
        ["", monthName(d.key)],
        ["Recettes", moneyRound(d.rec)],
        ["Dépenses", moneyRound(d.dep)],
        ["Solde", (d.solde >= 0 ? "+" : "−") + moneyRound(Math.abs(d.solde))]
      ]);
      host.appendChild(col);
    });
  }

  /* ------------------------------------------------------------- infobulle */

  var tip = $("tip");

  // Les lignes sont construites en DOM, jamais en HTML : un libellé saisi par
  // l'utilisateur ne peut pas devenir du balisage.
  function attachTip(node, lines) {
    node.addEventListener("pointerenter", function () {
      tip.textContent = "";
      lines.forEach(function (pair, index) {
        if (index) tip.appendChild(document.createElement("br"));
        if (pair[0]) {
          var k = document.createElement("span");
          k.className = "k";
          k.textContent = pair[0] + " ";
          tip.appendChild(k);
          tip.appendChild(document.createTextNode(pair[1]));
        } else {
          var b = document.createElement("b");
          b.textContent = pair[1];
          tip.appendChild(b);
        }
      });
      tip.classList.add("is-on");
    });
    node.addEventListener("pointermove", function (ev) {
      var x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
      var y = ev.clientY - tip.offsetHeight - 12;
      if (y < 8) y = ev.clientY + 18;
      tip.style.left = Math.max(8, x) + "px";
      tip.style.top = y + "px";
    });
    node.addEventListener("pointerleave", function () { tip.classList.remove("is-on"); });
  }

  /* --------------------------------------------------------------- saisie */

  function fillCategoryOptions() {
    var list = $("catOptions");
    list.textContent = "";
    L.listCategories(book(), draftType).forEach(function (c) {
      var option = document.createElement("option");
      option.value = c;
      list.appendChild(option);
    });
  }

  function setType(type) {
    draftType = type;
    $("typeDep").setAttribute("aria-pressed", String(type === "d"));
    $("typeRec").setAttribute("aria-pressed", String(type === "r"));
    fillCategoryOptions();
  }

  function showError(message) {
    var el = $("formError");
    el.textContent = message || "";
    el.hidden = !message;
  }

  function resetForm() {
    editingId = null;
    $("entryForm").classList.remove("is-editing");
    $("entryMode").hidden = true;
    $("cancelEdit").hidden = true;
    $("submitBtn").textContent = "Enregistrer";
    $("fAmount").value = "";
    $("fLabel").value = "";
    $("fCat").value = "";
    $("fDate").value = L.isoOf(today);
    showError("");
  }

  function startEdit(id) {
    var entry = state.entries.find(function (e) { return e.id === id; });
    if (!entry) return;
    editingId = id;
    setType(entry.type);
    $("fAmount").value = L.centsToCsv(entry.amount);
    $("fLabel").value = entry.label;
    $("fCat").value = entry.category;
    $("fDate").value = entry.date;
    $("entryForm").classList.add("is-editing");
    $("entryMode").hidden = false;
    $("cancelEdit").hidden = false;
    $("submitBtn").textContent = "Mettre à jour";
    showError("");
    $("fAmount").focus();
    $("fAmount").select();
    render();
  }

  $("entryForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var result = L.validate({
      type: draftType,
      amount: $("fAmount").value,
      label: $("fLabel").value,
      category: $("fCat").value,
      date: $("fDate").value
    });

    if (!result.ok) {
      showError(result.message);
      var field = { amount: "fAmount", label: "fLabel", date: "fDate" }[result.field];
      if (field) $(field).focus();
      return;
    }

    // Une catégorie saisie à la volée entre dans la liste : elle survivra à
    // la suppression de l'écriture qui l'a introduite.
    var added = L.addCategory(book(), result.entry.type, result.entry.category);
    if (added.ok) state.categories = added.categories;

    if (editingId) {
      var index = state.entries.findIndex(function (e) { return e.id === editingId; });
      if (index >= 0) {
        state.entries[index] = Object.assign({}, state.entries[index], result.entry);
      }
      toast("Écriture mise à jour.");
    } else {
      state.entries.push(Object.assign({ id: newId(), created: Date.now() }, result.entry));
    }

    view = L.monthKey(result.entry.date);
    resetForm();
    persist();
    render();
    $("fAmount").focus();
  });

  $("typeDep").addEventListener("click", function () { setType("d"); });
  $("typeRec").addEventListener("click", function () { setType("r"); });
  $("cancelEdit").addEventListener("click", function () { resetForm(); render(); });

  /* -------------------------------------------------- gestion des catégories */

  var catType = "d";

  function openCategories() {
    catType = draftType;
    showCatError("");
    $("catNew").value = "";
    renderCategoryManager();
    var dialog = $("catDialog");
    if (!dialog.open) dialog.showModal();
    $("catNew").focus();
  }

  function showCatError(message) {
    var el = $("catError");
    el.textContent = message || "";
    el.hidden = !message;
  }

  function setCatType(type) {
    catType = type;
    $("catTabDep").setAttribute("aria-pressed", String(type === "d"));
    $("catTabRec").setAttribute("aria-pressed", String(type === "r"));
    showCatError("");
    renderCategoryManager();
  }

  // Applique un résultat de ledger.js (ajout, renommage, suppression) et
  // rafraîchit tout ce qui dépend des catégories.
  function applyCategoryChange(result) {
    if (!result.ok) {
      showCatError(result.message);
      renderCategoryManager();
      return false;
    }
    state.categories = result.categories;
    if (result.entries) state.entries = result.entries;
    showCatError("");
    persist();
    renderCategoryManager();
    render();
    return true;
  }

  function renderCategoryManager() {
    var host = $("catManage");
    host.textContent = "";
    var counted = L.countByCategory(state.entries, catType);

    L.listCategories(book(), catType).forEach(function (name) {
      var used = counted(name);
      var li = document.createElement("li");
      li.dataset.category = name;

      var input = document.createElement("input");
      input.className = "catmanage__name";
      input.type = "text";
      input.value = name;
      input.maxLength = 40;
      input.setAttribute("aria-label", "Nom de la catégorie « " + name + " »");

      function commit() {
        var next = input.value.trim();
        if (!next || next === name) { input.value = name; return; }
        if (!applyCategoryChange(L.renameCategory(book(), catType, name, next))) input.value = name;
      }

      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
        if (ev.key === "Escape") { ev.stopPropagation(); input.value = name; input.blur(); }
      });
      input.addEventListener("blur", commit);

      var count = document.createElement("span");
      count.className = "catmanage__count";
      count.textContent = used ? used + (used > 1 ? " écritures" : " écriture") : "inutilisée";

      var del = document.createElement("button");
      del.type = "button";
      del.className = "rowbtn del";
      del.textContent = "×";
      del.setAttribute("aria-label", "Supprimer la catégorie « " + name + " »");
      del.addEventListener("click", function () { removeCategory(name, used); });

      li.appendChild(input);
      li.appendChild(count);
      li.appendChild(del);
      host.appendChild(li);
    });
  }

  function removeCategory(name, used) {
    if (!used) {
      applyCategoryChange(L.removeCategory(book(), catType, name));
      return;
    }
    api.confirm({
      message: "Supprimer la catégorie « " + name + " » ?",
      detail: used + (used > 1 ? " écritures passeront" : " écriture passera") + " dans « " + L.FALLBACK_CATEGORY + " ».",
      confirmLabel: "Supprimer"
    }).then(function (ok) {
      if (ok) applyCategoryChange(L.removeCategory(book(), catType, name));
    });
  }

  $("catAddForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = $("catNew").value;
    // Pas de bandeau de confirmation ici : il passerait sous la fenêtre
    // modale. La liste qui s'allonge est la confirmation.
    if (applyCategoryChange(L.addCategory(book(), catType, name))) $("catNew").value = "";
    $("catNew").focus();
  });

  $("openCats").addEventListener("click", openCategories);
  $("catTabDep").addEventListener("click", function () { setCatType("d"); });
  $("catTabRec").addEventListener("click", function () { setCatType("r"); });
  $("catClose").addEventListener("click", function () { $("catDialog").close(); });
  $("catDialog").addEventListener("close", function () { fillCategoryOptions(); });

  /* ---------------------------------------------------------- envoi Notion */

  var notionScope = "month";
  var notionBusy = false;

  function notionState(id, message, tone) {
    var el = $(id);
    el.textContent = message;
    el.className = "steps__state" + (tone ? " is-" + tone : "");
  }

  function notionError(message) {
    var el = $("notionError");
    el.textContent = message || "";
    el.hidden = !message;
  }

  function refreshNotionState() {
    return api.notion.load().then(function (config) {
      notionState("notionTokenState",
        config.hasToken ? "Jeton enregistré sur cet ordinateur." : "Aucun jeton enregistré.",
        config.hasToken ? "ok" : null);
      notionState("notionDbState",
        config.databaseId ? "Base liée : " + config.databaseId : "Aucune base indiquée.",
        config.databaseId ? "ok" : null);
      $("notionSend").disabled = !(config.hasToken && config.databaseId);
      return config;
    });
  }

  function openNotionDialog() {
    notionError("");
    $("notionToken").value = "";
    refreshNotionState();
    var dialog = $("notionDialog");
    if (!dialog.open) dialog.showModal();
  }

  function setNotionScope(scope) {
    notionScope = scope;
    $("notionScopeMonth").setAttribute("aria-pressed", String(scope === "month"));
    $("notionScopeAll").setAttribute("aria-pressed", String(scope === "all"));
  }

  // Les boutons se verrouillent pendant un appel réseau : deux envois
  // simultanés créeraient des doublons dans Notion.
  function notionLock(locked) {
    notionBusy = locked;
    ["notionSaveToken", "notionUseDb", "notionCreateDb", "notionSend", "notionForget"].forEach(function (id) {
      $(id).disabled = locked;
    });
    if (!locked) refreshNotionState();
  }

  $("notionSaveToken").addEventListener("click", function () {
    var token = $("notionToken").value.trim();
    if (!token) { notionError("Collez le secret de votre intégration Notion."); return; }
    notionError("");
    notionLock(true);
    api.notion.save({ token: token }).then(function () {
      $("notionToken").value = "";
      notionLock(false);
    });
  });

  $("notionUseDb").addEventListener("click", function () {
    var target = $("notionTarget").value.trim();
    if (!target) { notionError("Collez l'adresse de la base Notion."); return; }
    notionError("");
    notionLock(true);
    notionState("notionDbState", "Vérification…", "busy");
    api.notion.useDatabase({ target: target }).then(function (res) {
      if (!res.ok) notionError(res.message);
      else toast("Base « " + res.title + " » liée.");
      notionLock(false);
    });
  });

  $("notionCreateDb").addEventListener("click", function () {
    var target = $("notionTarget").value.trim();
    if (!target) { notionError("Collez l'adresse de la page Notion qui accueillera la base."); return; }
    notionError("");
    notionLock(true);
    notionState("notionDbState", "Création de la base…", "busy");
    api.notion.createDatabase({ target: target, parent: target, title: "Livre de comptes" }).then(function (res) {
      if (!res.ok) notionError(res.message);
      else toast("Base créée dans Notion.");
      notionLock(false);
    });
  });

  $("notionForget").addEventListener("click", function () {
    api.confirm({
      message: "Oublier les réglages Notion ?",
      detail: "Le jeton et le lien vers la base seront supprimés de cet ordinateur. Les lignes déjà envoyées restent dans Notion.",
      confirmLabel: "Oublier"
    }).then(function (ok) {
      if (!ok) return;
      api.notion.forget().then(function () {
        notionError("");
        refreshNotionState();
      });
    });
  });

  $("notionSend").addEventListener("click", function () {
    if (notionBusy) return;
    var list = notionScope === "month" ? L.inMonth(state.entries, view) : state.entries;
    if (!list.length) { notionError("Aucune écriture à envoyer pour cette sélection."); return; }

    notionError("");
    notionLock(true);
    notionState("notionSendState", "Envoi de " + list.length + " écritures…", "busy");

    api.notion.sync({ entries: list }).then(function (res) {
      notionLock(false);
      if (!res.ok) {
        notionState("notionSendState", "Envoi interrompu.", null);
        notionError(res.message);
        return;
      }

      var report = res.report;
      // On garde le lien vers chaque page Notion : le prochain envoi mettra
      // à jour au lieu de recréer.
      state.entries.forEach(function (e) {
        if (!Object.prototype.hasOwnProperty.call(report.pages, e.id)) return;
        var pageId = report.pages[e.id];
        if (pageId) e.notionPageId = pageId;
        else delete e.notionPageId;
      });
      persist();

      var parts = [];
      if (report.created) parts.push(report.created + (report.created > 1 ? " créées" : " créée"));
      if (report.updated) parts.push(report.updated + (report.updated > 1 ? " mises à jour" : " mise à jour"));
      if (report.failed) parts.push(report.failed + (report.failed > 1 ? " en échec" : " en échec"));
      notionState("notionSendState", parts.length ? parts.join(", ") + "." : "Rien à envoyer.",
        report.failed ? null : "ok");

      if (report.aborted) notionError(report.aborted);
      else if (report.errors.length) {
        notionError("Première erreur : " + report.errors[0].reason);
      }
    });
  });

  $("notionScopeMonth").addEventListener("click", function () { setNotionScope("month"); });
  $("notionScopeAll").addEventListener("click", function () { setNotionScope("all"); });
  $("notionClose").addEventListener("click", function () { $("notionDialog").close(); });
  $("openNotion").addEventListener("click", openNotionDialog);
  $("notionIntegrations").addEventListener("click", function () {
    window.open("https://www.notion.so/my-integrations", "_blank");
  });

  if (IS_APP) {
    api.notion.onProgress(function (progress) {
      if (progress.done >= progress.total) return;
      notionState("notionSendState",
        progress.done + " / " + progress.total + (progress.label ? " · " + progress.label : ""), "busy");
    });
  }

  /* ------------------------------------------------------ suppression */

  var undoBuffer = null;
  var toastTimer = null;

  function removeEntry(id) {
    var index = state.entries.findIndex(function (e) { return e.id === id; });
    if (index < 0) return;
    if (id === editingId) resetForm();
    undoBuffer = { entry: state.entries[index], index: index };
    state.entries.splice(index, 1);
    persist();
    render();
    toast("« " + undoBuffer.entry.label + " » supprimée.", true);
  }

  function toast(message, undoable) {
    $("toastMsg").textContent = message;
    $("toastUndo").hidden = !undoable;
    $("toast").classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      $("toast").classList.remove("is-on");
      undoBuffer = null;
    }, undoable ? 8000 : 3500);
  }

  $("toastUndo").addEventListener("click", function () {
    if (!undoBuffer) return;
    state.entries.splice(undoBuffer.index, 0, undoBuffer.entry);
    undoBuffer = null;
    persist();
    render();
    $("toast").classList.remove("is-on");
  });

  /* ---------------------------------------------------- navigation, recherche */

  $("prev").addEventListener("click", function () { view = L.shiftMonth(view, -1); render(); });
  $("next").addEventListener("click", function () { view = L.shiftMonth(view, 1); render(); });
  $("today").addEventListener("click", function () { view = L.isoOf(today).slice(0, 7); render(); });

  $("search").addEventListener("input", function () {
    query = this.value;
    $("searchClear").hidden = !query;
    render();
  });

  $("searchClear").addEventListener("click", function () {
    query = "";
    $("search").value = "";
    $("searchClear").hidden = true;
    render();
    $("search").focus();
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") {
      if ($("catDialog").open) return; // la fenêtre modale se ferme d'elle-même
      if (query) { $("searchClear").click(); return; }
      if (editingId) { resetForm(); render(); }
    }
  });

  /* ------------------------------------------------------------ fichiers */

  function stamp() {
    return L.isoOf(today);
  }

  function exportCsv(scope) {
    var list = scope === "month" ? L.inMonth(state.entries, view) : state.entries;
    if (!list.length) {
      api.info({ message: "Rien à exporter", detail: "Ce livre ne contient aucune écriture pour cet export." });
      return;
    }
    var name = scope === "month" ? "comptes-" + view + ".csv" : "comptes-" + stamp() + ".csv";
    api.saveCsv(name, L.toCsv(list)).then(function (res) {
      if (res && res.ok) toast(list.length + (list.length > 1 ? " écritures exportées." : " écriture exportée."));
    });
  }

  function importCsv() {
    api.openCsv().then(function (res) {
      if (!res || !res.ok) return;
      var parsed = L.fromCsv(res.text);
      if (!parsed.entries.length) {
        api.info({
          message: "Aucune écriture importée",
          detail: parsed.errors.length ? "Première erreur : " + parsed.errors[0].reason + "." : "Le fichier ne contient pas de ligne exploitable."
        });
        return;
      }

      var detail = parsed.errors.length
        ? parsed.errors.length + (parsed.errors.length > 1 ? " lignes seront ignorées" : " ligne sera ignorée") +
          " (" + parsed.errors.slice(0, 3).map(function (e) { return "ligne " + e.line + " : " + e.reason; }).join(", ") + ")."
        : "Elles s'ajouteront aux écritures déjà enregistrées.";

      api.confirm({
        message: "Importer " + parsed.entries.length + (parsed.entries.length > 1 ? " écritures ?" : " écriture ?"),
        detail: detail,
        confirmLabel: "Importer"
      }).then(function (ok) {
        if (!ok) return;
        parsed.entries.forEach(function (e) {
          state.entries.push(Object.assign({ id: newId(), created: Date.now() }, e));
          // Les catégories apportées par le fichier rejoignent la liste du
          // sens correspondant, pour survivre à la suppression des écritures.
          var added = L.addCategory(book(), e.type, e.category);
          if (added.ok) state.categories = added.categories;
        });
        demo = false;
        persist();
        render();
        toast(parsed.entries.length + (parsed.entries.length > 1 ? " écritures importées." : " écriture importée."));
      });
    });
  }

  function backup() {
    api.saveJson(
      "livre-de-comptes-" + stamp() + ".json",
      JSON.stringify({ version: 1, entries: state.entries, categories: state.categories }, null, 2)
    )
      .then(function (res) {
        if (res && res.ok) toast("Sauvegarde enregistrée.");
      });
  }

  function restore() {
    api.openJson().then(function (res) {
      if (!res || !res.ok) return;
      var parsed;
      try { parsed = JSON.parse(res.text); } catch (e) { parsed = null; }
      if (!parsed || !Array.isArray(parsed.entries)) {
        api.info({ message: "Sauvegarde illisible", detail: "Ce fichier n'est pas une sauvegarde du Livre de comptes." });
        return;
      }
      api.confirm({
        message: "Remplacer le livre par cette sauvegarde ?",
        detail: "Les " + state.entries.length + " écritures actuelles seront remplacées par les " + parsed.entries.length + " écritures du fichier.",
        confirmLabel: "Remplacer"
      }).then(function (ok) {
        if (!ok) return;
        state.entries = parsed.entries.map(function (e) {
          return Object.assign({ id: newId(), created: Date.now() }, e);
        });
        state.categories = L.sanitizeCategories(parsed.categories);
        demo = false;
        resetForm();
        persist();
        render();
        toast("Sauvegarde restaurée.");
      });
    });
  }

  function loadDemo() {
    var apply = function () {
      state.entries = L.buildDemo(today).map(function (e) {
        return Object.assign({ id: newId(), created: Date.now() }, e);
      });
      state.categories = L.defaultCategories();
      demo = true;
      view = L.isoOf(today).slice(0, 7);
      // Un 3 du mois, le mois courant est presque vide : on ouvre sur le
      // mois précédent, complet, pour que la démonstration montre quelque chose.
      if (L.inMonth(state.entries, view).length < 6) view = L.shiftMonth(view, -1);
      resetForm();
      persist();
      render();
    };
    if (!state.entries.length) return apply();
    api.confirm({
      message: "Remplacer le livre par des données d'exemple ?",
      detail: "Vos " + state.entries.length + " écritures actuelles seront effacées.",
      confirmLabel: "Remplacer"
    }).then(function (ok) { if (ok) apply(); });
  }

  function wipe() {
    if (!state.entries.length) return;
    api.confirm({
      message: "Effacer toutes les écritures ?",
      detail: "Les " + state.entries.length + " écritures du livre seront supprimées. Cette action est définitive.",
      confirmLabel: "Effacer"
    }).then(function (ok) {
      if (!ok) return;
      state.entries = [];
      state.categories = L.defaultCategories();
      demo = false;
      view = L.isoOf(today).slice(0, 7);
      resetForm();
      persist();
      render();
    });
  }

  $("clearDemo").addEventListener("click", function () {
    state.entries = [];
    demo = false;
    resetForm();
    persist();
    render();
  });

  $("wipe").addEventListener("click", wipe);
  $("reveal").addEventListener("click", function () { api.revealData(); });

  /* --------------------------------------------------------------- menus */

  var commands = {
    "new": function () { resetForm(); render(); $("fAmount").focus(); },
    search: function () { $("search").focus(); $("search").select(); },
    prev: function () { view = L.shiftMonth(view, -1); render(); },
    next: function () { view = L.shiftMonth(view, 1); render(); },
    today: function () { view = L.isoOf(today).slice(0, 7); render(); },
    categories: openCategories,
    notion: openNotionDialog,
    "import-csv": importCsv,
    "export-csv-month": function () { exportCsv("month"); },
    "export-csv-all": function () { exportCsv("all"); },
    backup: backup,
    restore: restore,
    demo: loadDemo,
    wipe: wipe,
    where: function () {
      api.dataPath().then(function (path) {
        api.info({
          message: "Où sont mes données ?",
          detail: "Vos écritures sont enregistrées dans ce fichier, sur cet ordinateur :\n\n" + path +
            "\n\nRien n'est envoyé sur Internet. Utilisez Fichier ▸ Enregistrer une sauvegarde pour en garder une copie ailleurs."
        });
      });
    }
  };

  api.onMenu(function (command) {
    if (commands[command]) commands[command]();
  });

  /* --------------------------------------------------------------- départ */

  function boot(data) {
    demo = Boolean(data.demo);
    state.categories = L.sanitizeCategories(data.categories);
    state.entries = (data.entries || []).map(function (e) {
      var entry = {
        id: e.id || newId(),
        created: e.created || 0,
        type: e.type === "r" ? "r" : "d",
        // Un import venant d'une version en euros (nombre décimal) est
        // reconverti en centimes une bonne fois pour toutes.
        amount: Number.isInteger(e.amount) ? e.amount : Math.round(Number(e.amount || 0) * 100),
        label: String(e.label || "Sans libellé"),
        category: String(e.category || "Divers"),
        date: L.isValidIso(e.date) ? e.date : L.isoOf(today)
      };
      // Le lien vers la page Notion doit survivre au redémarrage, sinon le
      // prochain envoi recréerait des lignes déjà présentes.
      if (typeof e.notionPageId === "string" && e.notionPageId) entry.notionPageId = e.notionPageId;
      return entry;
    });

    if (data.rescuedFrom) {
      api.info({
        message: "Fichier de données illisible",
        detail: "Le livre a été rouvert vide. L'ancien fichier a été conservé ici :\n\n" + data.rescuedFrom
      });
    }

    resetForm();
    setType("d");
    render();

    if (IS_APP) {
      $("reveal").hidden = false;
      $("openNotion").hidden = false;
      api.dataPath().then(function (path) {
        $("storeInfo").textContent = "Vos écritures sont enregistrées sur cet ordinateur : " + path;
      });
    } else {
      $("storeInfo").textContent = "Vos écritures sont enregistrées dans ce navigateur uniquement.";
    }
  }

  api.load().then(boot);
})();
