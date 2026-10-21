# Hälinä

Selaimessa toimiva seurapelivisa. Yksi iso näyttö pyörittää peliä, ja pelaajat liittyvät puhelimillaan neljän kirjaimen koodilla ilman sovellusta tai tunnusta.

**Pelimuodot:** Perusvisa (pohja) + Panos, Bluffi, Selviytyjä, Arvio ja Kaksintaistelu.
**Illan pohjat:** Pikailta (~20 min), Koko ilta (~40 min), Luokkahuone (~15 min). Kierrokset voi koota myös itse.

## Paikallinen testaus

Vaatimukset: Node.js 22 ja Java 21 (Firebase-emulaattorit tarvitsevat Javan).

```bash
npm install
npm run dev        # Auth- ja Database-emulaattorit + Vite samaan aikaan
```

| Osoite | Mitä |
| --- | --- |
| http://localhost:5173/host | Hostin iso näyttö |
| http://localhost:5173/play?devPlayer=1 | Pelaaja 1 (`devPlayer=2`, `3`… = eri pelaajat samassa selaimessa) |
| http://localhost:4000 | Emulator UI – tietokannan tila livenä |

- **Pelaa yksin botteja vastaan:** `npm run bots -- --room ABCD --count 8 --accuracy 0.6`
- **Nopeampi testipeli:** hostin aulassa on dev-tilassa valinta "Nopeus (dev)" (×2…×10).
- **Oikeat puhelimet samassa Wi-Fissä:** `npm run dev:lan`, jolloin QR-koodi osoittaa koneen LAN-IP:hen.
- **Oma kysymyspaketti:** host → "Tuo JSON…". Esimerkki: `packages/content/example-pack.json`.

## Testit

| Taso | Komento |
| --- | --- |
| Pelimoottori (Vitest + fast-check) ja kysymyspaketit | `npm test` |
| Tietokannan tietoturvasäännöt emulaattoria vasten | `npm run test:rules` |
| Päästä päähän: host + 3 pelaajaa pelaavat Pikaillan | `npm run test:e2e` |
| Tyypit | `npm run typecheck` |

## Rakenne

```text
apps/web/            React + Vite + TS: /host, /play
packages/engine/     pelimoottori ja pelimuodot (puhdas TS, ei Firebase-riippuvuutta)
packages/content/    kysymyspakettien zod-skeema + valmis paketti (40 perus, 17 bluffi, 20 arvio)
tools/bots/          bottipelaajat
firebase/            database.rules.json + sääntötestit
```

Hostin selain on pelin ainoa tuomari: se ajaa moottoria, ja Firebase Realtime Database vain välittää tilan. Oikeat vastaukset ovat vain `hostOnly`-puussa, jota pelaajat eivät voi lukea. Uusi pelimuoto lisätään yhtenä moduulina `packages/engine/src/modes/` ja rekisteröidään `MODES`-tauluun.

## Julkaisu Firebaseen

Käyttöönotto (kerran):

1. Luo Firebase-projekti. Ota käyttöön **Realtime Database** (alue `europe-west1`) ja **Authentication → Anonymous**.
2. Lisää projektiin Web-sovellus ja kopioi sen asetukset.
3. Lisää GitHub-repoon:
   - **Variables:** `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_APP_ID`
   - **Secret:** `FIREBASE_SERVICE_ACCOUNT` (palvelutilin JSON; roolit Firebase Hosting Admin + Firebase Realtime Database Admin)
4. Push `main`-haaraan → testit → `firebase deploy --only hosting,database`. Jokainen PR saa esikatseluosoitteen.

Käsin: `npx firebase login`, täytä `apps/web/.env.local` (mallina `.env.example`) ja aja `npx firebase deploy --project <projekti-id>` (`npm run build` ensin).
