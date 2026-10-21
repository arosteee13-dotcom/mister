# FETCH_PROTOCOL — cómo pido los datos de una plantilla (versión de bajo coste)

Objetivo: **que el HTML de BeSoccer/Transfermarkt no entre en el contexto del agente principal** y que
el trabajo de traducción de datos lo haga un script (`addsquad.js`, en la carpeta temporal de trabajo).

## Entrada que da el usuario
Solo las **URLs** por club (o la lista de nombres), en lotes de 4-6 clubes:
- `ID_CORTO_IDENTIFICADOR` + URL de la plantilla en BeSoccer (`https://es.besoccer.com/equipo/plantilla/<alias>`)
- URL del kader en Transfermarkt (`https://www.transfermarkt.es/<club>/kader/verein/<id>`) — o el nombre del club si hay que buscarlo.
- (Opcional) país del club para los casos en que la nacionalidad venga vacía o sea una región.

## Qué hace el subagente (`explore`, solo lectura)
1. `webfetch` (format `html`) de la plantilla de BeSoccer. El volcado completo queda en
   `/Users/chrisdearostegui/.local/share/opencode/tool-output/tool_*`.
2. `webfetch` del kader de Transfermarkt.
3. Trabaja **sobre esos ficheros** (Grep/Read/python3), nunca volcándolos en la respuesta.
4. Devuelve **solo** esto, sin HTML y sin explicaciones:

```
#CLUB <ID> <PAÍS_ISO2 opcional>
nombre;posTM;pie;nacimiento;nat;altura;valor_eur;grl;foto
...
#NOTAS: ...
```

## Reglas de cada columna
| col | contenido | regla |
|---|---|---|
| `nombre` | nombre completo del jugador | el del `panel-head`/ficha de BeSoccer (completo, no abreviado) |
| `posTM` | **posición principal del listado de Transfermarkt**, en español | "Portero", "Defensa central", "Lateral izquierdo/derecho", "Pivote", "Mediocentro", "Mediocentro ofensivo", "Mediapunta", "Interior izquierdo/derecho", "Extremo izquierdo/derecho", "Delantero centro". **No** poner secundarias |
| `pie` | `I` / `A` / vacío | `I` solo si TM dice zurdo; `A` si ambidiestro; derecho = vacío |
| `nacimiento` | `AAAA-MM-DD` (TM) o la edad de BeSoccer o vacío | país principal (si hay dos, el primero) |
| `nat` | país en español o ISO2 | si BeSoccer/TM dan región/continente o nada → dejar vacío |
| `altura` | cm | `-` si no hay |
| `valor_eur` | columna `€` de BeSoccer, **en euros sin puntos de millar** | `0` si la ficha pone `0` |
| `grl` | columna `rating` de BeSoccer | `-` si no hay |
| `foto` | id numérico de `cdn.resfu.com/img_data/players/medium/<ID>.jpg` | `-` si BeSoccer sirve `nofoto_jugador.png` |

`#NOTAS:` (una línea por club, solo lo relevante):
duplicados del volcado (p. ej. `H. Thomas` = `Hari Thomas`), filas de la sección **"Desconocido"**
(decir si se resolvieron leyendo su ficha), jugadores que están **solo en TM** o **solo en BeSoccer**,
homónimos con otro club, y **cedidos** que indique la ficha (`Jugadores cedidos al X` / `Jugadores cedidos`).

## Qué hago yo con eso
1. `node addsquad.js [--dry|--check|--replace]` con el CSV por `stdin` → escribe `players`+`photo`+`foot`
   en `players-db.json` (posiciones, país→ISO2, €→M€, año, colisiones, rechazadas). Reporta solo 2-3 líneas/club.
2. Reviso **solo** las líneas de `RECHAZADAS`/`COLISIONES` que imprima el script.
3. Verificación por lote: `node tclubsq.js <ID>` por club + `node chk_fast.js` una vez (`SIN LOGO: 0`).
4. `cp index.html players-db.json AGENTS.md CLUBES.md ~/Desktop/MyManager/` y **1 línea por club en `CLUBES.md`**.

## Por qué así
- `curl` a BeSoccer/TM y los proxies CORS están **bloqueados**; solo funciona `webfetch` (probado).
- Un volcado de BeSoccer son ~250 KB; la tabla compacta son ~30 líneas (~300 tokens).
- El mapeo posiciones/país/año/valor es determinista → no hace falta razonarlo cada vez.

## Modo ahorro (obligatorio)
- `addsquad.js` acepta **8 columnas** (sin altura): inserta el hueco automáticamente. Si la fila llega con 8 campos, no hace falta rellenar altura.

- **CSV sin `altura`** (addsquad la ignora): `nombre;pos;pie;nacimiento;nat;valor_eur;grl;foto`.
- **Sin prosa**: solo bloque(s) `#CLUB <ID> <ISO2>` + filas. Notas **solo si hay algo accionable**, en 1 línea: `#NOTA <ID>: 2 solo-TM; dup: X; cesión: A→B`. Si no hay plantilla: `#CLUB <ID> <ISO2>` + `#SIN PLANTILLA`.
- El prompt del subagente se reduce a: “aplica `FETCH_PROTOCOL` a: `<ID>` `<club>` (BeSoccer `<slug>`, TM `<slug/verein>`)”.
- Verificación con `verify.sh <IDs>` (≤3 líneas por club + `chk_fast`). Lotes de 5-10 clubes.
- **Nunca** volcar HTML ni líneas largas (`tail`/`cut`/contadores).
