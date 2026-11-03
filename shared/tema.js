// Tema chiaro / scuro / automatico. Caricato nel <head> per evitare lampi di colore.
(function () {
  var KEY = "tema-app-ville";
  var ORDINE = ["auto", "light", "dark"];
  var NOMI = { auto: "Automatico", light: "Chiaro", dark: "Scuro" };
  var ICONE = {
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };
  function leggi() { try { return localStorage.getItem(KEY) || "auto"; } catch (e) { return "auto"; } }
  function applica(t) {
    var r = document.documentElement;
    if (t === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", t);
    var scuro = t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", scuro ? "#171513" : "#faf4e6");
    document.querySelectorAll("[data-tema]").forEach(function (b) {
      b.innerHTML = ICONE[t] + "<span>" + NOMI[t] + "</span>";
      b.title = "Tema: " + NOMI[t] + " (tocca per cambiare)";
    });
  }
  applica(leggi());
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-tema]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = ORDINE[(ORDINE.indexOf(leggi()) + 1) % ORDINE.length];
        try { localStorage.setItem(KEY, t); } catch (e) {}
        applica(t);
      });
    });
    applica(leggi());
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { applica(leggi()); });
})();
