/* ---------- Layered character art ----------
   Stacks the Nano Banana pieces bundled in pieces.js (built by art/export_web.py) into portraits.
   Every piece sits on the same 400x960 canvas, so drawing is just layering. Tint layers are greyscale
   and multiplied by a colour: skin, hair, main (clothing), second (trousers/hose/sashes).
   The game's existing trait pickers (faceOf, archerBody, outfitOf, dressUp) decide which pieces to use.
   pic() falls back to svgArcher until the pieces have decoded, or if pieces.js is missing. */
const STK={ready:false,img:{},faces:new Map(),fig:new Map()};
(function(){
  if(!window.PIECES) return;
  const P=PIECES.p,waits=[];
  for(const k in P) for(const L in P[k]){
    const v=P[k][L];
    if(!Array.isArray(v)||typeof v[2]!=='string') continue;   // metadata such as an outfit's measured hands
    const [x,y,src]=v,im=new Image();im.src=src;
    STK.img[k+'/'+L]={x,y,im};
    // wait for load, not decode(): decode() can stall while the page is in the background (e.g. app switched)
    waits.push(new Promise(r=>{if(im.complete) r();else{im.onload=r;im.onerror=r}}));
  }
  Promise.all(waits).then(()=>{
    STK.ready=true;
    if(typeof ART!=='undefined') ART.clear();
    if(typeof render==='function'&&typeof S!=='undefined'&&S) render();
  });
})();
const STK_HAS=n=>!!(window.PIECES&&PIECES.p[n]);
const STK_FEM=['robe','gown_medieval','dress_victorian','dress_1920s','stola'];
const STK_HIDE_HAIR=['helm','hood','veil','coif','kerchief','palla'];
const STK_EAR_HATS=STK_HIDE_HAIR.concat(['galea','nursecap','cloche']);   // hats that cover the ears
/* Role kit (role hat, role detail, role outfit) is rolled per person, so not every nun is veiled or every
   bard carries a case. A person whose role clue ("Up close, #12 wears a starched cap…") appears in a story
   always wears the full kit, so the story never contradicts the portrait. Rolls are seeded by the person,
   so they're stable across renders and saves. */
const STK_KIT_CHANCE=.7;
function stkHasRoleClue(era,c){
  const f=era.f2c.indexOf(era.chars.indexOf(c));
  return era.scenes.some(s=>(s.tags||[]).some(t=>t.kind==='role'&&t.f===f));
}
function stkKit(era,c,item){
  if(stkHasRoleClue(era,c)) return true;
  return mulberry(hashStr('kit|'+item+'|'+c.name+'|'+c.role))()<STK_KIT_CHANCE;
}
/* The game's hat names are shared across eras; pick the piece that fits the era and the job. */
function stkHat(c,E,key,r,era){
  let hk=c.hw!=null?c.hw:headOf(r,c);
  if(c.hw==null&&era&&!stkKit(era,c,'hat')) hk='none';
  if(c.hw!=null&&typeof hatAllowed==='function'&&!hatAllowed(c,E,key,c.hw)) hk=era&&!stkKit(era,c,'hat')?'none':headOf(r,c);   // older saves
  if(hk==='coif'){
    if(key==='medieval') return c.sex==='f'?'kerchief':'coif';           // men: leather coif; women: cloth kerchief
    if(r.id==='nurse') return 'nursecap';
    if(c.sex==='f') return 'maidcap';
    return r.id==='cook'||r.id==='shipcook'?'cookcap':'none';
  }
  if(hk==='helm'&&key==='villa') return 'galea';
  if(hk==='veil'&&key==='villa'&&!['vestal','priestess'].includes(r.id)) return 'palla';
  return hk;
}
/* Role details (the game's r.badge). Held items are drawn once on the average body and moved to each
   body type's hand; hand x positions are from anchors.json (800-wide canvas, left hand). */
const STK_BADGES=['apron','strap','collar','cross','keys','medals','chain','pearls','bag','book','case','fur'];   // jewel brooch: dropped, didn't suit the style
const STK_HELD=['bag','book','case','samplecase','instrbox'];
const STK_BADGE_TINT={bag:'#2a2422',book:'#6a4428',case:'#4a3020',collar:'#f2efe8',jewel:'#b02a3a',keys:'#5c5c62',
  medals:'#8a2a3a',pearls:'#ece6d8',strap:'#6a4a30',purse:'#7a5230',samplecase:'#7a4a28',instrbox:'#7a5a3a'};
