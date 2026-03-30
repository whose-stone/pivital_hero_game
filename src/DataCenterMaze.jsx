import { useState, useEffect, useRef, useCallback } from "react";

const TW=96,TH=48,MW=31,MH=31,WS=0.06,RH=60,NUM_DRIVES=4,FRAGS_PER=4;
function genMaze(w,h){const m=Array.from({length:h},()=>Array(w).fill(1));const d=[[0,-2],[0,2],[-2,0],[2,0]];
  function sh(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function c(x,y){m[y][x]=0;for(const[dx,dy]of sh([...d])){const nx=x+dx,ny=y+dy;if(nx>0&&nx<w-1&&ny>0&&ny<h-1&&m[ny][nx]===1){m[y+dy/2][x+dx/2]=0;c(nx,ny);}}}
  c(1,1);for(let i=0;i<w*h*0.12;i++){const rx=1+Math.floor(Math.random()*(w-2)),ry=1+Math.floor(Math.random()*(h-2));
    if(m[ry][rx]===1){let a=0;if(ry>0&&m[ry-1][rx]===0)a++;if(ry<h-1&&m[ry+1][rx]===0)a++;if(rx>0&&m[ry][rx-1]===0)a++;if(rx<w-1&&m[ry][rx+1]===0)a++;if(a>=2)m[ry][rx]=0;}}return m;}
function placeOnFloor(maze,count,avoid){const items=[],av=new Set(avoid.map(p=>`${p.x},${p.y}`));let a=0;
  while(items.length<count&&a<3000){const x=1+Math.floor(Math.random()*(MW-2)),y=1+Math.floor(Math.random()*(MH-2));
    if(maze[y][x]===0&&!av.has(`${x},${y}`)){items.push({x,y});av.add(`${x},${y}`);}a++;}return items;}
function toIso(gx,gy){return{x:(gx-gy)*TW/2,y:(gx+gy)*TH/2};}
function tR(x,y,s){let h=x*374761393+y*668265263+s*1274126177;h=(h^(h>>13))*1103515245;return((h^(h>>16))&0x7fffffff)/0x7fffffff;}
function useIsMobile(){const[m,s]=useState(false);useEffect(()=>{const c=()=>s(('ontouchstart' in window||navigator.maxTouchPoints>0)&&window.innerWidth<768);c();window.addEventListener('resize',c);return()=>window.removeEventListener('resize',c);},[]);return m;}
function DPadBtn({icon,onPress,size}){const iRef=useRef(null),pRef=useRef(false);
  const go=(e)=>{e.preventDefault();if(pRef.current)return;pRef.current=true;onPress();iRef.current=setInterval(onPress,120);};
  const stop=(e)=>{if(e)e.preventDefault();pRef.current=false;if(iRef.current){clearInterval(iRef.current);iRef.current=null;}};
  useEffect(()=>()=>{if(iRef.current)clearInterval(iRef.current);},[]);
  return <button onTouchStart={go} onTouchEnd={stop} onTouchCancel={stop} onMouseDown={go} onMouseUp={stop} onMouseLeave={stop}
    style={{width:size,height:size,borderRadius:8,background:'rgba(0,170,255,0.08)',border:'1.5px solid rgba(0,170,255,0.25)',color:'rgba(0,220,255,0.8)',fontSize:18,fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center',touchAction:'manipulation',userSelect:'none',WebkitUserSelect:'none',cursor:'pointer',padding:0}}>{icon}</button>;}
function CrossDPad({onMove,size}){const s=size||46,g=3;
  return <div style={{display:'grid',gridTemplateColumns:`${s}px ${s}px ${s}px`,gridTemplateRows:`${s}px ${s}px ${s}px`,gap:g,flexShrink:0}}>
    <div/><DPadBtn icon="▲" size={s} onPress={()=>onMove(0,-1)}/><div/>
    <DPadBtn icon="◀" size={s} onPress={()=>onMove(-1,0)}/>
    <div style={{width:s,height:s,borderRadius:8,background:'rgba(0,170,255,0.03)',border:'1px solid rgba(0,170,255,0.08)'}}/>
    <DPadBtn icon="▶" size={s} onPress={()=>onMove(1,0)}/>
    <div/><DPadBtn icon="▼" size={s} onPress={()=>onMove(0,1)}/><div/>
  </div>;}

export default function DataCenterMaze(){
  const canvasRef=useRef(null);const[gs,setGs]=useState(null);const[dims,setDims]=useState({w:1400,h:850});
  const keysRef=useRef(new Set()),lastMoveRef=useRef(0),particlesRef=useRef([]),gRef=useRef(null);
  const walkRef=useRef({x:1,y:1,moving:false,walkCycle:0}),camRef=useRef({x:0,y:0});
  const revealedRef=useRef(new Uint8Array(MW*MH));
  const notifRef=useRef({text:'',timer:0});const sparksRef=useRef([]);
  const[showPhone,setShowPhone]=useState(false);
  const isMobile=useIsMobile();

  useEffect(()=>{const r=()=>{const vw=window.innerWidth,vh=window.innerHeight;
    if(vw<768)setDims({w:Math.min(vw*2,1000),h:Math.floor(vh*0.50*2)});
    else setDims({w:Math.min(1400,Math.floor(vw*0.96)),h:Math.min(850,Math.floor(vh*0.88))});};
    r();window.addEventListener('resize',r);return()=>window.removeEventListener('resize',r);},[]);

  const initGame=useCallback(()=>{
    const maze=genMaze(MW,MH);const player={x:1,y:1,dir:{x:1,y:0},facing:'se'};
    const types=['tall','wide','blade','network','storage'];const servers=[];
    for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(maze[y][x]===1){let adj=false;[[0,-1],[0,1],[-1,0],[1,0]].forEach(([dx,dy])=>{const n2=x+dx,m2=y+dy;if(n2>=0&&n2<MW&&m2>=0&&m2<MH&&maze[m2][n2]===0)adj=true;});
      if(adj){const r=tR(x,y,42),type=types[Math.floor(r*types.length)],nL=2+Math.floor(tR(x,y,77)*4);
        servers.push({x,y,type,lights:Array.from({length:nL},(_,i)=>({color:['#00cc33','#cc2222','#0088cc','#cc8800','#cc00aa','#00ccaa'][Math.floor(tR(x,y,i*17)*6)],blink:0.3+tR(x,y,i*31)*4,offset:tR(x,y,i*53)*Math.PI*2,yPos:0.12+tR(x,y,i*71)*0.75,xPos:0.6+tR(x,y,i*91)*0.35}))})}}}
    const avoidList=[{x:1,y:1}];
    const driveSpots=placeOnFloor(maze,NUM_DRIVES,avoidList);avoidList.push(...driveSpots);
    const drives=driveSpots.map((s,i)=>({...s,code:Array.from({length:4},()=>Math.floor(Math.random()*10)),collected:false,id:i}));
    const brokenServers=[];
    for(let di=0;di<drives.length;di++){const spots=placeOnFloor(maze,FRAGS_PER,avoidList);avoidList.push(...spots);
      spots.forEach((s,fi)=>{brokenServers.push({...s,driveId:di,position:fi,digit:drives[di].code[fi],fixed:false});});}
    walkRef.current={x:1,y:1,moving:false,walkCycle:0};revealedRef.current=new Uint8Array(MW*MH);
    sparksRef.current=[];notifRef.current={text:'',timer:0};setShowPhone(false);
    const p=toIso(1,1);camRef.current={x:p.x,y:p.y};
    const g={maze,player,drives,brokenServers,servers,score:0,totalDrives:NUM_DRIVES,won:false,flashRadius:12,fragments:[],codeEntry:null,atDrive:null};
    gRef.current=g;setGs({...g});
  },[]);
  useEffect(()=>{initGame();},[initGame]);

  // Screen: ▲=NE(0,-1) ▼=SW(0,1) ◀=NW(-1,0) ▶=SE(1,0)
  const movePlayer=useCallback((dx,dy)=>{
    const g=gRef.current;if(!g||g.won)return;
    if(g.codeEntry){const ce=g.codeEntry;
      if(dy===-1)ce.digits[ce.cursor]=(ce.digits[ce.cursor]+1)%10;
      else if(dy===1)ce.digits[ce.cursor]=(ce.digits[ce.cursor]+9)%10;
      else if(dx===-1)ce.cursor=Math.max(0,ce.cursor-1);
      else if(dx===1)ce.cursor=Math.min(3,ce.cursor+1);
      setGs({...g});return;}
    const w=walkRef.current;if(w.moving)return;
    if(dx===-1&&dy===0)g.player.facing='nw';
    else if(dx===1&&dy===0)g.player.facing='se';
    else if(dx===0&&dy===-1)g.player.facing='ne';
    else if(dx===0&&dy===1)g.player.facing='sw';
    g.player.dir={x:dx,y:dy};
    const nx=g.player.x+dx,ny=g.player.y+dy;
    if(nx>=0&&nx<MW&&ny>=0&&ny<MH&&g.maze[ny][nx]===0){
      g.player.x=nx;g.player.y=ny;w.moving=true;g.atDrive=null;
      // Broken server
      for(const bs of g.brokenServers){if(!bs.fixed&&bs.x===nx&&bs.y===ny){bs.fixed=true;
        g.fragments.push({driveId:bs.driveId,position:bs.position,digit:bs.digit});
        notifRef.current={text:`FRAGMENT: Drive ${bs.driveId+1} · Slot ${bs.position+1} = ${bs.digit}`,timer:180};
        const iso=toIso(nx,ny);for(let i=0;i<20;i++)particlesRef.current.push({x:iso.x,y:iso.y-30,vx:(Math.random()-0.5)*6,vy:-Math.random()*5-1,life:1,color:`hsl(${30+Math.random()*30},100%,${60+Math.random()*30}%)`});}}
      // Golden drive — just mark we're at it, don't open code yet
      for(const d of g.drives){if(!d.collected&&d.x===nx&&d.y===ny){
        g.atDrive=d.id;
        notifRef.current={text:'PRESS ENTER TO ACCESS DRIVE',timer:999};}}
      setGs({...g});}
  },[]);

  const openCodeEntry=useCallback(()=>{
    const g=gRef.current;if(!g||g.atDrive===null||g.codeEntry)return;
    g.codeEntry={driveId:g.atDrive,digits:[0,0,0,0],cursor:0};
    notifRef.current={text:'',timer:0};setGs({...g});
  },[]);

  const submitCode=useCallback(()=>{const g=gRef.current;if(!g||!g.codeEntry)return;
    const ce=g.codeEntry,drive=g.drives[ce.driveId];
    if(ce.digits.every((d,i)=>d===drive.code[i])){
      drive.collected=true;g.score++;g.codeEntry=null;g.atDrive=null;
      notifRef.current={text:`◆ DRIVE ${ce.driveId+1} RECOVERED ◆`,timer:180};
      const iso=toIso(drive.x,drive.y);for(let i=0;i<25;i++)particlesRef.current.push({x:iso.x,y:iso.y-20,vx:(Math.random()-0.5)*6,vy:-Math.random()*5-2,life:1,color:`hsl(${40+Math.random()*25},100%,${55+Math.random()*35}%)`});
      if(g.score>=g.totalDrives)g.won=true;setGs({...g});
    }else{notifRef.current={text:'ACCESS DENIED',timer:120};g.codeEntry=null;setGs({...g});}
  },[]);
  const cancelCode=useCallback(()=>{const g=gRef.current;if(g){g.codeEntry=null;setGs({...g});};},[]);

  useEffect(()=>{const kd=(e)=>{const k=e.key.toLowerCase();keysRef.current.add(k);
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','escape','enter','tab'].includes(k))e.preventDefault();
    if(k==='escape')cancelCode();
    if(k==='enter'){const g=gRef.current;if(g&&g.codeEntry)submitCode();else if(g&&g.atDrive!==null&&!g.codeEntry)openCodeEntry();}
    if(k==='tab')setShowPhone(p=>!p);};
    const ku=(e)=>{keysRef.current.delete(e.key.toLowerCase());};
    window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);return()=>{window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);};},[cancelCode,submitCode,openCodeEntry]);

  useEffect(()=>{if(!gs)return;let aid;
    const loop=(ts)=>{const g=gRef.current;if(!g){aid=requestAnimationFrame(loop);return;}
      const keys=keysRef.current;
      if(!isMobile&&ts-lastMoveRef.current>100&&!g.won){let dx=0,dy=0;
        if(keys.has('w')||keys.has('arrowup'))dy=-1;
        else if(keys.has('s')||keys.has('arrowdown'))dy=1;
        else if(keys.has('a')||keys.has('arrowleft'))dx=-1;
        else if(keys.has('d')||keys.has('arrowright'))dx=1;
        if(dx||dy){movePlayer(dx,dy);lastMoveRef.current=ts;}}
      const w=walkRef.current,tx=g.player.x,ty=g.player.y,ddx=tx-w.x,ddy=ty-w.y,dist=Math.sqrt(ddx*ddx+ddy*ddy);
      if(dist>0.01){const step=Math.min(WS,dist);w.x+=ddx/dist*step;w.y+=ddy/dist*step;w.walkCycle+=0.18;w.moving=dist>WS*2;}
      else{w.x=tx;w.y=ty;w.moving=false;}
      const tI=toIso(w.x,w.y);camRef.current.x+=(tI.x-camRef.current.x)*0.1;camRef.current.y+=(tI.y-camRef.current.y)*0.1;
      const rev=revealedRef.current;for(let gy2=0;gy2<MH;gy2++)for(let gx2=0;gx2<MW;gx2++){if(Math.sqrt((gx2-g.player.x)**2+(gy2-g.player.y)**2)<g.flashRadius)rev[gy2*MW+gx2]=1;}
      for(const bs of g.brokenServers){if(bs.fixed)continue;if(Math.random()<0.08){const iso=toIso(bs.x,bs.y);sparksRef.current.push({x:iso.x+(Math.random()-0.5)*20,y:iso.y-15-Math.random()*20,vx:(Math.random()-0.5)*2,vy:-Math.random()*2,life:0.6+Math.random()*0.4});}}
      sparksRef.current=sparksRef.current.filter(s=>{s.x+=s.vx;s.y+=s.vy;s.vy+=0.05;s.life-=0.03;return s.life>0;});
      particlesRef.current=particlesRef.current.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.1;p.life-=0.02;return p.life>0;});
      if(notifRef.current.timer>0&&!(g.atDrive!==null&&!g.codeEntry))notifRef.current.timer--;
      draw(ts,g);aid=requestAnimationFrame(loop);};
    aid=requestAnimationFrame(loop);return()=>cancelAnimationFrame(aid);
  },[gs,isMobile,movePlayer]);

  const computeLit=(gx,gy,p,g)=>{const dx=gx-p.x,dy=gy-p.y,dist=Math.sqrt(dx*dx+dy*dy);
    const amb=dist<6?0.4*(1-dist/6)**1.4:0;let fl=0;
    if(dist<g.flashRadius){const fd=p.dir,ang=Math.atan2(dy,dx);let diff=Math.abs(ang-Math.atan2(fd.y,fd.x));if(diff>Math.PI)diff=2*Math.PI-diff;
      if(diff<1.2)fl=(1-diff/1.2)*(1-dist/g.flashRadius)*0.9;if(diff<2.0&&dist<g.flashRadius*0.6)fl=Math.max(fl,0.15*(1-diff/2.0)*(1-dist/(g.flashRadius*0.6)));}
    if(dist<2.5)fl=Math.max(fl,0.85*(1-dist/2.5));return Math.min(1,fl+amb+0.008);};

  const draw=(ts,g)=>{const cv=canvasRef.current;if(!cv||!g)return;const ctx=cv.getContext('2d');const W=cv.width,H=cv.height;
    ctx.fillStyle='#020204';ctx.fillRect(0,0,W,H);const{maze,player,drives,brokenServers,servers}=g;
    const w=walkRef.current,pIso=toIso(w.x,w.y);
    const camX=Math.round(W/2-camRef.current.x),camY=Math.round(H/2-camRef.current.y);ctx.save();ctx.translate(camX,camY);
    const rev=revealedRef.current;const litMap=new Float32Array(MW*MH);
    for(let gy=0;gy<MH;gy++)for(let gx=0;gx<MW;gx++)litMap[gy*MW+gx]=computeLit(gx,gy,player,g);
    // Build golden drive set for glow
    const driveSet=new Set();for(const d of drives){if(!d.collected)driveSet.add(d.y*MW+d.x);}
    const pD=player.x+player.y;const tiles=[];
    for(let gy=0;gy<MH;gy++)for(let gx=0;gx<MW;gx++)tiles.push({gx,gy,d:gx+gy});tiles.sort((a,b)=>a.d-b.d);
    let pDrawn=false;
    const drawBrokenInRange=(min,max)=>{for(const bs of brokenServers){if(bs.fixed)continue;const dd=bs.x+bs.y;if(dd>min&&dd<=max){const iso=toIso(bs.x,bs.y);const br=litMap[bs.y*MW+bs.x];if(br<0.005&&!rev[bs.y*MW+bs.x])continue;drawBroken(ctx,iso.x,iso.y,Math.max(0.05,br),ts);}}};
    for(const{gx,gy}of tiles){const td=gx+gy;
      if(!pDrawn&&td>pD){drawBrokenInRange(-999,pD);drawAgent(ctx,pIso.x,pIso.y,ts,player,w);drawBeam(ctx,pIso.x,pIso.y,player,g);drawBrokenInRange(pD,td);pDrawn=true;}
      const idx=gy*MW+gx,lit=litMap[idx],revealed=rev[idx]===1;if(!revealed&&lit<0.005)continue;const iso=toIso(gx,gy);
      const isGold=driveSet.has(idx);
      if(maze[gy][gx]===0)drawFloor(ctx,iso.x,iso.y,revealed?Math.max(0.04,lit):lit,isGold?ts:0);
      else drawRack(ctx,iso.x,iso.y,revealed?Math.max(0.06,lit):lit,ts,servers.find(s=>s.x===gx&&s.y===gy),gx,gy,isGold?ts:0);}
    if(!pDrawn){drawBrokenInRange(-999,pD);drawAgent(ctx,pIso.x,pIso.y,ts,player,w);drawBeam(ctx,pIso.x,pIso.y,player,g);}
    drawBrokenInRange(pD,9999);
    for(const s of sparksRef.current){ctx.globalAlpha=s.life;ctx.fillStyle=`hsl(${30+Math.random()*20},100%,${60+Math.random()*30}%)`;ctx.beginPath();ctx.arc(s.x,s.y,1.5*s.life,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    for(const p of particlesRef.current){ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,2.5*p.life,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    ctx.restore();
    const vg=ctx.createRadialGradient(W/2,H/2,W*0.3,W/2,H/2,Math.max(W,H)*0.55);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(0.7,'rgba(0,0,0,0.04)');vg.addColorStop(1,'rgba(0,0,0,0.4)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
    drawHUD(ctx,W,H,g,ts,isMobile);
    if(notifRef.current.timer>0){const n=notifRef.current;const a=Math.min(1,n.timer/30);ctx.globalAlpha=a;
      ctx.font='bold 13px "JetBrains Mono",monospace';const tw=ctx.measureText(n.text).width;
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(W/2-tw/2-20,H-100,tw+40,36);
      ctx.fillStyle=n.text.includes('DENIED')?'#ff4444':n.text.includes('RECOVERED')?'#ffd700':n.text.includes('ENTER')? '#ffd700':'#0ff';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n.text,W/2,H-82);ctx.globalAlpha=1;}
    if(g.codeEntry)drawCodeEntry(ctx,W,H,g);};

  const phoneUI=gs&&showPhone&&!gs.codeEntry?(
    <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:280,background:'#0a0c12',border:'2px solid #1a2040',borderRadius:16,padding:16,boxShadow:'0 8px 40px rgba(0,0,0,0.8)',zIndex:10,fontFamily:'"JetBrains Mono",monospace'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{color:'#0af',fontSize:13,fontWeight:'bold'}}>📱 CODE LOG</div>
        <button onClick={()=>setShowPhone(false)} style={{background:'transparent',border:'1px solid #333',color:'#888',borderRadius:4,padding:'2px 8px',cursor:'pointer',fontFamily:'inherit',fontSize:10}}>✕</button>
      </div>
      <div style={{borderTop:'1px solid #1a2040',paddingTop:10}}>
        {gs.drives.map((d,di)=>(
          <div key={di} style={{marginBottom:10}}>
            <div style={{color:d.collected?'#555':'#ffd700',fontSize:11,marginBottom:4}}>{d.collected?`Drive ${di+1} — RECOVERED`:`Drive ${di+1}`}</div>
            {!d.collected&&<div style={{display:'flex',gap:6}}>
              {[0,1,2,3].map(si=>{const frag=gs.fragments.find(f=>f.driveId===di&&f.position===si);
                return <div key={si} style={{width:32,height:36,background:frag?'rgba(0,255,100,0.08)':'rgba(255,255,255,0.02)',border:`1px solid ${frag?'#0a4':'#222'}`,borderRadius:4,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                  <div style={{fontSize:7,color:'#556'}}>Slot {si+1}</div>
                  <div style={{fontSize:16,fontWeight:'bold',color:frag?'#0f0':'#333'}}>{frag?frag.digit:'?'}</div>
                </div>;})}
            </div>}
          </div>))}
      </div>
      <div style={{color:'#334',fontSize:9,marginTop:8,textAlign:'center'}}>Fix ⚡ servers to reveal digits</div>
    </div>):null;

  return (
    <div style={{position:'relative',width:'100vw',height:'100vh',background:'#000',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'"JetBrains Mono","Fira Code",monospace',overflow:'hidden',touchAction:'none',userSelect:'none',WebkitUserSelect:'none'}}>
      <canvas ref={canvasRef} width={dims.w} height={dims.h} style={{border:'1px solid #111828',borderRadius:4,maxWidth:'100%',maxHeight:isMobile?'50vh':'calc(100vh - 70px)',touchAction:'none'}}/>
      {phoneUI}
      {isMobile?(
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 8px',width:'100%',boxSizing:'border-box'}}>
          <div style={{display:'flex',flexDirection:'column',gap:4,flex:1}}>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              <button onClick={()=>setShowPhone(p=>!p)} style={{background:'rgba(0,170,255,0.1)',color:'#0af',border:'1px solid rgba(0,170,255,0.3)',padding:'5px 10px',borderRadius:5,fontFamily:'inherit',fontSize:10,touchAction:'manipulation'}}>📱 Codes</button>
              {gs?.atDrive!==null&&!gs?.codeEntry&&<button onClick={openCodeEntry} style={{background:'#ffd700',color:'#000',border:'none',padding:'5px 12px',borderRadius:5,fontFamily:'inherit',fontWeight:'bold',fontSize:11,touchAction:'manipulation'}}>ACCESS DRIVE</button>}
              {gs?.codeEntry&&<><button onClick={submitCode} style={{background:'#ffd700',color:'#000',border:'none',padding:'5px 12px',borderRadius:5,fontFamily:'inherit',fontWeight:'bold',fontSize:11,touchAction:'manipulation'}}>SUBMIT</button>
              <button onClick={cancelCode} style={{background:'transparent',color:'#888',border:'1px solid #333',padding:'5px 8px',borderRadius:4,fontFamily:'inherit',fontSize:10,touchAction:'manipulation'}}>BACK</button></>}
              {gs?.won&&<button onClick={initGame} style={{background:'#ffd700',color:'#000',border:'none',padding:'6px 14px',borderRadius:6,fontFamily:'inherit',fontWeight:'bold',fontSize:12,touchAction:'manipulation'}}>Play Again</button>}
              <button onClick={initGame} style={{background:'transparent',color:'#445',border:'1px solid #223',padding:'4px 8px',borderRadius:4,fontFamily:'inherit',fontSize:9,touchAction:'manipulation'}}>New</button>
            </div>
          </div>
          <CrossDPad onMove={movePlayer} size={44}/>
        </div>
      ):(
        <div style={{color:'#556',fontSize:12,marginTop:6,textAlign:'center',lineHeight:1.5}}>
          <span style={{color:'#0f0'}}>▲</span>=NE <span style={{color:'#0f0'}}>▼</span>=SW <span style={{color:'#0f0'}}>◀</span>=NW <span style={{color:'#0f0'}}>▶</span>=SE
          {gs?.codeEntry?' · ▲▼ digit · ◀▶ slot · Enter submit · Esc cancel':
          ' · '}<span onClick={()=>setShowPhone(p=>!p)} style={{color:'#0af',cursor:'pointer',textDecoration:'underline'}}>Tab: Code Log</span>
          {' · '}<span onClick={initGame} style={{color:'#445',cursor:'pointer',textDecoration:'underline'}}>New Maze</span>
          {gs?.won&&<span style={{display:'block',marginTop:4}}><button onClick={initGame} style={{background:'#ffd700',color:'#000',border:'none',padding:'6px 16px',borderRadius:4,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:13}}>Play Again</button></span>}
        </div>
      )}
    </div>
  );
}

/* ===== FLOOR ===== */
function drawFloor(ctx,x,y,br,glowTs){const hw=TW/2,hh=TH/2;ctx.save();ctx.globalAlpha=1;
  ctx.beginPath();ctx.moveTo(x,y-hh);ctx.lineTo(x+hw,y);ctx.lineTo(x,y+hh);ctx.lineTo(x-hw,y);ctx.closePath();
  const fb=Math.floor(4+br*28);ctx.fillStyle=`rgb(${fb},${fb+1},${fb+5})`;ctx.fill();
  if(glowTs>0){const pulse=0.25+Math.sin(glowTs/400)*0.12;ctx.fillStyle=`rgba(255,200,0,${pulse*Math.max(0.2,br)})`;ctx.fill();}
  if(br>0.025){ctx.beginPath();ctx.moveTo(x,y-hh);ctx.lineTo(x+hw,y);ctx.lineTo(x,y+hh);ctx.lineTo(x-hw,y);ctx.closePath();ctx.clip();
    const subN=4,lc=`rgba(${30+Math.floor(br*35)},${32+Math.floor(br*35)},${42+Math.floor(br*40)},${Math.min(0.8,br*1.5)})`;ctx.strokeStyle=lc;ctx.lineWidth=0.4;
    for(let i=1;i<subN;i++){const t=i/subN;ctx.beginPath();ctx.moveTo(x-hw+hw*t,y-hh*t);ctx.lineTo(x+hw*t,y+hh*(1-t));ctx.stroke();ctx.beginPath();ctx.moveTo(x+hw-hw*t,y-hh*t);ctx.lineTo(x-hw*t,y+hh*(1-t));ctx.stroke();}}
  ctx.restore();}

function drawBroken(ctx,x,y,br,ts){ctx.save();ctx.globalAlpha=Math.min(1,br+0.05);
  const sz=8,by=y-10;ctx.beginPath();ctx.moveTo(x,by-sz);ctx.lineTo(x+sz,by+sz*0.6);ctx.lineTo(x-sz,by+sz*0.6);ctx.closePath();
  ctx.fillStyle=`rgba(255,${Math.floor(100+Math.sin(ts/200)*50)},0,${0.5+Math.sin(ts/150)*0.3})`;ctx.fill();
  ctx.font='bold 8px monospace';ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('⚡',x,by);
  ctx.globalAlpha=1;ctx.restore();}

/*
 * SERVER RACK — iso-parallel bottom edges
 * Top diamond at y-RH, bottom diamond at y (the floor tile)
 * Left face: (x-hw, y-RH) → (x, y+hh-RH) → (x, y+hh) → (x-hw, y)
 * Right face: (x+hw, y-RH) → (x, y+hh-RH) → (x, y+hh) → (x+hw, y)
 * Bottom edges are parallel to top edges.
 */
function drawRack(ctx,x,y,br,ts,srv,gx,gy,goldTs){
  const hw=TW/2,hh=TH/2,rH=RH,type=srv?srv.type:'tall',m=br;
  const leftC=`rgb(${Math.floor(6+m*52)},${Math.floor(7+m*56)},${Math.floor(10+m*72)})`;
  const rightC=`rgb(${Math.floor(8+m*60)},${Math.floor(9+m*64)},${Math.floor(12+m*82)})`;
  const topC=`rgb(${Math.floor(10+m*68)},${Math.floor(11+m*72)},${Math.floor(15+m*90)})`;
  const lineC=`rgba(${Math.floor(20+m*80)},${Math.floor(22+m*85)},${Math.floor(30+m*100)},${0.3+m*0.5})`;
  const lineDk=`rgba(0,0,0,${0.1+m*0.2})`;
  ctx.save();ctx.globalAlpha=1;

  // Top face
  ctx.beginPath();ctx.moveTo(x,y-hh-rH);ctx.lineTo(x+hw,y-rH);ctx.lineTo(x,y+hh-rH);ctx.lineTo(x-hw,y-rH);ctx.closePath();ctx.fillStyle=topC;ctx.fill();

  // Left face — bottom edge: (x-hw, y) to (x, y+hh) — parallel to top
  ctx.beginPath();ctx.moveTo(x-hw,y-rH);ctx.lineTo(x,y+hh-rH);ctx.lineTo(x,y+hh);ctx.lineTo(x-hw,y);ctx.closePath();ctx.fillStyle=leftC;ctx.fill();

  // Left face iso-parallel rack lines
  const sc=type==='blade'?8:type==='network'?5:type==='storage'?7:type==='wide'?4:6;
  for(let i=1;i<sc;i++){const off=i*(rH/sc);ctx.beginPath();ctx.moveTo(x-hw,y-rH+off);ctx.lineTo(x,y+hh-rH+off);ctx.strokeStyle=lineC;ctx.lineWidth=0.6;ctx.stroke();}
  // Left face details
  if(m>0.04){for(let i=0;i<sc;i++){const oT=i*(rH/sc)+2,oB=(i+1)*(rH/sc)-2,mid=(oT+oB)/2;
    if(type==='blade'){for(let v=1;v<6;v++){const t=v/6,vx=x-hw+hw*t;ctx.beginPath();ctx.moveTo(vx,y-rH+oT+hh*t);ctx.lineTo(vx,y-rH+oB+hh*t);ctx.strokeStyle=lineDk;ctx.lineWidth=0.4;ctx.stroke();}}
    else if(type==='network'){for(let r=0;r<2;r++)for(let c=1;c<7;c++){const t=c/7;ctx.fillStyle=`rgb(${Math.floor(4+m*28)},${Math.floor(5+m*30)},${Math.floor(8+m*38)})`;ctx.beginPath();ctx.arc(x-hw+hw*t,y-rH+oT+3+r*4+hh*t,1.2,0,Math.PI*2);ctx.fill();}}
    else if(type==='storage'){const hOff=oT+2;ctx.beginPath();ctx.moveTo(x-hw+hw*0.3,y-rH+hOff+hh*0.3);ctx.lineTo(x-hw+hw*0.7,y-rH+hOff+hh*0.7);ctx.strokeStyle=`rgba(${Math.floor(40+m*80)},${Math.floor(42+m*82)},${Math.floor(55+m*95)},${0.3+m*0.5})`;ctx.lineWidth=1.2;ctx.stroke();}
    else{for(let v=1;v<5;v++){const t=v/5,vx=x-hw+hw*t;ctx.beginPath();ctx.moveTo(vx,y-rH+oT+hh*t);ctx.lineTo(vx,y-rH+oB+hh*t);ctx.strokeStyle=lineDk;ctx.lineWidth=0.4;ctx.stroke();}}
    const scC=`rgb(${Math.floor(12+m*50)},${Math.floor(13+m*52)},${Math.floor(18+m*65)})`;ctx.fillStyle=scC;
    ctx.beginPath();ctx.arc(x-hw+hw*0.08,y-rH+mid+hh*0.08,1.2,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(x-hw+hw*0.92,y-rH+mid+hh*0.92,1.2,0,Math.PI*2);ctx.fill();}}

  // Right face — bottom edge: (x, y+hh) to (x+hw, y) — parallel to top
  ctx.beginPath();ctx.moveTo(x+hw,y-rH);ctx.lineTo(x,y+hh-rH);ctx.lineTo(x,y+hh);ctx.lineTo(x+hw,y);ctx.closePath();ctx.fillStyle=rightC;ctx.fill();
  for(let i=1;i<sc;i++){const off=i*(rH/sc);ctx.beginPath();ctx.moveTo(x,y+hh-rH+off);ctx.lineTo(x+hw,y-rH+off);ctx.strokeStyle=lineC;ctx.lineWidth=0.6;ctx.stroke();}

  // LEDs
  if(srv){srv.lights.forEach(l=>{const bv=Math.sin(ts/1000*l.blink+l.offset);if(bv>-0.2){const vis=Math.max(0.12,Math.max(0,(bv+0.2)/1.2)*Math.min(1,m*2.5));ctx.globalAlpha=vis;ctx.fillStyle=l.color;ctx.beginPath();ctx.arc(x+hw*l.xPos,y-rH+rH*l.yPos,1.4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}});}
  // Cables
  if(srv){const nC=type==='network'?4:type==='blade'?3:2;const cC=[[0,70,160],[160,40,0],[0,130,80],[100,0,120]];
    for(let ci=0;ci<nC;ci++){const cx0=x-hw+2+ci*2.5,cy0=y-rH+6+ci*5,cmx=x-hw-2-ci*1.5,cmy=y-rH*0.45+ci*3,cex=x-hw+1+ci*2,cey=y-4-ci,cc=cC[ci%4];
      ctx.beginPath();ctx.moveTo(cx0,cy0);ctx.bezierCurveTo(cmx,cmy,cmx+1,cmy+6,cex,cey);ctx.strokeStyle=`rgb(${Math.floor(8+m*22)},${Math.floor(8+m*22)},${Math.floor(12+m*30)})`;ctx.lineWidth=1.8-ci*0.2;ctx.stroke();
      if(m>0.08){ctx.beginPath();ctx.moveTo(cx0,cy0);ctx.bezierCurveTo(cmx,cmy,cmx+1,cmy+6,cex,cey);ctx.strokeStyle=`rgba(${cc[0]},${cc[1]},${cc[2]},${0.1+m*0.4})`;ctx.lineWidth=0.6;ctx.stroke();}}}
  // Center seam
  ctx.beginPath();ctx.moveTo(x,y+hh-rH);ctx.lineTo(x,y+hh);ctx.strokeStyle=lineC;ctx.lineWidth=0.5;ctx.stroke();

  // Golden glow overlay on rack faces if this is a drive tile neighbor
  if(goldTs>0){const pulse=0.12+Math.sin(goldTs/400)*0.06;
    ctx.globalAlpha=pulse*Math.max(0.2,m);ctx.fillStyle='rgba(255,200,0,0.5)';
    ctx.beginPath();ctx.moveTo(x-hw,y-rH);ctx.lineTo(x,y+hh-rH);ctx.lineTo(x,y+hh);ctx.lineTo(x-hw,y);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(x+hw,y-rH);ctx.lineTo(x,y+hh-rH);ctx.lineTo(x,y+hh);ctx.lineTo(x+hw,y);ctx.closePath();ctx.fill();
    ctx.globalAlpha=1;}

  ctx.restore();}

/* ===== CODE ENTRY ===== */
function drawCodeEntry(ctx,W,H,g){const ce=g.codeEntry;
  ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(0,0,W,H);const cx=W/2,cy=H/2-20;
  ctx.font='bold 18px "JetBrains Mono",monospace';ctx.fillStyle='#ffd700';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(`◆ DRIVE ${ce.driveId+1} — ENTER ACCESS CODE ◆`,cx,cy-60);
  const bW=50,bH2=60,gap=12,totalW=bW*4+gap*3;const sX=cx-totalW/2;
  for(let i=0;i<4;i++){const bx=sX+i*(bW+gap),by=cy-bH2/2;const ic=i===ce.cursor;
    ctx.fillStyle=ic?'rgba(0,170,255,0.15)':'rgba(20,25,35,0.9)';ctx.fillRect(bx,by,bW,bH2);
    ctx.strokeStyle=ic?'#0af':'#334';ctx.lineWidth=ic?2:1;ctx.strokeRect(bx,by,bW,bH2);
    ctx.font='9px "JetBrains Mono",monospace';ctx.fillStyle='#556';ctx.fillText(`SLOT ${i+1}`,bx+bW/2,by-8);
    ctx.font='bold 28px "JetBrains Mono",monospace';ctx.fillStyle=ic?'#0ff':'#aab';ctx.fillText(`${ce.digits[i]}`,bx+bW/2,by+bH2/2+2);
    if(ic){ctx.font='12px monospace';ctx.fillStyle='#0af';ctx.fillText('▲',bx+bW/2,by-20);ctx.fillText('▼',bx+bW/2,by+bH2+16);}}
  const frags=g.fragments.filter(f=>f.driveId===ce.driveId);
  ctx.font='12px "JetBrains Mono",monospace';ctx.fillStyle='#888';ctx.fillText('KNOWN FRAGMENTS:',cx,cy+55);
  if(frags.length===0){ctx.fillStyle='#555';ctx.fillText('None — fix ⚡ broken servers to find codes',cx,cy+75);}
  else{ctx.fillStyle='#0f0';ctx.fillText(frags.map(f=>`Slot${f.position+1}=${f.digit}`).join('   '),cx,cy+75);}
  ctx.font='11px "JetBrains Mono",monospace';ctx.fillStyle='#445';ctx.fillText('▲▼ change digit · ◀▶ move slot · Enter submit · Esc cancel',cx,cy+105);}

/* ===== AGENT — taller, centered, clean head ===== */
function drawAgent(ctx,x,y,ts,player,walk){ctx.save();const f=player.facing;
  const isM=walk.moving||Math.abs(walk.x-player.x)>0.05||Math.abs(walk.y-player.y)>0.05;
  const wP=isM?walk.walkCycle:0,stride=isM?Math.sin(wP):0,bob=isM?Math.abs(Math.sin(wP))*1.5:0;
  // Character anchored at tile center (x,y). Feet near y, body extends up.
  const footY=y-2; // slightly above tile center
  const py=footY-40-bob*0.4; // head area ~42px above feet
  const fc={nw:{dx:-1,lx:-2,fx:-1,as:-1},ne:{dx:1,lx:2,fx:1,as:1},sw:{dx:-1,lx:-2,fx:-1,as:-1},se:{dx:1,lx:2,fx:1,as:1}};
  const cf=fc[f],dx=cf.dx;

  // Shadow
  ctx.beginPath();ctx.ellipse(x,footY+4,11,5,0,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.2)';ctx.fill();

  // ── LEGS ──
  const lL=stride*7,rL=-stride*7;ctx.lineCap='round';
  // Back leg
  ctx.strokeStyle='#14171e';ctx.lineWidth=3.2;
  ctx.beginPath();ctx.moveTo(x+3+dx,py+28);ctx.quadraticCurveTo(x+3+dx-rL*0.2,py+34,x+3+dx-rL*0.4,footY+1);ctx.stroke();
  ctx.beginPath();ctx.ellipse(x+3+dx-rL*0.4,footY+2,3,1.3,0,0,Math.PI*2);ctx.fillStyle='#0a0a0e';ctx.fill();
  // Front leg
  ctx.strokeStyle='#1a1e26';ctx.lineWidth=3.5;
  ctx.beginPath();ctx.moveTo(x-3+dx,py+28);ctx.quadraticCurveTo(x-3+dx-lL*0.2,py+34,x-3+dx-lL*0.4,footY+1);ctx.stroke();
  ctx.beginPath();ctx.ellipse(x-3+dx-lL*0.4,footY+2,3,1.3,0,0,Math.PI*2);ctx.fillStyle='#0c0c10';ctx.fill();

  // ── TORSO ──
  ctx.beginPath();ctx.moveTo(x-7+dx,py+10);ctx.lineTo(x-8+dx,py+28);ctx.lineTo(x+8+dx,py+28);ctx.lineTo(x+7+dx,py+10);ctx.closePath();ctx.fillStyle='#181c26';ctx.fill();
  // Seam
  ctx.beginPath();ctx.moveTo(x+dx*0.5,py+10);ctx.lineTo(x+dx*0.5,py+28);ctx.strokeStyle='#10131a';ctx.lineWidth=0.6;ctx.stroke();
  // Lapels
  ctx.beginPath();ctx.moveTo(x-1.5+dx,py+10);ctx.lineTo(x+dx*0.5,py+15);ctx.lineTo(x+1.5+dx,py+10);ctx.strokeStyle='#222838';ctx.lineWidth=0.7;ctx.stroke();
  // Tie
  ctx.beginPath();ctx.moveTo(x+dx*0.5,py+11);ctx.lineTo(x-0.8+dx*0.5,py+24);ctx.lineTo(x+dx*0.5,py+25);ctx.lineTo(x+0.8+dx*0.5,py+24);ctx.closePath();ctx.fillStyle='#3a0e14';ctx.fill();
  // Collar
  ctx.beginPath();ctx.moveTo(x-2.5+dx,py+9);ctx.lineTo(x+dx*0.5,py+11);ctx.lineTo(x+2.5+dx,py+9);ctx.strokeStyle='#444e5c';ctx.lineWidth=0.8;ctx.stroke();

  // ── FREE ARM ──
  const freeX=x-cf.as*6+dx,freeS=isM?stride*6.5:0;
  ctx.strokeStyle='#181c26';ctx.lineWidth=2.8;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(freeX,py+11);ctx.lineTo(freeX+freeS*0.3,py+21);ctx.stroke();
  ctx.beginPath();ctx.moveTo(freeX+freeS*0.3,py+21);ctx.lineTo(freeX+freeS*0.4,py+29);ctx.stroke();
  ctx.beginPath();ctx.arc(freeX+freeS*0.4,py+30,1.8,0,Math.PI*2);ctx.fillStyle='#b09070';ctx.fill();

  // ── FLASHLIGHT ARM (steady) ──
  const flX=x+cf.as*6.5+dx,flEX=x+cf.fx*17,flEY=py+12;
  ctx.strokeStyle='#181c26';ctx.lineWidth=2.8;
  ctx.beginPath();ctx.moveTo(flX,py+11);ctx.lineTo(flX+cf.fx*2,py+18);ctx.stroke();
  ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(flX+cf.fx*2,py+18);ctx.lineTo(flEX,flEY);ctx.stroke();
  ctx.beginPath();ctx.arc(flEX,flEY,1.8,0,Math.PI*2);ctx.fillStyle='#b09070';ctx.fill();
  // Flashlight
  ctx.beginPath();ctx.moveTo(flEX,flEY);ctx.lineTo(flEX+cf.fx*8,flEY-1);ctx.strokeStyle='#48505a';ctx.lineWidth=3;ctx.lineCap='round';ctx.stroke();
  ctx.beginPath();ctx.arc(flEX+cf.fx*9,flEY-1.5,2.5,0,Math.PI*2);ctx.fillStyle='#383f48';ctx.fill();
  const flg=ctx.createRadialGradient(flEX+cf.fx*9,flEY-1.5,0,flEX+cf.fx*9,flEY-1.5,4);flg.addColorStop(0,'rgba(255,255,200,0.4)');flg.addColorStop(1,'transparent');ctx.fillStyle=flg;ctx.beginPath();ctx.arc(flEX+cf.fx*9,flEY-1.5,4,0,Math.PI*2);ctx.fill();

  // ── NECK ──
  ctx.fillStyle='#b09070';ctx.fillRect(x-1.5+dx*0.5,py+5,3,5);

  // ── HEAD — clean oval, no protruding features ──
  ctx.beginPath();ctx.ellipse(x+dx*0.3,py-1,5.5,6.5,0,0,Math.PI*2);ctx.fillStyle='#b89878';ctx.fill();
  // Hair (sits on top half of head)
  ctx.beginPath();ctx.ellipse(x+dx*0.3,py-4.5,5.8,4,0,Math.PI*0.92,Math.PI*2.08);ctx.fillStyle='#151210';ctx.fill();
  // Side hair (small, flush to head)
  ctx.beginPath();ctx.ellipse(x+dx*0.3-cf.lx*1,py-1,1.8,4,0,0,Math.PI*2);ctx.fillStyle='#151210';ctx.fill();
  // Eye (small dot on the visible side)
  ctx.beginPath();ctx.arc(x+dx*0.3+cf.lx*1.8,py-1,0.9,0,Math.PI*2);ctx.fillStyle='#12121a';ctx.fill();

  ctx.restore();}

function drawBeam(ctx,px,py,player,g){ctx.save();const fd=player.dir;
  const bI=toIso(player.x+fd.x*g.flashRadius,player.y+fd.y*g.flashRadius),pI=toIso(player.x,player.y);
  const d2x=bI.x-pI.x,d2y=bI.y-pI.y,len=Math.sqrt(d2x*d2x+d2y*d2y);if(len<1){ctx.restore();return;}
  const nx=d2x/len,ny=d2y/len,bL=g.flashRadius*TW*0.4;const fy=py-32;
  const ex=px+nx*bL,ey=fy+ny*bL;
  ctx.beginPath();ctx.moveTo(px,fy);ctx.lineTo(ex-ny*bL*0.45,ey-nx*bL*0.05);ctx.lineTo(ex+ny*bL*0.45,ey+nx*bL*0.05);ctx.closePath();
  const gr=ctx.createLinearGradient(px,fy,ex,ey);gr.addColorStop(0,'rgba(255,255,220,0.04)');gr.addColorStop(0.3,'rgba(255,255,200,0.018)');gr.addColorStop(1,'rgba(255,255,180,0)');
  ctx.fillStyle=gr;ctx.fill();ctx.restore();}

function drawHUD(ctx,W,H,g,ts,mob){const fs=mob?10:14,sf=mob?9:11,bH=mob?28:38;
  ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,0,W,bH);ctx.fillStyle='rgba(0,170,255,0.06)';ctx.fillRect(0,bH-1,W,1);
  ctx.font=`bold ${fs}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#0af';ctx.textAlign='left';ctx.fillText('◆ DATACENTER BREACH',10,bH*0.65);
  ctx.textAlign='right';ctx.fillStyle='#ffd700';let st='';for(let i=0;i<g.totalDrives;i++)st+=i<g.score?'◆ ':'◇ ';ctx.fillText(st,W-10,bH*0.65);
  ctx.font=`${sf}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#556';ctx.fillText(`${g.score}/${g.totalDrives} DRIVES`,W-10,bH*0.35);
  ctx.textAlign='left';ctx.fillStyle='#f84';ctx.fillText(`⚡ ${g.fragments.length}/${g.totalDrives*FRAGS_PER}`,10,bH*0.35);
  if(g.won){ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);const p=0.8+Math.sin(ts/300)*0.2;ctx.textAlign='center';
    ctx.font=`bold ${mob?18:30}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle=`rgba(255,215,0,${p})`;ctx.fillText('◆ MISSION COMPLETE ◆',W/2,H/2-20);
    ctx.font=`${mob?11:15}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#0af';ctx.fillText('All drives recovered. Data secured.',W/2,H/2+18);}
  const ms=mob?2:3,mx=10,my=H-MH*ms-10;ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillRect(mx-2,my-2,MW*ms+4,MH*ms+4);
  ctx.strokeStyle='rgba(0,170,255,0.15)';ctx.lineWidth=0.5;ctx.strokeRect(mx-2,my-2,MW*ms+4,MH*ms+4);
  for(let gy=0;gy<MH;gy++)for(let gx=0;gx<MW;gx++){const d=Math.sqrt((gx-g.player.x)**2+(gy-g.player.y)**2);
    if(d<g.flashRadius+2){ctx.fillStyle=g.maze[gy][gx]===1?'rgba(25,35,55,0.8)':'rgba(12,16,25,0.5)';ctx.fillRect(mx+gx*ms,my+gy*ms,ms,ms);}}
  ctx.fillStyle='#0ff';ctx.fillRect(mx+g.player.x*ms-1,my+g.player.y*ms-1,ms+1,ms+1);
  for(const d of g.drives){if(d.collected)continue;if(Math.sqrt((d.x-g.player.x)**2+(d.y-g.player.y)**2)<g.flashRadius){ctx.fillStyle='#ffd700';ctx.fillRect(mx+d.x*ms,my+d.y*ms,ms,ms);}}
  for(const bs of g.brokenServers){if(bs.fixed)continue;if(Math.sqrt((bs.x-g.player.x)**2+(bs.y-g.player.y)**2)<g.flashRadius){ctx.fillStyle='#f84';ctx.fillRect(mx+bs.x*ms,my+bs.y*ms,ms,ms);}}}
