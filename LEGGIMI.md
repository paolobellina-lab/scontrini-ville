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
  `pagatoDal`, `pagatoAl`, `acquistoDi`, `agenziaId`, `agenziaPerc`, `utenze`, `conteggiConclusi`,
  i prezzi dei servizi e `serviziDett.*.incluso`; nemmeno stato e colore nelle schede.
  `normPren` in `shared/firebase.js` copia solo i campi consentiti.
- `meta/settings.servizi`: nomi dei servizi aggiunti in Summer Database.
- `scontrini`: `villaId`, `prenotazioneId`, `prenotazione` (copia di cliente e date), `data`, `importo`, `categoria`,
  `motivo`, `servizio`, `aggiuntiva`, `pagamento`, `hasFoto`, `creatoDa`, `creatoIl` (+ `storico` scritto da Summer Database).
  `servizio` (chiave del servizio o `null`, dal 18/11/2026) e `aggiuntiva` (bool): `true` = spesa per un servizio aggiuntivo
  (da addebitare al cliente o trattenere dal deposito); `false` = servizi offerti nella prenotazione.
  Vedi "Categorie" più sotto per come si calcola.
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

### Metodo di pagamento (dal 18/11/2026)
Campo `pagamento`: `"contanti"` | `"carta"` (carta di credito) | `"bonifico"`; `null` o assente = non indicato (`PAGAMENTI`).
Nel modulo, riquadro "Metodo di pagamento" con tre pulsanti (toccando di nuovo quello scelto si toglie la scelta);
si salva con `set` per i nuovi e `update` per le modifiche. **Dal 22/11/2026 la scelta è obbligatoria**: senza metodo
lo scontrino non si salva (anche in modifica di uno vecchio senza metodo); un valore sconosciuto scritto da Summer Database viene conservato e vale come scelta.
In Inseriti il metodo compare accanto alla prenotazione. Lo `storico` delle versioni precedenti lo scrive Summer Database;
l'app Scontrini usa `update`, quindi non lo tocca.

### Categorie (dalle Impostazioni di Summer Database, `meta/settings`)
Elenco costruito da `catalogoCategorie` in `shared/firebase.js`:
- **servizi**: base `pulizia`, `cuoco`, `transfer` (nomi predefiniti "Pulizia finale", "Cuoco", "Transfer"; nome cambiato in
  `serviziBase[chiave].label`, tolti se `serviziBase[chiave].off`) più `servizi: [{ key, label }]`.
  Lo scontrino salva `categoria` = nome del servizio e `servizio` = chiave; senza `servizio`, una categoria uguale al nome
  di un servizio vale lo stesso;
- **altre categorie**: `categorieSpese` (se manca o non si legge: Pulizie, Manutenzione, Lavanderia, Spesa e forniture,
  Utenze, Giardino e piscina, Benvenuto ospiti, Commissioni e tasse, Altro). Quelle in `categorieAggiuntive` sono
  aggiuntive; quelle in `categorieProprietario` sono **a carico del proprietario** (spese normali, mai aggiuntive);
- **Danni villa** (fissa, sempre aggiuntiva).

**Servizi tolti dall'offerta** (dal 20/11/2026): in Summer Database servizi e voci sono una sola lista con la colonna
"In offerta". Un servizio tolto dall'offerta ha `off: true` (base: `serviziBase[chiave].off`; aggiunti: `servizi[i].off`)
e diventa una voce di `categorieSpese` con lo stesso nome. L'app non lo mostra più tra i servizi del menu (così il nome non
compare due volte). Uno scontrino con `servizio` = chiave di un servizio tolto vale come servizio solo se la sua
prenotazione lo ha ancora spuntato; altrimenti segue la voce con lo stesso nome (aggiuntiva o a carico del proprietario
secondo le liste) e, se lo si modifica, viene salvato come voce (`servizio: null`). Nelle Schede prenotazioni i servizi
tolti mantengono il loro nome.

**Menu Categoria in due gruppi**, come in Summer Database: **Non aggiuntive** e **Aggiuntive**. I servizi stanno nell'uno o
nell'altro secondo la prenotazione scelta (servizio previsto nella prenotazione = non aggiuntiva) e il menu si riordina
quando cambia la prenotazione. Le spese a carico del proprietario hanno la dicitura "· a carico del proprietario".

**Servizi a carico del proprietario** (dal 20/11/2026): in Summer Database ogni servizio della prenotazione ha un carico,
`bookings.serviziDett[chiave].carico = 'esmeralda' | 'parte' | 'proprietario'`. `normPren` copia soltanto l'elenco dei
servizi con carico `proprietario` (`serviziProprietario`). Uno scontrino di un servizio previsto nella prenotazione con
carico `proprietario` resta "non aggiuntivo" ma è mostrato **a carico del proprietario** (dicitura nel menu, riga sotto il
menu ed etichetta in Inseriti), come le categorie di `categorieProprietario` (`aCaricoProprietario`).

