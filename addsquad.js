#!/usr/bin/env node
/* addsquad.js — escribe plantillas reales en players-db.json desde un CSV compacto.
   Pensado para el "pipeline de plantillas": el subagente hace los webfetch y devuelve el CSV;
   este script hace TODO lo determinista (posiciones, país→ISO2, €→M€, fecha→año, photo/foot,
   colisiones, positions como string).

   Uso:  node addsquad.js [--dry] [--check] [[--replace]] [--verify ID] [--year 2026] [--db RUTA] < datos.csv

   Entrada (stdin):
     #CLUB TREF            (opcional 3er campo: país de respaldo →  #CLUB TREF WA)
     nombre;posTM;pie;nacimiento;nat;altura;valor_eur;grl;foto
     J. Coll;Extremo izquierdo;I;2004-05-02;Gales;178;150000;48;1234567
     ...
     #NOTAS: ...           (se ignora; se reimprime)
   - posTM: texto TM en español ("Defensa central", "Interior izquierdo"…) o ya un código (DFC, MC…)
   - pie: I = izquierdo, A = ambidiestro, D/vacío = derecho
   - nacimiento: AAAA-MM-DD | DD/MM/AAAA | AAAA | edad (<=50) | vacío
   - nat: país en español o ISO2 (si hay dos, el primero); vacío → país de respaldo del #CLUB
   - valor_eur: euros (0/‑/vacío → null); grl: rating (0/‑/vacío → 40)
   - foto: id numérico del CDN resfu (‑/vacío → sin foto)
   Salida: 2-3 líneas por club. Exit: 0 ok · 1 hay filas rechazadas · 2 abortado.
*/
const fs=require('fs');
const ARGV=process.argv.slice(2);
const has=f=>ARGV.includes(f);
const val=(f,d)=>{const i=ARGV.indexOf(f);return i>=0?ARGV[i+1]:d};
const DRY=has('--dry')||has('--verify'), CHECK=has('--check'), REPLACE=has('--replace'), APPEND=has('--append');
const YEAR=+val('--year',2026), DB=val('--db','/Users/chrisdearostegui/Proyectos/MyManager/players-db.json');
const VERIFY=val('--verify',null);
const PHOTO_URL=id=>'https://cdn.resfu.com/img_data/players/medium/'+id+'.jpg?size=120x&lossy=1';

