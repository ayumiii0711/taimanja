const LW=1280, LH=720, MAX=100, DMAX=600;
const CHS=MANIFEST.characters, WPS=MANIFEST.weapons, STG=MANIFEST.stages;
const MONKEY=CHS.findIndex(c=>c.id==='monkey');
const OTHER=CHS.map((_,i)=>i).filter(i=>i!==MONKEY); // 猿以外の14種
const SND={'frying-pan':'カァン！','giant-leek':'ベチッ！','squeaky-hammer':'ポコッ！','zabuton':'ボフッ！','mop':'ズザッ！','rubber-chicken':'ギュエー！'};
const POSES=['idle','run','attack','hit','ko','win'];
const $=id=>document.getElementById(id);
// 乱数は crypto 由来・剰余バイアスなし
const rnd=n=>{const m=Math.floor(4294967296/n)*n,b=new Uint32Array(1);do crypto.getRandomValues(b);while(b[0]>=m);return b[0]%n};
const rf=()=>rnd(1e6)/1e6;
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
const balanced=(n,k)=>shuffle(Array.from({length:n},(_,i)=>i%k)); // 0..k-1 を均等に並べてシャッフル
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hue=no=>`hsl(${(no*137.5)%360} 70% 42%)`;
const badge=no=>`<span class="badge" style="background:${hue(no)}">${no}</span>`;

// ---- 入力欄 ----
let names=[],loaded=false;
const getDur=()=>{const v=Number($('dur').value);return Number.isInteger(v)&&v>=1&&v<=DMAX?v:0};
function parse(){
  names=$('names').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const n=names.length,over=n>MAX;
  $('count').textContent=`参加者 ${n}／${MAX}人`;
  $('count').className=over?'bad':'';
  const c=new Map();names.forEach(s=>c.set(s,(c.get(s)||0)+1));
  const dup=[...c].filter(([,k])=>k>1).map(([s,k])=>`${s}×${k}`);
  const m=$('msg');
  if(over){m.textContent='100人以内にしてください';m.className='bad'}
  else if(n<2){m.textContent='2人以上の名前を入力してください';m.className='bad'}
  else if(!getDur()){m.textContent=`決着時間は1〜${DMAX}秒の整数で指定してください`;m.className='bad'}
  else if(dup.length){m.textContent='同じ名前があるため、参加番号で区別します（'+dup.join('、')+'）';m.className='warn'}
  else{m.textContent='';m.className=''}
  $('start').disabled=!loaded||n<2||over||!getDur();
  document.querySelectorAll('#presets button').forEach(b=>b.classList.toggle('on',+b.dataset.s===getDur()));
}
$('names').addEventListener('input',parse);
$('dur').addEventListener('input',parse);
$('presets').innerHTML=[[1,'1秒'],[5,'5秒'],[15,'15秒'],[30,'30秒'],[60,'1分'],[180,'3分']].map(([s,l])=>`<button class="sec" data-s="${s}">${l}</button>`).join('');
$('presets').onclick=e=>{const s=e.target.dataset&&e.target.dataset.s;if(s){$('dur').value=s;parse()}};
try{const d=localStorage.getItem('taimanja.dur');if(d)$('dur').value=d}catch(e){}

// ---- 素材 ----
const img=src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(i);i.src=src});
let IMG;
async function load(){
  let done=0;const tot=CHS.length*6+WPS.length+STG.length;
  const L=src=>img(src).then(i=>{$('loading').textContent=`読み込み中… ${Math.round(++done/tot*100)}％`;return i});
  IMG={
    ch:await Promise.all(CHS.map(c=>Promise.all(POSES.map(p=>L(c.poses[p]))).then(a=>Object.fromEntries(POSES.map((p,i)=>[p,a[i]]))))),
    wp:await Promise.all(WPS.map(w=>L(w.image))),
    st:await Promise.all(STG.map(s=>L(s.image))),
  };
  loaded=true;$('loading').hidden=true;$('start').textContent='バトル開始';parse();
}

// ---- 状態 ----
let F=[],phase='prep',T=0,W=0,D=30,cnt=3,pops=[],conf=[],cam={x:LW/2,y:LH/2,s:1},winner=null,finalShown=false,stg=0,SZ=130;
const cv=$('cv'),ctx=cv.getContext('2d');
let kk=1,U=1; // kk: 論理座標→実ピクセル, U: CSS 1px あたりの論理座標
new ResizeObserver(()=>{const d=Math.min(2,devicePixelRatio||1),w=$('frame').clientWidth;cv.width=Math.round(w*d);cv.height=Math.round(w*d*9/16);kk=cv.width/LW;U=LW/w}).observe($('frame'));
const bounds=()=>{const b=STG[stg].footBounds;return {x0:b.left*LW,x1:b.right*LW,y0:b.top*LH,y1:b.bottom*LH}};
const ds=f=>{const b=bounds();return .85+.3*(f.y-b.y0)/(b.y1-b.y0)}; // 手前ほど大きく