const STK_HAND={m_slim:204,m_avg:182,m_heavy:170,f_slim:229,f_avg:218,f_heavy:200};
/* a role's detail can differ by job and era: the doctor's bag only suits 1888 doctors */
function stkBadgeItem(r,key){
  if(r.badge!=='bag') return r.badge;
  if(r.id==='merchant') return 'purse';                  // "a fat coin purse"
  if(r.id==='salesman') return 'samplecase';             // "a scuffed sample case"
  if(r.id==='physician'&&key==='villa') return 'instrbox';   // "a box of bronze instruments"
  return 'bag';
}
function stkBadge(c,r,body,era,outfit){
  const b=stkBadgeItem(r,era&&era.key);
  if(!(STK_BADGES.includes(b)||['purse','samplecase','instrbox'].includes(b))||(era&&!stkKit(era,c,'detail'))) return null;
  if(b==='collar'&&!['vicar','clergy','chaplain'].includes(r.id)) return null;   // the butler's collar is his suit's
  if(b==='cross'&&r.id==='nurse') return null;                                     // her cap carries the cross
  const ok=(outfit||'').replace('outfit_','').split('__')[0];   // a version drawn on this very outfit fits best (straps)
  const n=[`badge_${b}-${ok}__${body}`,`badge_${b}__${body}`,`badge_${b}__${c.sex}_avg`].find(STK_HAS);
  if(!n) return null;
  let dx=0,dy=0,side=null;
  const src=n.split('__')[1];
  if(STK_HELD.includes(b)){
    /* move the item (and the hand gripping it) onto the worn outfit's real hand, measured at export time */
    const e=STK.img[n+'/base'];side=e.x+e.im.naturalWidth/2<STK_W/2?0:1;
    const from=(PIECES.p[`outfit_${c.sex==='m'?'suit':'dress_victorian'}__${src}`]||{}).hands;
    const to=(PIECES.p[outfit]||{}).hands;
    if(from&&to){dx=to[side][0]-from[side][0];dy=to[side][1]-from[side][1]}
    else if(src!==body) dx=(side?-1:1)*(STK_HAND[body]-STK_HAND[src])/2;   // no measured hands: use anchors
  }
  /* several details were painted in the placeholder magenta: give each its natural colour */
  const tint=b==='apron'?(r.id==='smith'?'#5a3e28':'#f2efe8'):STK_BADGE_TINT[b]||'#f2efe8';
  return [n,dx,tint,dy,side];
}
const STK_BEARD={full:'full',mous:'moustache',goatee:'goatee',mutton:'mutton'};
/* accessories whose key-coloured parts get a fixed colour (the scarf takes the person's trim colour) */
const STK_ACC_TINT={glasses:'#3a4452',eyepatch:'#221c1a',earring:'#e0b040',necklace:'#e0b040'};
/* canvas geometry (half of the 800x1920 art canvas) */
const STK_W=400,STK_H=960,STK_FLOOR=887;

const STK_ROLE_OUTFITS=['mail','toga','cassock','robe','uniform','bare'];   // costumes that belong to a job
function stkOutfit(c,E,key,era){
  const fem=c.sex==='f';let o=outfitOf(c,E,key).top;
  if(era&&STK_ROLE_OUTFITS.includes(o)&&!stkKit(era,c,'outfit')){
    const tiers=E.tiers.map(t=>t[0]),low=c.tier===tiers[tiers.length-1]||c.tier===tiers[2];
    o=fem?(key==='liner'?'dress_mid':key==='villa'?'stola':'dress_long')
         :key==='medieval'?'doublet':key==='villa'?'tunic_short':low?'work':'suit';
  }
  if(o==='dress_long') o=key==='medieval'?'gown_medieval':'dress_victorian';
  else if(o==='dress_mid') o='dress_1920s';
  const femDefault=key==='liner'?'dress_1920s':key==='villa'?'stola':key==='medieval'?'gown_medieval':'dress_victorian';
  const maleDefault=key==='villa'?'tunic_short':key==='medieval'?'doublet':'suit';
  if(fem&&!STK_FEM.includes(o)) o=femDefault;
  if(!fem&&STK_FEM.includes(o)) o=maleDefault;
  const build=archerBody(c,faceOf(c)).build,bt={broad:'avg',curvy:'avg'}[build]||build;
  let n=`outfit_${o}__${c.sex}_${bt}`;
  if(!STK_HAS(n)) n=`outfit_${o}__${c.sex}_avg`;
  if(!STK_HAS(n)) n=`outfit_${fem?femDefault:maleDefault}__${c.sex}_avg`;
  return n;
}
/* Faces are handed out per era from the person's own homeland look (and age) only, so looks always match
   origin. Nobody shares a face while the group has an unused one; after that, the least-used face repeats. */
