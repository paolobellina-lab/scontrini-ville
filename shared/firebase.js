// Codice condiviso dalle due app: connessione a Firebase, login e funzioni di utilità.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocFromServer, getDocs, onSnapshot,
  query, where, orderBy, limit, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

export {
  collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, writeBatch
};

export const configurato = !String(firebaseConfig.apiKey).includes("INCOLLA_QUI");
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
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
export const normPren = (b) => ({
  id: b.id, villaId: b.villaId, ospite: (b.cliente || "").trim() || "Prenotazione senza nome",
  checkIn: b.from, checkOut: b.to, status: b.status || "", note: b.note || "",
});
/* Copia dei dati essenziali della prenotazione salvata dentro lo scontrino:
   se la prenotazione viene modificata o ricreata nell'altra app, lo scontrino resta raggruppato bene. */
export const fotoPren = (p) => (p ? { cliente: p.ospite, from: p.checkIn, to: p.checkOut } : null);
/* Ritrova la prenotazione di uno scontrino: per ID, poi per villa + date, altrimenti dalla copia salvata. */
export function trovaPren(s, prenotazioni) {
  if (!s.prenotazioneId && !s.prenotazione) return null;
  const snap = s.prenotazione;
  const perId = prenotazioni.find((p) => p.id === s.prenotazioneId && p.villaId === s.villaId);
  if (perId && (!snap || perId.checkIn === snap.from)) return perId;
  if (snap) {
    const perDate = prenotazioni.find((p) => p.villaId === s.villaId && p.checkIn === snap.from && p.checkOut === snap.to);
    if (perDate) return perDate;
    return { id: "old:" + snap.from + snap.to, villaId: s.villaId, ospite: snap.cliente || "Prenotazione",
      checkIn: snap.from, checkOut: snap.to, nonInCalendario: true };
  }
  return perId || null;
}

export const CATEGORIE = [
  "Pulizie", "Manutenzione", "Lavanderia", "Spesa e forniture", "Utenze",
  "Giardino e piscina", "Benvenuto ospiti", "Commissioni e tasse", "Altro"
];

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

  /* Prima di mostrare l'app verifico che l'account sia abilitato:
     le regole Firestore negano la lettura agli account non autorizzati. */
  const VERIFICATI = "account-verificati-app-ville";
  const leggiVerificati = () => { try { return JSON.parse(localStorage.getItem(VERIFICATI) || "[]"); } catch { return []; } };
  const segnaVerificato = (email) => {
    try { localStorage.setItem(VERIFICATI, JSON.stringify([...new Set([...leggiVerificati(), email])])); } catch {}
  };
  const togliVerificato = (email) => {
    try { localStorage.setItem(VERIFICATI, JSON.stringify(leggiVerificati().filter((e) => e !== email))); } catch {}
  };
  let attivo = false;

  onAuthStateChanged(auth, async (user) => {
    appEl.hidden = true;
    login.hidden = false;
    if (attivo) { attivo = false; onLogout?.(); }
    if (!user) { gBtn.hidden = false; return; }

    const email = (user.email || "").toLowerCase();
    gBtn.hidden = true;
    err.className = "muted";
    err.textContent = "Verifica dell'accesso in corso…";
    let ok = false;
    try {
      await getDocFromServer(doc(db, "meta", "assegnazioni"));
      ok = true;
      segnaVerificato(email);
    } catch (x) {
      if (x.code === "permission-denied") {
        togliVerificato(email);
      } else {
        // Nessuna connessione: entra solo chi su questo dispositivo è già stato verificato.
        ok = leggiVerificati().includes(email);
        if (!ok) {
          err.className = "err";
          err.textContent = "Non riesco a verificare l'accesso: controlla la connessione e riprova.";
          gBtn.hidden = false;
          await signOut(auth);
          return;
        }
      }
    }
    if (auth.currentUser?.uid !== user.uid) return; // nel frattempo è cambiato utente
    if (!ok) {
      await signOut(auth);
      err.className = "err";
      err.textContent = `L'account ${user.email} non è abilitato ad accedere a questa app.`;
      gBtn.hidden = false;
      return;
    }
    err.className = "err";
    err.textContent = "";
    login.hidden = true;
    appEl.hidden = false;
    attivo = true;
    onLogin(user);
  });
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
const fmtEuro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
export const euro = (n) => fmtEuro.format(Number(n) || 0);

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

export const labelPren = (p) =>
  `${p.ospite} · ${dataBreve(p.checkIn)} → ${dataBreve(p.checkOut)}${p.status && p.status !== "occupato" ? " (" + p.status + ")" : ""}`;

/* La prenotazione di quella villa in corso nella data indicata (check-in e check-out inclusi). */
export function bookingFor(prenotazioni, villaId, data) {
  if (!villaId || !data) return null;
  return prenotazioni
    .filter((p) => p.villaId === villaId && p.checkIn <= data && data <= p.checkOut)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0] || null;
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