function mk(no,name,ch,wp,x,y,extra){return {no,name,ch,wp,x,y,dir:1,hp:1,alive:true,win:false,state:'idle',t:0,cd:rf()*.5,hitDone:true,hitT:0,kx:0,ky:0,koT:-1,kv:[0,0],ph:rf()*6,spd:100,...extra}}
function prepScene(){ // 準備画面：待機中のキャラ（猿は本番の1体だけにするため出さない）
  stg=rnd(STG.length);SZ=130;const b=bounds(),ids=shuffle(OTHER.slice()).slice(0,7);
  F=ids.map((c,i)=>mk(0,'',c,rnd(WPS.length),b.x0+(i+.5)*(b.x1-b.x0)/7,b.y0+(b.y1-b.y0)*(.35+.4*rf())));
  F.forEach(f=>f.dir=f.x<LW/2?1:-1);
  phase='prep';cam={x:LW/2,y:LH/2,s:1};
}

function newMatch(){
  D=getDur()||30;try{localStorage.setItem('taimanja.dur',D)}catch(e){}
  const n=names.length,monkey=rnd(n),win=rnd(n); // 勝者・猿・背景・武器は互いに独立の抽選
  stg=rnd(STG.length);
  const ct=balanced(n-1,OTHER.length),wt=balanced(n,WPS.length);
  SZ=n>60?85:n>30?100:n>12?115:140;
  const b=bounds(),cols=Math.ceil(Math.sqrt(n*(b.x1-b.x0)/(b.y1-b.y0))),rows=Math.ceil(n/cols);
  const cells=shuffle(Array.from({length:cols*rows},(_,i)=>i));
  let ci=0;
  F=names.map((name,i)=>{
    const cx=cells[i]%cols,cy=Math.floor(cells[i]/cols);
    const x=b.x0+(cx+.2+.6*rf())*(b.x1-b.x0)/cols,y=b.y0+(cy+.2+.6*rf())*(b.y1-b.y0)/rows;
    return mk(i+1,name,i===monkey?MONKEY:OTHER[ct[ci++]],wt[i],x,y,{hp:Math.round(7*Math.min(6,Math.max(1,D/15))),win:i===win,dir:x<LW/2?1:-1,spd:SZ*(.95+.3*rf())});
  });
  winner=F[win];
  T=W=0;cnt=D<10?1:3;pops=[];conf=[];phase='count';finalShown=false;cam={x:LW/2,y:LH/2,s:1};
  $('log').innerHTML='';$('win').hidden=true;$('final').hidden=true;$('banner').style.opacity=0;$('banner').textContent='';
  $('prep').hidden=true;$('alive').hidden=false;$('quit').hidden=false;updAlive();
}
const aliveN=()=>F.reduce((a,f)=>a+f.alive,0);
const updAlive=()=>$('alive').textContent=`残り ${aliveN()}人`;
function banner(t,ms){const b=$('banner');b.textContent=t;b.classList.remove('on');void b.offsetWidth;b.classList.add('on');if(ms)setTimeout(()=>{if(b.textContent===t)b.style.opacity=0;b.classList.remove('on')},ms)}

function hit(a,b){
  const d=Math.hypot(b.x-a.x,b.y-a.y)||1,m=SZ/130;
  b.hitT=.35;b.kx=(b.x-a.x)/d*300*m;b.ky=(b.y-a.y)/d*120*m;b.state='idle';
  if(pops.length<25&&(F.length<20||rf()<.4))pops.push({x:b.x,y:b.y-SZ*.7,t:.7,s:SND[WPS[a.wp].id]});
  if(b.win)return; // 勝者は抽選で決定済み。戦闘では脱落しない
  if(--b.hp<=0){
    b.alive=false;b.koT=0;b.kv=[(b.x-a.x)/d*380*m,(b.y-a.y)/d*100*m-40*m];
    const l=$('log');l.insertAdjacentHTML('beforeend',`<div>${esc(b.name)} 脱落！</div>`);while(l.children.length>3)l.firstChild.remove();
    updAlive();
  }
}
function forceFinish(){ // 制限時間：残りの敗者をまとめて吹っ飛ばす
  const L=F.filter(f=>f.alive&&!f.win);
  if(D>=5&&L.length<=1)return; // 決勝の相手はそのまま決着させる
  const keep=D>=5&&L.length>1?L[rnd(L.length)]:null; // 決勝の相手を1人だけ残す
  if(keep)keep.hp=1;
  for(const f of L)if(f!==keep){f.alive=false;f.koT=0;const a=rf()*6.28;f.kv=[Math.cos(a)*400,Math.sin(a)*200-60]}
  updAlive();
}

