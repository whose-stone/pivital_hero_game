import { useState, useEffect, useRef, useCallback } from "react";
import { submitScoreToFirebase, fetchTopScores, fetchLevelScores, saveClaimToFirebase } from "./firebase";
import emailjs from '@emailjs/browser';

const TW=96,TH=48,MW=31,MH=31,WS=0.06,RH=60,NUM_DRIVES=4,FRAGS_PER=4;
const USB_COLORS=[
  {name:'red',hex:'#ff2244',led:'#ff4466',r:255,g:34,b:68},
  {name:'blue',hex:'#2266ff',led:'#4488ff',r:34,g:102,b:255},
  {name:'green',hex:'#22ff66',led:'#44ff88',r:34,g:255,b:102},
  {name:'yellow',hex:'#ffdd22',led:'#ffee44',r:255,g:221,b:34},
];
const TOOL_TYPES=[
  {name:'Multimeter',hex:'#ff8833',r:255,g:136,b:51},
  {name:'Patch Cable',hex:'#33aaff',r:51,g:170,b:255},
  {name:'Firmware Key',hex:'#aa33ff',r:170,g:51,b:255},
  {name:'Coolant Pack',hex:'#33ffaa',r:51,g:255,b:170},
];
function genMaze(w,h){const m=Array.from({length:h},()=>Array(w).fill(1));const d=[[0,-2],[0,2],[-2,0],[2,0]];
  function sh(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function c(x,y){m[y][x]=0;for(const[dx,dy]of sh([...d])){const nx=x+dx,ny=y+dy;if(nx>0&&nx<w-1&&ny>0&&ny<h-1&&m[ny][nx]===1){m[y+dy/2][x+dx/2]=0;c(nx,ny);}}}
  c(1,1);for(let i=0;i<w*h*0.12;i++){const rx=1+Math.floor(Math.random()*(w-2)),ry=1+Math.floor(Math.random()*(h-2));
    if(m[ry][rx]===1){let a=0;if(ry>0&&m[ry-1][rx]===0)a++;if(ry<h-1&&m[ry+1][rx]===0)a++;if(rx>0&&m[ry][rx-1]===0)a++;if(rx<w-1&&m[ry][rx+1]===0)a++;if(a>=2)m[ry][rx]=0;}}return m;}
function generateProductKey(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const r=()=>Array.from({length:4},()=>c[Math.floor(Math.random()*c.length)]).join('');
  return `${r()}-${r()}-${r()}`;}
function placeOnFloor(maze,count,avoid){const items=[],av=new Set(avoid.map(p=>`${p.x},${p.y}`));let a=0;
  while(items.length<count&&a<3000){const x=1+Math.floor(Math.random()*(MW-2)),y=1+Math.floor(Math.random()*(MH-2));
    if(maze[y][x]===0&&!av.has(`${x},${y}`)){items.push({x,y});av.add(`${x},${y}`);}a++;}return items;}
function placeOnWall(maze,count,avoid){const items=[],av=new Set(avoid.map(p=>`${p.x},${p.y}`));let a=0;
  while(items.length<count&&a<5000){const x=1+Math.floor(Math.random()*(MW-2)),y=1+Math.floor(Math.random()*(MH-2));
    if(maze[y][x]===1&&!av.has(`${x},${y}`)){const adjs=[[0,-1],[0,1],[-1,0],[1,0]];
      const floorAdj=adjs.map(([dx,dy])=>({x:x+dx,y:y+dy})).filter(p=>p.x>=0&&p.x<MW&&p.y>=0&&p.y<MH&&maze[p.y][p.x]===0&&!av.has(`${p.x},${p.y}`));
      if(floorAdj.length>0){const adj=floorAdj[Math.floor(Math.random()*floorAdj.length)];items.push({x,y,adjX:adj.x,adjY:adj.y});av.add(`${x},${y}`);av.add(`${adj.x},${adj.y}`);}}a++;}return items;}
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
  const[gamePhase,setGamePhase]=useState('splash');const splashStartRef=useRef(Date.now());
  const keysRef=useRef(new Set()),lastMoveRef=useRef(0),particlesRef=useRef([]),gRef=useRef(null);
  const walkRef=useRef({x:1,y:1,moving:false,walkCycle:0}),camRef=useRef({x:0,y:0});
  const revealedRef=useRef(new Uint8Array(MW*MH));
  const notifRef=useRef({text:'',timer:0});const sparksRef=useRef([]);const arcsRef=useRef([]);const dustRef=useRef([]);
  const[showPhone,setShowPhone]=useState(false);
  const[showScoreboard,setShowScoreboard]=useState(false);
  const[showSplash,setShowSplash]=useState(true);
  const[showLevelSelect,setShowLevelSelect]=useState(false);
  const[showLevel10Win,setShowLevel10Win]=useState(false);
  const[level10Key,setLevel10Key]=useState('');
  const[userEmail,setUserEmail]=useState('');
  const[emailStatus,setEmailStatus]=useState('idle'); // idle, sending, sent, error
  const[firebaseScores,setFirebaseScores]=useState({overall:[],levels:{}});
  const[scoresLoading,setScoresLoading]=useState(false);
  const highScoresRef=useRef(null);
  if(!highScoresRef.current){try{highScoresRef.current=JSON.parse(localStorage.getItem('dcb_scores'))||{overall:[],levels:{}};}catch(e){highScoresRef.current={overall:[],levels:{}};}}
  const saveScoresLocal=()=>{try{localStorage.setItem('dcb_scores',JSON.stringify(highScoresRef.current));}catch(e){}};
  const refreshScores=useCallback(async()=>{setScoresLoading(true);
    const overall=await fetchTopScores(20);
    const lvlData={};for(let l=1;l<=10;l++){const ld=await fetchLevelScores(l,20);if(ld&&ld.length>0)lvlData[`lvl${l}`]=ld;}
    if(overall)setFirebaseScores({overall,levels:lvlData});
    setScoresLoading(false);},[]);
  useEffect(()=>{refreshScores();},[refreshScores]);
  const isMobile=useIsMobile();

  useEffect(()=>{const r=()=>{const vw=window.innerWidth,vh=window.innerHeight;
    if(vw<768)setDims({w:Math.min(vw*2,1000),h:Math.floor(vh*0.50*2)});
    else setDims({w:Math.min(1400,Math.floor(vw*0.96)),h:Math.min(850,Math.floor(vh*0.88))});};
    r();window.addEventListener('resize',r);return()=>window.removeEventListener('resize',r);},[]);

  const initGame=useCallback((level=1)=>{
    const maze=genMaze(MW,MH);const player={x:1,y:1,dir:{x:1,y:0},facing:'se'};
    const types=['tall','wide','blade','network','storage'];const servers=[];
    for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(maze[y][x]===1){let adj=false;[[0,-1],[0,1],[-1,0],[1,0]].forEach(([dx,dy])=>{const n2=x+dx,m2=y+dy;if(n2>=0&&n2<MW&&m2>=0&&m2<MH&&maze[m2][n2]===0)adj=true;});
      if(adj){const r=tR(x,y,42),type=types[Math.floor(r*types.length)],nL=2+Math.floor(tR(x,y,77)*4);
        servers.push({x,y,type,lights:Array.from({length:nL},(_,i)=>({color:['#00cc33','#cc2222','#0088cc','#cc8800','#cc00aa','#00ccaa'][Math.floor(tR(x,y,i*17)*6)],blink:0.3+tR(x,y,i*31)*4,offset:tR(x,y,i*53)*Math.PI*2,yPos:0.12+tR(x,y,i*71)*0.75,xPos:0.6+tR(x,y,i*91)*0.35}))})}}}
    const avoidList=[{x:1,y:1}];
    // Mechanic type: levels 1-5 = USB sticks, levels 6-8 = tools, levels 9-10 = tools + guards
    const useTools=level>=6;
    // Broken server count (always multiples of 4): lvl1=4, lvl2=8, lvl3=12, lvl4=16, lvl5=16, lvl6=4, lvl7=8, lvl8=12, lvl9+=12
    const brokenCount=level<=5?Math.min(16,4*level):level===6?4:level===7?8:12;
    const numDrives=brokenCount/4;
    const driveSpots=placeOnFloor(maze,numDrives,avoidList);avoidList.push(...driveSpots);
    const drives=driveSpots.map((s,i)=>({...s,code:Array.from({length:4},()=>Math.floor(Math.random()*10)),collected:false,id:i}));
    const levelColor=Math.floor(Math.random()*USB_COLORS.length);
    const brokenServers=[];
    // 4 broken servers per drive, each holds one fragment (digit position 0-3)
    for(let bi=0;bi<brokenCount;bi++){const di=bi%numDrives,fi=Math.floor(bi/numDrives);
      const spots=placeOnWall(maze,1,avoidList);if(spots.length===0)continue;
      spots.forEach(s=>avoidList.push({x:s.x,y:s.y},{x:s.adjX,y:s.adjY}));
      const pos=fi<FRAGS_PER?fi:Math.floor(Math.random()*FRAGS_PER);
      const toolType=useTools?bi%TOOL_TYPES.length:-1;
      brokenServers.push({x:spots[0].x,y:spots[0].y,adjX:spots[0].adjX,adjY:spots[0].adjY,driveId:di,position:pos,digit:drives[di].code[pos],fixed:false,colorIndex:useTools?toolType:levelColor,toolType});}
    // USB sticks (levels 1-5) or Tools (levels 6+)
    let usbSticks=[],tools=[];
    if(!useTools){const usbSpots=placeOnFloor(maze,brokenCount,avoidList);avoidList.push(...usbSpots);
      usbSticks=usbSpots.map((s,i)=>({...s,colorIndex:levelColor,collected:false,id:i}));}
    else{for(let ti=0;ti<TOOL_TYPES.length;ti++){const spots=placeOnFloor(maze,1,avoidList);avoidList.push(...spots);
      tools.push({...spots[0],toolType:ti,collected:false,id:ti});}}
    // Security guards (levels 9+)
    const guards=[];
    if(level>=9){const guardCount=1;const sightRange=level>=10?7:4;
      for(let gi=0;gi<guardCount;gi++){const gSpots=placeOnFloor(maze,1,avoidList.concat([{x:player.x,y:player.y}]));
        if(gSpots.length>0){avoidList.push(...gSpots);
          // Generate random patrol waypoints
          const patrolPts=placeOnFloor(maze,4,[gSpots[0]]);
          guards.push({x:gSpots[0].x,y:gSpots[0].y,walkPos:{x:gSpots[0].x,y:gSpots[0].y},dir:{x:0,y:1},patrol:[gSpots[0],...patrolPts],patrolIdx:0,moveTimer:0,sightRange,alertTimer:0});}}}
    // Par time for scoring (seconds) — beating par gives bonus
    const parTime=120+(level-1)*30;
    walkRef.current={x:1,y:1,moving:false,walkCycle:0};revealedRef.current=new Uint8Array(MW*MH);
    sparksRef.current=[];arcsRef.current=[];dustRef.current=[];notifRef.current={text:'',timer:0};setShowPhone(false);
    const p=toIso(1,1);camRef.current={x:p.x,y:p.y};
    const g={maze,player,drives,brokenServers,servers,score:0,totalDrives:numDrives,won:false,levelComplete:false,gameOver:false,gameOverReason:null,level,flashRadius:12,fragments:[],codeEntry:null,atDrive:null,usbSticks,tools,guards,usbInventory:[],collectedTools:[],atBrokenServer:null,cyberdeckEntry:null,levelColor,useTools,startTime:Date.now(),parTime,elapsed:0,levelScore:0,showScoreEntry:false,scoreInitials:['A','A','A'],scoreCursor:0};
    gRef.current=g;setGs({...g});
  },[]);
  useEffect(()=>{if(!showSplash)initGame();},[initGame,showSplash]);
  // Splash screen animation
  useEffect(()=>{if(gamePhase!=='splash')return;let aid;
    const splashLoop=(ts)=>{const cv=canvasRef.current;if(!cv){aid=requestAnimationFrame(splashLoop);return;}
      drawSplash(cv.getContext('2d'),cv.width,cv.height,ts,Date.now()-splashStartRef.current);
      aid=requestAnimationFrame(splashLoop);};
    aid=requestAnimationFrame(splashLoop);
    // Also allow click/touch to dismiss
    const dismiss=()=>{
      if(showLevel10Win){setShowLevel10Win(false);initGame(1);return;}
      if(Date.now()-splashStartRef.current>1500)setGamePhase('playing');
    };
    window.addEventListener('click',dismiss);window.addEventListener('touchstart',dismiss);
    return()=>{cancelAnimationFrame(aid);window.removeEventListener('click',dismiss);window.removeEventListener('touchstart',dismiss);};
  },[gamePhase]);
  useEffect(()=>{if(gamePhase==='playing'&&!gRef.current)initGame();},[initGame,gamePhase]);

  const startNextLevel=useCallback(()=>{const g=gRef.current;if(g)initGame(g.level+1);},[initGame]);

  // Screen: ▲=NE(0,-1) ▼=SW(0,1) ◀=NW(-1,0) ▶=SE(1,0)
  const movePlayer=useCallback((dx,dy)=>{
    const g=gRef.current;if(!g||g.won||g.gameOver)return;
    // Score initials entry
    if(g.levelComplete&&g.showScoreEntry){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?#';
      if(dy===-1){const ci=chars.indexOf(g.scoreInitials[g.scoreCursor]);g.scoreInitials[g.scoreCursor]=chars[(ci+1)%chars.length];}
      else if(dy===1){const ci=chars.indexOf(g.scoreInitials[g.scoreCursor]);g.scoreInitials[g.scoreCursor]=chars[(ci-1+chars.length)%chars.length];}
      else if(dx===-1)g.scoreCursor=Math.max(0,g.scoreCursor-1);
      else if(dx===1)g.scoreCursor=Math.min(2,g.scoreCursor+1);
      setGs({...g});return;}
    if(g.levelComplete)return;
    if(g.cyberdeckEntry)return;
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
      g.player.x=nx;g.player.y=ny;w.moving=true;g.atDrive=null;g.atBrokenServer=null;
      // USB stick pickup (levels 1-5)
      for(const usb of g.usbSticks){if(!usb.collected&&usb.x===nx&&usb.y===ny){usb.collected=true;
        g.usbInventory.push(usb.colorIndex);
        const col=USB_COLORS[usb.colorIndex];
        notifRef.current={text:`USB STICK COLLECTED: ${col.name.toUpperCase()}`,timer:180};
        const iso=toIso(nx,ny);for(let i=0;i<20;i++)particlesRef.current.push({x:iso.x,y:iso.y-20,vx:(Math.random()-0.5)*6,vy:-Math.random()*5-1,life:1,color:col.hex});}}
      // Tool pickup (levels 6+, reusable)
      for(const tool of g.tools){if(!tool.collected&&tool.x===nx&&tool.y===ny){tool.collected=true;
        g.collectedTools.push(tool.toolType);
        const tt=TOOL_TYPES[tool.toolType];
        notifRef.current={text:`TOOL COLLECTED: ${tt.name.toUpperCase()}`,timer:180};
        const iso=toIso(nx,ny);for(let i=0;i<20;i++)particlesRef.current.push({x:iso.x,y:iso.y-20,vx:(Math.random()-0.5)*6,vy:-Math.random()*5-1,life:1,color:tt.hex});}}
      // Check if adjacent to broken server
      for(let i=0;i<g.brokenServers.length;i++){const bs=g.brokenServers[i];
        if(!bs.fixed&&bs.adjX===nx&&bs.adjY===ny){g.atBrokenServer=i;
          notifRef.current={text:'PRESS ENTER TO ACCESS SERVER',timer:999};break;}}
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
      if(g.score>=g.totalDrives){g.levelComplete=true;g.won=false;
        g.elapsed=Math.floor((Date.now()-g.startTime)/1000);
        // Score: base 1000*level + time bonus (par - elapsed, min 0) * 10 * level
        const timeBonus=Math.max(0,g.parTime-g.elapsed);
        g.levelScore=1000*g.level+timeBonus*10*g.level;
        g.showScoreEntry=true;g.scoreInitials=['A','A','A'];g.scoreCursor=0;}setGs({...g});
    }else{notifRef.current={text:'ACCESS DENIED',timer:120};g.codeEntry=null;setGs({...g});}
  },[]);
  const cancelCode=useCallback(()=>{const g=gRef.current;if(g){g.codeEntry=null;g.cyberdeckEntry=null;setGs({...g});};},[]);

  const submitScore=useCallback(async()=>{
    const g=gRef.current;if(!g||!g.showScoreEntry)return;
    const initials=g.scoreInitials.join('');const entry={initials,score:g.levelScore,level:g.level,time:g.elapsed};
    // Save locally as fallback
    const hs=highScoresRef.current;
    const lk=`lvl${g.level}`;if(!hs.levels[lk])hs.levels[lk]=[];
    hs.levels[lk].push(entry);hs.levels[lk].sort((a,b)=>b.score-a.score);hs.levels[lk]=hs.levels[lk].slice(0,20);
    hs.overall.push(entry);hs.overall.sort((a,b)=>b.score-a.score);hs.overall=hs.overall.slice(0,20);
    saveScoresLocal();
    // Submit to Firebase
    await submitScoreToFirebase(entry);
    refreshScores();
    g.showScoreEntry=false;
    if(g.level===10){const key=generateProductKey();setLevel10Key(key);setShowLevel10Win(true);setUserEmail('');setEmailStatus('idle');}
    setGs({...g});
  },[refreshScores]);

  const handleSendCertificate=useCallback(async(e)=>{
    if(e)e.preventDefault();
    if(!userEmail||!userEmail.includes('@')){alert('Please enter a valid email address.');return;}
    const g=gRef.current;if(!g)return;
    setEmailStatus('sending');
    
    // 1. Save to Firestore
    const saved=await saveClaimToFirebase(userEmail,level10Key,g.levelScore);
    
    // 2. Send via EmailJS
    try{
      await emailjs.send('service_30qpyed','template_datacenter', {
        to_email: userEmail,
        product_key: level10Key,
        score: g.levelScore.toLocaleString(),
        date: new Date().toLocaleDateString()
      }, 'hLd3dUtYCuTR19cJr');
      setEmailStatus('sent');
    }catch(err){
      console.error('Email failed:',err);
      setEmailStatus(saved?'sent_db_only':'error'); // If DB saved but email failed
    }
  },[userEmail,level10Key]);

  const openCyberdeck=useCallback(()=>{
    const g=gRef.current;if(!g||g.atBrokenServer===null||g.cyberdeckEntry)return;
    const bs=g.brokenServers[g.atBrokenServer];
    let hasMatch=false;
    if(g.useTools){
      hasMatch=g.collectedTools.includes(bs.toolType);
      // Tools are reusable, don't remove
    }else{
      const usbIdx=g.usbInventory.indexOf(bs.colorIndex);
      hasMatch=usbIdx!==-1;
      if(hasMatch)g.usbInventory.splice(usbIdx,1);
    }
    g.cyberdeckEntry={brokenIndex:g.atBrokenServer,colorIndex:bs.colorIndex,toolType:bs.toolType,hasMatch,useTools:g.useTools,phase:hasMatch?'running':'denied',timer:0};
    notifRef.current={text:'',timer:0};setGs({...g});
  },[]);

  useEffect(()=>{const kd=(e)=>{const k=e.key.toLowerCase();keysRef.current.add(k);
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','escape','enter','tab'].includes(k))e.preventDefault();
    if(showLevel10Win){
      if(emailStatus==='sent'||emailStatus==='sent_db_only'){setShowLevel10Win(false);initGame(1);return;}
      return; // Prevent dismissal while entering email
    }
    if(gamePhase==='splash'){if(Date.now()-splashStartRef.current>1500){setGamePhase('playing');}return;}
    if(k==='escape')cancelCode();
    if(k==='enter'){const g=gRef.current;if(!g)return;
      if(g.levelComplete&&g.showScoreEntry)submitScore();
      else if(g.levelComplete&&!g.showScoreEntry)startNextLevel();
      else if(g.gameOver)initGame(g.level);
      else if(g.codeEntry)submitCode();
      else if(g.cyberdeckEntry)return;
      else if(g.atDrive!==null)openCodeEntry();
      else if(g.atBrokenServer!==null)openCyberdeck();}
    if(k==='tab'){e.preventDefault();setShowScoreboard(p=>!p);}};
    const ku=(e)=>{keysRef.current.delete(e.key.toLowerCase());};
    window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);return()=>{window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);};},[cancelCode,submitCode,submitScore,openCodeEntry,openCyberdeck,startNextLevel,initGame,gamePhase]);

  useEffect(()=>{if(!gs)return;let aid;
    const loop=(ts)=>{const g=gRef.current;if(!g){aid=requestAnimationFrame(loop);return;}
      const keys=keysRef.current;
      if(!isMobile&&ts-lastMoveRef.current>100&&!g.won&&!g.levelComplete&&!g.gameOver){let dx=0,dy=0;
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
      // Enhanced sparks for broken servers
      for(const bs of g.brokenServers){if(bs.fixed)continue;const col=g.useTools?TOOL_TYPES[bs.toolType]:USB_COLORS[bs.colorIndex];const iso=toIso(bs.x,bs.y);
        if(Math.random()<0.25){for(let si=0;si<2+Math.floor(Math.random()*2);si++){
          sparksRef.current.push({x:iso.x+(Math.random()-0.5)*30,y:iso.y-15-Math.random()*40,vx:(Math.random()-0.5)*4,vy:-Math.random()*3-0.5,life:0.8+Math.random()*0.5,color:col.hex,size:1.5+Math.random()*2});}}
        // Electrical arcs
        if(Math.random()<0.016){const pts=[];const n=3+Math.floor(Math.random()*3);
          for(let i=0;i<n;i++)pts.push({x:iso.x+(Math.random()-0.5)*36,y:iso.y-10-Math.random()*50});
          arcsRef.current.push({points:pts,life:0.3+Math.random()*0.2,color:col.hex,r:col.r,g:col.g,b:col.b});}}
      sparksRef.current=sparksRef.current.filter(s=>{s.x+=s.vx;s.y+=s.vy;s.vy+=0.05;s.life-=0.025;return s.life>0;});
      arcsRef.current=arcsRef.current.filter(a=>{a.life-=0.03;return a.life>0;});
      // Ambient dust
      if(dustRef.current.length<50&&Math.random()<0.3){const pI2=toIso(g.player.x,g.player.y);
        dustRef.current.push({x:pI2.x+(Math.random()-0.5)*TW*8,y:pI2.y+(Math.random()-0.5)*TH*8-30,vx:(Math.random()-0.5)*0.15,vy:-0.05-Math.random()*0.1,life:1,size:0.8+Math.random()*1.2});}
      dustRef.current=dustRef.current.filter(d=>{d.x+=d.vx;d.y+=d.vy;d.life-=0.002;return d.life>0;});
      particlesRef.current=particlesRef.current.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.1;p.life-=0.02;return p.life>0;});
      // Cyberdeck timer
      if(g.cyberdeckEntry){g.cyberdeckEntry.timer++;
        if(g.cyberdeckEntry.phase==='denied'&&g.cyberdeckEntry.timer>120){g.cyberdeckEntry=null;}
        if(g.cyberdeckEntry&&g.cyberdeckEntry.phase==='running'&&g.cyberdeckEntry.timer>180){
          const bs=g.brokenServers[g.cyberdeckEntry.brokenIndex];bs.fixed=true;
          g.fragments.push({driveId:bs.driveId,position:bs.position,digit:bs.digit});
          notifRef.current={text:`FRAGMENT: Drive ${bs.driveId+1} · Slot ${bs.position+1} = ${bs.digit}`,timer:180};
          const rcol=bs.toolType>=0?TOOL_TYPES[bs.toolType]:USB_COLORS[bs.colorIndex];
          const iso=toIso(bs.x,bs.y);for(let i=0;i<25;i++)particlesRef.current.push({x:iso.x,y:iso.y-30,vx:(Math.random()-0.5)*6,vy:-Math.random()*5-1,life:1,color:rcol.hex});
          g.cyberdeckEntry=null;g.atBrokenServer=null;}}
      if(notifRef.current.timer>0&&!(g.atDrive!==null&&!g.codeEntry)&&!(g.atBrokenServer!==null&&!g.cyberdeckEntry))notifRef.current.timer--;
      // Count-up timer (pause during cyberdeck and when level complete/game over)
      if(!g.levelComplete&&!g.gameOver&&!g.won&&!g.cyberdeckEntry){
        g.elapsed=Math.floor((Date.now()-g.startTime)/1000);}
      // Guard AI
      for(const gd of g.guards){if(g.gameOver||g.levelComplete)break;
        gd.moveTimer++;
        // Move every 8 frames (~133ms at 60fps, slower than player)
        if(gd.moveTimer>=8){gd.moveTimer=0;
          const tgt=gd.patrol[gd.patrolIdx];const gdx=Math.sign(tgt.x-gd.x),gdy=Math.sign(tgt.y-gd.y);
          let nx2=gd.x,ny2=gd.y;
          if(gdx!==0&&g.maze[gd.y][gd.x+gdx]===0)nx2=gd.x+gdx;
          else if(gdy!==0&&g.maze[gd.y+gdy]&&g.maze[gd.y+gdy][gd.x]===0)ny2=gd.y+gdy;
          else{gd.patrolIdx=(gd.patrolIdx+1)%gd.patrol.length;continue;}
          gd.x=nx2;gd.y=ny2;if(gdx||gdy)gd.dir={x:gdx||gd.dir.x,y:gdy||gd.dir.y};
          if(Math.abs(gd.x-tgt.x)<=1&&Math.abs(gd.y-tgt.y)<=1)gd.patrolIdx=(gd.patrolIdx+1)%gd.patrol.length;}
        // Smooth walk interpolation
        const wdx=gd.x-gd.walkPos.x,wdy=gd.y-gd.walkPos.y;
        gd.walkPos.x+=wdx*0.08;gd.walkPos.y+=wdy*0.08;
        // Line-of-sight check
        const px2=g.player.x,py2=g.player.y,dist2=Math.sqrt((px2-gd.x)**2+(py2-gd.y)**2);
        if(dist2<=gd.sightRange){let blocked=false;
          const steps=Math.ceil(dist2*2);
          for(let si=1;si<steps;si++){const t2=si/steps;
            const cx2=Math.round(gd.x+(px2-gd.x)*t2),cy2=Math.round(gd.y+(py2-gd.y)*t2);
            if(g.maze[cy2]&&g.maze[cy2][cx2]===1){blocked=true;break;}}
          if(!blocked){g.gameOver=true;g.gameOverReason='guard';}}}
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
    // Build broken server lookup map (wall tiles)
    const brokenMap=new Map();for(const bs of brokenServers){if(!bs.fixed)brokenMap.set(`${bs.x},${bs.y}`,bs);}
    // Build USB stick / tool lookup maps (floor tiles)
    const usbMap=new Map();for(const usb of g.usbSticks){if(!usb.collected)usbMap.set(`${usb.x},${usb.y}`,usb);}
    const toolMap=new Map();for(const tool of g.tools){if(!tool.collected)toolMap.set(`${tool.x},${tool.y}`,tool);}
    const pD=player.x+player.y;const tiles=[];
    for(let gy=0;gy<MH;gy++)for(let gx=0;gx<MW;gx++)tiles.push({gx,gy,d:gx+gy});tiles.sort((a,b)=>a.d-b.d);
    let pDrawn=false;
    for(const{gx,gy}of tiles){const td=gx+gy;
      if(!pDrawn&&td>pD){drawAgent(ctx,pIso.x,pIso.y,ts,player,w);drawBeam(ctx,pIso.x,pIso.y,player,g);pDrawn=true;}
      const idx=gy*MW+gx,lit=litMap[idx],revealed=rev[idx]===1;if(!revealed&&lit<0.005)continue;const iso=toIso(gx,gy);
      const isGold=driveSet.has(idx);
      if(maze[gy][gx]===0){drawFloor(ctx,iso.x,iso.y,revealed?Math.max(0.04,lit):lit,isGold?ts:0,gx,gy);
        const usb=usbMap.get(`${gx},${gy}`);if(usb)drawUsbStick(ctx,iso.x,iso.y,usb.colorIndex,ts,revealed?Math.max(0.04,lit):lit);
        const tool=toolMap.get(`${gx},${gy}`);if(tool)drawTool(ctx,iso.x,iso.y,tool.toolType,ts,revealed?Math.max(0.04,lit):lit);}
      else{const bsInfo=brokenMap.get(`${gx},${gy}`);
        drawRack(ctx,iso.x,iso.y,revealed?Math.max(0.06,lit):lit,ts,servers.find(s=>s.x===gx&&s.y===gy),gx,gy,isGold?ts:0,bsInfo);}}
    if(!pDrawn){drawAgent(ctx,pIso.x,pIso.y,ts,player,w);drawBeam(ctx,pIso.x,pIso.y,player,g);}
    // Draw guards
    for(const gd of g.guards){const gIso=toIso(gd.walkPos.x,gd.walkPos.y);const gLit=litMap[Math.round(gd.y)*MW+Math.round(gd.x)]||0;
      if(gLit>0.01||rev[Math.round(gd.y)*MW+Math.round(gd.x)])drawGuard(ctx,gIso.x,gIso.y,ts,gd,gLit);}
    // Sparks with color and glow
    for(const s of sparksRef.current){ctx.globalAlpha=s.life;ctx.fillStyle=s.color||`hsl(${30+Math.random()*20},100%,70%)`;ctx.beginPath();ctx.arc(s.x,s.y,(s.size||1.5)*s.life,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    // Electrical arcs
    for(const a of arcsRef.current){if(a.points.length<2)continue;ctx.globalAlpha=a.life*2;ctx.strokeStyle=a.color;ctx.lineWidth=1.5;ctx.shadowBlur=8;ctx.shadowColor=`rgba(${a.r},${a.g},${a.b},0.8)`;
      ctx.beginPath();ctx.moveTo(a.points[0].x,a.points[0].y);for(let i=1;i<a.points.length;i++)ctx.lineTo(a.points[i].x,a.points[i].y);ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=1;}
    // Dust particles
    for(const d of dustRef.current){ctx.globalAlpha=d.life*0.06;ctx.fillStyle='#8899aa';ctx.beginPath();ctx.arc(d.x,d.y,d.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    for(const p of particlesRef.current){ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,2.5*p.life,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    ctx.restore();
    const vg=ctx.createRadialGradient(W/2,H/2,W*0.3,W/2,H/2,Math.max(W,H)*0.55);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(0.7,'rgba(0,0,0,0.04)');vg.addColorStop(1,'rgba(0,0,0,0.4)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
    drawHUD(ctx,W,H,g,ts,isMobile);
    if(notifRef.current.timer>0){const n=notifRef.current;const a=Math.min(1,n.timer/30);ctx.globalAlpha=a;
      ctx.font='bold 13px "JetBrains Mono",monospace';const tw=ctx.measureText(n.text).width;
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(W/2-tw/2-20,H-100,tw+40,36);
      ctx.fillStyle=n.text.includes('DENIED')?'#ff4444':n.text.includes('RECOVERED')?'#ffd700':n.text.includes('ENTER')||n.text.includes('SERVER')?'#ffd700':n.text.includes('COLLECTED')?USB_COLORS[g.levelColor].hex:'#0ff';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n.text,W/2,H-82);ctx.globalAlpha=1;}
    if(g.codeEntry)drawCodeEntry(ctx,W,H,g);
    if(g.cyberdeckEntry)drawCyberdeck(ctx,W,H,g);
    if(showLevel10Win)drawLevel10Win(ctx,W,H,ts,level10Key,emailStatus);};

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
      <div style={{color:USB_COLORS[gs.levelColor].hex,fontSize:9,marginTop:8,textAlign:'center'}}>USB sticks: {gs.usbInventory.length} in inventory</div>
      <div style={{color:'#334',fontSize:9,marginTop:4,textAlign:'center'}}>Find {USB_COLORS[gs.levelColor].name} USB sticks to repair servers</div>
    </div>):null;

  const fs=firebaseScores;
  const scoreboardUI=showScoreboard?(
    <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:360,maxHeight:'80vh',overflow:'auto',background:'#0a0c12',border:'2px solid #ffd700',borderRadius:12,padding:16,boxShadow:'0 8px 40px rgba(0,0,0,0.9)',zIndex:20,fontFamily:'"JetBrains Mono",monospace'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{color:'#ffd700',fontSize:14,fontWeight:'bold'}}>GLOBAL HIGH SCORES</div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={refreshScores} style={{background:'transparent',border:'1px solid #334',color:scoresLoading?'#334':'#0af',borderRadius:4,padding:'2px 8px',cursor:'pointer',fontFamily:'inherit',fontSize:9}}>{scoresLoading?'...':'↻'}</button>
          <button onClick={()=>setShowScoreboard(false)} style={{background:'transparent',border:'1px solid #333',color:'#888',borderRadius:4,padding:'2px 8px',cursor:'pointer',fontFamily:'inherit',fontSize:10}}>✕</button>
        </div>
      </div>
      <div style={{color:'#0af',fontSize:11,fontWeight:'bold',marginBottom:6}}>OVERALL TOP 20</div>
      <div style={{borderTop:'1px solid #1a2040',marginBottom:12}}>
        {(fs.overall.length===0)?<div style={{color:'#334',fontSize:10,padding:6}}>{scoresLoading?'Loading...':'No scores yet'}</div>:
        fs.overall.map((e,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'3px 4px',fontSize:10,color:i<3?'#ffd700':i<10?'#0af':'#556',borderBottom:'1px solid #111'}}>
            <span>{String(i+1).padStart(2,' ')}. {e.initials}</span>
            <span>LVL{e.level}</span>
            <span>{Math.floor(e.time/60)}:{String(e.time%60).padStart(2,'0')}</span>
            <span style={{fontWeight:'bold'}}>{e.score.toLocaleString()}</span>
          </div>))}
      </div>
      {Object.keys(fs.levels).sort().map(lk=>(
        <div key={lk}>
          <div style={{color:'#f84',fontSize:10,fontWeight:'bold',marginBottom:4}}>LEVEL {lk.replace('lvl','')}</div>
          <div style={{borderTop:'1px solid #1a2040',marginBottom:10}}>
            {fs.levels[lk].slice(0,10).map((e,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'2px 4px',fontSize:9,color:i<3?'#ffd700':'#556',borderBottom:'1px solid #0a0a0a'}}>
                <span>{i+1}. {e.initials}</span>
                <span>{Math.floor(e.time/60)}:{String(e.time%60).padStart(2,'0')}</span>
                <span style={{fontWeight:'bold'}}>{e.score.toLocaleString()}</span>
              </div>))}
          </div>
        </div>))}
    </div>):null;

  const level10WinUI = showLevel10Win && (emailStatus === 'idle' || emailStatus === 'sending' || emailStatus === 'error' || emailStatus === 'sent_db_only') ? (
    <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:360,background:'rgba(10,15,30,0.95)',border:'2px solid #0af',borderRadius:12,padding:24,boxShadow:'0 0 50px rgba(0,170,255,0.4)',zIndex:100,fontFamily:'"JetBrains Mono",monospace',textAlign:'center'}}>
      <div style={{color:'#0af',fontSize:18,fontWeight:'bold',marginBottom:16}}>CLAIM YOUR CERTIFICATE</div>
      <div style={{color:'#8899aa',fontSize:12,marginBottom:20,lineHeight:1.5}}>Enter your email to receive your official Level 10 Mastery Certificate and AI Consultation voucher.</div>
      <form onSubmit={handleSendCertificate}>
        <input 
          type="email" 
          value={userEmail} 
          onChange={(e)=>setUserEmail(e.target.value)}
          placeholder="Enter your email address"
          disabled={emailStatus === 'sending'}
          style={{width:'100%',background:'#050810',border:'1px solid #1a2040',borderRadius:6,padding:'12px 16px',color:'#fff',fontSize:14,fontFamily:'inherit',marginBottom:16,outline:'none',boxSizing:'border-box'}}
          required
        />
        {emailStatus === 'error' && <div style={{color:'#ff4444',fontSize:11,marginBottom:12}}>Failed to send email. But don't worry, your claim is saved!</div>}
        {emailStatus === 'sent_db_only' && <div style={{color:'#ffaa00',fontSize:11,marginBottom:12}}>Claim saved to database, but email delivery failed.</div>}
        <button 
          type="submit"
          disabled={emailStatus === 'sending'}
          style={{width:'100%',background:emailStatus === 'sending' ? '#222' : 'linear-gradient(135deg,#0af,#0088cc)',color:'#fff',border:'none',padding:'14px',borderRadius:6,fontSize:14,fontWeight:'bold',fontFamily:'inherit',cursor:emailStatus === 'sending' ? 'default' : 'pointer',boxShadow:'0 0 15px rgba(0,170,255,0.2)'}}
        >
          {emailStatus === 'sending' ? 'SENDING...' : 'SEND MY CERTIFICATE'}
        </button>
      </form>
      <div style={{marginTop:16,fontSize:10,color:'#445'}}>* Your performance and email will be saved to the Pivital Systems Mastery Database.</div>
    </div>
  ) : null;

  const startFromSplash=(level=1)=>{setShowSplash(false);setShowLevelSelect(false);initGame(level);};

  if(showSplash){return(
    <div style={{position:'relative',width:'100vw',height:'100vh',background:'#000',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'"JetBrains Mono","Fira Code",monospace',overflow:'hidden',userSelect:'none',WebkitUserSelect:'none'}}>
      <div style={{textAlign:'center',maxWidth:500}}>
        <div style={{fontSize:isMobile?28:48,fontWeight:'bold',color:'#0af',letterSpacing:2,marginBottom:8}}>DATACENTER</div>
        <div style={{fontSize:isMobile?20:36,fontWeight:'bold',color:'#ffd700',letterSpacing:4,marginBottom:24}}>BREACH</div>
        <div style={{color:'#556',fontSize:isMobile?10:13,marginBottom:40,lineHeight:1.6}}>
          Infiltrate the data center. Recover the drives.<br/>Repair the servers. Escape undetected.
        </div>
        <button onClick={()=>startFromSplash(1)} style={{background:'linear-gradient(135deg,#0af,#07d)',color:'#fff',border:'none',padding:isMobile?'12px 32px':'16px 48px',borderRadius:8,fontSize:isMobile?16:20,fontWeight:'bold',fontFamily:'inherit',cursor:'pointer',letterSpacing:1,boxShadow:'0 0 20px rgba(0,170,255,0.3)'}}>
          START MISSION
        </button>
        {showLevelSelect&&(
          <div style={{marginTop:20,display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center'}}>
            {Array.from({length:10},(_,i)=>i+1).map(lv=>(
              <button key={lv} onClick={()=>startFromSplash(lv)} style={{background:'rgba(0,170,255,0.08)',color:'#0af',border:'1px solid rgba(0,170,255,0.3)',padding:'6px 12px',borderRadius:4,fontSize:11,fontFamily:'inherit',cursor:'pointer',minWidth:36}}>
                {lv}
              </button>))}
          </div>)}
        <div style={{position:'absolute',bottom:16,left:0,right:0,textAlign:'center'}}>
          <button onClick={()=>setShowLevelSelect(s=>!s)} style={{background:'none',border:'none',color:'#334',fontSize:9,fontFamily:'inherit',cursor:'pointer',padding:'4px 12px'}}>
            {showLevelSelect?'▼ HIDE LEVELS':'▲ SELECT LEVEL'}
          </button>
        </div>
      </div>
    </div>);}

  return (
    <div style={{position:'relative',width:'100vw',height:'100vh',background:'#000',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'"JetBrains Mono","Fira Code",monospace',overflow:'hidden',touchAction:'none',userSelect:'none',WebkitUserSelect:'none'}}>
      <canvas ref={canvasRef} width={dims.w} height={dims.h} style={{border:'1px solid #111828',borderRadius:4,maxWidth:'100%',maxHeight:isMobile?'50vh':'calc(100vh - 70px)',touchAction:'none'}}/>
      {phoneUI}
      {scoreboardUI}
      {level10WinUI}
      {isMobile?(
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 8px',width:'100%',boxSizing:'border-box'}}>
          <div style={{display:'flex',flexDirection:'column',gap:4,flex:1}}>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              <button onClick={()=>setShowPhone(p=>!p)} style={{background:'rgba(0,170,255,0.1)',color:'#0af',border:'1px solid rgba(0,170,255,0.3)',padding:'5px 10px',borderRadius:5,fontFamily:'inherit',fontSize:10,touchAction:'manipulation'}}>📱 Codes</button>
              <button onClick={()=>setShowScoreboard(p=>!p)} style={{background:'rgba(255,215,0,0.1)',color:'#ffd700',border:'1px solid rgba(255,215,0,0.3)',padding:'5px 10px',borderRadius:5,fontFamily:'inherit',fontSize:10,touchAction:'manipulation'}}>🏆</button>
              {gs?.atDrive!==null&&!gs?.codeEntry&&<button onClick={openCodeEntry} style={{background:'#ffd700',color:'#000',border:'none',padding:'5px 12px',borderRadius:5,fontFamily:'inherit',fontWeight:'bold',fontSize:11,touchAction:'manipulation'}}>ACCESS DRIVE</button>}
              {gs?.atBrokenServer!==null&&!gs?.cyberdeckEntry&&<button onClick={openCyberdeck} style={{background:USB_COLORS[gs.levelColor].hex,color:'#000',border:'none',padding:'5px 12px',borderRadius:5,fontFamily:'inherit',fontWeight:'bold',fontSize:11,touchAction:'manipulation'}}>ACCESS SERVER</button>}
              {gs?.codeEntry&&<><button onClick={submitCode} style={{background:'#ffd700',color:'#000',border:'none',padding:'5px 12px',borderRadius:5,fontFamily:'inherit',fontWeight:'bold',fontSize:11,touchAction:'manipulation'}}>SUBMIT</button>
              <button onClick={cancelCode} style={{background:'transparent',color:'#888',border:'1px solid #333',padding:'5px 8px',borderRadius:4,fontFamily:'inherit',fontSize:10,touchAction:'manipulation'}}>BACK</button></>}
              {gs?.levelComplete&&<button onClick={startNextLevel} style={{background:'#ffd700',color:'#000',border:'none',padding:'6px 14px',borderRadius:6,fontFamily:'inherit',fontWeight:'bold',fontSize:12,touchAction:'manipulation'}}>Next Level</button>}
              {gs?.gameOver&&<button onClick={()=>initGame(gs.level)} style={{background:'#ff4444',color:'#fff',border:'none',padding:'6px 14px',borderRadius:6,fontFamily:'inherit',fontWeight:'bold',fontSize:12,touchAction:'manipulation'}}>Retry</button>}
              <button onClick={()=>initGame(1)} style={{background:'transparent',color:'#445',border:'1px solid #223',padding:'4px 8px',borderRadius:4,fontFamily:'inherit',fontSize:9,touchAction:'manipulation'}}>Restart</button>
            </div>
          </div>
          <CrossDPad onMove={movePlayer} size={44}/>
        </div>
      ):(
        <div style={{color:'#556',fontSize:12,marginTop:6,textAlign:'center',lineHeight:1.5}}>
          <span style={{color:'#0f0'}}>▲</span>=NE <span style={{color:'#0f0'}}>▼</span>=SW <span style={{color:'#0f0'}}>◀</span>=NW <span style={{color:'#0f0'}}>▶</span>=SE
          {gs?.codeEntry?' · ▲▼ digit · ◀▶ slot · Enter submit · Esc cancel':
          ' · '}<span onClick={()=>setShowPhone(p=>!p)} style={{color:'#0af',cursor:'pointer',textDecoration:'underline'}}>Codes</span>
          {' · '}<span onClick={()=>setShowScoreboard(p=>!p)} style={{color:'#ffd700',cursor:'pointer',textDecoration:'underline'}}>Tab: Scores</span>
          {' · '}<span onClick={()=>initGame(1)} style={{color:'#445',cursor:'pointer',textDecoration:'underline'}}>Restart</span>
          {gs?.levelComplete&&<span style={{display:'block',marginTop:4}}><button onClick={startNextLevel} style={{background:'#ffd700',color:'#000',border:'none',padding:'6px 16px',borderRadius:4,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:13}}>Next Level</button></span>}
          {gs?.gameOver&&<span style={{display:'block',marginTop:4}}><button onClick={()=>initGame(gs.level)} style={{background:'#ff4444',color:'#fff',border:'none',padding:'6px 16px',borderRadius:4,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:13}}>Retry Level</button></span>}
        </div>
      )}
    </div>
  );
}

/* ===== SPLASH SCREEN ===== */
function drawSplash(ctx,W,H,ts,elapsed){
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
  const cx=W/2,cy=H/2;const t=elapsed/1000;
  // Scanlines
  ctx.globalAlpha=0.04;ctx.fillStyle='#0af';for(let i=0;i<H;i+=3)ctx.fillRect(0,i,W,1);ctx.globalAlpha=1;

  // Phase 1: DOS boot text (0-1.5s)
  if(t<4){
    const bootLines=['C:\\> BIOS CHECK... OK','C:\\> LOADING MAINFRAME OS v3.1','C:\\> INITIALIZING NETWORK STACK...','C:\\> MOUNTING /dev/datacenter','C:\\> WARNING: SECURITY BREACH DETECTED','C:\\> LAUNCHING RECOVERY PROTOCOL...','','C:\\> DATACENTER DISASTER v1.0'];
    ctx.font='13px "JetBrains Mono","Courier New",monospace';ctx.textAlign='left';
    const lineH=20,startY=40;
    for(let i=0;i<bootLines.length;i++){const lineT=t-i*0.18;if(lineT<0)break;
      const chars=Math.min(bootLines[i].length,Math.floor(lineT*40));
      ctx.fillStyle=bootLines[i].includes('WARNING')?'#ff4444':bootLines[i].includes('DATACENTER')?'#ffd700':'#0f0';
      ctx.fillText(bootLines[i].substring(0,chars),30,startY+i*lineH);
      // Blinking cursor on current line
      if(chars<bootLines[i].length&&Math.sin(ts/150)>0){ctx.fillStyle='#0f0';ctx.fillRect(30+chars*7.8,startY+i*lineH-12,8,14);}}
    // Loading bar
    if(t>1){const barW=W-80,barH=12,barX=40,barY=startY+bootLines.length*lineH+20;
      const prog=Math.min(1,(t-1)/2.5);
      ctx.fillStyle='#111';ctx.fillRect(barX,barY,barW,barH);
      ctx.fillStyle='#0f0';ctx.fillRect(barX+1,barY+1,(barW-2)*prog,barH-2);
      ctx.font='9px "JetBrains Mono",monospace';ctx.fillStyle='#0f0';ctx.fillText(`${Math.floor(prog*100)}%`,barX+barW+8,barY+10);}}

  // Phase 2: Title card (fades in from 2s)
  if(t>2){const fadeIn=Math.min(1,(t-2)/0.8);ctx.globalAlpha=fadeIn;
    // Dark overlay to cover boot text
    ctx.fillStyle=`rgba(0,0,0,${fadeIn*0.9})`;ctx.fillRect(0,0,W,H);

    // Server rack silhouettes in background
    const rackW=40,rackH=120,gap=20,numRacks=Math.floor(W/(rackW+gap));
    for(let i=0;i<numRacks;i++){const rx=i*(rackW+gap)+gap/2,ry=cy+30;
      // Rack body
      ctx.fillStyle=`rgba(15,18,28,${0.6+Math.sin(ts/1000+i)*0.15})`;ctx.fillRect(rx,ry-rackH,rackW,rackH);
      ctx.strokeStyle='rgba(30,40,60,0.5)';ctx.lineWidth=0.5;ctx.strokeRect(rx,ry-rackH,rackW,rackH);
      // Rack slots
      for(let s=0;s<6;s++){const sy=ry-rackH+8+s*(rackH/6);ctx.fillStyle='rgba(20,25,40,0.8)';ctx.fillRect(rx+3,sy,rackW-6,rackH/6-4);
        // Blinking LEDs
        for(let l=0;l<3;l++){const on=Math.sin(ts/300+i*2+s*1.5+l*3)>0.3;
          ctx.fillStyle=on?(['#00ff44','#ff2244','#0088ff','#ffaa00'][(i+s+l)%4]):'#111';
          ctx.beginPath();ctx.arc(rx+rackW-8+l*3,sy+5,1.2,0,Math.PI*2);ctx.fill();}}}
    // Spark effects on random racks
    for(let sp=0;sp<3;sp++){const sx=((Math.sin(ts/400+sp*7)*0.5+0.5)*W*0.8)+W*0.1;
      const sy=cy-50-Math.random()*40;ctx.fillStyle=`rgba(255,${150+Math.floor(Math.random()*100)},0,${0.3+Math.random()*0.4})`;
      ctx.beginPath();ctx.arc(sx,sy,1+Math.random()*2,0,Math.PI*2);ctx.fill();}

    // Title: DATACENTER
    ctx.font=`bold ${Math.min(60,W*0.07)}px "JetBrains Mono","Fira Code",monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    // Glow effect
    ctx.shadowBlur=20;ctx.shadowColor='#0af';ctx.fillStyle='#0af';ctx.fillText('DATACENTER',cx,cy-70);
    ctx.shadowBlur=0;
    // Title: DISASTER
    ctx.font=`bold ${Math.min(72,W*0.085)}px "JetBrains Mono","Fira Code",monospace`;
    ctx.shadowBlur=25;ctx.shadowColor='#ff2244';ctx.fillStyle='#ff2244';ctx.fillText('DISASTER',cx,cy-20);
    ctx.shadowBlur=0;
    // Subtitle
    ctx.font=`${Math.min(14,W*0.018)}px "JetBrains Mono",monospace`;ctx.fillStyle='#556';
    ctx.fillText('A PIVITAL SYSTEMS GAME',cx,cy+15);

    // Electrical arc across title
    if(Math.sin(ts/500)>0.7){ctx.strokeStyle='rgba(0,170,255,0.6)';ctx.lineWidth=1.5;ctx.shadowBlur=8;ctx.shadowColor='#0af';
      ctx.beginPath();let ax=cx-120,ay=cy-45;ctx.moveTo(ax,ay);
      for(let i=0;i<6;i++){ax+=40+Math.random()*10;ay=cy-45+(Math.random()-0.5)*30;ctx.lineTo(ax,ay);}ctx.stroke();ctx.shadowBlur=0;}

    // "PRESS ANY KEY" blink (after 3s)
    if(t>3.5){const blink=Math.sin(ts/400)>0?1:0.2;ctx.globalAlpha=blink*fadeIn;
      ctx.font=`bold ${Math.min(18,W*0.025)}px "JetBrains Mono",monospace`;ctx.fillStyle='#ffd700';
      ctx.fillText('PRESS ANY KEY TO START',cx,cy+60);
      ctx.globalAlpha=fadeIn;}

    // Copyright / version
    ctx.font=`${Math.min(10,W*0.013)}px "JetBrains Mono",monospace`;ctx.fillStyle='#334';
    ctx.fillText('2026 PIVITAL SYSTEMS',cx,H-20);
    ctx.globalAlpha=1;}

  // CRT vignette
  const vg=ctx.createRadialGradient(cx,cy,W*0.25,cx,cy,Math.max(W,H)*0.6);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(0.8,'rgba(0,0,0,0.15)');vg.addColorStop(1,'rgba(0,0,0,0.6)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);}

function drawLevel10Win(ctx,W,H,ts,key,emailStatus){
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
  const cx=W/2,cy=H/2;
  // Background Matrix effect (very subtle)
  ctx.font='10px monospace';ctx.globalAlpha=0.03;ctx.fillStyle='#0f0';
  for(let i=0;i<W;i+=20)for(let j=0;j<H;j+=20){if(Math.random()>0.8)ctx.fillText(Math.floor(Math.random()*10),i,j);}
  ctx.globalAlpha=1;

  // Certificate Border
  ctx.strokeStyle='#ffd700';ctx.lineWidth=2;ctx.strokeRect(40,40,W-80,H-80);
  ctx.strokeStyle='#ffd700';ctx.lineWidth=1;ctx.strokeRect(50,50,W-100,H-100);

  // Title
  ctx.shadowBlur=15;ctx.shadowColor='#ffd700';ctx.fillStyle='#ffd700';ctx.textAlign='center';
  ctx.font='bold 32px "JetBrains Mono",monospace';ctx.fillText('◆ DATACENTER BREACH MASTERY ◆',cx,cy-140);
  ctx.shadowBlur=0;

  ctx.font='16px "JetBrains Mono",monospace';ctx.fillStyle='#0af';
  ctx.fillText('SECURITY CLEARANCE LEVEL 10 GRANTED',cx,cy-90);

  // Key Area
  const boxW=420,boxH=100;
  ctx.fillStyle='rgba(10,20,40,0.9)';ctx.fillRect(cx-boxW/2,cy-40,boxW,boxH);
  ctx.strokeStyle='#0af';ctx.lineWidth=2;ctx.strokeRect(cx-boxW/2,cy-40,boxW,boxH);
  
  ctx.font='12px "JetBrains Mono",monospace';ctx.fillStyle='#888';
  ctx.fillText('PIVITAL SYSTEMS PRODUCT KEY',cx,cy-20);
  
  ctx.font='bold 36px "Courier New",monospace';ctx.fillStyle='#fff';
  ctx.shadowBlur=10;ctx.shadowColor='#fff';
  ctx.fillText(key,cx,cy+30);
  ctx.shadowBlur=0;

  // Rewards
  ctx.font='bold 20px "JetBrains Mono",monospace';ctx.fillStyle='#0f0';
  ctx.fillText('REWARD UNLOCKED: 4 FREE HOURS OF AI CONSULTATION',cx,cy+100);
  
  ctx.font='13px "JetBrains Mono",monospace';ctx.fillStyle='#556';
  ctx.fillText('Enter your email below to receive your official certificate.',cx,cy+130);

  // Branding
  ctx.font='bold 14px "JetBrains Mono",monospace';ctx.fillStyle='#ffd700';
  ctx.fillText('PIVITAL SYSTEMS — CORPORATE ELITE DIVISION',cx,cy+180);

  // Dismiss button prompt only if sent
  if((emailStatus==='sent'||emailStatus==='sent_db_only')&&Math.sin(ts/400)>0){
    ctx.font='12px "JetBrains Mono",monospace';ctx.fillStyle='#0af';
    ctx.fillText('CERTIFICATE SENT! PRESS ANY KEY TO CONTINUE',cx,H-70);
  }
}

/* ===== FLOOR ===== */
function drawFloor(ctx,x,y,br,glowTs,gx,gy){const hw=TW/2,hh=TH/2;ctx.save();ctx.globalAlpha=1;
  ctx.beginPath();ctx.moveTo(x,y-hh);ctx.lineTo(x+hw,y);ctx.lineTo(x,y+hh);ctx.lineTo(x-hw,y);ctx.closePath();
  // Per-tile brightness variation
  const tv=gx!==undefined?Math.floor((tR(gx,gy,123)-0.5)*6):0;
  const fb=Math.floor(4+br*28)+tv;ctx.fillStyle=`rgb(${fb},${fb+1},${fb+5})`;ctx.fill();
  if(glowTs>0){const pulse=0.25+Math.sin(glowTs/400)*0.12;ctx.fillStyle=`rgba(255,200,0,${pulse*Math.max(0.2,br)})`;ctx.fill();}
  if(br>0.025){ctx.beginPath();ctx.moveTo(x,y-hh);ctx.lineTo(x+hw,y);ctx.lineTo(x,y+hh);ctx.lineTo(x-hw,y);ctx.closePath();ctx.clip();
    const subN=4,lc=`rgba(${30+Math.floor(br*35)},${32+Math.floor(br*35)},${42+Math.floor(br*40)},${Math.min(0.8,br*1.5)})`;ctx.strokeStyle=lc;ctx.lineWidth=0.4;
    for(let i=1;i<subN;i++){const t=i/subN;ctx.beginPath();ctx.moveTo(x-hw+hw*t,y-hh*t);ctx.lineTo(x+hw*t,y+hh*(1-t));ctx.stroke();ctx.beginPath();ctx.moveTo(x+hw-hw*t,y-hh*t);ctx.lineTo(x-hw*t,y+hh*(1-t));ctx.stroke();}}
  ctx.restore();}

function drawTool(ctx,x,y,toolType,ts,br){ctx.save();
  const tt=TOOL_TYPES[toolType];const bob=Math.sin(ts/350+toolType*1.8)*4;
  const tx=x,ty=y-RH+8+bob;ctx.globalAlpha=Math.min(1,br*2+0.15);
  ctx.shadowBlur=10;ctx.shadowColor=tt.hex;
  // Tool body (wrench/key shape)
  ctx.fillStyle=tt.hex;ctx.beginPath();
  ctx.moveTo(tx-5,ty-1);ctx.lineTo(tx+3,ty-4);ctx.lineTo(tx+6,ty-2);ctx.lineTo(tx-2,ty+1);ctx.closePath();ctx.fill();
  ctx.fillStyle=`rgba(${Math.floor(tt.r*0.7)},${Math.floor(tt.g*0.7)},${Math.floor(tt.b*0.7)},1)`;
  ctx.beginPath();ctx.moveTo(tx-5,ty-1);ctx.lineTo(tx-2,ty+1);ctx.lineTo(tx-2,ty-3);ctx.lineTo(tx-5,ty-5);ctx.closePath();ctx.fill();
  // Handle
  ctx.fillStyle='#888';ctx.fillRect(tx+3,ty-4,2,3);
  ctx.shadowBlur=0;
  ctx.globalAlpha=0.15*Math.min(1,br);ctx.fillStyle=tt.hex;ctx.beginPath();ctx.ellipse(x,y,8,4,0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;ctx.restore();}

function drawUsbStick(ctx,x,y,colorIndex,ts,br){ctx.save();
  const col=USB_COLORS[colorIndex];const bob=Math.sin(ts/400+colorIndex*1.5)*4;
  const ux=x,uy=y-RH+8+bob;ctx.globalAlpha=Math.min(1,br*2+0.15);
  // Glow
  ctx.shadowBlur=10;ctx.shadowColor=col.hex;
  // USB body (small isometric rectangle)
  ctx.fillStyle=col.hex;ctx.beginPath();
  ctx.moveTo(ux-4,uy-2);ctx.lineTo(ux+2,uy-5);ctx.lineTo(ux+6,uy-3);ctx.lineTo(ux,uy);ctx.closePath();ctx.fill();
  // USB top
  ctx.fillStyle=col.led;ctx.beginPath();
  ctx.moveTo(ux-4,uy-2);ctx.lineTo(ux+2,uy-5);ctx.lineTo(ux+2,uy-9);ctx.lineTo(ux-4,uy-6);ctx.closePath();ctx.fill();
  // USB side
  ctx.fillStyle=`rgba(${Math.floor(col.r*0.6)},${Math.floor(col.g*0.6)},${Math.floor(col.b*0.6)},1)`;ctx.beginPath();
  ctx.moveTo(ux+2,uy-5);ctx.lineTo(ux+6,uy-3);ctx.lineTo(ux+6,uy-7);ctx.lineTo(ux+2,uy-9);ctx.closePath();ctx.fill();
  // Connector tab
  ctx.fillStyle='#aaa';ctx.beginPath();
  ctx.moveTo(ux-2,uy-6.5);ctx.lineTo(ux+1,uy-8);ctx.lineTo(ux+1,uy-10);ctx.lineTo(ux-2,uy-8.5);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;
  // Floor highlight
  ctx.globalAlpha=0.15*Math.min(1,br);ctx.fillStyle=col.hex;ctx.beginPath();ctx.ellipse(x,y,8,4,0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;ctx.restore();}

/*
 * SERVER RACK — iso-parallel bottom edges
 * Top diamond at y-RH, bottom diamond at y (the floor tile)
 * Left face: (x-hw, y-RH) → (x, y+hh-RH) → (x, y+hh) → (x-hw, y)
 * Right face: (x+hw, y-RH) → (x, y+hh-RH) → (x, y+hh) → (x+hw, y)
 * Bottom edges are parallel to top edges.
 */
function drawRack(ctx,x,y,br,ts,srv,gx,gy,goldTs,bsInfo){
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

  // Left face iso-parallel rack lines (visible at medium+ brightness)
  const sc=type==='blade'?8:type==='network'?5:type==='storage'?7:type==='wide'?4:6;
  if(m>0.1){for(let i=1;i<sc;i++){const off=i*(rH/sc);ctx.beginPath();ctx.moveTo(x-hw,y-rH+off);ctx.lineTo(x,y+hh-rH+off);ctx.strokeStyle=lineC;ctx.lineWidth=0.6;ctx.stroke();}}
  // Left face details (visible at high brightness)
  if(m>0.3){for(let i=0;i<sc;i++){const oT=i*(rH/sc)+2,oB=(i+1)*(rH/sc)-2,mid=(oT+oB)/2;
    if(type==='blade'){for(let v=1;v<6;v++){const t=v/6,vx=x-hw+hw*t;ctx.beginPath();ctx.moveTo(vx,y-rH+oT+hh*t);ctx.lineTo(vx,y-rH+oB+hh*t);ctx.strokeStyle=lineDk;ctx.lineWidth=0.4;ctx.stroke();}}
    else if(type==='network'){for(let r=0;r<2;r++)for(let c=1;c<7;c++){const t=c/7;ctx.fillStyle=`rgb(${Math.floor(4+m*28)},${Math.floor(5+m*30)},${Math.floor(8+m*38)})`;ctx.beginPath();ctx.arc(x-hw+hw*t,y-rH+oT+3+r*4+hh*t,1.2,0,Math.PI*2);ctx.fill();}}
    else if(type==='storage'){const hOff=oT+2;ctx.beginPath();ctx.moveTo(x-hw+hw*0.3,y-rH+hOff+hh*0.3);ctx.lineTo(x-hw+hw*0.7,y-rH+hOff+hh*0.7);ctx.strokeStyle=`rgba(${Math.floor(40+m*80)},${Math.floor(42+m*82)},${Math.floor(55+m*95)},${0.3+m*0.5})`;ctx.lineWidth=1.2;ctx.stroke();}
    else{for(let v=1;v<5;v++){const t=v/5,vx=x-hw+hw*t;ctx.beginPath();ctx.moveTo(vx,y-rH+oT+hh*t);ctx.lineTo(vx,y-rH+oB+hh*t);ctx.strokeStyle=lineDk;ctx.lineWidth=0.4;ctx.stroke();}}
    const scC=`rgb(${Math.floor(12+m*50)},${Math.floor(13+m*52)},${Math.floor(18+m*65)})`;ctx.fillStyle=scC;
    ctx.beginPath();ctx.arc(x-hw+hw*0.08,y-rH+mid+hh*0.08,1.2,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(x-hw+hw*0.92,y-rH+mid+hh*0.92,1.2,0,Math.PI*2);ctx.fill();}}

  // Right face — bottom edge: (x, y+hh) to (x+hw, y) — parallel to top
  ctx.beginPath();ctx.moveTo(x+hw,y-rH);ctx.lineTo(x,y+hh-rH);ctx.lineTo(x,y+hh);ctx.lineTo(x+hw,y);ctx.closePath();ctx.fillStyle=rightC;ctx.fill();
  if(m>0.1){for(let i=1;i<sc;i++){const off=i*(rH/sc);ctx.beginPath();ctx.moveTo(x,y+hh-rH+off);ctx.lineTo(x+hw,y-rH+off);ctx.strokeStyle=lineC;ctx.lineWidth=0.6;ctx.stroke();}}

  // LEDs
  if(bsInfo&&!bsInfo.fixed){const col=bsInfo.toolType>=0?TOOL_TYPES[bsInfo.toolType]:USB_COLORS[bsInfo.colorIndex];
    if(srv){srv.lights.forEach(l=>{const bv=Math.sin(ts/150+l.offset*2);const vis=Math.max(0.3,(bv*0.5+0.5)*Math.min(1,m*3));ctx.globalAlpha=vis;ctx.shadowBlur=6;ctx.shadowColor=col.hex;ctx.fillStyle=col.led;ctx.beginPath();ctx.arc(x+hw*l.xPos,y-rH+rH*l.yPos,2.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;});}
    // Additional dramatic LEDs on left face
    for(let i=0;i<4;i++){const bv=Math.sin(ts/120+i*1.5);const vis=Math.max(0.2,(bv*0.5+0.5)*Math.min(1,m*3));ctx.globalAlpha=vis;ctx.shadowBlur=5;ctx.shadowColor=col.hex;ctx.fillStyle=col.led;
      const lt=0.15+i*0.2,ly=0.15+i*0.22;ctx.beginPath();ctx.arc(x-hw+hw*lt,y-rH+rH*ly+hh*lt,2,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;}}
  else if(srv){srv.lights.forEach(l=>{const bv=Math.sin(ts/1000*l.blink+l.offset);if(bv>-0.2){const vis=Math.max(0.12,Math.max(0,(bv+0.2)/1.2)*Math.min(1,m*2.5));ctx.globalAlpha=vis;ctx.fillStyle=l.color;ctx.beginPath();ctx.arc(x+hw*l.xPos,y-rH+rH*l.yPos,1.4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}});}
  // Cables (visible at medium+ brightness)
  if(srv&&m>0.2){const nC=type==='network'?4:type==='blade'?3:2;const cC=[[0,70,160],[160,40,0],[0,130,80],[100,0,120]];
    for(let ci=0;ci<nC;ci++){const cx0=x-hw+2+ci*2.5,cy0=y-rH+6+ci*5,cmx=x-hw-2-ci*1.5,cmy=y-rH*0.45+ci*3,cex=x-hw+1+ci*2,cey=y-4-ci,cc=cC[ci%4];
      ctx.beginPath();ctx.moveTo(cx0,cy0);ctx.bezierCurveTo(cmx,cmy,cmx+1,cmy+6,cex,cey);ctx.strokeStyle=`rgb(${Math.floor(8+m*22)},${Math.floor(8+m*22)},${Math.floor(12+m*30)})`;ctx.lineWidth=1.8-ci*0.2;ctx.stroke();
      if(m>0.08){ctx.beginPath();ctx.moveTo(cx0,cy0);ctx.bezierCurveTo(cmx,cmy,cmx+1,cmy+6,cex,cey);ctx.strokeStyle=`rgba(${cc[0]},${cc[1]},${cc[2]},${0.1+m*0.4})`;ctx.lineWidth=0.6;ctx.stroke();}}}
  // Center seam
  ctx.beginPath();ctx.moveTo(x,y+hh-rH);ctx.lineTo(x,y+hh);ctx.strokeStyle=lineC;ctx.lineWidth=0.5;ctx.stroke();

  // Broken server color pulsing overlay
  if(bsInfo&&!bsInfo.fixed){const col=bsInfo.toolType>=0?TOOL_TYPES[bsInfo.toolType]:USB_COLORS[bsInfo.colorIndex];const pulse=0.08+Math.sin(ts/200)*0.06;
    ctx.globalAlpha=pulse*Math.max(0.2,m);ctx.fillStyle=`rgba(${col.r},${col.g},${col.b},0.5)`;
    ctx.beginPath();ctx.moveTo(x-hw,y-rH);ctx.lineTo(x,y+hh-rH);ctx.lineTo(x,y+hh);ctx.lineTo(x-hw,y);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(x+hw,y-rH);ctx.lineTo(x,y+hh-rH);ctx.lineTo(x,y+hh);ctx.lineTo(x+hw,y);ctx.closePath();ctx.fill();
    ctx.globalAlpha=1;}
  // Golden glow overlay on rack faces if this is a drive tile neighbor
  else if(goldTs>0){const pulse=0.12+Math.sin(goldTs/400)*0.06;
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
  if(frags.length===0){ctx.fillStyle='#555';ctx.fillText('None — use USB sticks to repair servers',cx,cy+75);}
  else{ctx.fillStyle='#0f0';ctx.fillText(frags.map(f=>`Slot${f.position+1}=${f.digit}`).join('   '),cx,cy+75);}
  ctx.font='11px "JetBrains Mono",monospace';ctx.fillStyle='#445';ctx.fillText('▲▼ change digit · ◀▶ move slot · Enter submit · Esc cancel',cx,cy+105);}

/* ===== CYBERDECK POPUP ===== */
function drawCyberdeck(ctx,W,H,g){const cd=g.cyberdeckEntry;if(!cd)return;
  const isToolMode=cd.useTools;
  const accentCol=isToolMode?TOOL_TYPES[cd.toolType]:USB_COLORS[cd.colorIndex];
  const t=cd.timer;
  ctx.fillStyle='rgba(0,0,0,0.8)';ctx.fillRect(0,0,W,H);
  const cx=W/2,cy=H/2,bw=360,bh=240;
  ctx.strokeStyle=accentCol.hex;ctx.lineWidth=2;ctx.fillStyle='rgba(5,8,15,0.95)';
  ctx.fillRect(cx-bw/2,cy-bh/2,bw,bh);ctx.strokeRect(cx-bw/2,cy-bh/2,bw,bh);
  ctx.globalAlpha=0.03;ctx.fillStyle=accentCol.hex;for(let i=0;i<bh;i+=3)ctx.fillRect(cx-bw/2,cy-bh/2+i,bw,1);ctx.globalAlpha=1;
  ctx.fillStyle=`rgba(${accentCol.r},${accentCol.g},${accentCol.b},0.15)`;ctx.fillRect(cx-bw/2,cy-bh/2,bw,24);
  ctx.font='bold 11px "JetBrains Mono",monospace';ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.fillStyle=accentCol.hex;ctx.fillText('CYBERDECK v2.1 — SERVER DIAGNOSTIC',cx-bw/2+10,cy-bh/2+12);
  const ly=cy-bh/2+40,lh=16;ctx.font='12px "JetBrains Mono",monospace';
  const itemName=isToolMode?TOOL_TYPES[cd.toolType].name.toUpperCase():USB_COLORS[cd.colorIndex].name.toUpperCase();
  const itemLabel=isToolMode?'TOOL':'USB STICK';
  if(cd.phase==='denied'){
    if(t<40){ctx.fillStyle=accentCol.hex;ctx.fillText('> SCANNING...',cx-bw/2+12,ly);
      const dots='.'.repeat(Math.floor(t/10)%4);ctx.fillText(`  ${dots}`,cx-bw/2+120,ly);}
    else if(t<80){ctx.fillStyle=accentCol.hex;ctx.fillText('> SCANNING... COMPLETE',cx-bw/2+12,ly);
      ctx.fillStyle='#ff4444';ctx.fillText(`> REQUIRES ${itemLabel}: ${itemName}`,cx-bw/2+12,ly+lh);}
    else{ctx.fillStyle=accentCol.hex;ctx.fillText('> SCANNING... COMPLETE',cx-bw/2+12,ly);
      ctx.fillStyle='#ff4444';ctx.fillText(`> REQUIRES ${itemLabel}: ${itemName}`,cx-bw/2+12,ly+lh);
      ctx.font='bold 16px "JetBrains Mono",monospace';ctx.textAlign='center';
      const flash=Math.sin(t/8)>0?1:0.4;ctx.globalAlpha=flash;ctx.fillStyle='#ff4444';ctx.fillText('ACCESS DENIED',cx,ly+lh*3.5);ctx.globalAlpha=1;}}
  else if(cd.phase==='running'){
    const lines=[`> ${itemLabel} DETECTED: ${itemName}`,'> Mounting device...','> Running repair script...','> Patching firmware...','> Restoring data block...','> FRAGMENT RECOVERED'];
    const lineDelay=28;
    for(let i=0;i<lines.length;i++){if(t>i*lineDelay){
      const isLast=i===lines.length-1;ctx.fillStyle=i===0?accentCol.hex:isLast?'#22ff66':'#8899aa';
      if(isLast)ctx.font='bold 12px "JetBrains Mono",monospace';else ctx.font='12px "JetBrains Mono",monospace';
      const lineAge=t-i*lineDelay;const chars=Math.min(lines[i].length,Math.floor(lineAge*1.5));
      ctx.fillText(lines[i].substring(0,chars),cx-bw/2+12,ly+i*lh);}}
    const prog=Math.min(1,t/170);ctx.fillStyle='rgba(255,255,255,0.1)';ctx.fillRect(cx-bw/2+12,cy+bh/2-30,bw-24,8);
    ctx.fillStyle=accentCol.hex;ctx.fillRect(cx-bw/2+12,cy+bh/2-30,(bw-24)*prog,8);}
  ctx.textAlign='left';}

/* ===== AGENT — taller, centered, clean head ===== */
function drawAgent(ctx,x,y,ts,player,walk){ctx.save();const f=player.facing;
  const isM=walk.moving||Math.abs(walk.x-player.x)>0.05||Math.abs(walk.y-player.y)>0.05;
  const wP=isM?walk.walkCycle:0,stride=isM?Math.sin(wP):0,bob=isM?Math.abs(Math.sin(wP))*1.2:0;
  const isBack=f==='nw'||f==='ne';
  const fc={nw:{dx:-1,fx:-1,as:-1},ne:{dx:1,fx:1,as:1},sw:{dx:-1,fx:-1,as:-1},se:{dx:1,fx:1,as:1}};
  const cf=fc[f],dx=cf.dx;
  // Realistic proportions: ~52px total. Head=7, neck=2, torso=16, legs=27
  const footY=y-2;
  const hipY=footY-27-bob*0.3;   // hips — legs are 27px
  const shouldY=hipY-16;          // shoulders — torso is 16px
  const neckY=shouldY-2;          // neck
  const headY=neckY-3;            // head center

  // Shadow
  ctx.beginPath();ctx.ellipse(x,footY+4,10,4,0,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.2)';ctx.fill();

  // ── LEGS (27px, split: thigh 14 + shin 13) ──
  const lL=stride*8,rL=-stride*8;ctx.lineCap='round';
  const kneeOff=14;
  // Back leg (thigh + shin)
  ctx.strokeStyle='#14171e';ctx.lineWidth=2.8;
  const bkX=x+2.5+dx,bkKneeX=bkX-rL*0.25,bkKneeY=hipY+kneeOff,bkFootX=bkX-rL*0.4;
  ctx.beginPath();ctx.moveTo(bkX,hipY);ctx.quadraticCurveTo(bkKneeX+rL*0.1,bkKneeY-2,bkKneeX,bkKneeY);ctx.stroke();
  ctx.strokeStyle='#12151c';ctx.lineWidth=2.6;
  ctx.beginPath();ctx.moveTo(bkKneeX,bkKneeY);ctx.quadraticCurveTo(bkKneeX-rL*0.1,bkKneeY+7,bkFootX,footY);ctx.stroke();
  ctx.beginPath();ctx.ellipse(bkFootX,footY+1.5,3,1.2,0,0,Math.PI*2);ctx.fillStyle='#0a0a0e';ctx.fill();
  // Front leg
  ctx.strokeStyle='#1a1e26';ctx.lineWidth=3;
  const frX=x-2.5+dx,frKneeX=frX-lL*0.25,frKneeY=hipY+kneeOff,frFootX=frX-lL*0.4;
  ctx.beginPath();ctx.moveTo(frX,hipY);ctx.quadraticCurveTo(frKneeX+lL*0.1,frKneeY-2,frKneeX,frKneeY);ctx.stroke();
  ctx.strokeStyle='#181c24';ctx.lineWidth=2.8;
  ctx.beginPath();ctx.moveTo(frKneeX,frKneeY);ctx.quadraticCurveTo(frKneeX-lL*0.1,frKneeY+7,frFootX,footY);ctx.stroke();
  ctx.beginPath();ctx.ellipse(frFootX,footY+1.5,3,1.2,0,0,Math.PI*2);ctx.fillStyle='#0c0c10';ctx.fill();

  // ── TORSO (16px, narrower at waist) ──
  const sw=6.5,hw=5;// shoulder half-width, hip half-width
  ctx.beginPath();ctx.moveTo(x-sw+dx,shouldY);ctx.lineTo(x-hw+dx,hipY);ctx.lineTo(x+hw+dx,hipY);ctx.lineTo(x+sw+dx,shouldY);ctx.closePath();ctx.fillStyle='#181c26';ctx.fill();
  // Belt line
  ctx.beginPath();ctx.moveTo(x-hw+dx,hipY);ctx.lineTo(x+hw+dx,hipY);ctx.strokeStyle='#111418';ctx.lineWidth=1;ctx.stroke();
  // Center seam
  ctx.beginPath();ctx.moveTo(x+dx*0.5,shouldY);ctx.lineTo(x+dx*0.5,hipY);ctx.strokeStyle='#10131a';ctx.lineWidth=0.5;ctx.stroke();
  if(!isBack){
    // Lapels
    ctx.beginPath();ctx.moveTo(x-1.5+dx,shouldY+1);ctx.lineTo(x+dx*0.5,shouldY+5);ctx.lineTo(x+1.5+dx,shouldY+1);ctx.strokeStyle='#222838';ctx.lineWidth=0.6;ctx.stroke();
    // Tie
    ctx.beginPath();ctx.moveTo(x+dx*0.5,shouldY+2);ctx.lineTo(x-0.6+dx*0.5,hipY-4);ctx.lineTo(x+dx*0.5,hipY-3);ctx.lineTo(x+0.6+dx*0.5,hipY-4);ctx.closePath();ctx.fillStyle='#3a0e14';ctx.fill();
    // Collar
    ctx.beginPath();ctx.moveTo(x-2+dx,shouldY);ctx.lineTo(x+dx*0.5,shouldY+2);ctx.lineTo(x+2+dx,shouldY);ctx.strokeStyle='#444e5c';ctx.lineWidth=0.7;ctx.stroke();}

  // ── ARMS (proportional: upper 10px, forearm 10px) ──
  const freeX=x-cf.as*sw+dx,freeS=isM?stride*7:0;
  ctx.strokeStyle='#181c26';ctx.lineWidth=2.4;ctx.lineCap='round';
  // Free arm: upper
  ctx.beginPath();ctx.moveTo(freeX,shouldY+1);ctx.lineTo(freeX+freeS*0.25,shouldY+11);ctx.stroke();
  // Free arm: forearm
  ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(freeX+freeS*0.25,shouldY+11);ctx.lineTo(freeX+freeS*0.35,shouldY+21);ctx.stroke();
  // Hand
  ctx.beginPath();ctx.arc(freeX+freeS*0.35,shouldY+22,1.6,0,Math.PI*2);ctx.fillStyle='#b09070';ctx.fill();

  // Flashlight arm: upper
  const flX=x+cf.as*sw+dx,flMidX=flX+cf.fx*3,flMidY=shouldY+10;
  ctx.strokeStyle='#181c26';ctx.lineWidth=2.4;
  ctx.beginPath();ctx.moveTo(flX,shouldY+1);ctx.lineTo(flMidX,flMidY);ctx.stroke();
  // Forearm extending forward
  const flEX=x+cf.fx*16,flEY=shouldY+4;
  ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(flMidX,flMidY);ctx.lineTo(flEX,flEY);ctx.stroke();
  ctx.beginPath();ctx.arc(flEX,flEY,1.6,0,Math.PI*2);ctx.fillStyle='#b09070';ctx.fill();
  // Flashlight
  ctx.beginPath();ctx.moveTo(flEX,flEY);ctx.lineTo(flEX+cf.fx*7,flEY-0.5);ctx.strokeStyle='#48505a';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.stroke();
  ctx.beginPath();ctx.arc(flEX+cf.fx*8,flEY-1,2,0,Math.PI*2);ctx.fillStyle='#383f48';ctx.fill();
  const flg=ctx.createRadialGradient(flEX+cf.fx*8,flEY-1,0,flEX+cf.fx*8,flEY-1,3.5);flg.addColorStop(0,'rgba(255,255,200,0.4)');flg.addColorStop(1,'transparent');ctx.fillStyle=flg;ctx.beginPath();ctx.arc(flEX+cf.fx*8,flEY-1,3.5,0,Math.PI*2);ctx.fill();

  // ── NECK ──
  ctx.fillStyle='#b09070';ctx.fillRect(x-1.2+dx*0.3,neckY,2.4,2.5);

  // ── HEAD (7px tall, ~4px wide — smaller relative to body) ──
  const hx=x+dx*0.3;
  // Skin shape
  ctx.beginPath();ctx.moveTo(hx-3.5,headY+1);ctx.quadraticCurveTo(hx-3.8,headY-2,hx-2,headY-4.5);
  ctx.quadraticCurveTo(hx,headY-5.5,hx+2,headY-4.5);ctx.quadraticCurveTo(hx+3.8,headY-2,hx+3.5,headY+1);
  ctx.quadraticCurveTo(hx+2.5,headY+3,hx,headY+3.5);ctx.quadraticCurveTo(hx-2.5,headY+3,hx-3.5,headY+1);ctx.closePath();
  ctx.fillStyle='#b89878';ctx.fill();
  // Hair
  ctx.beginPath();ctx.moveTo(hx-3.8,headY);ctx.quadraticCurveTo(hx-4,headY-3,hx-2,headY-5);
  ctx.quadraticCurveTo(hx,headY-6,hx+2,headY-5);ctx.quadraticCurveTo(hx+4,headY-3,hx+3.8,headY);
  ctx.quadraticCurveTo(hx+2.5,headY-1.5,hx,headY-2.5);ctx.quadraticCurveTo(hx-2.5,headY-1.5,hx-3.8,headY);ctx.closePath();
  ctx.fillStyle='#151210';ctx.fill();
  if(isBack){
    // Back view — hair covers most of head
    ctx.beginPath();ctx.moveTo(hx-3.5,headY+1);ctx.quadraticCurveTo(hx-3.8,headY-2,hx-2,headY-4.5);
    ctx.quadraticCurveTo(hx,headY-5.5,hx+2,headY-4.5);ctx.quadraticCurveTo(hx+3.8,headY-2,hx+3.5,headY+1);
    ctx.quadraticCurveTo(hx+2,headY+2,hx,headY+2);ctx.quadraticCurveTo(hx-2,headY+2,hx-3.5,headY+1);ctx.closePath();
    ctx.fillStyle='#151210';ctx.fill();}

  ctx.restore();}

function drawGuard(ctx,x,y,ts,gd,br){ctx.save();
  const footY=y-2,py=footY-35;ctx.globalAlpha=Math.min(1,br+0.1);
  // Shadow
  ctx.beginPath();ctx.ellipse(x,footY+4,10,4,0,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.2)';ctx.fill();
  // Legs (simple)
  ctx.strokeStyle='#1a1a2a';ctx.lineWidth=3;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x-3,py+25);ctx.lineTo(x-3,footY+1);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x+3,py+25);ctx.lineTo(x+3,footY+1);ctx.stroke();
  // Body (darker uniform)
  ctx.fillStyle='#1a1a30';ctx.fillRect(x-7,py+8,14,18);
  // Shoulders
  ctx.fillStyle='#222240';ctx.fillRect(x-8,py+8,16,5);
  // Head (dark cap)
  ctx.beginPath();ctx.ellipse(x,py+2,5,6,0,0,Math.PI*2);ctx.fillStyle='#b89878';ctx.fill();
  ctx.beginPath();ctx.ellipse(x,py-2,5.5,3.5,0,Math.PI*0.85,Math.PI*2.15);ctx.fillStyle='#1a1a30';ctx.fill();
  // Red flashlight beam indicator
  const bAng=Math.atan2(gd.dir.y,gd.dir.x);const bLen=gd.sightRange*TW*0.15;
  const bx=x+Math.cos(bAng)*5,by=py+10+Math.sin(bAng)*5;
  const bex=bx+Math.cos(bAng)*bLen,bey=by+Math.sin(bAng)*bLen;
  ctx.globalAlpha=0.15*br;ctx.beginPath();ctx.moveTo(bx,by);
  ctx.lineTo(bex-Math.sin(bAng)*bLen*0.3,bey+Math.cos(bAng)*bLen*0.3);
  ctx.lineTo(bex+Math.sin(bAng)*bLen*0.3,bey-Math.cos(bAng)*bLen*0.3);ctx.closePath();
  ctx.fillStyle='rgba(255,40,40,0.4)';ctx.fill();
  // Red LED on cap
  const flash=Math.sin(ts/200)>0?0.8:0.3;ctx.globalAlpha=flash;ctx.fillStyle='#ff2222';
  ctx.beginPath();ctx.arc(x,py-3,1.5,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;ctx.restore();}

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
  ctx.font=`bold ${fs}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#0af';ctx.textAlign='left';ctx.fillText(`◆ DATACENTER DISASTER — LVL ${g.level}`,10,bH*0.65);
  // Count-up timer (center)
  const mins=Math.floor(g.elapsed/60),secs=g.elapsed%60;
  const tCol=g.elapsed<g.parTime?'#22ff66':g.elapsed<g.parTime*1.5?'#ffaa00':'#ff4444';
  ctx.textAlign='center';ctx.font=`bold ${sf}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle=tCol;ctx.fillText(`${mins}:${String(secs).padStart(2,'0')}`,W/2,bH*0.5);
  ctx.textAlign='right';ctx.fillStyle='#ffd700';let st='';for(let i=0;i<g.totalDrives;i++)st+=i<g.score?'◆ ':'◇ ';ctx.fillText(st,W-10,bH*0.65);
  ctx.font=`${sf}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#556';ctx.fillText(`${g.score}/${g.totalDrives} DRIVES`,W-10,bH*0.35);
  ctx.textAlign='left';const col=USB_COLORS[g.levelColor];ctx.fillStyle=col.hex;ctx.fillText(`◈ ${g.fragments.length} FRAGS`,10,bH*0.35);
  // USB inventory as colored dots
  const usbX=mob?90:120;let udx=usbX;
  for(const ci of g.usbInventory){ctx.fillStyle=USB_COLORS[ci].hex;ctx.beginPath();ctx.arc(udx,bH*0.35-1,3,0,Math.PI*2);ctx.fill();udx+=8;}
  // Level complete screen with score entry
  if(g.levelComplete){ctx.fillStyle='rgba(0,0,0,0.82)';ctx.fillRect(0,0,W,H);const p=0.8+Math.sin(ts/300)*0.2;ctx.textAlign='center';
    ctx.font=`bold ${mob?20:32}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle=`rgba(255,215,0,${p})`;ctx.fillText(`◆ LEVEL ${g.level} COMPLETE ◆`,W/2,H/2-80);
    ctx.font=`${mob?11:14}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#0af';
    ctx.fillText(`Time: ${Math.floor(g.elapsed/60)}m ${g.elapsed%60}s · ${g.brokenServers.filter(b=>b.fixed).length} servers repaired`,W/2,H/2-50);
    // Score display
    ctx.font=`bold ${mob?16:24}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#ffd700';
    ctx.fillText(`SCORE: ${g.levelScore.toLocaleString()}`,W/2,H/2-20);
    const bonusT=Math.max(0,g.parTime-g.elapsed);
    ctx.font=`${mob?9:11}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle=bonusT>0?'#22ff66':'#ff4444';
    ctx.fillText(bonusT>0?`${bonusT}s under par (+${bonusT*10*g.level} bonus)`:`${Math.abs(bonusT)}s over par (no time bonus)`,W/2,H/2+2);
    // Initials entry
    if(g.showScoreEntry){
      ctx.font=`${mob?10:13}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#888';ctx.fillText('ENTER YOUR INITIALS',W/2,H/2+28);
      const iW=30,iG=8,iTotalW=iW*3+iG*2,iSX=W/2-iTotalW/2,iY=H/2+38;
      for(let i=0;i<3;i++){const ix=iSX+i*(iW+iG),sel=i===g.scoreCursor;
        ctx.fillStyle=sel?'rgba(255,215,0,0.15)':'rgba(20,25,35,0.8)';ctx.fillRect(ix,iY,iW,36);
        ctx.strokeStyle=sel?'#ffd700':'#334';ctx.lineWidth=sel?2:1;ctx.strokeRect(ix,iY,iW,36);
        ctx.font=`bold 22px "JetBrains Mono",monospace`;ctx.fillStyle=sel?'#ffd700':'#aab';ctx.fillText(g.scoreInitials[i],ix+iW/2,iY+22);
        if(sel){ctx.font='10px monospace';ctx.fillStyle='#ffd700';ctx.fillText('▲',ix+iW/2,iY-6);ctx.fillText('▼',ix+iW/2,iY+44);}}
      ctx.font=`bold ${mob?11:14}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#ffd700';ctx.fillText('◀▶ move · ▲▼ change · ENTER submit',W/2,H/2+95);}
    else{ctx.font=`bold ${mob?13:18}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#ffd700';ctx.fillText('PRESS ENTER FOR NEXT LEVEL',W/2,H/2+50);}}
  // Game over screen
  if(g.gameOver){ctx.fillStyle='rgba(0,0,0,0.8)';ctx.fillRect(0,0,W,H);const p=0.7+Math.sin(ts/200)*0.3;ctx.textAlign='center';
    ctx.font=`bold ${mob?20:32}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle=`rgba(255,68,68,${p})`;
    ctx.fillText('DETECTED BY SECURITY',W/2,H/2-30);
    ctx.font=`${mob?11:15}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#888';ctx.fillText(`Level ${g.level} · ${g.score}/${g.totalDrives} drives recovered`,W/2,H/2+5);
    ctx.font=`bold ${mob?12:16}px "JetBrains Mono","Fira Code",monospace`;ctx.fillStyle='#ff4444';ctx.fillText('PRESS ENTER TO RETRY',W/2,H/2+35);}
  // ── PALM PILOT MINIMAP DEVICE ──
  const ms=mob?2:3,mapW=MW*ms,mapH=MH*ms;
  const devPad=6,devR=8,headerH=16,footerH=10;
  const devW=mapW+devPad*2+4,devH=mapH+devPad*2+headerH+footerH+4;
  const devX=8,devY=H-devH-8;
  const mx=devX+devPad+2,my=devY+devPad+headerH+2;
  // Device body — rounded dark shell
  ctx.fillStyle='#1a1c22';ctx.beginPath();
  ctx.moveTo(devX+devR,devY);ctx.lineTo(devX+devW-devR,devY);ctx.quadraticCurveTo(devX+devW,devY,devX+devW,devY+devR);
  ctx.lineTo(devX+devW,devY+devH-devR);ctx.quadraticCurveTo(devX+devW,devY+devH,devX+devW-devR,devY+devH);
  ctx.lineTo(devX+devR,devY+devH);ctx.quadraticCurveTo(devX,devY+devH,devX,devY+devH-devR);
  ctx.lineTo(devX,devY+devR);ctx.quadraticCurveTo(devX,devY,devX+devR,devY);ctx.closePath();ctx.fill();
  // Device border
  ctx.strokeStyle='#333842';ctx.lineWidth=1.5;ctx.stroke();
  // Inner bezel highlight
  ctx.strokeStyle='rgba(60,70,90,0.4)';ctx.lineWidth=0.5;
  ctx.strokeRect(devX+2,devY+2,devW-4,devH-4);
  // Screen inset
  ctx.fillStyle='rgba(0,4,10,0.85)';ctx.fillRect(mx-2,my-2,mapW+4,mapH+4);
  ctx.strokeStyle='rgba(0,80,120,0.2)';ctx.lineWidth=0.5;ctx.strokeRect(mx-2,my-2,mapW+4,mapH+4);
  // Grid location text above radar
  ctx.font=`bold ${mob?7:9}px "JetBrains Mono",monospace`;ctx.textAlign='center';ctx.fillStyle='#0af';
  ctx.fillText(`GRID: ${g.player.x},${g.player.y}`,devX+devW/2,devY+headerH-2);
  // Subtle header line
  ctx.fillStyle='rgba(0,170,255,0.12)';ctx.fillRect(devX+devPad,devY+headerH,devW-devPad*2,1);
  // Radar grid
  for(let gy=0;gy<MH;gy++)for(let gx=0;gx<MW;gx++){const d=Math.sqrt((gx-g.player.x)**2+(gy-g.player.y)**2);
    if(d<g.flashRadius+2){ctx.fillStyle=g.maze[gy][gx]===1?'rgba(25,35,55,0.8)':'rgba(8,12,20,0.5)';ctx.fillRect(mx+gx*ms,my+gy*ms,ms,ms);}}
  // Radar sweep line
  const sweepAng=ts/2000*Math.PI*2;const sweepLen=g.flashRadius*ms;
  ctx.globalAlpha=0.08;ctx.strokeStyle='#0af';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(mx+g.player.x*ms,my+g.player.y*ms);
  ctx.lineTo(mx+g.player.x*ms+Math.cos(sweepAng)*sweepLen,my+g.player.y*ms+Math.sin(sweepAng)*sweepLen);ctx.stroke();ctx.globalAlpha=1;
  // Player blip
  ctx.fillStyle='#0ff';ctx.fillRect(mx+g.player.x*ms-1,my+g.player.y*ms-1,ms+1,ms+1);
  // Drives
  for(const d of g.drives){if(d.collected)continue;if(Math.sqrt((d.x-g.player.x)**2+(d.y-g.player.y)**2)<g.flashRadius){ctx.fillStyle='#ffd700';ctx.fillRect(mx+d.x*ms,my+d.y*ms,ms,ms);}}
  // Broken servers
  for(const bs of g.brokenServers){if(bs.fixed)continue;if(Math.sqrt((bs.x-g.player.x)**2+(bs.y-g.player.y)**2)<g.flashRadius){const bcol=bs.toolType>=0?TOOL_TYPES[bs.toolType]:USB_COLORS[bs.colorIndex];ctx.fillStyle=bcol.hex;ctx.fillRect(mx+bs.x*ms,my+bs.y*ms,ms,ms);}}
  // USB sticks
  for(const usb of g.usbSticks){if(usb.collected)continue;if(Math.sqrt((usb.x-g.player.x)**2+(usb.y-g.player.y)**2)<g.flashRadius){ctx.fillStyle=USB_COLORS[usb.colorIndex].hex;ctx.globalAlpha=0.6+Math.sin(ts/300)*0.3;ctx.fillRect(mx+usb.x*ms,my+usb.y*ms,ms,ms);ctx.globalAlpha=1;}}
  // Tools
  for(const tool of g.tools){if(tool.collected)continue;if(Math.sqrt((tool.x-g.player.x)**2+(tool.y-g.player.y)**2)<g.flashRadius){ctx.fillStyle=TOOL_TYPES[tool.toolType].hex;ctx.globalAlpha=0.6+Math.sin(ts/300)*0.3;ctx.fillRect(mx+tool.x*ms,my+tool.y*ms,ms,ms);ctx.globalAlpha=1;}}
  // Guards
  for(const gd of g.guards){if(Math.sqrt((gd.x-g.player.x)**2+(gd.y-g.player.y)**2)<g.flashRadius){ctx.fillStyle='#ff2222';ctx.globalAlpha=0.6+Math.sin(ts/200)*0.4;ctx.fillRect(mx+Math.round(gd.x)*ms,my+Math.round(gd.y)*ms,ms,ms);ctx.globalAlpha=1;}}
  // Footer — device brand text
  ctx.font=`${mob?5:6}px "JetBrains Mono",monospace`;ctx.textAlign='center';ctx.fillStyle='#2a2e38';
  ctx.fillText('PIVITAL OS',devX+devW/2,devY+devH-3);}
