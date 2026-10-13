# MyManager — notas de trabajo (para reducir contexto/tokens)

Juego de manager en **dos ficheros**: `index.html` (todo el `<script>`) + **`players-db.json`** (base de datos real: UNA línea minificada de ~1.2 MB, objeto plano `{idClub:[[fila],...]}`). Sin build ni git.
Base temporal de pruebas: `/var/folders/0f/mskspkv13z32b90kxsqy5p2c0000gn/T/opencode/` (jsdom + `chk_fast.js`).

## REGLAS DE AHORRO (importante)
- **No volcar líneas largas**: `players-db.json` es UNA línea gigante (nunca imprimirla entera); `FORM_MAIN`, `CUPNAME`, `STADIUM`, `CLUBBY` también son largos. No imprimir filas completas.
- Usar `grep -c` / `grep -o` con patrón corto, o scripts node que impriman **solo 1 campo** (p. ej. nombres).
- Para buscar estructura, mejor el subagente **explore** (devuelve resumen).
- **Chequeo ligero por defecto** (parseo + `SIN LOGO` + `dupkeys`) y **smoke completo solo cuando el usuario lo pida**.
- Informes de **3–5 líneas**.

## Arquitectura (IMPORTANTE)
- **`players-db.json`** (raíz): la base real `{idClub:[[fullName,pos,birthYear,ISO2nat,ovr,pot,valueM€,null,positions],...]}`. Se vuelca en `REAL_DB`. **Aquí van las plantillas.** Es 1 línea → **editar con node** (`JSON.parse` → `db[ID]=[...]` → `JSON.stringify`), **NO** con el editor de texto.
- **`index.html`**: TODO lo demás — `REAL_ATTR`, `REAL_FOOT`, `REAL_PHOTO`, `REAL_LOANS`, `FORM_MAIN`, clubes (`K2`), estadios… Los bloques nuevos van **antes de la recaptura final** `CLUB_DEFAULTS=Object.fromEntries(...)` (cerca del final del `<script>`, antes de `init();`).
- `REAL_DB` inline solo lleva algún alias (`REAL_DB.FARN=REAL_DB.FAR`). **No** añadir plantillas inline.
- `curMode()` = `ui.modeChosen ? (ui.gmode||'fict') : (DBMGR.active ? 'real' : 'fict')`. **En tests jsdom** hay que poner `ui.modeChosen=true; ui.gmode='real'` para modo real.

## Flujo (construir una plantilla)
El usuario pega la ficha de un club (es.besoccer.com). Pasos:
1. `players-db.json` (node): `db[ID]=[ ...filas... ]`.
2. `index.html` (bloque antes de la recaptura final): `REAL_ATTR` (por nombre) + `REAL_FOOT` (solo zurdos/ambos) + `REAL_PHOTO` (por nombre) + `REAL_LOANS` (si hay cesiones) + `FORM_MAIN[ID]` (si falta).
3. Verificar con jsdom: `Object.assign(REAL_DB, json)`, `ui.modeChosen=true; ui.gmode='real'`, `newGame(1,ID)`, `squadFor(ID)` (debe salir con las fichas reales).
4. `cp` de **AMBOS** ficheros a `~/Desktop/MyManager/`.

### Formato de fila (`players-db.json`)
`[fullName, pos, birthYear, ISO2nat, ovr, pot, valueM€|null, null, positions]`
- `pos` general: `GK|DF|MD|FW`; `positions` específicas: POR, DFC, LD, LI, MCD, MC, MCO, MD, MI, DC, ED, EI.
- Conversiones: `MP→MCO`, `CAD→MD` (carrilero derecho), `CAI→MI` (carrilero izquierdo).
- `birthYear = 2026 − edad`; `valueM€` en millones (`507 K.€→0.507`); `pot`/sueldo → `null` (el juego los calcula).

### Convenciones
- **Nombres**: completos (los del `panel-head` de BeSoccer).
- **Pie** (`REAL_FOOT`): por defecto derecho; poner `'I'`/`'A'` solo si el paste lo dice.
- **Nacionalidad**: ISO2. `Nacionalidad X`→X; región/continente/nada → país del club.
- **Fotos**: id = último número de `cdn.resfu.com/img_data/players/medium/<ID>.jpg`; verificar 200 (subagente + `curl` de uno en uno). Si hay **colisión de nombre**, usar objeto por club `REAL_PHOTO[nombre]={CLUBID:url}` (y `REAL_FOOT[nombre]={CLUBID:'D'|'I'}`), DESPUÉS de las asignaciones simples; el lookup usa el prefijo del id del jugador.