function step(dt){
  T+=dt;
  if(phase==='prep'){for(const f of F)f.ph+=dt*12;return}
  if(phase==='count'){cnt-=dt;const k=Math.ceil(cnt);if(k>0&&$('banner').textContent!==String(k))banner(String(k));if(cnt<=0){phase='fight';banner('スタート！',900)}return}
  for(const f of F)if(f.koT>=0){f.koT+=dt;f.x+=f.kv[0]*dt;f.y+=f.kv[1]*dt}
  pops=pops.filter(p=>(p.t-=dt)>0);
  if(phase!=='fight')return;
  const A=F.filter(f=>f.alive);
  if(A.length===1){phase='end';winner=A[0];$('final').hidden=true;$('alive').hidden=true;$('quit').hidden=true;setTimeout(showWin,D<5?600:1500);confetti();return}
  if(A.length===2&&!finalShown){finalShown=true;$('log').innerHTML='';$('final').innerHTML=`<span class="n">${badge(A[0].no)}${esc(A[0].name)}</span><span>VS</span><span class="n">${badge(A[1].no)}${esc(A[1].name)}</span>`;$('final').hidden=false;if(D>=5)banner('決勝！',1500)}
  const R=SZ*.6,sep=SZ*.3,b=bounds();
  for(const f of A){
    f.ph+=dt*12;
    if(f.hitT>0){f.hitT-=dt;f.x+=f.kx*dt;f.y+=f.ky*dt;f.kx*=.9;f.ky*=.9;continue}
    let tg=null,bd=1e18;
    for(const o of A){if(o===f)continue;const d=(o.x-f.x)**2+((o.y-f.y)*2)**2;if(d<bd){bd=d;tg=o}}
    const d=Math.sqrt(bd)||1,ux=(tg.x-f.x)/d,uy=(tg.y-f.y)*2/d;
    if(Math.abs(ux)>.2)f.dir=ux>0?1:-1;
    if(f.state==='attack'){
      f.t+=dt;
      if(!f.hitDone&&f.t>=.18){f.hitDone=true;if(d<R+SZ*.2)hit(f,tg)}
      if(f.t>=.45){f.state='run';f.cd=.4+rf()*.5}
    }else{
      f.cd-=dt;
      if(d<=R&&f.cd<=0){f.state='attack';f.t=0;f.hitDone=false}
      else{f.state='run';if(d>R*.7){f.x+=ux*f.spd*dt;f.y+=uy*f.spd*dt/2}}
    }
  }
  for(let i=0;i<A.length;i++)for(let j=i+1;j<A.length;j++){
    const a=A[i],c=A[j],dx=c.x-a.x,dy=(c.y-a.y)*2,d=Math.hypot(dx,dy);
    if(d<sep&&d>0){const p=(sep-d)/2/d;a.x-=dx*p;a.y-=dy*p/2;c.x+=dx*p;c.y+=dy*p/2}
  }
  for(const f of A){f.x=Math.max(b.x0,Math.min(b.x1,f.x));f.y=Math.max(b.y0,Math.min(b.y1,f.y))}
}