function stkFaceMap(era){
  if(STK.faces.has(era.id)) return STK.faces.get(era.id);
  const names=Object.keys(PIECES.p).filter(k=>k.startsWith('face_')).sort(),used={},map=[];
  const pool=grp=>{const p=names.filter(k=>k.startsWith(grp)),o=hashStr(era.id+grp)%Math.max(1,p.length);return p.slice(o).concat(p.slice(0,o))};
  era.chars.forEach((c,i)=>{
    const ph=c.pheno||faceOf(c).pheno||'north';
    // own group; if it has no art at all: an older person uses their homeland's younger faces, then any face
    let own=pool(c.old?`face_${c.sex}_old_${ph}_`:`face_${c.sex}_${ph}_`);
    if(!own.length&&c.old) own=pool(`face_${c.sex}_${ph}_`);
    if(!own.length) own=pool(`face_${c.sex}_`);
    const pick=own.find(k=>!used[k])||own.slice().sort((a,b)=>(used[a]||0)-(used[b]||0))[0]||null;
    if(pick) used[pick]=(used[pick]||0)+1;
    map[i]=pick;
  });
  STK.faces.set(era.id,map);
  return map;
}
function stkLayers(era,E,c){
  const r=roleOf(E,c.role),F=faceOf(c),B=archerBody(c,F),ci=era.chars.indexOf(c);
  const main=mixC((r.body&&stkHasRoleClue(era,c)?r.body:null)||c.bodyHex||r.body||tierOf(E,c.tier)[2],'#ffffff',.1)   /* a story quoting the job ("a legionary's red tunic") needs the job's own colour, not a varied one */,trim=c.trim||'#e0b040';
  const skin=PSKIN[Math.min(5,c.skin)];
  const T={skin,hair:F.hair,main,second:B.second,lips:mixC(mulC(skin,.86),F.lipstick?'#b0303a':'#b85a50',F.lipstick?.45:.28)};
  const hk=stkHat(c,E,era.key,r,era),helm=hk==='helm';
  const outfit=stkOutfit(c,E,era.key,era),L=[[outfit,T]];
  const bd=stkBadge(c,r,outfit.split('__')[1],era,outfit);
  if(bd) L.push([bd[0],{...T,main:bd[2],second:bd[2]},bd[1],bd[3],bd[4]]);
  if((c.acc||[]).includes('necklace')&&c.sex==='f') L.push(['acc_necklace',{...T,main:'#e0b040',second:'#e0b040'}]);   // under face and hair
  const face=stkFaceMap(era)[ci];if(face) L.push([face,T]);
  const beard=c.beard?STK_BEARD[c.bstyle]||'full':(F.marks||[]).includes('stubble')?'stubble':null;
  if(beard&&!helm) L.push([`facial_${beard}`,T]);
  let hs=c.hs;if(c.sex==='f'&&hs==='short') hs='crop';
  if(hs&&hs!=='bald'&&!STK_HIDE_HAIR.includes(hk)) L.push([`hair_${c.sex}_${hs}`,T]);
  const acc=c.acc||[],accT=a=>{const k=STK_ACC_TINT[a]||trim;return {...T,main:k,second:k}};
  // necklace: women only (on men it floated over collars and ties). Earrings: only where the ears show.
  const earsShow=['bald','short','crop','balding','bun','ponytail','braid'].includes(hs||'bald')&&!(c.sex==='f'&&hs==='crop')&&!STK_EAR_HATS.includes(hk);   // a woman's crop is a bob over the ears
  if(acc.includes('scarf')&&!['hood','veil','palla','helm'].includes(hk)) L.push(['acc_scarf',accT('scarf')]);   // looked wrong under a hood
  if(!helm&&acc.includes('earring')&&earsShow) L.push(['acc_earring',accT('earring')]);
  if(!helm) ['glasses','eyepatch'].forEach(a=>{if(acc.includes(a)) L.push([`acc_${a}`,accT(a)])});
  if(acc.includes('bandage')&&(!hk||hk==='none')) L.push(['acc_bandage',accT('bandage')]);   // a forehead bandage can't sit under a hat
  if(hk==='galea') L.push(['hat_galea',{...T,main:'#9aa0a6',second:'#6a4a30'}]);   // drawn in key colours: iron, leather
  else if(hk&&hk!=='none'){const hc=hk==='ribbon'?trim:mixC(main,'#000000',.15),hn=c.sex==='f'&&STK_HAS(`hat_${hk}_f`)?`hat_${hk}_f`:`hat_${hk}`;L.push([hn,{...T,main:hc,second:hc}])}   // women's cut where one exists   // hood is magenta-keyed
  return L.filter(([n])=>STK_HAS(n));
}
const stkTmp=document.createElement('canvas');
function stkDraw(ctx,name,T,dx=0,dy=0){
  const P=PIECES.p[name];
  dx=dx||0;dy=dy||0;
  ['main','second','skin','lips','hair'].forEach(g=>{
    if(!P[g]) return;
    const e=STK.img[name+'/'+g],w=e.im.naturalWidth,h=e.im.naturalHeight;
    stkTmp.width=w;stkTmp.height=h;
    const t=stkTmp.getContext('2d');
    t.drawImage(e.im,0,0);
    t.globalCompositeOperation='multiply';t.fillStyle=T[g]||'#ffffff';t.fillRect(0,0,w,h);
    t.globalCompositeOperation='destination-in';t.drawImage(e.im,0,0);
    ctx.drawImage(stkTmp,e.x+dx,e.y+dy);
  });
  const b=STK.img[name+'/base'];if(b) ctx.drawImage(b.im,b.x+dx,b.y+dy);
}
function stkFigure(era,E,c){
  const key=era.id+'|'+era.chars.indexOf(c);
  if(STK.fig.has(key)) return STK.fig.get(key);
  const cv=document.createElement('canvas');cv.width=STK_W;cv.height=STK_H;
  const ctx=cv.getContext('2d'),L=stkLayers(era,E,c);
  /* a hat's clip layer marks where hair must not show (above its brim), so big hair doesn't poke out */
  const hat=L.find(([n])=>n.startsWith('hat_')),clip=hat&&STK.img[hat[0]+'/clip'];
  const nurse=hat&&hat[0]==='hat_nursecap';
  L.forEach(([n,T,dx,dy,side])=>{
    if(side!=null){   // a held item brings its own gripping hand: remove the outfit's open hand on that side
      const m=STK.img[L[0][0]+'/handmask'+(side?'R':'L')],hk=STK.img[n+'/skin'];
      const top=hk?hk.y+(dy||0)+3:0;   // erase only below where the gripping hand begins, so the wrist joins
      if(m){ctx.save();ctx.beginPath();ctx.rect(0,top,STK_W,STK_H);ctx.clip();
        ctx.globalCompositeOperation='destination-out';ctx.drawImage(m.im,m.x,m.y);ctx.restore()}
    }
    if(!((clip||nurse)&&n.startsWith('hair_'))){stkDraw(ctx,n,T,dx,dy);return}
    const off=document.createElement('canvas');off.width=STK_W;off.height=STK_H;
    const o=off.getContext('2d');stkDraw(o,n,T);
    if(nurse){   // under the nurse's veil only the front of the hair shows: keep hair inside the head's outline
      o.globalCompositeOperation='destination-in';o.beginPath();o.ellipse(200,172,45,60,0,0,7);o.fill();
    }
    else{o.globalCompositeOperation='destination-out';o.drawImage(clip.im,clip.x,clip.y)}
    ctx.drawImage(off,0,0);
  });
  STK.fig.set(key,cv);
  return cv;
}
/* Backdrops: places shared by related roles, so the backdrop is only a soft hint (several roles share each place,
   each role has 2-5 places, and 30% of people get the era's neutral backdrop). Must match BACKDROPS in make_jobs.py. */
