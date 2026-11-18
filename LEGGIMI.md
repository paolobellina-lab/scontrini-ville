# App Scontrini (ville)

App web per fotografare gli scontrini delle ville e assegnarli a villa e prenotazione.
Usa lo stesso progetto Firebase e lo stesso database di **Summer Database** (l'app di gestione ville).

| Cartella | Cosa contiene |
|---|---|
| `scontrini/` | **App Scontrini**: sezione *Scontrini* (schede Nuovo e Inseriti) e sezione *Schede prenotazioni* |
| `consulta/` | **Dismessa il 16/11/2026** (era "Spese Ville"): pagina che rimanda alla pagina **Prenotazioni** di Summer Database, https://paolobellina-lab.github.io/summer-database/#prenotazioni |
| `shared/` | codice comune: `firebase.js` (connessione, accesso, regole di collegamento e categorie), `style.css`, `tema.js`, icone |

Il riepilogo delle spese (spese reali per prenotazione, vendita, acquisto, deposito, margini, esportazioni)
si consulta ora solo in Summer Database.

## Dati (Firestore, database "(default)")

- `villas` e `bookings`: **gestite da Summer Database**. L'app Scontrini le legge soltanto.
  Dalle prenotazioni usa solo: `villaId`, `cliente`, `from`, `to`, `status` (solo per l'etichetta nel menu),
  `earlyIn`, `lateOut`, `pulizia`, `cuoco`, `transfer`, `servizi`, `serviziDett.{chiave}.note`, `note`.
  **Non mostra mai i dati economici né quelli interni**: `prezzoVendita`, `prezzoAcquisto`, `deposito` (deposito di sicurezza),
  `pagatoDal`, `pagatoAl`, `acquistoDi`,
  i prezzi dei servizi e `serviziDett.*.incluso`; nemmeno stato e colore nelle schede.
  `normPren` in `shared/firebase.js` copia solo i campi consentiti.
- `meta/settings.servizi`: nomi dei servizi aggiunti in Summer Database.
- `scontrini`: `villaId`, `prenotazioneId`, `prenotazione` (copia di cliente e date), `data`, `importo`, `categoria`,
  `motivo`, `aggiuntiva`, `hasFoto`, `creatoDa`, `creatoIl` (+ `storico` scritto da Summer Database).
  `aggiuntiva` (bool, facoltativo, dal 17/11/2026): `true` = spesa per un servizio aggiuntivo richiesto durante il soggiorno
  (da addebitare al cliente o trattenere dal deposito); `false`/assente = servizi inclusi nella prenotazione.
  Se manca, "Danni villa" conta come aggiuntiva (`isAggiuntiva`).
- `scontrini_foto`: la foto compressa, con lo stesso ID dello scontrino. Le foto stanno in Firestore, non in Storage.

Le modifiche agli scontrini usano sempre `update`, così l'array `storico` di Summer Database non si perde.
In Summer Database una prenotazione con scontrini non si può eliminare: prima gli scontrini vanno spostati
su un'altra prenotazione o eliminati.

### Collegamento scontrino → prenotazione (`trovaPren`)
1. `bookings[prenotazioneId]` se esiste e ha lo stesso `villaId`. Non si controllano più le date della copia:
   se le date della prenotazione cambiano, lo scontrino resta collegato (dal 16/11/2026).
2. Altrimenti la prenotazione della stessa villa con `from` e `to` uguali alla copia salvata nello scontrino.
3. Altrimenti si usa la copia, segnata "non più in calendario".
4. Nessun `prenotazioneId` e nessuna copia → "spesa generale della villa".

### Stato "Vuoto per pieno" (dal 18/11/2026)
`status: "vuoto"`: villa pagata al proprietario ma non ancora affittata (periodo di acquisto, di solito senza cliente).
Gli affitti dei clienti in quei giorni sono prenotazioni separate (`acquistoDi` = id del vuoto).
- Senza cliente si mostra "Vuoto per pieno" al posto del nome (nelle schede in arancione `#e9801c`, come in Summer Database);
  nel menu delle prenotazioni l'etichetta è "Vuoto per pieno".
- Gli scontrini si possono collegare anche a un vuoto (spese della villa in quei giorni).
- Scelta automatica in base alla data: se la data cade sia nell'affitto di un cliente sia nel vuoto che lo contiene,
  viene proposta la prenotazione del cliente.

### Categorie (`CATEGORIE` in `shared/firebase.js`)
Menu dell'app Scontrini: Pulizie, Manutenzione, Lavanderia, Spesa e forniture, Utenze, Giardino e piscina,
Benvenuto ospiti, Commissioni e tasse, **Danni villa** (spesa normale), Altro.

Elenco completo in Summer Database: in più **Affitto proprietario** e **Restituzione deposito sicurezza**.

Casella **"Spesa per servizio aggiuntivo"** nel modulo (campo `aggiuntiva`): si spunta da sola scegliendo "Danni villa",
si può cambiare a mano; nell'elenco Inseriti compare l'etichetta "aggiuntiva". Si salva con `update`.

**Affitto proprietario** (`CAT_AFFITTO`): quanto pagato davvero al proprietario per la prenotazione. Spesa normale
(entra nei totali), `aggiuntiva` sempre `false` (casella disattivata). È un dato economico riservato: si inserisce da
Summer Database e non è nel menu; uno scontrino che ce l'ha si mostra con la sua categoria e la mantiene in modifica.

**Restituzione deposito sicurezza** (`CAT_RESTITUZIONE`):
- si inserisce solo da Summer Database e non è proposta nel menu dell'app Scontrini;
- l'`importo` è salvato **positivo** e non va cambiato, ma si mostra con il meno (es. −4.000,00 €);
- è denaro restituito al cliente, non una spesa della villa: è **escluso da tutti i totali** delle spese
  (`importoSpesa` restituisce 0) e dal conteggio scontrini delle schede prenotazione;
- nell'app Scontrini non si può modificare: toccandola compare un avviso.

Se si modifica uno scontrino con una categoria fuori elenco, quella categoria viene aggiunta al menu solo per
quello scontrino, così salvando non cambia.

## Chi può entrare

L'elenco degli account si gestisce in Summer Database (Impostazioni → Account e accessi, documento `meta/accessi`).
L'app Scontrini lo legge soltanto:
- account **non in elenco** ma fatto entrare dalle regole → amministratore, entra sempre;
- account in elenco **con** la casella `scontrini` → entra;
- account in elenco **senza** `scontrini`, o bloccato dalle regole → esce subito con il messaggio
  "L'account … non è abilitato a questa app" e i dati salvati sul dispositivo vengono cancellati;
- il controllo continua mentre l'app è aperta: se la casella viene tolta, l'utente esce subito.

L'accesso resta ricordato sul dispositivo finché non si preme "Esci".

## Ville visibili per account

L'app legge (senza mai scriverlo) il documento `meta/assegnazioni`, gestito da Summer Database:
- amministratore (non presente in `meta/accessi.utenti`) senza assegnazioni → vede tutto;
- altro account **non presente** nelle assegnazioni → non vede nessuna villa ("Nessuna villa assegnata");
- account presente → vede solo le ville intere assegnate e le singole prenotazioni assegnate
  (più le spese generali di quelle ville);
- account con nessuna villa e nessuna prenotazione → "Nessuna villa assegnata".

Vale per il modulo di inserimento, per Inseriti e per le Schede prenotazioni.
È un filtro per fare ordine, non una protezione dei dati.

## Regole Firestore

Le regole sono gestite da Summer Database (documento di Progetto `claude/vincoli-firebase.md`).
Devono sempre mantenere le righe di `scontrini` e `scontrini_foto`. `firestore.rules` qui è solo un riferimento storico.

## Pubblicazione

GitHub Pages dal branch `main`, cartella principale: https://paolobellina-lab.github.io/scontrini-ville/
- iPhone (Safari): apri `…/scontrini/` → Condividi → **Aggiungi alla schermata Home**.
- Android (Chrome): menu ⋮ → **Installa app**.

Prova in locale: dalla cartella del progetto `python3 -m http.server 8000`, poi apri http://localhost:8000.

## Uso

1. *Scontrini → Nuovo*: scatta la foto, scrivi data e importo, scegli la villa. **La prenotazione si seleziona da sola**
   se la data dello scontrino cade tra check-in e check-out (estremi inclusi); puoi cambiarla a mano
   o scegliere "spesa generale della villa".
2. *Scontrini → Inseriti*: tutti gli scontrini, filtrabili per villa e prenotazione, con il totale delle spese.
3. *Schede prenotazioni*: le prenotazioni assegnate, per periodo (passate, questa settimana, prossima settimana,
   prossime 2/3/4 settimane, tutte), con servizi e note; da ogni scheda si aggiunge uno scontrino già collegato.
4. Senza rete lo scontrino viene salvato sul telefono e inviato appena torna la connessione.