**Offerta o aggiuntiva** (`calcolaAggiuntiva`):
- servizio → offerto se la prenotazione ha quel servizio (`bookings.pulizia|cuoco|transfer` vero, oppure `bookings.servizi`
  contiene la chiave); altrimenti, o senza prenotazione, **aggiuntiva**;
- altre categorie → non aggiuntive, tranne le voci **a carico del cliente** (`categorieAggiuntive`, mai se a carico del
  proprietario), che dal 20/11/2026 sono aggiuntive solo se non erano nell'offerta della prenotazione (`voceInOfferta`):
  - prenotazione nata da un'offerta (`bookings.vociOfferta: [nome]`, copiato da `normPren`): non aggiuntiva se la voce è
    nell'elenco, altrimenti aggiuntiva;
  - prenotazione inserita a mano (senza `vociOfferta`): non aggiuntiva se la voce è **Predefinita**
    (`meta/settings.prezziServizi["voce:" + nome].predef === true`), altrimenti aggiuntiva;
  - senza prenotazione (spese generali): aggiuntiva.
  Sotto il menu: "Voce compresa nell'offerta di questa prenotazione: spesa offerta, non da addebitare al cliente."
  (o "Voce predefinita, già compresa nel prezzo…" per le prenotazioni inserite a mano). `prezziServizi` contiene anche
  chiavi `voce:<nome>`, che non sono servizi; per i servizi conta sempre la spunta nella prenotazione;
- Danni villa → sì; categorie riservate → no;
- categoria sconosciuta (rinominata o tolta dopo l'inserimento) → vale il campo `aggiuntiva` salvato.

Al salvataggio l'app scrive `categoria`, `servizio` (chiave o `null`) e `aggiuntiva` calcolata (`set` per i nuovi,
`update` per le modifiche, così lo `storico` resta). Sotto il menu una riga dice se la spesa è offerta, aggiuntiva o a
carico del proprietario; in Inseriti le etichette "aggiuntiva" e "a carico del proprietario".
Rinominare o togliere una categoria in Summer Database non cambia gli scontrini già inseriti: in modifica la loro
categoria resta (aggiunta al menu solo per quello scontrino).

### Categorie riservate a Summer Database (decisione del proprietario, 18/11/2026)
**Affitto proprietario**, **Restituzione deposito sicurezza**, **Addebito cliente**, **Addebito proprietario** e
(dal 20/11/2026) **Commissione agenzia** (`CATEGORIE_RISERVATE`, `isRiservata`): si inseriscono, modificano e cancellano solo da Summer Database.
Nell'app Scontrini non sono mai nel menu, **non si mostrano** (né in Inseriti né nelle Schede prenotazioni, né nei conteggi
dei filtri), sono escluse da tutti i conteggi e totali e non vengono mai toccate. Gli scontrini restano nella collezione
`scontrini` con la stessa struttura: l'app li filtra soltanto. Così gli importi pagati al proprietario, i depositi
restituiti, gli addebiti e le commissioni d'agenzia non sono visibili ai collaboratori.

### Il mio borsellino (dal 22/11/2026)
Terza sezione in alto, **"Il mio borsellino"**: i contanti in mano all'account collegato.
- **Entrate**: prelievi (collezione `borsellino`, tipo `prelievo`) e, in contanti, gli addebiti incassati
  ("Addebito cliente" / "Addebito proprietario", inseriti da Summer Database).
- **Uscite**: note spese pagate in contanti (`pagamento: 'contanti'`) del proprio borsellino (`scontrini.contantiDi`, o, se manca,
  chi le ha inserite), anche la "Restituzione deposito sicurezza" in contanti; spese personali in contanti; contanti riconsegnati.
  Qui le categorie riservate compaiono con nome e importo, ma solo quelle del proprio borsellino (decisione del proprietario).
- **+ Prelievo contanti** e **+ Spesa personale** (voci da `meta/settings.vociBorsellino`, di norma Pausa pranzo, Benzina, Rimborso, Altro;
  metodo di pagamento obbligatorio; foto facoltativa in `borsellino_foto/{id}`). Le spese personali con carta o bonifico si registrano
  ma non scalano i contanti (elenco a parte).
- `borsellino/{id}` = `{ email (proprietario del borsellino, minuscolo), tipo: 'prelievo'|'spesa'|'riconsegna', voce, pagamento, importo,
  data, nota, hasFoto, creatoDa, creatoIl }`. Si leggono solo i propri (`where('email', '==', …)`, `listenQuiet`); dopo il salvataggio
  solo l'amministratore può modificarli o cancellarli (da Summer Database, pagina Borsellini). Le regole lo impongono.

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
