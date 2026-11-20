// Codice condiviso dalle due app: connessione a Firebase, login e funzioni di utilità.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver,
  onAuthStateChanged, signOut,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocFromServer, getDocFromCache, getDocs, onSnapshot,
  query, where, orderBy, limit, serverTimestamp, writeBatch, terminate, clearIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

export {
  collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, writeBatch
};

export const configurato = !String(firebaseConfig.apiKey).includes("INCOLLA_QUI");
const app = initializeApp(firebaseConfig);
// Accesso ricordato sul dispositivo: si resta collegati finché non si preme "Esci".
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});
// Cache locale: l'app funziona anche senza rete e invia i dati appena torna la connessione.
// Database "(default)", lo stesso dell'app di gestione ville.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

/* Ville e prenotazioni sono gestite dall'app di gestione ville: qui si leggono soltanto.
   Collezioni e campi di quell'app → nomi usati in queste app. */
export const COLL = { ville: "villas", prenotazioni: "bookings" };
export const nomeVilla = (v) =>
  (v && (v.nome || v.name || v.titolo || v.title || v.label)) || (v ? "Villa " + v.id : "Villa non trovata");
export const normVilla = (v) => ({ ...v, nome: nomeVilla(v) });
/* Solo i campi che servono a queste app: i prezzi (prezzoVendita, prezzoAcquisto, prezzi dei servizi),
   lo stato e il colore della prenotazione non vengono copiati. */
export const normPren = (b) => ({
  id: b.id, villaId: b.villaId,
  ospite: (b.cliente || "").trim() || (b.status === "vuoto" ? NOME_STATO.vuoto : "Prenotazione senza nome"),
  vuoto: b.status === "vuoto",
  cliente: (b.cliente || "").trim(),
  checkIn: b.from, checkOut: b.to, status: b.status || "", note: b.note || "",
  early: !!b.earlyIn, late: !!b.lateOut,
  servizi: [...SERVIZI_BASE.map(([k]) => k).filter((k) => b[k]), ...(Array.isArray(b.servizi) ? b.servizi : [])],
  noteServizi: Object.fromEntries(Object.entries(b.serviziDett || {})
    .map(([k, d]) => [k, String((d && d.note) || "").trim()]).filter(([, n]) => n)),
  // servizi che la prenotazione ha "a carico del proprietario" (serviziDett[chiave].carico, dal 20/11/2026):
  // si copia solo questo, non prezzi né altri dati del servizio
  serviziProprietario: Object.entries(b.serviziDett || {})
    .filter(([, d]) => d && d.carico === "proprietario").map(([k]) => k),
});
/* Servizi di base della scheda prenotazione di Summer Database; gli altri arrivano da meta/settings.servizi */
export const SERVIZI_BASE = [["pulizia", "Pulizia finale"], ["cuoco", "Cuoco"], ["transfer", "Transfer"]];
/* Copia dei dati essenziali della prenotazione salvata dentro lo scontrino:
   se la prenotazione viene modificata o ricreata nell'altra app, lo scontrino resta raggruppato bene. */
export const fotoPren = (p) => (p ? { cliente: p.ospite, from: p.checkIn, to: p.checkOut } : null);
/* Ritrova la prenotazione di uno scontrino: per ID, poi per villa + date, altrimenti dalla copia salvata. */
export function trovaPren(s, prenotazioni) {
  if (!s.prenotazioneId && !s.prenotazione) return null;
  const snap = s.prenotazione;
  // 1) stessa prenotazione (ID) della stessa villa: resta collegata anche se le sue date cambiano
  const perId = prenotazioni.find((p) => p.id === s.prenotazioneId && p.villaId === s.villaId);
  if (perId) return perId;
  // 2) stessa villa con le date della copia salvata nello scontrino; 3) altrimenti la copia
  if (snap) {
    const perDate = prenotazioni.find((p) => p.villaId === s.villaId && p.checkIn === snap.from && p.checkOut === snap.to);
    if (perDate) return perDate;
    return { id: "old:" + snap.from + snap.to, villaId: s.villaId, ospite: snap.cliente || "Prenotazione",
      checkIn: snap.from, checkOut: snap.to, nonInCalendario: true };
  }
  return null;
}

