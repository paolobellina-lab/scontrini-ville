# App Ville: Scontrini + Spese Ville

Le app sono due e usano lo stesso database Firebase:

| Cartella | App | Cosa fa |
|---|---|---|
| `scontrini/` | **Scontrini** | Fotografi lo scontrino, scrivi importo e motivo, scegli villa e prenotazione; nella scheda Inseriti li ritrovi filtrando per villa e prenotazione |
| `consulta/` | **Spese Ville** | Vedi tutti gli scontrini raggruppati per **villa → prenotazione**, con i totali, le foto e l'esportazione per Excel |

## Come sono organizzati i dati (Firestore, database "(default)")

Le app usano lo stesso progetto e database dell'app di gestione ville.

- `villas` e `bookings`: **gestite dall'app di gestione ville**. Le app degli scontrini le leggono soltanto.
  Dalle prenotazioni si usano i campi `villaId`, `cliente`, `from`, `to` e `status`.
- `scontrini`: `villaId`, `prenotazioneId`, `prenotazione` (copia di cliente e date), `data`, `importo`, `categoria`,
  `motivo`, `hasFoto`, `creatoDa`, `creatoIl`
- `scontrini_foto`: la foto compressa, con lo stesso ID dello scontrino

Ogni scontrino conserva una copia di cliente e date della prenotazione. Così, se nell'altra app una prenotazione
viene modificata o ricreata con un altro ID, lo scontrino resta comunque nel gruppo giusto.
Le foto stanno in Firestore e non in Storage, così basta il piano gratuito.

## Configurazione di Firebase

1. **Regole**: in Firestore → Regole incolla il contenuto di `firestore.rules`. Contiene già anche le regole
   dell'altra app e aggiunge `scontrini` e `scontrini_foto`. Poi fai clic su Pubblica.
2. **Accesso**: si entra solo con **Accedi con Google** (le regole richiedono un'email verificata).
   In Authentication → Metodo di accesso, il provider **Google** deve essere attivo.
3. **Configurazione**: in ⚙️ Impostazioni progetto → Le tue app copia `firebaseConfig` (lo stesso dell'altra app)
   nel file `firebase-config.js`.

## Prova sul Mac

Dalla cartella del progetto, apri il Terminale e lancia:

```
python3 -m http.server 8000
```

Poi apri http://localhost:8000. Non funziona aprendo il file con doppio clic, perché serve un indirizzo web.

## Pubblicazione su GitHub Pages (per usarle da cellulare e Mac)

1. Crea un repository su GitHub (es. `app-ville`) e carica tutti i file di questa cartella.
2. Nel repository: **Settings → Pages** → Source: *Deploy from a branch* → branch `main`, cartella `/ (root)` → Save.
3. Dopo un minuto le app saranno su `https://TUO-UTENTE.github.io/app-ville/`.
4. In Firebase: **Authentication → Settings → Domini autorizzati** → aggiungi `TUO-UTENTE.github.io`.

**Installazione:**
- iPhone (Safari): apri `…/scontrini/` → Condividi → **Aggiungi alla schermata Home**. Ripeti per `…/consulta/`.
- Android (Chrome): menu ⋮ → **Installa app**.
- Mac (Chrome): icona di installazione nella barra dell'indirizzo; con Safari: File → **Aggiungi al Dock**.

## Uso

1. Nell'app **Scontrini**, scheda *Ville e prenotazioni*: aggiungi le ville; tocca una villa per inserire le sue prenotazioni.
2. Scheda *Nuovo*: scatta la foto, scrivi data e importo, scegli la villa. **La prenotazione si seleziona da sola**
   se la data dello scontrino cade tra check-in e check-out (estremi inclusi); puoi sempre cambiarla a mano
   o scegliere "spesa generale della villa".
3. Senza rete lo scontrino viene salvato sul telefono e inviato appena torna la connessione.
4. Nell'app **Spese Ville** trovi tutto raggruppato per villa e prenotazione, con il totale per categoria.
   Puoi filtrare per villa, periodo e testo, vedere e scaricare la foto, esportare un CSV che si apre con Excel e stampare.