### Cesiones `REAL_LOANS`
Formato: `[nombre, from, to, share, rol, ext?, force?]`, `ext=[name,pos,year,nat,ovr,pot,val,wage,positions]`.
- El nombre debe **coincidir con el `REAL_DB` del DESTINO** (si no, renombrar). Si el origen no tiene al jugador → `ext`.
- **Comprobar cesiones previas** (grep con `from`/`to`) para no duplicar; si hay una previa con nombre corto, retirarla y dejar una sola con nombre completo.
- Orígenes/destinos deben existir en `CLUBBY` (si no, crear con `K2` + escudo).

### Filiales (regla del usuario)
- Portugal: `X U23` del mismo club → filial `X II`. Inglaterra: `X U18`/`X U21` → `X U21`.
- Filial de **otro** club → a su propio club **como cedido**.
- Crear con `K(...)` (id = padre+"B"), `bTeam=1`, escudo heredado, registrar en `FAMILY` (ambas direcciones).

### Clubes: crear si no existen
`K2(id,name,short,city,co,c1,c2,rep)` + escudo.
**Comprobar colisión de id antes** (los ids de 3 letras chocan): p.ej. `LSK`=Levski Sofia, `FCN`=Núremberg, `LIL`=Lille, `APOL`=APOEL, `FALK`=Falkirk.

## Nombres genéricos (modo "jugadores ficticios")
Para evitar licencias, en modo ficticio (`fictOn()` = `!!state && curMode()==='fict'`) se renombran **clubes y estadios** (mutación `applyModeNames(resetClubOverrides→fictRestore)`) y **competiciones** (`divName`/`compName`/`trophyName` → `fictCompName`/`fictTrophy`). El **museo de trofeos** usa `trophyName(...,true)` (siempre nombres reales). En modo real no cambia nada.

## Gotchas conocidos
- `CHV`=Chievo Verona (Chaves=`CHAV`). `UDL` tenía plantilla española mal asignada (ya sustituida).
- Legacy vs real: `GRI`/`GRIM`, `NPC`/`NEWP`, `POV`/`PORV`, `OLD`/`OLDH`, `NTH`/`NTHT`, `CHV`/`CHAV`.
- `FALK`=Falkirk (Escocia), **Falkenbergs=`FLKB`**. `ODD`=Odd (Noruega), `ODDV`=IK Oddevold. `LIS`=Lillestrøm (¡`LSK` es Levski Sofia!). `OM`/`OL`… cuidado con las 3 letras.
- Clubes destino creados esta temporada: `NORD` (Nordsjælland), `APLM` (Apollon Limassol; `APOL`=APOEL), `JARO` (FF Jaro), `MARH` (IFK Mariehamn), `STB2` (Stabæk II), `GNIS` (Gnistan), `IFKA` (IF Karlstad), `TORL` (Torslanda IK), `KLKR` (FK Karlskrona), `ENKO` (Enköpings SK).
- Filiales/clubes creados antes: GILLB, PORVB, FARB, FELB, LEIXB, PENB, PTMB, TRZB, UDLB, VIZB, SOU21, CHA21, STK21, OKHD, ARLM, POHG, LNZC, ZELP, HTFF, GOT, BREI, HAUG, SOKK, KSZO, CZAR, RNIS, VITS, LAHO, ROSE.

## Estado de clubes
- **Allsvenskan (Suecia): 16/16** reales (AIK, BKH, BRP, DEG, DIF, GAIS, HAL, HAM, IFE, IFK, KALM, MALM, MJA, ORG, SIR, VSK). Superettan simulado.
- **EN4 (League Two)**: 24/24 · **RPL (Rusia)**: 16/16 · **Argentina**: 30/30 · **Bulgaria**: 14/14 · **Ligue 2**: 18/18 · **Süper Lig**: 18/18.
- **PL2 (Polonia)**: LKS, MIE, ODR, POD, POS, POL, PNI, RCH, SMIE, SRZ, TNC, UNS, WAR (+ ARK, POBY…).
- **Segunda Liga (Portugal)** — hechos: CHAV, FAR, FEI, FEL, LEIX, LUFC, PEN, PTM, TON, TRZ, UDL, VIZ, FCPB, SPTLB. Revisar cuáles quedan.

## Anclas útiles (buscar por nombre; las líneas driftean)
- `players-db.json`: la BD real (editar con node).
- `index.html`: `REAL_ATTR`, `REAL_FOOT`, `REAL_PHOTO`, `REAL_LOANS`, `FORM_MAIN`, `curMode`/`fictOn`/`applyModeNames`, `CLUB_DEFAULTS=Object.fromEntries` (recaptura final = ancla segura), `FAMILY`, `FILIAL_SUF`, `trophyName`, `museumCatalog`, `ensureUserSquad`.