/* ---------- Categorie degli scontrini (dal 18/11/2026 dalle Impostazioni di Summer Database) ----------
   Il menu ha tre gruppi:
   1) Servizi offerti: i servizi delle prenotazioni (meta/settings: base pulizia/cuoco/transfer con nome in
      serviziBase[chiave].label e tolti se serviziBase[chiave].off; più servizi: [{ key, label }]).
      Lo scontrino salva categoria = nome del servizio e servizio = chiave.
   2) Altre categorie: meta/settings.categorieSpese (se manca, CATEGORIE qui sotto);
      quelle in meta/settings.categorieAggiuntive sono aggiuntive.
   3) Fisse: Danni villa (sempre aggiuntiva). Affitto proprietario e Restituzione deposito sicurezza
      esistono ma si inseriscono solo da Summer Database: non sono nel menu. */
export const CATEGORIE = [
  "Pulizie", "Manutenzione", "Lavanderia", "Spesa e forniture", "Utenze",
  "Giardino e piscina", "Benvenuto ospiti", "Commissioni e tasse", "Altro"
];
export const CAT_DANNI = "Danni villa";
/* Categorie riservate (decisione del proprietario, 18/11/2026): si inseriscono, modificano e cancellano SOLO da
   Summer Database. L'app Scontrini non le propone nel menu, non le mostra (né in Inseriti né nelle Schede
   prenotazioni), le esclude da conteggi e totali e non le tocca.
   - Affitto proprietario: quanto pagato davvero al proprietario (spesa, mai aggiuntiva);
   - Restituzione deposito sicurezza: denaro restituito al cliente (importo salvato positivo);
   - Addebito cliente / Addebito proprietario: entrate (quanto si fa pagare al cliente o al proprietario);
   - Commissione agenzia (dal 20/11/2026): quanto si riconosce all'agenzia che ha portato il cliente
     (spesa della prenotazione, mai aggiuntiva; si crea solo da Summer Database). */
export const CAT_AFFITTO = "Affitto proprietario";
export const CAT_RESTITUZIONE = "Restituzione deposito sicurezza";
export const CAT_ADDEBITO_CLIENTE = "Addebito cliente";
export const CAT_ADDEBITO_PROPRIETARIO = "Addebito proprietario";
export const CAT_COMMISSIONE_AGENZIA = "Commissione agenzia";
export const CATEGORIE_RISERVATE = [CAT_AFFITTO, CAT_RESTITUZIONE, CAT_ADDEBITO_CLIENTE, CAT_ADDEBITO_PROPRIETARIO, CAT_COMMISSIONE_AGENZIA];
export const isRiservata = (s) => CATEGORIE_RISERVATE.includes(s?.categoria);

/* Elenco delle categorie a partire da meta/settings (null = non leggibile → valori predefiniti). */
export function catalogoCategorie(settings) {
  const sb = (settings && settings.serviziBase) || {};
  // tutti i servizi, anche quelli tolti dall'offerta (off: true): base → serviziBase[chiave].off,
  // aggiunti → servizi[i].off (dal 20/11/2026; il record resta per le prenotazioni che lo hanno)
  const tutti = [
    ...SERVIZI_BASE.map(([k, def]) => ({ key: k, label: String((sb[k] && sb[k].label) || "").trim() || def, off: !!(sb[k] && sb[k].off) })),
    ...(Array.isArray(settings?.servizi) ? settings.servizi : [])
      .filter((x) => x && x.key).map((x) => ({ key: x.key, label: String(x.label || x.key).trim(), off: !!x.off })),
  ];
  const servizi = tutti.filter((x) => !x.off).map(({ key, label }) => ({ key, label })); // quelli nel menu
  const spenti = new Set(tutti.filter((x) => x.off).map((x) => x.key));
  const nomiServizi = new Map(tutti.map((x) => [x.key, x.label]));
  const lista = Array.isArray(settings?.categorieSpese) ? settings.categorieSpese.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const altre = (lista.length ? lista : CATEGORIE)
    .filter((c) => c !== CAT_DANNI && !CATEGORIE_RISERVATE.includes(c));
  const aggiuntive = new Set(Array.isArray(settings?.categorieAggiuntive) ? settings.categorieAggiuntive : []);
  // spese a carico del proprietario: spese normali (aggiuntiva = false), mostrate a parte in Summer Database
  const proprietario = new Set(Array.isArray(settings?.categorieProprietario) ? settings.categorieProprietario : []);
  return { servizi, spenti, nomiServizi, altre, aggiuntive, proprietario };
}
/* Chiave del servizio di uno scontrino: il campo servizio, oppure una categoria uguale al nome di un servizio. */
/* Un servizio tolto dall'offerta (off) vale come servizio solo se la prenotazione dello scontrino lo ha ancora
   spuntato; altrimenti lo scontrino segue la voce delle note spese con lo stesso nome.
   p = prenotazione normalizzata (normPren) o null; se non indicata (undefined) il servizio spento non vale. */