const STK_PLACES={
  medieval:{hall:['lord','lady','heir','chaplain','steward','servant','minstrel','envoy'],chapel:['chaplain','friar','nun','lady'],
    battlements:['knight','maa','archer','lord','smith'],kitchen:['cook','servant','laundress','steward'],courtyard:['smith','maa','servant','falconer','friar'],
    mews:['falconer','archer','knight','heir','smith'],solar:['lady','lord','heir','envoy','minstrel','nun'],laundry:['laundress','servant','cook']},
  manor:{drawing:['mistress','daughter','guest','vicar','colonel'],library:['master','son','physician','colonel','governess'],
    dining:['butler','footman','guest','master'],kitchen:['cook','maid','housekeeper'],servants:['butler','housekeeper','valet','footman','ladysmaid','maid','cook'],
    nursery:['governess','nanny','daughter'],stables:['groom','gamekeeper','son','gardener'],gardens:['gardener','gamekeeper','daughter','vicar','nanny','groom'],
    dressing:['ladysmaid','valet','mistress','physician']},
  liner:{saloon:['magnate','socialite','heir','fcp','musician','steward'],promenade:['fcp','socialite','teacher','clergy','traveller','officer','magnate','heir','captain'],
    lounge:['teacher','clergy','salesman','traveller','musician'],berths:['emigrant','traveller','musician','nurse'],bridge:['captain','officer','wireless'],
    wireless:['wireless','officer'],boiler:['stoker','deckhand'],galley:['shipcook','steward','deckhand'],infirmary:['nurse','clergy'],
    cargo:['deckhand','emigrant','salesman','stoker','shipcook']},
  villa:{atrium:['senator','matrona','heir','steward','scribe','attendant','vestal'],peristyle:['matrona','heir','dancer','physician','priestess'],
    triclinium:['senator','merchant','dancer','attendant','cook'],kitchen:['cook','attendant','porter','fisher'],harbour:['merchant','fisher','porter','soldier'],
    temple:['priestess','vestal','senator'],street:['merchant','soldier','gladiator','physician','scribe'],baths:['gladiator','senator','heir'],
    tablinum:['scribe','steward','senator']}};