// ---- 描画 ----
function drawF(f){
  const I=IMG.ch[f.ch],c=CHS[f.ch],w=WPS[f.wp],m=SZ/130,k=SZ*ds(f)/384;
  let pose='idle',a=-.6,hop=0,rot=0,z=0,alpha=1,drawW=true,ax=0;
  if(f.koT>=0){pose='ko';drawW=false;const t=f.koT;z=Math.max(0,120*t*(1.2-t)*4)*.6*m;rot=t*10*f.dir;alpha=Math.max(0,1-(t-.8)/.6)}
  else if(phase==='end'&&f.win){pose='win';hop=Math.abs(Math.sin(T*8))*14*m}
  else if(f.hitT>0){pose='hit';rot=-.2*f.dir}
  else if(f.state==='attack'){
    pose='attack';const u=Math.min(1,f.t/.45),e=1-(1-Math.min(1,u/.5))**3;
    if(w.id==='zabuton'){a=u*14;ax=140*Math.sin(Math.PI*u)}else a=-1.9+3*e;
  }else if(f.state==='run'){pose='run';hop=Math.abs(Math.sin(f.ph))*(f.ch===MONKEY?16:9)*m;a=-.8}
  else hop=(phase==='count'||phase==='prep')?Math.abs(Math.sin(T*5+f.ph))*4*m:0;
  if(alpha<=0)return;
  ctx.save();ctx.globalAlpha=alpha;
  ctx.fillStyle='#0004';ctx.beginPath();ctx.ellipse(f.x,f.y,SZ*ds(f)*.22*(1-z/(400*m)),SZ*ds(f)*.07,0,0,7);ctx.fill();
  ctx.translate(f.x,f.y-z-hop*ds(f));ctx.rotate(rot);ctx.scale(f.dir*k,k);ctx.translate(...MANIFEST.characterGroundAnchor.map(v=>-v));
  ctx.drawImage(I[pose],0,0);
  if(drawW){
    const an=c.weaponAnchors[pose==='attack'?'attack':pose==='run'?'run':'idle'],s=w.suggestedSizeRelativeToCharacterFrame*384/256;
    ctx.translate(an[0]+ax,an[1]);ctx.rotate(a);ctx.scale(s,s);ctx.translate(-w.grip[0],-w.grip[1]);
    ctx.drawImage(IMG.wp[f.wp],0,0);
  }
  ctx.restore();
}
function labels(list,big){
  // 前面（y が大きい）から順に置き、重なる名前は間引く。番号の丸は常に表示
  const boxes=[],small=aliveN()>12,fs=(big?20:small?10:13)*U,r=fs*.95;
  ctx.font=`700 ${fs}px sans-serif`;ctx.textBaseline='middle';
  const mx=small?5:10;
  for(const f of list.slice().sort((a,b)=>b.y-a.y)){
    const sx=(f.x-cam.x)*cam.s+LW/2,sy=(f.y-cam.y)*cam.s+LH/2+4*U;
    const nm=f.name.length>mx?f.name.slice(0,mx)+'…':f.name;
    const bw=ctx.measureText(f.no).width,bd=Math.max(r*2,bw+fs*.8),tw=ctx.measureText(nm).width,Wd=bd+tw+fs*.9;
    const box=[sx-Wd/2,sy,Wd,r*2],ov=boxes.some(o=>box[0]<o[0]+o[2]&&o[0]<box[0]+box[2]&&box[1]<o[1]+o[3]&&o[1]<box[1]+box[3]);
    if(!ov){boxes.push(box);ctx.fillStyle='#fffd';ctx.strokeStyle='#282139';ctx.lineWidth=1.5*U;ctx.beginPath();ctx.roundRect(box[0],sy,Wd,r*2,r);ctx.fill();ctx.stroke();
      ctx.fillStyle=hue(f.no);ctx.beginPath();ctx.roundRect(box[0],sy,bd,r*2,r);ctx.fill();
      ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(f.no,box[0]+bd/2,sy+r+U*.5);
      ctx.fillStyle='#282139';ctx.textAlign='left';ctx.fillText(nm,box[0]+bd+fs*.35,sy+r+U*.5)}
    else if(list.length<=30){ctx.fillStyle=hue(f.no);ctx.strokeStyle='#fff';ctx.lineWidth=1.5*U;ctx.beginPath();ctx.arc(sx,sy+r*.7,r*.7,0,7);ctx.fill();ctx.stroke()}
  }
}
function updateCam(dt){
  const A=F.filter(f=>f.alive);let tx=LW/2,ty=LH/2,ts=1;
  if(phase==='end'&&winner){tx=winner.x;ty=winner.y-60;ts=2.2}
  else if(phase==='fight'&&A.length<=10&&D>=5){ // 残り10人から寄る
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
    for(const f of A){x0=Math.min(x0,f.x);x1=Math.max(x1,f.x);y0=Math.min(y0,f.y);y1=Math.max(y1,f.y)}
    tx=(x0+x1)/2;ty=(y0+y1)/2-60;ts=Math.max(1,Math.min(2,LW/(x1-x0+360),LH/(y1-y0+300)));
  }
  const k=1-Math.exp(-dt*3);cam.s+=(ts-cam.s)*k;
  const hw=LW/2/cam.s,hh=LH/2/cam.s; // 背景画像の外が映らないように
  cam.x+=(Math.max(hw,Math.min(LW-hw,tx))-cam.x)*k;cam.y+=(Math.max(hh,Math.min(LH-hh,ty))-cam.y)*k;
}
function draw(dt){
  ctx.setTransform(kk,0,0,kk,0,0);
  if(!IMG){ctx.fillStyle='#282139';ctx.fillRect(0,0,LW,LH);return}
  updateCam(dt);
  ctx.save();ctx.translate(LW/2,LH/2);ctx.scale(cam.s,cam.s);ctx.translate(-cam.x,-cam.y);
  ctx.drawImage(IMG.st[stg],0,0,LW,LH);
  const order=F.filter(f=>f.alive||(f.koT>=0&&f.koT<1.5)).sort((a,b)=>(a.koT>=0)-(b.koT>=0)||a.y-b.y);
  if(phase==='end'&&winner){ctx.strokeStyle='#ffc760';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(winner.x,winner.y,SZ*.45,SZ*.15,0,0,7);ctx.stroke()}
  for(const f of order)drawF(f);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
  for(const p of pops){const s=Math.max(SZ*.3,12*U/cam.s);ctx.font=`900 ${s}px sans-serif`;ctx.strokeStyle='#282139';ctx.lineWidth=s/5;ctx.fillStyle='#ffd23f';const y=p.y-(.7-p.t)*40;ctx.strokeText(p.s,p.x,y);ctx.fillText(p.s,p.x,y)}
  ctx.restore();
  if(phase!=='prep')labels(order.filter(f=>f.alive),phase==='end');
  for(const c of conf){c.y+=c.v*dt*U;c.x+=Math.sin(c.y/40+c.p)*40*dt*U;c.r+=dt*4;ctx.fillStyle=c.c;ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.r);ctx.fillRect(-4*U,-2*U,8*U,4*U);ctx.restore()}
  conf=conf.filter(c=>c.y<LH+20);
}
function confetti(){for(let i=0;i<150;i++)conf.push({x:rf()*LW,y:-rf()*LH,v:120+rf()*200,p:rf()*6,r:rf()*6,c:`hsl(${rnd(360)} 85% 55%)`})}
function showWin(){
  const w=winner;
  $('wname').innerHTML=badge(w.no)+esc(w.name);
  $('wsub').textContent=`${CHS[w.ch].name} ／ ${WPS[w.wp].name}`;
  $('win').hidden=false;
}