export function servizioDi(s, cat, p) {
  const k = s?.servizio || cat.servizi.find((x) => x.label === s?.categoria)?.key || null;
  if (!k || !cat.spenti?.has(k)) return k;
  return p && Array.isArray(p.servizi) && p.servizi.includes(k) ? k : null;
}
/* "Aggiuntiva" (da addebitare al cliente) calcolata come in Summer Database:
   - servizio: offerto se la prenotazione dello scontrino ha quel servizio, altrimenti aggiuntivo
     (anche per le spese generali, senza prenotazione);
   - altre categorie: aggiuntiva se è in categorieAggiuntive;
   - Danni villa sì; le categorie riservate (Affitto proprietario, Restituzione, Addebiti) no;
   - categoria sconosciuta (rinominata o tolta): vale il campo aggiuntiva salvato.
   p = prenotazione dello scontrino già normalizzata (normPren), oppure null. */
export function calcolaAggiuntiva(s, p, cat) {
  const c = s?.categoria;
  if (CATEGORIE_RISERVATE.includes(c)) return false;
  if (c === CAT_DANNI) return true;
  const k = servizioDi(s, cat, p);
  if (k) return !(p && Array.isArray(p.servizi) && p.servizi.includes(k));
  if (cat.altre.includes(c)) return !cat.proprietario.has(c) && cat.aggiuntive.has(c);
  return typeof s?.aggiuntiva === "boolean" ? s.aggiuntiva : false;
}
/* Metodo di pagamento dello scontrino (campo pagamento, dal 18/11/2026); null o assente = non indicato */
export const PAGAMENTI = [["contanti", "Contanti"], ["carta", "Carta di credito"], ["bonifico", "Bonifico"]];
export const nomePagamento = (v) => (PAGAMENTI.find(([k]) => k === v) || [, ""])[1];
/* Importo che conta nei totali delle spese dell'app (le categorie riservate non sono mai mostrate né contate) */
export const importoSpesa = (s) => (isRiservata(s) ? 0 : Number(s?.importo) || 0);
/* Categoria a carico del proprietario (meta/settings.categorieProprietario) */
/* A carico del proprietario: categoria in categorieProprietario, oppure (dal 20/11/2026) servizio previsto nella
   prenotazione con carico "proprietario". p = prenotazione normalizzata dello scontrino, o null. */
export function aCaricoProprietario(s, cat, p) {
  const k = servizioDi(s, cat, p);
  if (k) return !!(p && Array.isArray(p.servizi) && p.servizi.includes(k) && (p.serviziProprietario || []).includes(k));
  return cat.proprietario.has(s?.categoria);
}