function stkBackdrop(era,c){
  const places=STK_PLACES[era.key]||{},rnd=mulberry(hashStr('place|'+c.name+'|'+c.role));
  const mine=Object.keys(places).filter(k=>places[k].includes(c.role));
  const place=rnd()<.3||!mine.length?'neutral':mine[Math.floor(rnd()*mine.length)];
  return STK.img[`bg_${era.key}_${place}/base`]||STK.img[`bg_${era.key}_neutral/base`]||null;
}
/* Returns a data URI for pic(), framed like the old SVG variants (full 200:480, head square, bust). */
function stackPic(era,E,c,variant,opts){
  if(!STK.ready) return null;
  const fig=stkFigure(era,E,c),bg=PBG[era.key]||PBG.manor;
  const box=variant==='head'?[120,95,160,160]:variant==='bust'?[50,85,300,315]:[25,85,350,840];
  const [bx,by,bw,bh]=box,sc=variant==='head'?1.5:1;
  const cv=document.createElement('canvas');cv.width=bw*sc;cv.height=bh*sc;
  const ctx=cv.getContext('2d');ctx.scale(sc,sc);
  ctx.fillStyle=bg[0];ctx.fillRect(0,0,bw,bh);
  const bd=stkBackdrop(era,c);
  if(bd){
    // placed as in the full portrait (covering its 350x840 frame), then cropped for bust/head
    const im=bd.im,h=840,w=im.naturalWidth*h/im.naturalHeight;
    ctx.save();
    if(variant==='head') ctx.filter='blur(1.2px)';                 // small thumbnails: softer, less busy
    ctx.drawImage(im,25+(350-w)/2-bx,85-by,w,h);
    ctx.restore();
    ctx.fillStyle=bg[0];ctx.globalAlpha=variant==='head'?.35:.18;ctx.fillRect(0,0,bw,bh);ctx.globalAlpha=1;   // mute it
  }else if(variant==='full'){ctx.fillStyle=bg[1];ctx.fillRect(0,bh*300/480,bw,bh)}
  if(variant==='full'){
    const s=archerBody(c,faceOf(c)).scale||1;
    ctx.fillStyle='rgba(0,0,0,.2)';ctx.beginPath();ctx.ellipse(200-bx,STK_FLOOR-by+2,95*s,12,0,0,7);ctx.fill();
    ctx.translate(200-bx,STK_FLOOR-by);ctx.scale(s,s);ctx.translate(-200,-STK_FLOOR);   // height varies by person
    if(opts&&opts.blur) ctx.filter='blur(4px)';   // an unwatched person: the figure is soft, the scene around them stays sharp
    ctx.drawImage(fig,0,0);
    ctx.filter='none';
  } else ctx.drawImage(fig,-bx,-by);
  return cv.toDataURL('image/webp',.9);
}