// 実時間 W が設定時間 D に収まるよう、残り人数が直線的に減る目標に合わせてシミュ速度を調整する
let last=0;
function frame(ts){
  const dt=Math.min(.05,Math.max(0,(ts-last)/1000||0));last=ts;
  if(phase==='fight'){
    W+=dt;if(W>=D)forceFinish();
    const target=1+(F.length-1)*Math.max(0,1-W/D);
    const k=Math.min(60,Math.max(.5,(aliveN()-1)/Math.max(.5,target-1)));
    const sim=k*dt,n=Math.max(1,Math.ceil(sim*30));
    for(let i=0;i<n;i++)step(sim/n);
  }else step(dt);
  draw(dt);
  requestAnimationFrame(frame);
}

// ---- 画面遷移 ----
function toPrep(){
  prepScene();
  $('prep').hidden=false;$('alive').hidden=true;$('quit').hidden=true;$('win').hidden=true;$('final').hidden=true;$('log').innerHTML='';$('banner').style.opacity=0;
}
$('start').onclick=()=>{parse();if(!$('start').disabled)newMatch()};
$('again').onclick=newMatch;
$('edit').onclick=$('quit').onclick=toPrep;

// ---- 全画面（iPhone など非対応端末は画面いっぱい表示で代用）----
const st=$('stage');
const isFs=()=>document.fullscreenElement===st||st.classList.contains('pfs');
const fsLabel=()=>{$('fs').textContent=isFs()?'全画面を解除':'全画面';$('fs').setAttribute('aria-label',isFs()?'全画面表示を解除':'全画面表示に切り替え')};
$('fs').onclick=()=>{
  if(isFs()){document.fullscreenElement?document.exitFullscreen():st.classList.remove('pfs')}
  else if(st.requestFullscreen)st.requestFullscreen().catch(()=>{st.classList.add('pfs');fsLabel()});
  else st.classList.add('pfs');
  fsLabel();
};
document.addEventListener('fullscreenchange',fsLabel);

parse();toPrep();requestAnimationFrame(frame);load();