/* ---------- Login ---------- */
export function setupAuth({ onLogin, onLogout }) {
  const login = document.getElementById("login");
  const appEl = document.getElementById("app");
  const form = login.querySelector("form");
  const err = login.querySelector(".err");
  if (!configurato) document.getElementById("config-warning").hidden = false;

  // Accesso solo con Google: le regole del database richiedono un'email verificata.
  const gBtn = document.getElementById("google-login");
  gBtn.addEventListener("click", async () => {
    err.textContent = "";
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    gBtn.disabled = true;
    try {
      await signInWithPopup(auth, provider);
    } catch (x) {
      if (/popup-blocked|operation-not-supported/.test(x.code || "")) return signInWithRedirect(auth, provider);
      if (!/popup-closed|cancelled-popup/.test(x.code || "")) err.textContent = "Accesso non riuscito: " + (x.message || x);
    } finally {
      gBtn.disabled = false;
    }
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  document.querySelectorAll("[data-logout]").forEach((b) =>
    b.addEventListener("click", () => signOut(auth)));

  /* Prima di mostrare l'app verifico che l'account sia abilitato.
     1) Le regole Firestore negano la lettura a chi non è amministratore né in meta/accessi.emails.
     2) Chi è in meta/accessi.utenti deve avere "scontrini" nel campo app.
        Chi non è in elenco è un amministratore ed entra sempre. meta/accessi qui si legge soltanto. */
  const APP = "scontrini";
  const MSG = "messaggio-accesso-app-ville";
  const VERIFICATI = "account-verificati-app-ville";
  const leggiVerificati = () => { try { return JSON.parse(localStorage.getItem(VERIFICATI) || "[]"); } catch { return []; } };
  const segnaVerificato = (email) => {
    try { localStorage.setItem(VERIFICATI, JSON.stringify([...new Set([...leggiVerificati(), email])])); } catch {}
  };
  const togliVerificato = (email) => {
    try { localStorage.setItem(VERIFICATI, JSON.stringify(leggiVerificati().filter((e) => e !== email))); } catch {}
  };
  const abilitato = (accessi, email) => {
    const u = (accessi?.utenti || []).find((x) => String(x.email || "").toLowerCase() === email);
    return !u || (Array.isArray(u.app) && u.app.includes(APP));
  };
  const mostraErrore = (testo) => { err.className = "err"; err.textContent = testo; gBtn.hidden = false; };

  // Messaggio lasciato prima del ricaricamento della pagina (dopo un'uscita forzata)
  try {
    const m = sessionStorage.getItem(MSG);
    if (m) { sessionStorage.removeItem(MSG); err.className = "err"; err.textContent = m; }
  } catch {}

  let attivo = false, stopAccessi = null, espulsione = false;

  /* Fa uscire l'utente, cancella i dati salvati sul dispositivo e ricarica la pagina. */
  async function espelli(user, testo) {
    if (espulsione) return;
    espulsione = true;
    appEl.hidden = true;
    login.hidden = false;
    gBtn.hidden = true;
    err.className = "muted";
    err.textContent = "Uscita in corso…";
    togliVerificato((user?.email || "").toLowerCase());
    try { sessionStorage.setItem(MSG, testo); } catch {}
    try { stopAccessi?.(); } catch {}
    try { await signOut(auth); } catch {}
    try { await terminate(db); } catch {}
    try { await clearIndexedDbPersistence(db); } catch {
      // un'altra scheda tiene aperto il database: provo a cancellarlo direttamente
      try {
        const dbs = (await indexedDB.databases?.()) || [];
        dbs.filter((d) => d.name && d.name.startsWith("firestore/")).forEach((d) => indexedDB.deleteDatabase(d.name));
      } catch {}
    }
    location.reload();
  }
  // Pulsante "Riprova" (senza uscire dall'account) quando manca la connessione
  const riprova = document.createElement("button");
  riprova.type = "button"; riprova.className = "btn"; riprova.textContent = "Riprova"; riprova.hidden = true;
  gBtn.after(riprova);
  let utenteDaRiprovare = null;
  const mostraRiprova = (user) => { utenteDaRiprovare = user; riprova.hidden = false; };
  riprova.addEventListener("click", () => { riprova.hidden = true; if (utenteDaRiprovare) verifica(utenteDaRiprovare); });
  window.addEventListener("online", () => { if (!riprova.hidden && utenteDaRiprovare) { riprova.hidden = true; verifica(utenteDaRiprovare); } });

  const testoNonAbilitato = (user) => `L'account ${user.email} non è abilitato a questa app.`;

  onAuthStateChanged(auth, (user) => {
    if (espulsione) return;
    appEl.hidden = true;
    login.hidden = false;
    riprova.hidden = true;
    stopAccessi?.(); stopAccessi = null;
    if (attivo) { attivo = false; onLogout?.(); }
    if (!user) { gBtn.hidden = false; return; }
    verifica(user);
  });

  async function verifica(user) {
    const email = (user.email || "").toLowerCase();
    gBtn.hidden = true;
    err.className = "muted";
    err.textContent = "Verifica dell'accesso in corso…";
    let accessi = null;
    try {
      const d = await getDocFromServer(doc(db, "meta", "accessi"));
      accessi = d.exists() ? d.data() : null;
    } catch (x) {
      if (x.code === "permission-denied") return espelli(user, testoNonAbilitato(user));
      // Nessuna connessione: entra solo chi su questo dispositivo è già stato verificato.
      // Gli altri restano collegati (nessuna uscita) e possono riprovare.
      if (!leggiVerificati().includes(email)) {
        err.className = "err";
        err.textContent = "Non riesco a verificare l'accesso: controlla la connessione.";
        mostraRiprova(user);
        return;
      }
      try { const d = await getDocFromCache(doc(db, "meta", "accessi")); accessi = d.exists() ? d.data() : null; } catch {}
    }
    if (auth.currentUser?.uid !== user.uid) return; // nel frattempo è cambiato utente
    if (!abilitato(accessi, email)) return espelli(user, testoNonAbilitato(user));

    segnaVerificato(email);
    err.className = "err";
    err.textContent = "";
    login.hidden = true;
    appEl.hidden = false;
    attivo = true;

    // Controllo continuo: se l'abilitazione viene tolta con l'app aperta, l'utente esce
    stopAccessi = onSnapshot(doc(db, "meta", "accessi"),
      (d) => { if (!abilitato(d.exists() ? d.data() : null, email)) espelli(user, testoNonAbilitato(user)); },
      (x) => { if (x.code === "permission-denied") espelli(user, testoNonAbilitato(user)); });

    onLogin(user);
  }
}


/* Ascolta una collezione in tempo reale e restituisce un array di oggetti {id, ...campi}. */
export function listen(nome, cb, ...vincoli) {
  return onSnapshot(
    query(collection(db, nome), ...vincoli),
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
    (e) => toast(e.code === "permission-denied"
      ? `L'account ${auth.currentUser?.email || ""} non è autorizzato. Esci ed entra con l'account Google giusto.`
      : "Errore di lettura (" + nome + "): " + e.message)
  );
}

/* Ascolta un singolo documento in tempo reale (null se non esiste o non leggibile). */
export function listenDoc(col, id, cb) {
  return onSnapshot(doc(db, col, id),
    (d) => cb(d.exists() ? d.data() : null),
    (e) => { console.warn("Lettura " + col + "/" + id + ":", e.message); cb(null); });
}

/* ---------- Utilità ---------- */
/* Formato italiano con il punto delle migliaia sempre presente (1.234,50 €, anche sotto i 10.000) */
export const euro = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [int, dec] = Math.abs(v).toFixed(2).split(".");
  return (v < 0 ? "−" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec + " €";
};

const daIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const dataIt = (s) => (s ? daIso(s).toLocaleDateString("it-IT") : "");
export const dataBreve = (s) =>
  s ? daIso(s).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "";

export const isoLocale = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const oggi = () => isoLocale(new Date());

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Accetta "12,50", "1.234,50" o "12.50" */
export function parseImporto(v) {
  v = String(v).trim().replace(/[€\s]/g, "");
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  return Math.round(parseFloat(v) * 100) / 100;
}

/* Nomi degli stati da mostrare. "vuoto" = Vuoto per pieno: villa pagata al proprietario ma non ancora affittata
   (periodo di acquisto, di solito senza cliente). Colore in Summer Database: arancione #e9801c. */
export const NOME_STATO = { vuoto: "Vuoto per pieno" };
export const COLORE_VUOTO = "#e9801c";
export const labelPren = (p) => {
  const st = p.status && p.status !== "occupato" ? (NOME_STATO[p.status] || p.status) : "";
  return `${p.ospite} · ${dataBreve(p.checkIn)} → ${dataBreve(p.checkOut)}${st && st !== p.ospite ? " (" + st + ")" : ""}`;
};

/* La prenotazione di quella villa in corso nella data indicata (check-in e check-out inclusi). */
export function bookingFor(prenotazioni, villaId, data) {
  if (!villaId || !data) return null;
  return prenotazioni
    .filter((p) => p.villaId === villaId && p.checkIn <= data && data <= p.checkOut)
    // un affitto del cliente vince su un "Vuoto per pieno" che lo contiene; poi la prenotazione iniziata prima
    .sort((a, b) => (a.vuoto === b.vuoto ? 0 : a.vuoto ? 1 : -1) || a.checkIn.localeCompare(b.checkIn))[0] || null;
}

/* Ridimensiona e comprime la foto (resta sotto il limite di 1 MB di un documento Firestore). */
export async function compressImage(file, lato = 1500) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("immagine non leggibile"));
    i.src = URL.createObjectURL(file);
  });
  let w = img.naturalWidth, h = img.naturalHeight;
  const s = Math.min(1, lato / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  let q = 0.72, url = c.toDataURL("image/jpeg", q);
  while (url.length > 750000 && q > 0.3) { q -= 0.1; url = c.toDataURL("image/jpeg", q); }
  if (url.length > 750000) { // foto enorme: riduco ancora le dimensioni
    const c2 = document.createElement("canvas");
    c2.width = Math.round(c.width * 0.6); c2.height = Math.round(c.height * 0.6);
    c2.getContext("2d").drawImage(c, 0, 0, c2.width, c2.height);
    url = c2.toDataURL("image/jpeg", 0.6);
  }
  return url;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}