const POSMAP={
 'portero':'POR','arquero':'POR','guardameta':'POR',
 'defensa central':'DFC','central':'DFC','defensa':'DFC',
 'lateral derecho':'LD','lateral izquierdo':'LI','carrilero derecho':'MD','carrilero izquierdo':'MI',
 'pivote':'MCD','mediocentro defensivo':'MCD',
 'mediocentro':'MC','centrocampista':'MC','volante':'MC',
 'mediocentro ofensivo':'MCO','mediapunta':'MCO','enganche':'MCO',
 'interior derecho':'MD','interior izquierdo':'MI',
 'extremo derecho':'ED','extremo izquierdo':'EI','extremo':'ED',
 'delantero centro':'DC','delantero':'DC','segunda punta':'DC','ariete':'DC'
};
const CODES=['POR','DFC','LD','LI','MCD','MC','MCO','MD','MI','ED','EI','DC'];
const GENERIC={POR:'GK',DFC:'DF',LD:'DF',LI:'DF',MCD:'MD',MC:'MD',MCO:'MD',MD:'MD',MI:'MD',ED:'FW',EI:'FW',DC:'FW'};
const NAT={
 'gales':'WA','inglaterra':'EN','escocia':'SC','irlanda':'IE','irlanda del norte':'NIR',
 'espana':'ES','portugal':'PT','francia':'FR','alemania':'DE','italia':'IT','paises bajos':'NL','holanda':'NL',
 'belgica':'BE','suiza':'CH','austria':'AT','polonia':'PL','chequia':'CZ','republica checa':'CZ',
 'eslovaquia':'SK','hungria':'HU','rumania':'RO','bulgaria':'BG','serbia':'RS','croacia':'HR','eslovenia':'SI',
 'bosnia y herzegovina':'BA','bosnia':'BA','montenegro':'ME','macedonia del norte':'MK','macedonia':'MK',
 'albania':'AL','grecia':'GR','turquia':'TR','ucrania':'UA','rusia':'RU','bielorrusia':'BY','lituania':'LT',
 'letonia':'LV','estonia':'EE','finlandia':'FI','suecia':'SE','noruega':'NO','dinamarca':'DK','islandia':'IS',
 'malta':'MT','chipre':'CY','luxemburgo':'LU','andorra':'AD','san marino':'SM','gibraltar':'GI',
 'islas feroe':'FO','feroe':'FO','moldavia':'MD','moldova':'MD','georgia':'GE','armenia':'AM',
 'azerbaiyan':'AZ','kazajistan':'KZ','israel':'IL','egipto':'EG','marruecos':'MA','argelia':'DZ',
 'tunez':'TN','libia':'LY','senegal':'SN','mali':'ML','nigeria':'NG','ghana':'GH','costa de marfil':'CI',
 'camerun':'CM','guinea-bissau':'GW','guinea bissau':'GW','guinea':'GN','gambia':'GM','sierra leona':'SL',
 'liberia':'LR','congo':'CG','rd del congo':'CD','republica democratica del congo':'CD','angola':'AO',
 'mozambique':'MZ','sudafrica':'ZA','zimbabue':'ZW','zambia':'ZM','kenia':'KE','etiopia':'ET','somalia':'SO',
 'sudan':'SD','uganda':'UG','tanzania':'TZ','ruanda':'RW','burundi':'BI','cabo verde':'CV',
 'santo tome y principe':'ST','santa lucia':'LC','jamaica':'JM','trinidad y tobago':'TT','haiti':'HT',
 'republica dominicana':'DO','cuba':'CU','curazao':'CW','surinam':'SR','guyana':'GY','canada':'CA',
 'estados unidos':'US','mexico':'MX','costa rica':'CR','panama':'PA','honduras':'HN','guatemala':'GT',
 'el salvador':'SV','nicaragua':'NI','belice':'BZ','brasil':'BR','argentina':'AR','uruguay':'UY',
 'paraguay':'PY','bolivia':'BO','chile':'CL','peru':'PE','ecuador':'EC','colombia':'CO','venezuela':'VE',
 'australia':'AU','nueva zelanda':'NZ','fiyi':'FJ','japon':'JP','corea del sur':'KR','china':'CN',
 'irak':'IQ','iran':'IR','arabia saudi':'SA','emiratos arabes unidos':'AE','catar':'QA','india':'IN',
 'indonesia':'ID','malasia':'MY','singapur':'SG','tailandia':'TH','vietnam':'VN','filipinas':'PH',
 'hong kong':'HK','oman':'OM','jordania':'JO','libano':'LB','siria':'SY','kuwait':'KW','barein':'BH',
 'yemen':'YE','palestina':'PS','kosovo':'XK','liechtenstein':'LI','bahamas':'BS','barbados':'BB',
 'bermudas':'BM','antigua y barbuda':'AG','dominica':'DM','granada':'GD','bosnia-herzegovina':'BA'
};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function mapPos(raw){
  const s=norm(raw); if(!s) return null;
  const up=String(raw).trim().toUpperCase(); if(CODES.includes(up)) return up;
  if(POSMAP[s]) return POSMAP[s];
  const first=s.split('/')[0].trim(); if(POSMAP[first]) return POSMAP[first];
  const head=s.replace(/\s*(derecho|izquierdo|central|ofensivo)\s*$/,'').trim();
  for(const k in POSMAP) if(norm(k).startsWith(head)&&head.length>=4) return POSMAP[k];
  return null;
}
function mapNat(raw,fallback){
  const s=String(raw||'').trim(); if(!s) return fallback||null;
  const first=s.split('/')[0].trim();
  if(/^[A-Za-z]{2,3}$/.test(first)) return first.toUpperCase();   /* ya viene ISO2/NIR */
  const k=norm(first);
  return NAT[k]||null;
}
function mapYear(raw){
  const s=String(raw||'').trim(); if(!s||s==='-') return 2006;
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if(m) return +m[1];
  m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(m) return +m[3];
  m=s.match(/^(\d{4})$/); if(m) return +m[1];
  const n=+s; if(Number.isFinite(n)&&n>0&&n<=50) return YEAR-n;
  return 2006;
}
const num=v=>{let s=String(v==null?'':v).trim().replace(/\s/g,''); if(!s||s==='-') return 0;
  if(/^\d{1,3}(\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');    /* 1.110.000 → 1110000 */
  s=s.replace(',','.');
  const n=parseFloat(s); return Number.isFinite(n)?n:0};

/* ---------- leer entrada ---------- */
const raw=fs.readFileSync(0,'utf8').replace(/^\uFEFF/,'');
const clubs=[]; let cur=null; const notes=[];
for(const line of raw.split(/\r?\n/)){
  const t=line.trim(); if(!t) continue;
  if(/^#\s*NOTAS/i.test(t)){notes.push(t);continue}
  const m=t.match(/^#\s*CLUB\s+([A-Za-z0-9_]{2,8})(?:\s+([A-Za-z]{2,12}))?/);
  if(m){cur={id:m[1].toUpperCase(),coFallback:m[2]?mapNat(m[2]):null,rows:[],rej:[],dup:[],photos:0,coll:[]};clubs.push(cur);continue}
  if(t.startsWith('#')) continue;
  if(!cur){process.stderr.write('addsquad: fila sin #CLUB previo: '+t.slice(0,40)+'\n');continue}
  const f=t.split(';').map(x=>x.trim());
  /* formato compacto (sin altura): 8 columnas → se inserta un hueco */
  if(f.length===8)f.splice(5,0,'-');
  const name=f[0]; if(!name||/^nombre$/i.test(name)) continue;
  const code=mapPos(f[1]); const nat=mapNat(f[4],cur.coFallback);
  if(!code){cur.rej.push(name+'(pos:'+(f[1]||'?')+')');continue}
  if(!nat||!/^[A-Z]{2,3}$/.test(nat)){cur.rej.push(name+'(nat:'+(f[4]||'?')+')');continue}
  let grl=Math.round(num(f[7])); const warn=[];
  if(!grl){grl=40;warn.push('grl→40')}
  const vEur=num(f[6]); const val=vEur?Math.round(vEur/1e6*1e6)/1e6:0;
  const row=[name,GENERIC[code],mapYear(f[3]),nat,grl,null,val,null,code];
  if(cur.rows.some(r=>r[0]===name)){cur.dup.push(name);continue}
  cur.rows.push(row);
  cur['_meta']=cur['_meta']||{}; cur['_meta'][name]={code,pie:String(f[2]||'').trim().toUpperCase(),photo:/^\d+$/.test(String(f[8]||'').trim())?String(f[8]).trim():null,warn};
}
if(!clubs.length){process.stderr.write('addsquad: no he leído ningún #CLUB. Abortado.\n');process.exit(2)}

const db=JSON.parse(fs.readFileSync(DB,'utf8')); db.players=db.players||{}; db.photo=db.photo||{}; db.foot=db.foot||{};
const nameToClubs={}; for(const [cid,rows] of Object.entries(db.players)) for(const r of rows) (nameToClubs[r[0]]=nameToClubs[r[0]]||new Set()).add(cid);

let anyRej=false, aborted=0;
const report=[];
for(const c of clubs){
  const exists=!!db.players[c.id];
  const skip=exists&&!REPLACE&&!DRY&&!APPEND;
  if(skip)aborted++;
  if(APPEND&&exists&&!REPLACE){
    const have=new Set(db.players[c.id].map(r=>r[0]));
    c.present=c.rows.filter(r=>have.has(r[0])).map(r=>r[0]);
    c.rows=c.rows.filter(r=>!have.has(r[0]));
  }
  const cfg=c['_meta']||{};
  if(c.rej.length) anyRej=true;
  const newPhotos=[];
  for(const r of c.rows){
    const name=r[0], meta=cfg[name]||{};
    const others=[...(nameToClubs[name]||[])].filter(x=>x!==c.id);
    /* foto */
    if(meta.photo){
      c.photos++; newPhotos.push(meta.photo);
      const url=PHOTO_URL(meta.photo), prev=db.photo[name];
      if(others.length){
        c.coll.push(name+'@'+others.join(','));
        if(prev&&typeof prev==='object') db.photo[name]=Object.assign({},prev,{[c.id]:url});
        else if(prev) db.photo[name]=Object.assign({[others[0]]:prev},{[c.id]:url});
        else db.photo[name]={[c.id]:url};
      } else if(prev&&typeof prev==='object') db.photo[name]=Object.assign({},prev,{[c.id]:url});
      else db.photo[name]=url;
    } else if(others.length){
      c.coll.push(name+'@'+others.join(','));
      const prev=db.photo[name];
      if(prev&&typeof prev==='string') db.photo[name]={[others[0]]:prev};
      /* sin foto propia: si ya era objeto, se deja como está (este club queda sin entrada) */
    }
    /* pie */
    const pie=meta.pie;
    if(pie==='I'||pie==='A'){
      const prevF=db.foot[name];
      if(prevF&&typeof prevF==='object') db.foot[name]=Object.assign({},prevF,{[c.id]:pie});
      else if(others.length) db.foot[name]=Object.assign({[others[0]]:(typeof prevF==='string'?prevF:'D')},{[c.id]:pie});
      else db.foot[name]=pie;
    }
  }
  if(!DRY&&!skip){if(APPEND&&exists)db.players[c.id]=db.players[c.id].concat(c.rows.map(r=>r.slice()));else db.players[c.id]=c.rows.map(r=>r.slice())}
  const g=n=>c.rows.filter(r=>r[1]===n).length;
  if(skip) report[report.length-1]+=' — OMITIDO (ya existe; usa --replace)';
  report.push(`${c.id}: ${c.rows.length} fichas | GK ${g('GK')} / DF ${g('DF')} / MD ${g('MD')} / FW ${g('FW')} | fotos ${c.photos}/${c.rows.length}`
    +(c.coll.length?` | COLISIONES: ${[...new Set(c.coll)].join(', ')}`:'')
    +(c.dup.length?` | duplicadas ignoradas: ${c.dup.join(', ')}`:'')+(c.present&&c.present.length?` | ya en BD: ${c.present.join(', ')}`:'')
    +(c.rej.length?` | RECHAZADAS: ${c.rej.join(', ')}`:''));
}

/* ---------- verificación contra la BD actual ---------- */
if(VERIFY){
  for(const c of clubs){
    const old=db.players[c.id]; if(!old){report.push(`${c.id}: no está en la BD (nada que comparar)`);continue}
    if(old.length!==c.rows.length){report.push(`${c.id}: nº de filas distinto (BD ${old.length} vs ${c.rows.length})`)}
    let dif=0, same=0;
    const n=Math.min(old.length,c.rows.length);
    for(let i=0;i<n;i++){
      const a=old[i],b=c.rows[i];
      const equal=['0','1','2','3','4','6','8'].every(k=>String(a[+k])===String(b[+k]));
      if(equal) same++; else {dif++; if(dif<=5) report.push(`  #${i} ${a[0]}`+(a[0]!==b[0]?` → ${b[0]}`:'')+` | BD[${a[1]},${a[2]},${a[3]},${a[4]},${a[6]},${a[8]}] vs CSV[${b[1]},${b[2]},${b[3]},${b[4]},${b[6]},${b[8]}]`)}
    }
    report.push(`${c.id}: idénticas ${same}/${n}${dif?` | dif ${dif}`:' ✔'}`);
  }
}

/* ---------- comprobar fotos en el CDN ---------- */
if(CHECK&&!DRY){
  const ids=[...new Set(clubs.flatMap(c=>c.rows.map(r=>{const m=(c['_meta']||{})[r[0]];return m&&m.photo}))).values()].filter(Boolean);
  const bad=[];
  for(const id of ids){
    const code=require('child_process').execSync(`curl -s -o /dev/null -w "%{http_code}" "${PHOTO_URL(id)}"`).toString().trim();
    if(code!=='200') bad.push(id+'('+code+')');
  }
  report.push(`fotos CDN: ${ids.length-bad.length}/${ids.length} 200`+(bad.length?` | fallan: ${bad.join(', ')}`:' ✔'));
}

if(!DRY&&!VERIFY) fs.writeFileSync(DB,JSON.stringify(db));
report.forEach(l=>console.log(l));
notes.forEach(n=>console.log(n));
console.log(DRY?`(--dry: no se ha escrito nada${VERIFY?' · modo verificación':''})`:'escrito '+DB);
process.exit(aborted?2:(anyRej?1:0));
