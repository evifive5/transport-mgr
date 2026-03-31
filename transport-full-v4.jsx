import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

// ── Tokens ──────────────────────────────────────────────────
const C = {
  bg:"#090d13",s1:"#10161f",s2:"#18202c",s3:"#1f2939",
  bdr:"#253040",bdr2:"#2e3a4e",
  acc:"#f0a500",accD:"#26190a",
  blue:"#4d9fff",blueD:"#061830",
  grn:"#3db94e",grnD:"#0a2215",
  red:"#f74f48",redD:"#280c0c",
  ylw:"#d09820",ylwD:"#231808",
  pur:"#a78bfa",purD:"#160e2e",
  txt:"#cdd8e6",mut:"#627585",dim:"#2a3848",
};

// ── Utils ────────────────────────────────────────────────────
const genId = () => Math.random().toString(36).slice(2,9);
const todayStr = () => new Date().toISOString().slice(0,10);
const nowTime = () => new Date().toTimeString().slice(0,5);
const fmtHM = (m) => {
  if (m == null || isNaN(m)) return "--";
  const a=Math.abs(m); return `${Math.floor(a/60)}h${String(a%60).padStart(2,"0")}m`;
};
const diffMin = (t1,t2) => {
  if (!t1||!t2) return 0;
  const [h1,m1]=t1.split(":").map(Number),[h2,m2]=t2.split(":").map(Number);
  let d=(h2*60+m2)-(h1*60+m1); if(d<0) d+=1440; return d;
};
const daysUntil = (d) => d ? Math.ceil((new Date(d)-new Date(todayStr()))/86400000) : 9999;
// Excel日付変換（シリアル値→YYYY-MM-DD）
const fmtExcelDate=(v)=>{
  if(!v) return "";
  if(typeof v==="string") return v.slice(0,10);
  if(typeof v==="number"){
    const d=new Date(Math.round((v-25569)*86400*1000));
    return d.toISOString().slice(0,10);
  }
  return String(v).slice(0,10);
};
// ドライバー名でID検索
const findDrvId=(drivers,name)=>{
  if(!name) return "";
  const d=drivers.find(x=>x.name===name||x.name.replace(/\s/g,"")===(name||"").replace(/\s/g,""));
  return d?.id||"";
};
const fmtDate = (d) => d ? d.replace(/-/g,"/") : "-";

// 改善基準計算
const calcLabor = (att) => {
  if (!att||!att.clockIn) return null;
  const out = att.clockOut || nowTime();
  const total = diffMin(att.clockIn, out);
  const breakMin = (att.breaks||[]).reduce((s,b)=>s+diffMin(b.start,b.end||nowTime()),0);
  const work = total - breakMin;
  const drive = att.driveMin || 0;
  const overtime = Math.max(0, work - 480);
  // 深夜(22:00-05:00)
  let nightMin = 0;
  const inM = att.clockIn.split(":").map(Number); let tm = inM[0]*60+inM[1];
  const outM2 = out.split(":").map(Number); let endTm = outM2[0]*60+outM2[1];
  if (endTm < tm) endTm += 1440;
  for (let t=tm; t<endTm; t++) { const tt=t%1440; if(tt>=22*60||tt<5*60) nightMin++; }
  return { total, breakMin, work, drive, overtime, nightMin,
    over13: total > 780, over16: total > 960, driveOver: drive > 240 };
};

// ── Seed Data ────────────────────────────────────────────────
const SEED = {
  drivers:[
    {id:"d1",no:"DRV001",name:"田中 一郎",kana:"タナカ イチロウ",phone:"090-1234-5678",
     license:"大型第一種",licenseNo:"東京12-345678",licenseExpiry:"2026-05-15",
     hireDate:"2018-04-01",group:"A班",empType:"正社員",
     address:"大阪市北区梅田1-1",birth:"1985-03-15",status:"待機中",note:""},
    {id:"d2",no:"DRV002",name:"佐藤 次郎",kana:"サトウ ジロウ",phone:"090-8765-4321",
     license:"普通第一種",licenseNo:"大阪34-901234",licenseExpiry:"2026-04-20",
     hireDate:"2020-07-01",group:"B班",empType:"正社員",
     address:"堺市堺区大小路1-2",birth:"1990-11-28",status:"配送中",note:""},
    {id:"d3",no:"DRV003",name:"高橋 三郎",kana:"タカハシ サブロウ",phone:"090-1111-2222",
     license:"大型第一種",licenseNo:"大阪56-789012",licenseExpiry:"2027-12-01",
     hireDate:"2015-10-01",group:"A班",empType:"正社員",
     address:"吹田市江坂町2-3",birth:"1982-07-04",status:"休暇",note:"4/5まで年休"},
  ],
  vehicles:[
    {id:"v1",plate:"大阪 100 あ 1234",type:"2トントラック",capacity:2000,year:2019,
     status:"使用中",inspDate:"2026-06-30",oilDate:"2026-04-15",
     lastMaint:"2026-03-01",mileage:85000,note:""},
    {id:"v2",plate:"大阪 200 い 5678",type:"4トントラック",capacity:4000,year:2021,
     status:"空き",inspDate:"2026-05-10",oilDate:"2026-05-01",
     lastMaint:"2026-02-15",mileage:62000,note:""},
    {id:"v3",plate:"大阪 300 う 9012",type:"軽トラック",capacity:500,year:2022,
     status:"整備中",inspDate:"2028-01-15",oilDate:"2026-09-01",
     lastMaint:"2026-03-28",mileage:31000,note:"定期点検中"},
  ],
  orders:[
    {id:"o1",no:"ORD-001",customer:"山田商事株式会社",destId:"dst1",
     address:"大阪市中央区本町3-4-5",weight:800,status:"配車済み",
     driverId:"d1",vehicleId:"v1",date:"2026-04-01",
     loadStart:null,loadEnd:null,unloadStart:null,unloadEnd:null,
     amount:25000,note:"",createdAt:"2026-03-30"},
    {id:"o2",no:"ORD-002",customer:"鈴木物産",destId:"dst2",
     address:"堺市堺区大小路町2-1",weight:1200,status:"未配車",
     driverId:null,vehicleId:null,date:"2026-04-01",
     loadStart:null,loadEnd:null,unloadStart:null,unloadEnd:null,
     amount:38000,note:"精密機器注意",createdAt:"2026-03-30"},
    {id:"o3",no:"ORD-003",customer:"山田商事株式会社",destId:"dst1",
     address:"大阪市中央区本町3-4-5",weight:600,status:"完了",
     driverId:"d2",vehicleId:"v2",date:"2026-03-29",
     loadStart:"08:30",loadEnd:"09:00",unloadStart:"11:00",unloadEnd:"11:45",
     amount:20000,note:"",createdAt:"2026-03-28"},
    {id:"o4",no:"ORD-004",customer:"近畿物流センター",destId:"dst2",
     address:"吹田市江坂町1-1",weight:3200,status:"未配車",
     driverId:null,vehicleId:null,date:"2026-04-02",
     loadStart:null,loadEnd:null,unloadStart:null,unloadEnd:null,
     amount:65000,note:"要フォークリフト",createdAt:"2026-03-30"},
    {id:"o5",no:"ORD-005",customer:"鈴木物産",destId:"dst2",
     address:"堺市堺区大小路町2-1",weight:450,status:"配送中",
     driverId:"d2",vehicleId:"v1",date:"2026-03-30",
     loadStart:"07:30",loadEnd:"08:10",unloadStart:null,unloadEnd:null,
     amount:15000,note:"",createdAt:"2026-03-30"},
  ],
  attendance:[
    {id:"at1",driverId:"d1",date:"2026-03-30",clockIn:"08:00",clockOut:null,
     breaks:[{start:"12:00",end:"13:00"}],driveMin:180,status:"出勤中",
     alcoholMorn:"正常",alcoholEve:null,note:""},
    {id:"at2",driverId:"d1",date:"2026-03-29",clockIn:"07:30",clockOut:"21:45",
     breaks:[{start:"12:00",end:"13:00"},{start:"15:30",end:"16:00"}],driveMin:480,status:"退勤済",
     alcoholMorn:"正常",alcoholEve:"正常",note:""},
    {id:"at3",driverId:"d1",date:"2026-03-28",clockIn:"08:00",clockOut:"18:00",
     breaks:[{start:"12:00",end:"13:00"}],driveMin:360,status:"退勤済",
     alcoholMorn:"正常",alcoholEve:"正常",note:""},
    {id:"at4",driverId:"d2",date:"2026-03-30",clockIn:"07:30",clockOut:null,
     breaks:[],driveMin:240,status:"出勤中",
     alcoholMorn:"正常",alcoholEve:null,note:""},
    {id:"at5",driverId:"d2",date:"2026-03-29",clockIn:"06:30",clockOut:"20:00",
     breaks:[{start:"11:30",end:"12:00"},{start:"18:00",end:"18:30"}],driveMin:420,status:"退勤済",
     alcoholMorn:"正常",alcoholEve:"正常",note:""},
  ],
  shifts:[
    {id:"sh1",driverId:"d1",date:"2026-04-05",type:"年休"},
    {id:"sh2",driverId:"d3",date:"2026-03-31",type:"年休"},
    {id:"sh3",driverId:"d3",date:"2026-04-01",type:"年休"},
    {id:"sh4",driverId:"d3",date:"2026-04-02",type:"年休"},
    {id:"sh5",driverId:"d3",date:"2026-04-03",type:"年休"},
    {id:"sh6",driverId:"d3",date:"2026-04-04",type:"年休"},
    {id:"sh7",driverId:"d3",date:"2026-04-05",type:"年休"},
  ],
  drivingLogs:[
    {id:"dl1",driverId:"d2",date:"2026-03-30",segStart:"07:30",segBreak:null,accMin:240,alerted:false},
  ],
  destinations:[
    {id:"dst1",name:"山田商事 大阪本社",address:"大阪市中央区本町3-4-5",
     contact:"山田太郎",phone:"06-1234-5678",note:"搬入口：北側",loadMin:30,unloadMin:45},
    {id:"dst2",name:"近畿物流センター 堺営業所",address:"堺市堺区大小路町2-1",
     contact:"鈴木花子",phone:"072-987-6543",note:"要予約",loadMin:60,unloadMin:60},
  ],
  billing:[
    {id:"b1",no:"INV-001",customer:"山田商事株式会社",orderIds:["o3"],
     amount:20000,tax:2000,status:"未入金",issueDate:"2026-03-31",dueDate:"2026-04-30",note:""},
    {id:"b2",no:"INV-002",customer:"鈴木物産",orderIds:["o5"],
     amount:15000,tax:1500,status:"請求済",issueDate:"2026-03-30",dueDate:"2026-04-30",note:""},
  ],
  messages:[
    {id:"ms1",from:"admin",to:"d1",content:"明日の配送予定を確認してください",ts:"2026-03-30T09:00:00",read:true},
    {id:"ms2",from:"d1",to:"admin",content:"確認しました。問題ありません",ts:"2026-03-30T09:15:00",read:true},
    {id:"ms3",from:"admin",to:"d2",content:"本日の積み込み時間を報告してください",ts:"2026-03-30T10:00:00",read:false},
  ],
  opLogs:[
    {id:"op1",driverId:"d1",vehicleId:"v1",date:"2026-03-29",startTime:"08:00",endTime:"18:30",
     odomStart:84500,odomEnd:84850,distance:350,route:"大阪北ルート",fuelCost:4800,note:""},
    {id:"op2",driverId:"d2",vehicleId:"v2",date:"2026-03-29",startTime:"07:00",endTime:"17:00",
     odomStart:62000,odomEnd:62280,distance:280,route:"堺ルート",fuelCost:3900,note:""},
  ],
};

// ── Storage ──────────────────────────────────────────────────
const DB = {
  async load() { try { const r=await window.storage.get("tms-v4"); return r?JSON.parse(r.value):null; } catch { return null; } },
  async save(d) { try { await window.storage.set("tms-v4",JSON.stringify(d)); } catch {} }
};

// ── UI Components ────────────────────────────────────────────
const inputSt = {
  width:"100%",background:C.s2,border:`1px solid ${C.bdr}`,borderRadius:4,
  padding:"7px 10px",color:C.txt,fontSize:13,boxSizing:"border-box",outline:"none",fontFamily:"inherit"
};

function Badge({label,color=C.mut}){
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",
    borderRadius:4,border:`1px solid ${color}55`,color,fontSize:11,fontWeight:700,
    background:color+"18",whiteSpace:"nowrap"}}>{label}</span>;
}

function Alert({type,children}){
  const map={danger:{c:C.red,bg:C.redD},warn:{c:C.ylw,bg:C.ylwD},info:{c:C.blue,bg:C.blueD},ok:{c:C.grn,bg:C.grnD}};
  const {c,bg}=map[type]||map.info;
  return <div style={{background:bg,border:`1px solid ${c}44`,borderRadius:6,padding:"8px 12px",
    color:c,fontSize:12,marginBottom:8}}>{children}</div>;
}

function Btn({children,onClick,v="primary",sm,disabled,full,style={}}){
  const bg=v==="primary"?C.acc:v==="danger"?C.red:v==="blue"?C.blue:"transparent";
  const col=v==="primary"?"#000":C.txt;
  const bdr=v==="ghost"?`1px solid ${C.bdr}`:"none";
  return <button onClick={onClick} disabled={disabled} style={{
    background:bg,color:col,border:bdr,borderRadius:4,
    padding:sm?"3px 10px":"7px 16px",fontSize:sm?11:13,fontWeight:700,
    cursor:disabled?"not-allowed":"pointer",opacity:disabled?.5:1,
    width:full?"100%":"auto",lineHeight:1.4,...style
  }}>{children}</button>;
}

function Modal({title,onClose,children,wide}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:9999,
      display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
      <div style={{background:C.s1,border:`1px solid ${C.bdr}`,borderRadius:8,
        width:wide?"min(760px,96vw)":"min(520px,96vw)",maxHeight:"90vh",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"12px 18px",borderBottom:`1px solid ${C.bdr}`,flexShrink:0}}>
          <span style={{color:C.txt,fontWeight:700,fontSize:15}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.mut,cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
        </div>
        <div style={{padding:18,overflowY:"auto"}}>{children}</div>
      </div>
    </div>
  );
}

function Fld({label,children,half}){
  return(
    <div style={{marginBottom:12,flex:half?"1":"unset"}}>
      <label style={{display:"block",color:C.mut,fontSize:10,fontWeight:700,
        textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{label}</label>
      {children}
    </div>
  );
}

function Inp({label,...p}){return <Fld label={label}><input {...p} style={{...inputSt,...(p.style||{})}}/></Fld>;}
function Sel({label,opts,...p}){
  return <Fld label={label}><select {...p} style={{...inputSt,...(p.style||{})}}>
    {opts.map(o=><option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}
  </select></Fld>;
}

function Th({c}){return <th style={{textAlign:"left",padding:"8px 10px",background:C.s2,
  color:C.mut,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",
  whiteSpace:"nowrap",borderBottom:`1px solid ${C.bdr}`}}>{c}</th>;}
function Td({children,style={}}){return <td style={{padding:"8px 10px",color:C.txt,fontSize:13,verticalAlign:"middle",...style}}>{children}</td>;}
function Tr0({cols}){return <tr><td colSpan={cols} style={{textAlign:"center",color:C.dim,padding:20,fontSize:13}}>データなし</td></tr>;}

function PageHd({title,action}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
      <h2 style={{color:C.txt,fontSize:18,fontWeight:800,margin:0}}>{title}</h2>
      {action}
    </div>
  );
}

function SecHd({c}){return <h3 style={{color:C.mut,fontSize:10,fontWeight:700,
  textTransform:"uppercase",letterSpacing:"0.1em",margin:"16px 0 8px"}}>{c}</h3>;}

function StatCard({label,val,color=C.txt,alert,sub}){
  return(
    <div style={{background:C.s1,border:`1px solid ${alert?color:C.bdr}`,borderRadius:8,padding:"12px 16px"}}>
      <div style={{color:C.mut,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>{label}</div>
      <div style={{color,fontSize:28,fontWeight:900,fontFamily:"'Courier New',monospace"}}>{val}</div>
      {sub&&<div style={{color:C.mut,fontSize:11,marginTop:2}}>{sub}</div>}
    </div>
  );
}

function StatusDot({s}){
  const map={"配送中":C.ylw,"出勤中":C.grn,"待機中":C.grn,"完了":C.grn,"退勤済":C.mut,"休暇":C.mut,
    "未配車":C.red,"配車済み":C.blue,"キャンセル":C.red,"空き":C.grn,"使用中":C.ylw,"整備中":C.red};
  return <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:map[s]||C.mut,marginRight:6}}/>;
}

// ─── 改善基準 Status badge ───
function LaborBadge({att}){
  const r=calcLabor(att);
  if(!r) return <span style={{color:C.mut,fontSize:11}}>--</span>;
  if(r.over16) return <Badge label="16h超過 違反" color={C.red}/>;
  if(r.over13) return <Badge label="13h超過" color={C.ylw}/>;
  return <Badge label="正常" color={C.grn}/>;
}

// ── 出退勤フォーム共通 ────────────────────────────────────────
function AttForm({att,onSave,onClose,drivers}){
  const [f,setF]=useState(att||{driverId:drivers[0]?.id||"",date:todayStr(),clockIn:"",clockOut:"",
    breaks:[],driveMin:"",status:"退勤済",alcoholMorn:"正常",alcoholEve:"正常",note:""});
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  const addBrk=()=>s("breaks",[...f.breaks,{start:"",end:""}]);
  const updBrk=(i,k,v)=>s("breaks",f.breaks.map((b,j)=>j===i?{...b,[k]:v}:b));
  const delBrk=(i)=>s("breaks",f.breaks.filter((_,j)=>j!==i));
  return(
    <Modal title={att?"出退勤編集":"出退勤登録"} onClose={onClose}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
        <Sel label="ドライバー" value={f.driverId} onChange={e=>s("driverId",e.target.value)}
          opts={drivers.map(d=>({v:d.id,l:d.name}))} />
        <Inp label="日付" type="date" value={f.date} onChange={e=>s("date",e.target.value)}/>
        <Inp label="出勤時刻" type="time" value={f.clockIn} onChange={e=>s("clockIn",e.target.value)}/>
        <Inp label="退勤時刻" type="time" value={f.clockOut||""} onChange={e=>s("clockOut",e.target.value||null)}/>
        <Inp label="運転時間（分）" type="number" value={f.driveMin} onChange={e=>s("driveMin",Number(e.target.value))}/>
        <Sel label="ステータス" value={f.status} onChange={e=>s("status",e.target.value)}
          opts={["出勤中","退勤済","欠勤","年休"]} />
        <Sel label="アルコール（出勤前）" value={f.alcoholMorn||""} onChange={e=>s("alcoholMorn",e.target.value)}
          opts={[{v:"",l:"未実施"},{v:"正常",l:"正常"},{v:"異常",l:"異常"}]}/>
        <Sel label="アルコール（退勤後）" value={f.alcoholEve||""} onChange={e=>s("alcoholEve",e.target.value)}
          opts={[{v:"",l:"未実施"},{v:"正常",l:"正常"},{v:"異常",l:"異常"}]}/>
      </div>
      <div style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <label style={{color:C.mut,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>休憩</label>
          <Btn sm v="ghost" onClick={addBrk}>＋ 追加</Btn>
        </div>
        {f.breaks.map((b,i)=>(
          <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
            <input type="time" value={b.start} onChange={e=>updBrk(i,"start",e.target.value)} style={{...inputSt,flex:1}}/>
            <span style={{color:C.mut,fontSize:12}}>〜</span>
            <input type="time" value={b.end} onChange={e=>updBrk(i,"end",e.target.value)} style={{...inputSt,flex:1}}/>
            <button onClick={()=>delBrk(i)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16,padding:0}}>×</button>
          </div>
        ))}
      </div>
      <Inp label="備考" value={f.note} onChange={e=>s("note",e.target.value)}/>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
        <Btn v="ghost" onClick={onClose}>キャンセル</Btn>
        <Btn onClick={()=>onSave({...f,id:att?.id})}>保存</Btn>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════
//  PAGES
// ══════════════════════════════════════════════════

// ── Dashboard ─────────────────────────────────────
function Dashboard({data,role,cDrvId}){
  const {drivers,vehicles,orders,attendance,messages}=data;
  const today=todayStr();

  // アラート生成
  const alerts=[];
  drivers.forEach(d=>{
    const du=daysUntil(d.licenseExpiry);
    if(du<=60) alerts.push({type:du<=30?"danger":"warn",msg:`${d.name}：免許証期限まで${du}日 (${fmtDate(d.licenseExpiry)})`});
    const td=attendance.find(a=>a.driverId===d.id&&a.date===today);
    if(td&&(!td.alcoholMorn)) alerts.push({type:"warn",msg:`${d.name}：本日の出勤前アルコールチェック未実施`});
  });
  vehicles.forEach(v=>{
    const du=daysUntil(v.inspDate);
    if(du<=60) alerts.push({type:du<=30?"danger":"warn",msg:`${v.plate}：車検期限まで${du}日 (${fmtDate(v.inspDate)})`});
    const od=daysUntil(v.oilDate);
    if(od<=30) alerts.push({type:"warn",msg:`${v.plate}：オイル交換時期まで${od}日`});
  });
  attendance.forEach(a=>{
    const r=calcLabor(a);
    if(r?.over16) alerts.push({type:"danger",msg:`${drivers.find(d=>d.id===a.driverId)?.name}：${fmtDate(a.date)} 拘束16h超過（改善基準違反）`});
    else if(r?.over13) alerts.push({type:"warn",msg:`${drivers.find(d=>d.id===a.driverId)?.name}：${fmtDate(a.date)} 拘束13h超過`});
    if(a.alcoholMorn==="異常"||a.alcoholEve==="異常")
      alerts.push({type:"danger",msg:`${drivers.find(d=>d.id===a.driverId)?.name}：${fmtDate(a.date)} アルコール異常検知`});
  });

  if(role==="driver"){
    const me=drivers.find(d=>d.id===cDrvId);
    const myAtt=attendance.find(a=>a.driverId===cDrvId&&a.date===today);
    const myOrders=orders.filter(o=>o.driverId===cDrvId&&o.date===today);
    const lr=calcLabor(myAtt);
    const unread=messages.filter(m=>m.to===cDrvId&&!m.read).length;
    return(
      <div>
        <PageHd title="マイページ"/>
        {unread>0&&<Alert type="info">未読メッセージが{unread}件あります</Alert>}
        <div style={{background:C.s1,border:`1px solid ${C.bdr}`,borderRadius:8,padding:"14px 18px",marginBottom:18,display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:C.accD,display:"flex",alignItems:"center",justifyContent:"center",color:C.acc,fontWeight:900,fontSize:16}}>
            {me?.name.slice(0,1)}
          </div>
          <div>
            <div style={{color:C.txt,fontWeight:700,fontSize:17}}>{me?.name}</div>
            <div style={{color:C.mut,fontSize:12,marginTop:2}}>{me?.group} / {me?.license}</div>
            <div style={{marginTop:4}}><StatusDot s={me?.status}/><span style={{color:C.mut,fontSize:12}}>{me?.status}</span></div>
          </div>
        </div>
        {myAtt&&lr&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:18}}>
            <StatCard label="拘束時間" val={fmtHM(lr.total)} color={lr.over16?C.red:lr.over13?C.ylw:C.txt} alert={lr.over13}/>
            <StatCard label="運転時間" val={fmtHM(lr.drive)} color={lr.driveOver?C.ylw:C.txt}/>
            <StatCard label="残業時間" val={fmtHM(lr.overtime)} color={lr.overtime>0?C.ylw:C.mut}/>
          </div>
        )}
        <SecHd c="本日の担当配送"/>
        {myOrders.length===0?<p style={{color:C.dim,fontSize:13}}>担当配送なし</p>:
          myOrders.map(o=>(
            <div key={o.id} style={{background:C.s2,borderRadius:6,padding:"10px 14px",marginBottom:6,display:"flex",gap:10,alignItems:"center"}}>
              <code style={{color:C.acc,fontSize:11,minWidth:72}}>{o.no}</code>
              <span style={{color:C.txt,fontSize:13,flex:1}}>{o.customer}</span>
              <Badge label={o.status} color={o.status==="完了"?C.grn:o.status==="配送中"?C.ylw:C.blue}/>
            </div>
          ))
        }
      </div>
    );
  }

  const todayAtt=attendance.filter(a=>a.date===today);
  const active=drivers.filter(d=>d.status==="配送中"||d.status==="待機中");
  const unassgn=orders.filter(o=>o.status==="未配車"&&o.date>=today);

  return(
    <div>
      <PageHd title="ダッシュボード" action={<span style={{color:C.mut,fontSize:12}}>{fmtDate(today)}</span>}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:22}}>
        <StatCard label="本日稼働" val={todayAtt.filter(a=>a.status==="出勤中").length+"名"} color={C.grn}/>
        <StatCard label="未配車" val={unassgn.length+"件"} color={unassgn.length>0?C.red:C.mut} alert={unassgn.length>0}/>
        <StatCard label="配送中" val={orders.filter(o=>o.status==="配送中").length+"件"} color={C.ylw}/>
        <StatCard label="空き車両" val={vehicles.filter(v=>v.status==="空き").length+"台"} color={C.blue}/>
        <StatCard label="アラート" val={alerts.length+"件"} color={alerts.length>0?C.red:C.mut} alert={alerts.length>0}/>
      </div>
      {alerts.length>0&&(
        <div style={{marginBottom:18}}>
          <SecHd c="アラート"/>
          {alerts.slice(0,8).map((a,i)=><Alert key={i} type={a.type}>{a.msg}</Alert>)}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
        <div>
          <SecHd c="ドライバー状況"/>
          {drivers.map(d=>{
            const att=attendance.find(a=>a.driverId===d.id&&a.date===today);
            const lr=att?calcLabor(att):null;
            return(
              <div key={d.id} style={{background:C.s1,borderRadius:6,padding:"8px 12px",marginBottom:6,
                border:`1px solid ${lr?.over13?C.ylw:C.bdr}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:C.txt,fontSize:13,fontWeight:600}}>{d.name}</span>
                  <StatusDot s={d.status}/><span style={{color:C.mut,fontSize:11}}>{d.status}</span>
                </div>
                {lr&&<div style={{color:C.mut,fontSize:11,marginTop:3}}>
                  拘束 {fmtHM(lr.total)} / 運転 {fmtHM(lr.drive)}
                  {lr.over13&&<span style={{color:C.ylw,marginLeft:6}}>⚠ 13h超</span>}
                </div>}
              </div>
            );
          })}
        </div>
        <div>
          <SecHd c="未配車の注文"/>
          {unassgn.length===0?<p style={{color:C.dim,fontSize:13}}>未配車の注文なし</p>:
            unassgn.map(o=>(
              <div key={o.id} style={{background:C.s1,borderRadius:6,padding:"8px 12px",marginBottom:6,
                border:`1px solid ${C.redD}`}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <code style={{color:C.acc,fontSize:11}}>{o.no}</code>
                  <span style={{color:C.mut,fontSize:11}}>{fmtDate(o.date)}</span>
                </div>
                <div style={{color:C.txt,fontSize:13,marginTop:2}}>{o.customer}</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ── 出退勤管理 ─────────────────────────────────────
function Attendance({data,setData,role,cDrvId}){
  const [modal,setModal]=useState(null);
  const [showAttImport,setShowAttImport]=useState(false);
  const [filter,setFilter]=useState({month:todayStr().slice(0,7),drvId:role==="driver"?cDrvId:"all"});
  const {attendance,drivers}=data;

  const [sortAtt,setSortAtt]=useState("date_desc");
  const [showStatus,setShowStatus]=useState("all");

  let filtered=attendance.filter(a=>{
    if(filter.month&&!a.date.startsWith(filter.month)) return false;
    if(filter.drvId!=="all"&&a.driverId!==filter.drvId) return false;
    if(showStatus!=="all"&&a.status!==showStatus) return false;
    return true;
  });
  filtered=[...filtered].sort((a,b)=>{
    if(sortAtt==="date_desc") return b.date.localeCompare(a.date);
    if(sortAtt==="date_asc") return a.date.localeCompare(b.date);
    const la=calcLabor(a),lb=calcLabor(b);
    if(sortAtt==="total_desc") return (lb?.total||0)-(la?.total||0);
    if(sortAtt==="ot_desc") return (lb?.overtime||0)-(la?.overtime||0);
    return 0;
  });

  const save=(form)=>{
    if(form.id) setData(d=>({...d,attendance:d.attendance.map(a=>a.id===form.id?form:a)}));
    else setData(d=>({...d,attendance:[...d.attendance,{...form,id:genId()}]}));
    setModal(null);
  };
  const del=(id)=>{ if(!confirm("削除しますか？")) return; setData(d=>({...d,attendance:d.attendance.filter(a=>a.id!==id)})); };

  // 月次集計
  const monthSummary=drivers.map(drv=>{
    const recs=attendance.filter(a=>a.driverId===drv.id&&a.date.startsWith(filter.month));
    const totalWork=recs.reduce((s,a)=>{const r=calcLabor(a);return s+(r?.work||0);},0);
    const totalDrive=recs.reduce((s,a)=>s+(a.driveMin||0),0);
    const totalOT=recs.reduce((s,a)=>{const r=calcLabor(a);return s+(r?.overtime||0);},0);
    const violations=recs.filter(a=>{const r=calcLabor(a);return r?.over13;}).length;
    return {drv,recs:recs.length,totalWork,totalDrive,totalOT,violations};
  });

  const clockAction=(type)=>{
    const existing=attendance.find(a=>a.driverId===cDrvId&&a.date===todayStr());
    if(type==="in"){
      if(existing) return alert("本日すでに出勤登録済みです");
      const newAtt={id:genId(),driverId:cDrvId,date:todayStr(),clockIn:nowTime(),
        clockOut:null,breaks:[],driveMin:0,status:"出勤中",alcoholMorn:null,alcoholEve:null,note:""};
      setData(d=>({...d,attendance:[...d.attendance,newAtt]}));
    } else {
      if(!existing) return alert("本日の出勤記録がありません");
      setData(d=>({...d,attendance:d.attendance.map(a=>a.id===existing.id?{...a,clockOut:nowTime(),status:"退勤済"}:a)}));
    }
  };

  return(
    <div>
      <PageHd title="勤怠管理" action={role==="admin"&&<div style={{display:"flex",gap:6}}><Btn v="ghost" sm onClick={()=>setShowAttImport(true)}>📥 Excel取込</Btn><Btn onClick={()=>setModal({})}>＋ 登録</Btn></div>}/>

      {role==="driver"&&(
        <div style={{display:"flex",gap:10,marginBottom:18}}>
          <Btn v="blue" onClick={()=>clockAction("in")} style={{flex:1,padding:"14px",fontSize:16,fontWeight:900}}>🟢 出勤</Btn>
          <Btn v="ghost" onClick={()=>clockAction("out")} style={{flex:1,padding:"14px",fontSize:16,fontWeight:900}}>🔴 退勤</Btn>
        </div>
      )}

      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <input type="month" value={filter.month} onChange={e=>setFilter(x=>({...x,month:e.target.value}))}
          style={{...inputSt,width:140}}/>
        {role==="admin"&&<select value={filter.drvId} onChange={e=>setFilter(x=>({...x,drvId:e.target.value}))}
          style={{...inputSt,width:160}}>
          <option value="all">全ドライバー</option>
          {drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select>}
        <select value={sortAtt} onChange={e=>setSortAtt(e.target.value)} style={{...inputSt,width:160}}>
          <option value="date_desc">日付（新しい順）</option>
          <option value="date_asc">日付（古い順）</option>
          <option value="total_desc">拘束時間（長い順）</option>
          <option value="ot_desc">残業（多い順）</option>
        </select>
        <select value={showStatus} onChange={e=>setShowStatus(e.target.value)} style={{...inputSt,width:130}}>
          <option value="all">全ステータス</option>
          <option value="出勤中">出勤中のみ</option>
          <option value="退勤済">退勤済のみ</option>
          <option value="欠勤">欠勤のみ</option>
          <option value="年休">年休のみ</option>
        </select>
      </div>

      {role==="admin"&&(
        <>
          <SecHd c="月次集計"/>
          <div style={{overflowX:"auto",marginBottom:20}}>
            <table style={{width:"100%",borderCollapse:"collapse",background:C.s1,borderRadius:8,overflow:"hidden"}}>
              <thead><tr>
                <Th c="ドライバー"/><Th c="出勤日数"/><Th c="労働時間"/><Th c="運転時間"/>
                <Th c="残業時間"/><Th c="改善基準超過"/>
              </tr></thead>
              <tbody>
                {monthSummary.map(m=>(
                  <tr key={m.drv.id} style={{borderBottom:`1px solid ${C.bdr}`}}>
                    <Td>{m.drv.name}</Td>
                    <Td><span style={{fontFamily:"'Courier New',monospace"}}>{m.recs}日</span></Td>
                    <Td><span style={{fontFamily:"'Courier New',monospace"}}>{fmtHM(m.totalWork)}</span></Td>
                    <Td><span style={{fontFamily:"'Courier New',monospace"}}>{fmtHM(m.totalDrive)}</span></Td>
                    <Td><span style={{fontFamily:"'Courier New',monospace",color:m.totalOT>0?C.ylw:C.txt}}>{fmtHM(m.totalOT)}</span></Td>
                    <Td>{m.violations>0?<Badge label={`${m.violations}件`} color={C.red}/>:<Badge label="なし" color={C.grn}/>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SecHd c="日別記録"/>
        </>
      )}

      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",background:C.s1,borderRadius:8,overflow:"hidden"}}>
          <thead><tr>
            {role==="admin"&&<Th c="ドライバー"/>}
            <Th c="日付"/><Th c="出勤"/><Th c="退勤"/><Th c="拘束時間"/>
            <Th c="運転時間"/><Th c="残業時間"/><Th c="夜間"/><Th c="改善基準"/>
            <Th c="アルコール"/><Th c="操作"/>
          </tr></thead>
          <tbody>
            {filtered.length===0&&<Tr0 cols={role==="admin"?11:10}/>}
            {filtered.sort((a,b)=>b.date.localeCompare(a.date)).map(a=>{
              const drv=drivers.find(d=>d.id===a.driverId);
              const lr=calcLabor(a);
              return(
                <tr key={a.id} style={{borderBottom:`1px solid ${C.bdr}`,background:lr?.over13?C.redD+"44":""}}>
                  {role==="admin"&&<Td style={{fontWeight:600}}>{drv?.name}</Td>}
                  <Td style={{fontSize:12}}>{fmtDate(a.date)}</Td>
                  <Td><code style={{fontSize:12,color:C.grn}}>{a.clockIn||"--"}</code></Td>
                  <Td><code style={{fontSize:12,color:a.clockOut?C.txt:C.ylw}}>{a.clockOut||"出勤中"}</code></Td>
                  <Td><span style={{fontFamily:"'Courier New',monospace",color:lr?.over13?C.red:C.txt,fontWeight:lr?.over13?700:400}}>{fmtHM(lr?.total)}</span></Td>
                  <Td><span style={{fontFamily:"'Courier New',monospace"}}>{fmtHM(lr?.drive)}</span></Td>
                  <Td><span style={{fontFamily:"'Courier New',monospace",color:lr?.overtime>0?C.ylw:C.mut}}>{fmtHM(lr?.overtime)}</span></Td>
                  <Td><span style={{fontFamily:"'Courier New',monospace",color:lr?.nightMin>0?C.pur:C.mut}}>{fmtHM(lr?.nightMin)}</span></Td>
                  <Td><LaborBadge att={a}/></Td>
                  <Td style={{fontSize:11}}>
                    {a.alcoholMorn&&<span style={{color:a.alcoholMorn==="異常"?C.red:C.grn,marginRight:4}}>出:{a.alcoholMorn}</span>}
                    {a.alcoholEve&&<span style={{color:a.alcoholEve==="異常"?C.red:C.grn}}>退:{a.alcoholEve}</span>}
                    {!a.alcoholMorn&&<span style={{color:C.dim}}>未実施</span>}
                  </Td>
                  <Td>
                    <div style={{display:"flex",gap:4}}>
                      <Btn sm onClick={()=>setModal(a)}>編集</Btn>
                      {role==="admin"&&<Btn sm v="danger" onClick={()=>del(a.id)}>削除</Btn>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modal!==null&&<AttForm att={modal.id?modal:null} drivers={role==="admin"?drivers:[drivers.find(d=>d.id===cDrvId)]} onSave={save} onClose={()=>setModal(null)}/>}
      {showAttImport&&<ExcelImporter type="attendance" data={data} onImport={rows=>{
        const newItems=rows.map(r=>({id:genId(),
          driverId:findDrvId(drivers,r["ドライバー氏名"]),
          date:fmtExcelDate(r["日付"])||todayStr(),
          clockIn:String(r["出勤時刻"]||"").slice(0,5),
          clockOut:String(r["退勤時刻"]||"").slice(0,5)||null,
          breaks:[],driveMin:Number(r["運転時間(分)"]||0),
          status:r["退勤時刻"]?"退勤済":"出勤中",
          alcoholMorn:"正常",alcoholEve:r["退勤時刻"]?"正常":null,
          note:r["備考"]||""}));
        setData(d=>({...d,attendance:[...d.attendance,...newItems]}));setShowAttImport(false);
      }} onClose={()=>setShowAttImport(false)}/>}
    </div>
  );
}

// ── 改善基準管理 ────────────────────────────────────
function LaborMgmt({data}){
  const {attendance,drivers}=data;
  const [selDrv,setSelDrv]=useState("all");
  const [month,setMonth]=useState(todayStr().slice(0,7));
  const [sortKey,setSortKey]=useState("date_desc");
  const [showOnly,setShowOnly]=useState("all"); // all / violation / warn / ok

  const CRITERIA=[
    {id:"over16",label:"16h超過",color:C.red},
    {id:"over13",label:"13h超過",color:C.ylw},
    {id:"driveOver",label:"運転4h超",color:C.pur},
    {id:"overtime",label:"残業あり",color:C.blue},
    {id:"night",label:"深夜あり",color:C.pur},
  ];
  const [activeCriteria,setActiveCriteria]=useState(CRITERIA.map(c=>c.id));
  const toggleCrit=(id)=>setActiveCriteria(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]);

  let recs=attendance.filter(a=>a.date.startsWith(month)&&(selDrv==="all"||a.driverId===selDrv));

  // showOnly filter
  recs=recs.filter(a=>{
    const lr=calcLabor(a);
    if(!lr) return showOnly==="all";
    if(showOnly==="violation") return lr.over16;
    if(showOnly==="warn") return lr.over13&&!lr.over16;
    if(showOnly==="ok") return !lr.over13;
    return true;
  });

  // sort
  const sortFn=(a,b)=>{
    const la=calcLabor(a),lb=calcLabor(b);
    if(sortKey==="date_desc") return b.date.localeCompare(a.date);
    if(sortKey==="date_asc") return a.date.localeCompare(b.date);
    if(sortKey==="total_desc") return (lb?.total||0)-(la?.total||0);
    if(sortKey==="total_asc") return (la?.total||0)-(lb?.total||0);
    if(sortKey==="drive_desc") return (lb?.drive||0)-(la?.drive||0);
    if(sortKey==="ot_desc") return (lb?.overtime||0)-(la?.overtime||0);
    return 0;
  };
  recs=recs.sort(sortFn);

  const avgDrive2d=(drvId)=>{
    const rr=attendance.filter(a=>a.driverId===drvId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2);
    if(rr.length===0) return 0;
    return Math.round(rr.reduce((s,a)=>s+(a.driveMin||0),0)/rr.length);
  };

  // 表示する列を activeCriteria に基づいて決める
  const showCol=(id)=>activeCriteria.includes(id);

  return(
    <div>
      <PageHd title="改善基準告示管理"/>
      <Alert type="info">
        改善基準告示（2024年施行）：拘束時間原則13h以内・最大16h / 連続運転4h以内（30分休憩） / 休息8h以上
      </Alert>

      {/* フィルター行 */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{...inputSt,width:140}}/>
        <select value={selDrv} onChange={e=>setSelDrv(e.target.value)} style={{...inputSt,width:160}}>
          <option value="all">全ドライバー</option>
          {drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={sortKey} onChange={e=>setSortKey(e.target.value)} style={{...inputSt,width:150}}>
          <option value="date_desc">日付（新しい順）</option>
          <option value="date_asc">日付（古い順）</option>
          <option value="total_desc">拘束時間（長い順）</option>
          <option value="total_asc">拘束時間（短い順）</option>
          <option value="drive_desc">運転時間（長い順）</option>
          <option value="ot_desc">残業（多い順）</option>
        </select>
      </div>

      {/* 表示フィルター */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {["all","violation","warn","ok"].map(v=>(
          <button key={v} onClick={()=>setShowOnly(v)} style={{
            background:showOnly===v?C.acc:C.s2,color:showOnly===v?"#000":C.mut,
            border:"none",borderRadius:4,padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>
            {v==="all"?"すべて":v==="violation"?"16h違反のみ":v==="warn"?"13h超のみ":"適合のみ"}
          </button>
        ))}
      </div>

      {/* 表示列のON/OFF */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,background:C.s2,
        borderRadius:8,padding:"8px 12px",alignItems:"center"}}>
        <span style={{color:C.mut,fontSize:11,fontWeight:700,marginRight:4}}>表示列：</span>
        {CRITERIA.map(c=>(
          <button key={c.id} onClick={()=>toggleCrit(c.id)} style={{
            background:activeCriteria.includes(c.id)?c.color+"22":"none",
            color:activeCriteria.includes(c.id)?c.color:C.dim,
            border:`1px solid ${activeCriteria.includes(c.id)?c.color+"66":C.bdr}`,
            borderRadius:20,padding:"3px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>
            {activeCriteria.includes(c.id)?"✓ ":""}{c.label}
          </button>
        ))}
      </div>

      {/* 2日平均 */}
      <SecHd c="2日平均運転時間"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:20}}>
        {(selDrv==="all"?drivers:[drivers.find(d=>d.id===selDrv)]).filter(Boolean).map(d=>{
          const avg=avgDrive2d(d.id);
          const over=avg>480;
          return <StatCard key={d.id} label={d.name+" 2日平均"} val={fmtHM(avg)}
            color={over?C.red:avg>400?C.ylw:C.grn} alert={over} sub={over?"⚠ 上限超過":"正常範囲"}/>
        })}
      </div>

      <SecHd c={`日別チェック（${recs.length}件）`}/>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",background:C.s1,borderRadius:8,overflow:"hidden"}}>
          <thead><tr>
            <Th c="日付"/><Th c="ドライバー"/><Th c="出勤"/><Th c="退勤"/>
            <Th c="拘束時間"/>
            {showCol("over13")&&<Th c="休憩合計"/>}
            {showCol("driveOver")&&<Th c="運転時間"/>}
            {showCol("overtime")&&<Th c="残業"/>}
            {showCol("night")&&<Th c="深夜早朝"/>}
            <Th c="判定"/>
          </tr></thead>
          <tbody>
            {recs.length===0&&<Tr0 cols={6}/>}
            {recs.map(a=>{
              const drv=drivers.find(d=>d.id===a.driverId);
              const lr=calcLabor(a);
              if(!lr) return null;
              return(
                <tr key={a.id} style={{borderBottom:`1px solid ${C.bdr}`,
                  background:lr.over16?C.redD+"66":lr.over13?C.ylwD+"44":""}}>
                  <Td style={{fontSize:12}}>{fmtDate(a.date)}</Td>
                  <Td style={{fontWeight:600}}>{drv?.name}</Td>
                  <Td><code style={{fontSize:12,color:C.grn}}>{a.clockIn}</code></Td>
                  <Td><code style={{fontSize:12}}>{a.clockOut||"出勤中"}</code></Td>
                  <Td><span style={{fontFamily:"'Courier New',monospace",fontWeight:700,
                    color:lr.over16?C.red:lr.over13?C.ylw:C.txt}}>{fmtHM(lr.total)}</span></Td>
                  {showCol("over13")&&<Td><span style={{fontFamily:"'Courier New',monospace",color:C.mut}}>{fmtHM(lr.breakMin)}</span></Td>}
                  {showCol("driveOver")&&<Td><span style={{fontFamily:"'Courier New',monospace",color:lr.driveOver?C.ylw:C.txt}}>{fmtHM(lr.drive)}</span></Td>}
                  {showCol("overtime")&&<Td><span style={{fontFamily:"'Courier New',monospace",color:lr.overtime>0?C.ylw:C.mut}}>{fmtHM(lr.overtime)}</span></Td>}
                  {showCol("night")&&<Td><span style={{fontFamily:"'Courier New',monospace",color:lr.nightMin>0?C.pur:C.mut}}>{fmtHM(lr.nightMin)}</span></Td>}
                  <Td>
                    {lr.over16&&<Badge label="16h超 違反" color={C.red}/>}
                    {!lr.over16&&lr.over13&&<Badge label="13h超" color={C.ylw}/>}
                    {!lr.over13&&<Badge label="適合" color={C.grn}/>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SecHd c="改善基準告示 早見表"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
        {[
          {label:"1日の拘束時間",rule:"原則13時間以内（最大16時間）",color:C.ylw},
          {label:"連続運転時間",rule:"4時間以内（30分以上休憩必要）",color:C.blue},
          {label:"休息時間",rule:"1回につき継続8時間以上",color:C.grn},
          {label:"拘束時間（月）",rule:"原則284時間以内（最大310時間）",color:C.pur},
          {label:"時間外労働",rule:"年間960時間以内（月100時間未満）",color:C.acc},
          {label:"2日平均運転",rule:"1日平均8時間以内",color:C.red},
        ].map((item,i)=>(
          <div key={i} style={{background:C.s1,border:`1px solid ${item.color}33`,borderRadius:8,padding:"12px 14px"}}>
            <div style={{color:item.color,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{item.label}</div>
            <div style={{color:C.txt,fontSize:12}}>{item.rule}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── シフト・有給管理 ────────────────────────────────
function ShiftMgmt({data,setData,role,cDrvId}){
  const [month,setMonth]=useState(todayStr().slice(0,7));
  const [modal,setModal]=useState(null);
  const [showShiftImport,setShowShiftImport]=useState(false);
  const {shifts,drivers,attendance}=data;

  const [year,mon]=month.split("-").map(Number);
  const daysInMonth=new Date(year,mon,0).getDate();
  const days=Array.from({length:daysInMonth},(_,i)=>{
    const d=`${month}-${String(i+1).padStart(2,"0")}`;
    return {d, dow:["日","月","火","水","木","金","土"][new Date(d).getDay()]};
  });

  const saveShift=(form)=>{
    if(form.id) setData(d=>({...d,shifts:d.shifts.map(s=>s.id===form.id?form:s)}));
    else setData(d=>({...d,shifts:[...d.shifts,{...form,id:genId()}]}));
    setModal(null);
  };

  const toggleShift=(drvId,date,type)=>{
    const ex=shifts.find(s=>s.driverId===drvId&&s.date===date);
    if(ex){
      if(ex.type===type) setData(d=>({...d,shifts:d.shifts.filter(s=>s.id!==ex.id)}));
      else setData(d=>({...d,shifts:d.shifts.map(s=>s.id===ex.id?{...s,type}:s)}));
    } else {
      setData(d=>({...d,shifts:[...d.shifts,{id:genId(),driverId:drvId,date,type}]}));
    }
  };

  const shownDrivers=role==="driver"?drivers.filter(d=>d.id===cDrvId):drivers;
  const paidLeaveCount=(drvId)=>shifts.filter(s=>s.driverId===drvId&&s.type==="年休"&&s.date.startsWith(month)).length;

  const typeColor={"年休":C.grn,"公休":C.blue,"特休":C.pur,"欠勤":C.red,"休日出勤":C.ylw};

  return(
    <div>
      <PageHd title="シフト・有給管理" action={role==="admin"&&<div style={{display:"flex",gap:6}}><Btn v="ghost" sm onClick={()=>setShowShiftImport(true)}>📥 Excel取込</Btn><Btn onClick={()=>setModal({})}>＋ 一括登録</Btn></div>}/>
      <div style={{display:"flex",gap:10,marginBottom:14}}>
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{...inputSt,width:140}}/>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        {Object.entries(typeColor).map(([t,c])=>(
          <span key={t} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:c}}>
            <span style={{width:10,height:10,background:c,borderRadius:2}}/>
            {t}
          </span>
        ))}
      </div>

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",minWidth:"100%",background:C.s1,borderRadius:8,overflow:"hidden"}}>
          <thead><tr>
            <th style={{padding:"8px 10px",background:C.s2,color:C.mut,fontSize:11,fontWeight:700,textAlign:"left",position:"sticky",left:0,zIndex:1,minWidth:80,borderBottom:`1px solid ${C.bdr}`}}>名前</th>
            {days.map(({d,dow})=>(
              <th key={d} style={{padding:"6px 4px",background:C.s2,color:dow==="日"?C.red:dow==="土"?C.blue:C.mut,
                fontSize:10,fontWeight:700,textAlign:"center",borderBottom:`1px solid ${C.bdr}`,minWidth:32}}>
                <div>{d.slice(8)}</div>
                <div>{dow}</div>
              </th>
            ))}
            <th style={{padding:"8px 10px",background:C.s2,color:C.mut,fontSize:10,fontWeight:700,textAlign:"center",borderBottom:`1px solid ${C.bdr}`}}>年休残</th>
          </tr></thead>
          <tbody>
            {shownDrivers.map(drv=>(
              <tr key={drv.id} style={{borderBottom:`1px solid ${C.bdr}`}}>
                <td style={{padding:"6px 10px",color:C.txt,fontSize:12,fontWeight:600,position:"sticky",left:0,background:C.s1,zIndex:1}}>
                  {drv.name.slice(3)||drv.name}
                </td>
                {days.map(({d,dow})=>{
                  const sh=shifts.find(s=>s.driverId===drv.id&&s.date===d);
                  const att=attendance.find(a=>a.driverId===drv.id&&a.date===d);
                  const c=sh?typeColor[sh.type]:att?"#ffffff22":dow==="日"||dow==="土"?"#ffffff08":"";
                  return(
                    <td key={d} onClick={()=>role==="admin"&&toggleShift(drv.id,d,sh?.type==="年休"?"公休":"年休")}
                      style={{textAlign:"center",padding:"4px 2px",cursor:role==="admin"?"pointer":"default",
                        background:c,fontSize:10,fontWeight:700,color:sh?typeColor[sh.type]+"dd":att?C.grn:C.dim}}>
                      {sh?sh.type.slice(0,1):att?"出":""}
                    </td>
                  );
                })}
                <td style={{textAlign:"center",color:C.acc,fontWeight:700,fontSize:13,padding:"6px 10px"}}>
                  {Math.max(0,20-shifts.filter(s=>s.driverId===drv.id&&s.type==="年休").length)}日
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{color:C.dim,fontSize:11,marginTop:8}}>※管理者はセルをクリックで年休/公休を切り替えられます</p>
      {showShiftImport&&<ExcelImporter type="shifts" data={data} onImport={rows=>{
        const newItems=rows.map(r=>({id:genId(),
          driverId:findDrvId(drivers,r["ドライバー氏名"]),
          date:fmtExcelDate(r["日付"])||"",
          type:r["種別"]||"公休"})).filter(s=>s.driverId&&s.date);
        setData(d=>({...d,shifts:[...d.shifts,...newItems]}));setShowShiftImport(false);
      }} onClose={()=>setShowShiftImport(false)}/>}

      {modal&&(
        <Modal title="シフト一括登録" onClose={()=>setModal(null)}>
          <Alert type="info">ドライバー全員の特定日に休日を一括登録します</Alert>
          <Inp label="対象日" type="date" value={modal.date||""} onChange={e=>setModal(x=>({...x,date:e.target.value}))}/>
          <Sel label="種別" value={modal.type||"公休"} onChange={e=>setModal(x=>({...x,type:e.target.value}))}
            opts={["公休","年休","特休"]}/>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}>
            <Btn v="ghost" onClick={()=>setModal(null)}>キャンセル</Btn>
            <Btn onClick={()=>{
              if(!modal.date) return;
              const newShifts=drivers.map(d=>({id:genId(),driverId:d.id,date:modal.date,type:modal.type||"公休"}));
              setData(d=>({...d,shifts:[...d.shifts.filter(s=>s.date!==modal.date),...newShifts]}));
              setModal(null);
            }}>一括登録</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── 配送管理 ───────────────────────────────────────
function Orders({data,setData,role,cDrvId}){
  const [modal,setModal]=useState(null);
  const [filt,setFilt]=useState("all");
  const [showImport,setShowImport]=useState(false);
  const {orders,drivers,vehicles,destinations}=data;

  const base=role==="driver"?orders.filter(o=>o.driverId===cDrvId):orders;
  const shown=filt==="all"?base:base.filter(o=>o.status===filt);

  const save=(form)=>{
    if(form.id) setData(d=>({...d,orders:d.orders.map(o=>o.id===form.id?form:o)}));
    else {
      const no="ORD-"+String(data.orders.length+1).padStart(3,"0");
      setData(d=>({...d,orders:[...d.orders,{...form,id:genId(),no,createdAt:todayStr()}]}));
    }
    setModal(null);
  };
  const del=(id)=>{ if(!confirm("削除しますか？")) return; setData(d=>({...d,orders:d.orders.filter(o=>o.id!==id)})); };
  const changeStatus=(id,s)=>setData(d=>({...d,orders:d.orders.map(o=>o.id===id?{...o,status:s}:o)}));

  const fbtns=["all","未配車","配車済み","配送中","完了","キャンセル"];
  return(
    <div>
      <PageHd title="配送管理" action={role==="admin"&&<div style={{display:"flex",gap:6}}><Btn v="ghost" sm onClick={()=>setShowImport(true)}>📥 Excel取込</Btn><Btn onClick={()=>setModal({})}>＋ 新規注文</Btn></div>}/>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {fbtns.map(s=>(
          <button key={s} onClick={()=>setFilt(s)} style={{
            background:filt===s?C.acc:C.s2,color:filt===s?"#000":C.mut,
            border:"none",borderRadius:4,padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>
            {s==="all"?"すべて":s}
          </button>
        ))}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",background:C.s1,borderRadius:8,overflow:"hidden"}}>
          <thead><tr>
            <Th c="注文番号"/><Th c="顧客"/><Th c="届け先"/><Th c="重量"/><Th c="配送日"/>
            <Th c="ステータス"/><Th c="ドライバー"/><Th c="積込"/><Th c="荷降"/><Th c="操作"/>
          </tr></thead>
          <tbody>
            {shown.length===0&&<Tr0 cols={10}/>}
            {shown.map(o=>{
              const drv=drivers.find(d=>d.id===o.driverId);
              return(
                <tr key={o.id} style={{borderBottom:`1px solid ${C.bdr}`}}>
                  <Td><code style={{color:C.acc,fontSize:11}}>{o.no}</code></Td>
                  <Td style={{maxWidth:120}}>{o.customer}</Td>
                  <Td style={{fontSize:11,color:C.mut,maxWidth:140}}>{o.address}</Td>
                  <Td style={{fontFamily:"'Courier New',monospace"}}>{o.weight}kg</Td>
                  <Td style={{fontSize:11}}>{fmtDate(o.date)}</Td>
                  <Td>
                    <Badge label={o.status}
                      color={o.status==="完了"?C.grn:o.status==="配送中"?C.ylw:o.status==="未配車"?C.red:C.blue}/>
                  </Td>
                  <Td style={{fontSize:12}}>{drv?.name||<span style={{color:C.dim}}>未割当</span>}</Td>
                  <Td style={{fontSize:11}}>
                    {o.loadStart?<><code style={{color:C.grn}}>{o.loadStart}</code>〜<code style={{color:C.grn}}>{o.loadEnd||"?"}</code></>:<span style={{color:C.dim}}>-</span>}
                  </Td>
                  <Td style={{fontSize:11}}>
                    {o.unloadStart?<><code style={{color:C.blue}}>{o.unloadStart}</code>〜<code style={{color:C.blue}}>{o.unloadEnd||"?"}</code></>:<span style={{color:C.dim}}>-</span>}
                  </Td>
                  <Td>
                    <div style={{display:"flex",gap:4}}>
                      {role==="admin"&&<Btn sm onClick={()=>setModal(o)}>編集</Btn>}
                      {role==="driver"&&o.status==="配車済み"&&<Btn sm v="blue" onClick={()=>changeStatus(o.id,"配送中")}>開始</Btn>}
                      {role==="driver"&&o.status==="配送中"&&<Btn sm onClick={()=>changeStatus(o.id,"完了")}>完了</Btn>}
                      {role==="admin"&&<Btn sm v="danger" onClick={()=>del(o.id)}>削除</Btn>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modal!==null&&<OrderModal order={modal.id?modal:null} drivers={drivers} vehicles={vehicles} destinations={destinations} onSave={save} onClose={()=>setModal(null)}/>}
      {showImport&&<ExcelImporter type="orders" data={data} onImport={rows=>{
        const newItems=rows.map(r=>({id:genId(),no:"ORD-"+String(data.orders.length+1).padStart(3,"0"),
          customer:r["顧客名"]||"",address:r["届け先住所"]||"",weight:Number(r["重量(kg)"]||0),
          date:fmtExcelDate(r["配送予定日"])||todayStr(),amount:Number(r["金額(円)"]||0),
          status:"未配車",driverId:null,vehicleId:null,destId:"",
          loadStart:null,loadEnd:null,unloadStart:null,unloadEnd:null,
          note:r["備考"]||"",createdAt:todayStr()}));
        setData(d=>({...d,orders:[...d.orders,...newItems]}));setShowImport(false);
      }} onClose={()=>setShowImport(false)}/>}
    </div>
  );
}

function OrderModal({order,drivers,vehicles,destinations,onSave,onClose}){
  const [f,setF]=useState(order||{customer:"",destId:"",address:"",weight:"",status:"未配車",
    driverId:"",vehicleId:"",date:"",loadStart:"",loadEnd:"",unloadStart:"",unloadEnd:"",amount:"",note:""});
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  const selDest=(id)=>{
    const dst=(destinations||[]).find(d=>d.id===id);
    if(dst) setF(x=>({...x,destId:id,address:dst.address||x.address,customer:dst.name||x.customer}));
    else setF(x=>({...x,destId:id}));
  };
  return(
    <Modal title={order?"注文編集":"新規注文"} onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
        <Inp label="顧客名" value={f.customer} onChange={e=>s("customer",e.target.value)}/>
        <Sel label="納品先カルテから選択" value={f.destId||""} onChange={e=>selDest(e.target.value)}
          opts={[{v:"",l:"直接入力"},...(destinations||[]).map(d=>({v:d.id,l:d.name}))]}/>
        <Inp label="配送予定日" type="date" value={f.date} onChange={e=>s("date",e.target.value)}/>
        <Inp label="重量(kg)" type="number" value={f.weight} onChange={e=>s("weight",e.target.value)}/>
        <Sel label="ステータス" value={f.status} onChange={e=>s("status",e.target.value)}
          opts={["未配車","配車済み","配送中","完了","キャンセル"]}/>
        <Inp label="金額(円)" type="number" value={f.amount||""} onChange={e=>s("amount",Number(e.target.value))}/>
        <Sel label="担当ドライバー" value={f.driverId||""} onChange={e=>s("driverId",e.target.value||null)}
          opts={[{v:"",l:"未割当"},...drivers.map(d=>({v:d.id,l:d.name}))]}/>
        <Sel label="使用車両" value={f.vehicleId||""} onChange={e=>s("vehicleId",e.target.value||null)}
          opts={[{v:"",l:"未割当"},...vehicles.map(v=>({v:v.id,l:`${v.plate}(${v.type})`}))]}/>
      </div>
      <Inp label="届け先住所" value={f.address} onChange={e=>s("address",e.target.value)}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0 10px"}}>
        <Inp label="積込開始" type="time" value={f.loadStart||""} onChange={e=>s("loadStart",e.target.value)}/>
        <Inp label="積込終了" type="time" value={f.loadEnd||""} onChange={e=>s("loadEnd",e.target.value)}/>
        <Inp label="荷降開始" type="time" value={f.unloadStart||""} onChange={e=>s("unloadStart",e.target.value)}/>
        <Inp label="荷降終了" type="time" value={f.unloadEnd||""} onChange={e=>s("unloadEnd",e.target.value)}/>
      </div>
      <Inp label="備考" value={f.note} onChange={e=>s("note",e.target.value)}/>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
        <Btn v="ghost" onClick={onClose}>キャンセル</Btn>
        <Btn onClick={()=>onSave({...f,id:order?.id})}>保存</Btn>
      </div>
    </Modal>
  );
}

// ── 配車管理 ───────────────────────────────────────
function Dispatch({data,setData}){
  const {orders,drivers,vehicles}=data;
  const unassigned=orders.filter(o=>o.status==="未配車");
  const avDrivers=drivers.filter(d=>d.status==="待機中");
  const avVehicles=vehicles.filter(v=>v.status==="空き");

  const assign=(orderId,driverId,vehicleId)=>{
    setData(d=>({...d,
      orders:d.orders.map(o=>o.id===orderId?{...o,status:"配車済み",driverId:driverId||o.driverId,vehicleId:vehicleId||o.vehicleId}:o),
      drivers:d.drivers.map(drv=>drv.id===driverId?{...drv,status:"配送中"}:drv),
      vehicles:d.vehicles.map(v=>v.id===vehicleId?{...v,status:"使用中"}:v),
    }));
  };

  return(
    <div>
      <PageHd title="配車管理"/>
      <div style={{background:C.blueD,border:`1px solid ${C.blue}44`,borderRadius:8,padding:"10px 14px",
        marginBottom:16,fontSize:13,color:C.blue,display:"flex",gap:8,alignItems:"flex-start"}}>
        <span style={{flexShrink:0,marginTop:1}}>💡</span>
        <div>
          <span style={{fontWeight:700}}>配車管理の仕組み：</span>
          「配送管理」で新規注文を追加すると、ステータスが「未配車」の注文がここに自動で表示されます。
          ドライバーと車両を選んで「配車する」ボタンを押すだけで配車完了です。
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:20}}>
        <div>
          <SecHd c={`空きドライバー (${avDrivers.length}名)`}/>
          {avDrivers.length===0?<p style={{color:C.dim,fontSize:13}}>空きドライバーなし</p>:
            avDrivers.map(d=>(
              <div key={d.id} style={{background:C.s1,borderRadius:6,padding:"10px 14px",marginBottom:6,border:`1px solid ${C.grnD}`}}>
                <div style={{color:C.txt,fontWeight:600,fontSize:13}}>{d.name}</div>
                <div style={{color:C.mut,fontSize:11,marginTop:2}}>{d.group} / {d.license}</div>
              </div>
            ))
          }
        </div>
        <div>
          <SecHd c={`空き車両 (${avVehicles.length}台)`}/>
          {avVehicles.length===0?<p style={{color:C.dim,fontSize:13}}>空き車両なし</p>:
            avVehicles.map(v=>(
              <div key={v.id} style={{background:C.s1,borderRadius:6,padding:"10px 14px",marginBottom:6,border:`1px solid ${C.blueDim||C.blueD}`}}>
                <div style={{color:C.txt,fontWeight:600,fontSize:13}}><code style={{fontSize:12}}>{v.plate}</code></div>
                <div style={{color:C.mut,fontSize:11,marginTop:2}}>{v.type} / 積載{v.capacity.toLocaleString()}kg</div>
              </div>
            ))
          }
        </div>
      </div>
      <SecHd c={`未配車の注文 (${unassigned.length}件)`}/>
      {unassigned.length===0?<p style={{color:C.dim,fontSize:13}}>未配車の注文はありません ✓</p>:
        unassigned.map(o=>(
          <DispatchCard key={o.id} order={o} drivers={drivers} vehicles={vehicles} onAssign={assign}/>
        ))
      }
    </div>
  );
}

function DispatchCard({order,drivers,vehicles,onAssign}){
  const [drvId,setDrvId]=useState("");
  const [vehId,setVehId]=useState("");
  const avD=drivers.filter(d=>d.status==="待機中");
  const avV=vehicles.filter(v=>v.status==="空き");
  return(
    <div style={{background:C.s1,border:`1px solid ${C.bdr}`,borderRadius:8,padding:"14px 16px",marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div>
          <code style={{color:C.acc,fontSize:12}}>{order.no}</code>
          <span style={{color:C.txt,fontWeight:700,fontSize:14,marginLeft:10}}>{order.customer}</span>
        </div>
        <span style={{color:C.mut,fontSize:11}}>{fmtDate(order.date)}</span>
      </div>
      <div style={{color:C.mut,fontSize:12,marginBottom:12}}>{order.address} / {order.weight}kg</div>
      {order.note&&<div style={{color:C.ylw,fontSize:11,marginBottom:10}}>⚠ {order.note}</div>}
      <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:140}}>
          <label style={{color:C.mut,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:4}}>ドライバー</label>
          <select value={drvId} onChange={e=>setDrvId(e.target.value)} style={{...inputSt}}>
            <option value="">選択...</option>
            {avD.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div style={{flex:1,minWidth:160}}>
          <label style={{color:C.mut,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:4}}>車両</label>
          <select value={vehId} onChange={e=>setVehId(e.target.value)} style={{...inputSt}}>
            <option value="">選択...</option>
            {avV.map(v=><option key={v.id} value={v.id}>{v.plate}({v.type})</option>)}
          </select>
        </div>
        <Btn onClick={()=>{if(!drvId||!vehId){alert("ドライバーと車両を選択してください");return;} onAssign(order.id,drvId,vehId);}} disabled={!drvId||!vehId}>配車する</Btn>
      </div>
    </div>
  );
}

// ── ドライバー台帳 ──────────────────────────────────
function DriverLedger({data,setData}){
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [sortD,setSortD]=useState("name");
  const [filtGrp,setFiltGrp]=useState("all");
  const [showDrvImport,setShowDrvImport]=useState(false);
  const {drivers}=data;

  const groups=["all",...[...new Set(drivers.map(d=>d.group||""))].filter(Boolean)];

  let shown=[...drivers]
    .filter(d=>{
      if(filtGrp!=="all"&&d.group!==filtGrp) return false;
      if(search){
        const q=search.toLowerCase();
        return d.name.includes(q)||d.kana?.includes(q)||d.phone?.includes(q)||d.license?.includes(q);
      }
      return true;
    })
    .sort((a,b)=>{
      if(sortD==="name") return a.name.localeCompare(b.name);
      if(sortD==="expiry") return (a.licenseExpiry||"9999").localeCompare(b.licenseExpiry||"9999");
      if(sortD==="hire") return a.hireDate.localeCompare(b.hireDate);
      if(sortD==="group") return (a.group||"").localeCompare(b.group||"");
      return 0;
    });

  const save=(form)=>{
    if(form.id) setData(d=>({...d,drivers:d.drivers.map(x=>x.id===form.id?form:x)}));
    else setData(d=>({...d,drivers:[...d.drivers,{...form,id:genId(),no:`DRV${String(d.drivers.length+1).padStart(3,"0")}`}]}));
    setModal(null);
  };
  const del=(id)=>{ if(!confirm("削除しますか？")) return; setData(d=>({...d,drivers:d.drivers.filter(x=>x.id!==id)})); };

  return(
    <div>
      <PageHd title="デジタル運転者台帳" action={<div style={{display:"flex",gap:6}}><Btn v="ghost" sm onClick={()=>setShowDrvImport(true)}>📥 Excel取込</Btn><Btn onClick={()=>setModal({})}>＋ 追加</Btn></div>}/>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <input placeholder="🔍 名前・免許・電話で検索..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{...inputSt,flex:1,minWidth:180}}/>
        <select value={sortD} onChange={e=>setSortD(e.target.value)} style={{...inputSt,width:150}}>
          <option value="name">氏名順</option>
          <option value="expiry">免許期限順</option>
          <option value="hire">入社日順</option>
          <option value="group">班順</option>
        </select>
        <select value={filtGrp} onChange={e=>setFiltGrp(e.target.value)} style={{...inputSt,width:110}}>
          {groups.map(g=><option key={g} value={g}>{g==="all"?"全グループ":g}</option>)}
        </select>
      </div>
      <div style={{color:C.mut,fontSize:12,marginBottom:10}}>{shown.length}名 表示中</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
        {shown.map(d=>{
          const du=daysUntil(d.licenseExpiry);
          return(
            <div key={d.id} style={{background:C.s1,border:`1px solid ${du<=30?C.red:du<=60?C.ylw:C.bdr}`,borderRadius:8,padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:C.accD,display:"flex",alignItems:"center",justifyContent:"center",color:C.acc,fontWeight:900,fontSize:15}}>
                    {d.name.slice(0,1)}
                  </div>
                  <div>
                    <div style={{color:C.txt,fontWeight:700,fontSize:15}}>{d.name}</div>
                    <div style={{color:C.mut,fontSize:11}}>{d.kana}</div>
                  </div>
                </div>
                <Badge label={d.status} color={d.status==="待機中"?C.grn:d.status==="配送中"?C.ylw:C.mut}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 10px",fontSize:12}}>
                {[
                  ["社員番号",d.no],["グループ",d.group],
                  ["免許種別",d.license],["免許番号",d.licenseNo],
                  ["免許期限",<span style={{color:du<=30?C.red:du<=60?C.ylw:C.txt}}>{fmtDate(d.licenseExpiry)}{du<=60?` (残${du}日)`:""}</span>],
                  ["入社日",fmtDate(d.hireDate)],
                  ["電話番号",d.phone],["雇用形態",d.empType],
                ].map(([l,v],i)=>(
                  <div key={i}><span style={{color:C.mut}}>{l}：</span><span style={{color:C.txt}}>{v||"-"}</span></div>
                ))}
              </div>
              {d.note&&<div style={{color:C.ylw,fontSize:11,marginTop:8}}>備考：{d.note}</div>}
              <div style={{display:"flex",gap:6,marginTop:12}}>
                <Btn sm full onClick={()=>setModal(d)}>編集</Btn>
                <Btn sm v="danger" onClick={()=>del(d.id)}>削除</Btn>
              </div>
            </div>
          );
        })}
      </div>
      {modal!==null&&<DrvModal drv={modal.id?modal:null} onSave={save} onClose={()=>setModal(null)}/>}
      {showDrvImport&&<ExcelImporter type="drivers" data={data} onImport={rows=>{
        const newItems=rows.map((r,i)=>({id:genId(),
          no:"DRV"+String(data.drivers.length+i+1).padStart(3,"0"),
          name:r["氏名"]||"",kana:r["フリガナ"]||"",phone:r["電話番号"]||"",
          license:r["免許種別"]||"普通第一種",licenseNo:r["免許証番号"]||"",
          licenseExpiry:fmtExcelDate(r["免許有効期限"])||"",
          hireDate:fmtExcelDate(r["入社日"])||"",
          group:r["グループ"]||"A班",empType:r["雇用形態"]||"正社員",
          address:"",birth:"",status:"待機中",note:""}));
        setData(d=>({...d,drivers:[...d.drivers,...newItems]}));setShowDrvImport(false);
      }} onClose={()=>setShowDrvImport(false)}/>}
    </div>
  );
}

function DrvModal({drv,onSave,onClose}){
  const [f,setF]=useState(drv||{name:"",kana:"",phone:"",license:"普通第一種",licenseNo:"",
    licenseExpiry:"",hireDate:"",group:"A班",empType:"正社員",address:"",birth:"",status:"待機中",note:""});
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  return(
    <Modal title={drv?"ドライバー編集":"ドライバー追加"} onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
        <Inp label="氏名" value={f.name} onChange={e=>s("name",e.target.value)}/>
        <Inp label="フリガナ" value={f.kana} onChange={e=>s("kana",e.target.value)}/>
        <Inp label="電話番号" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="090-0000-0000"/>
        <Inp label="生年月日" type="date" value={f.birth} onChange={e=>s("birth",e.target.value)}/>
        <Sel label="免許種別" value={f.license} onChange={e=>s("license",e.target.value)}
          opts={["普通第一種","大型第一種","準中型","中型第一種","普通第二種","大型第二種"]}/>
        <Inp label="免許証番号" value={f.licenseNo} onChange={e=>s("licenseNo",e.target.value)}/>
        <Inp label="免許証更新日" type="date" value={f.licenseExpiry} onChange={e=>s("licenseExpiry",e.target.value)}/>
        <Inp label="入社日" type="date" value={f.hireDate} onChange={e=>s("hireDate",e.target.value)}/>
        <Sel label="グループ" value={f.group} onChange={e=>s("group",e.target.value)}
          opts={["A班","B班","C班","管理職"]}/>
        <Sel label="雇用形態" value={f.empType} onChange={e=>s("empType",e.target.value)}
          opts={["正社員","契約社員","パート","アルバイト"]}/>
        <Sel label="ステータス" value={f.status} onChange={e=>s("status",e.target.value)}
          opts={["待機中","配送中","休暇","退職"]}/>
      </div>
      <Inp label="住所" value={f.address} onChange={e=>s("address",e.target.value)}/>
      <Inp label="備考" value={f.note} onChange={e=>s("note",e.target.value)}/>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
        <Btn v="ghost" onClick={onClose}>キャンセル</Btn>
        <Btn onClick={()=>onSave({...f,id:drv?.id})}>保存</Btn>
      </div>
    </Modal>
  );
}

// ── 車両台帳 ───────────────────────────────────────
function VehicleLedger({data,setData}){
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [sortV,setSortV]=useState("plate");
  const [filtStatus,setFiltStatus]=useState("all");
  const [showVehImport,setShowVehImport]=useState(false);
  const {vehicles}=data;

  let shown=[...vehicles]
    .filter(v=>{
      if(filtStatus!=="all"&&v.status!==filtStatus) return false;
      if(search){
        const q=search.toLowerCase();
        return v.plate.includes(q)||v.type.includes(q);
      }
      return true;
    })
    .sort((a,b)=>{
      if(sortV==="plate") return a.plate.localeCompare(b.plate);
      if(sortV==="insp") return (a.inspDate||"9999").localeCompare(b.inspDate||"9999");
      if(sortV==="oil") return (a.oilDate||"9999").localeCompare(b.oilDate||"9999");
      if(sortV==="capacity_desc") return b.capacity-a.capacity;
      if(sortV==="mileage_desc") return b.mileage-a.mileage;
      return 0;
    });

  const save=(form)=>{
    if(form.id) setData(d=>({...d,vehicles:d.vehicles.map(x=>x.id===form.id?form:x)}));
    else setData(d=>({...d,vehicles:[...d.vehicles,{...form,id:genId()}]}));
    setModal(null);
  };
  const del=(id)=>{ if(!confirm("削除しますか？")) return; setData(d=>({...d,vehicles:d.vehicles.filter(x=>x.id!==id)})); };

  return(
    <div>
      <PageHd title="デジタル車両台帳" action={<div style={{display:"flex",gap:6}}><Btn v="ghost" sm onClick={()=>setShowVehImport(true)}>📥 Excel取込</Btn><Btn onClick={()=>setModal({})}>＋ 追加</Btn></div>}/>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <input placeholder="🔍 ナンバー・車種で検索..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{...inputSt,flex:1,minWidth:180}}/>
        <select value={sortV} onChange={e=>setSortV(e.target.value)} style={{...inputSt,width:160}}>
          <option value="plate">ナンバー順</option>
          <option value="insp">車検期限順</option>
          <option value="oil">オイル交換順</option>
          <option value="capacity_desc">積載量（大きい順）</option>
          <option value="mileage_desc">走行距離（多い順）</option>
        </select>
        <select value={filtStatus} onChange={e=>setFiltStatus(e.target.value)} style={{...inputSt,width:110}}>
          <option value="all">全ステータス</option>
          <option value="空き">空きのみ</option>
          <option value="使用中">使用中のみ</option>
          <option value="整備中">整備中のみ</option>
        </select>
      </div>
      <div style={{color:C.mut,fontSize:12,marginBottom:10}}>{shown.length}台 表示中</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
        {shown.map(v=>{
          const inspDu=daysUntil(v.inspDate);
          const oilDu=daysUntil(v.oilDate);
          return(
            <div key={v.id} style={{background:C.s1,border:`1px solid ${inspDu<=30?C.red:inspDu<=60?C.ylw:C.bdr}`,borderRadius:8,padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{color:C.acc,fontWeight:900,fontFamily:"'Courier New',monospace",fontSize:14}}>{v.plate}</div>
                  <div style={{color:C.txt,fontSize:13,marginTop:2}}>{v.type}</div>
                </div>
                <Badge label={v.status} color={v.status==="空き"?C.grn:v.status==="使用中"?C.ylw:C.red}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 10px",fontSize:12}}>
                {[
                  ["最大積載量",`${v.capacity.toLocaleString()}kg`],
                  ["年式",`${v.year}年`],
                  ["走行距離",`${v.mileage.toLocaleString()}km`],
                  ["車検期限",<span style={{color:inspDu<=30?C.red:inspDu<=60?C.ylw:C.txt}}>{fmtDate(v.inspDate)}{inspDu<=60?` (残${inspDu}日)`:""}</span>],
                  ["オイル交換",<span style={{color:oilDu<=30?C.ylw:C.txt}}>{fmtDate(v.oilDate)}{oilDu<=30?` (残${oilDu}日)`:""}</span>],
                  ["最終整備日",fmtDate(v.lastMaint)],
                ].map(([l,v2],i)=>(
                  <div key={i}><span style={{color:C.mut}}>{l}：</span><span style={{color:C.txt}}>{v2}</span></div>
                ))}
              </div>
              {v.note&&<div style={{color:C.ylw,fontSize:11,marginTop:8}}>備考：{v.note}</div>}
              <div style={{display:"flex",gap:6,marginTop:12}}>
                <Btn sm full onClick={()=>setModal(v)}>編集</Btn>
                <Btn sm v="danger" onClick={()=>del(v.id)}>削除</Btn>
              </div>
            </div>
          );
        })}
      </div>
      {modal!==null&&<VehModal veh={modal.id?modal:null} onSave={save} onClose={()=>setModal(null)}/>}
      {showVehImport&&<ExcelImporter type="vehicles" data={data} onImport={rows=>{
        const newItems=rows.map(r=>({id:genId(),
          plate:r["ナンバープレート"]||"",type:r["車種"]||"2トントラック",
          capacity:Number(r["最大積載量(kg)"]||0),year:Number(r["年式"]||new Date().getFullYear()),
          status:"空き",inspDate:fmtExcelDate(r["車検期限"])||"",
          oilDate:"",lastMaint:"",mileage:Number(r["走行距離(km)"]||0),
          note:r["備考"]||""}));
        setData(d=>({...d,vehicles:[...d.vehicles,...newItems]}));setShowVehImport(false);
      }} onClose={()=>setShowVehImport(false)}/>}
    </div>
  );
}

function VehModal({veh,onSave,onClose}){
  const [f,setF]=useState(veh||{plate:"",type:"2トントラック",capacity:2000,year:new Date().getFullYear(),
    status:"空き",inspDate:"",oilDate:"",lastMaint:"",mileage:0,note:""});
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  return(
    <Modal title={veh?"車両編集":"車両追加"} onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
        <Inp label="ナンバープレート" value={f.plate} onChange={e=>s("plate",e.target.value)} placeholder="大阪 100 あ 1234"/>
        <Sel label="車種" value={f.type} onChange={e=>s("type",e.target.value)}
          opts={["軽トラック","2トントラック","4トントラック","10トントラック","冷凍車","バン","ウィング車"]}/>
        <Inp label="最大積載量(kg)" type="number" value={f.capacity} onChange={e=>s("capacity",Number(e.target.value))}/>
        <Inp label="年式" type="number" value={f.year} onChange={e=>s("year",Number(e.target.value))}/>
        <Sel label="ステータス" value={f.status} onChange={e=>s("status",e.target.value)}
          opts={["空き","使用中","整備中"]}/>
        <Inp label="走行距離(km)" type="number" value={f.mileage} onChange={e=>s("mileage",Number(e.target.value))}/>
        <Inp label="車検期限" type="date" value={f.inspDate} onChange={e=>s("inspDate",e.target.value)}/>
        <Inp label="次回オイル交換" type="date" value={f.oilDate} onChange={e=>s("oilDate",e.target.value)}/>
        <Inp label="最終整備日" type="date" value={f.lastMaint} onChange={e=>s("lastMaint",e.target.value)}/>
      </div>
      <Inp label="備考" value={f.note} onChange={e=>s("note",e.target.value)}/>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
        <Btn v="ghost" onClick={onClose}>キャンセル</Btn>
        <Btn onClick={()=>onSave({...f,id:veh?.id})}>保存</Btn>
      </div>
    </Modal>
  );
}

// ── 安全管理（アルコールチェック） ──────────────────
function Safety({data,setData,role,cDrvId}){
  const [modal,setModal]=useState(null);
  const [month,setMonth]=useState(todayStr().slice(0,7));
  const {attendance,drivers}=data;

  const recs=attendance.filter(a=>a.date.startsWith(month)&&(role==="driver"?a.driverId===cDrvId:true));
  const noCheck=recs.filter(a=>!a.alcoholMorn).length;

  const saveAlcohol=(attId,field,val)=>{
    setData(d=>({...d,attendance:d.attendance.map(a=>a.id===attId?{...a,[field]:val}:a)}));
  };

  return(
    <div>
      <PageHd title="安全管理 / アルコールチェック"/>
      {noCheck>0&&<Alert type="warn">{noCheck}件のアルコールチェック未実施があります</Alert>}
      <div style={{display:"flex",gap:10,marginBottom:14}}>
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{...inputSt,width:140}}/>
        {role==="driver"&&(
          <Btn v="blue" onClick={()=>{
            const today=todayStr();
            const att=data.attendance.find(a=>a.driverId===cDrvId&&a.date===today);
            if(!att){alert("本日の出勤記録がありません。先に出退勤登録を行ってください");return;}
            setModal(att);
          }}>アルコールチェック記録</Btn>
        )}
      </div>

      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",background:C.s1,borderRadius:8,overflow:"hidden"}}>
          <thead><tr>
            {role==="admin"&&<Th c="ドライバー"/>}
            <Th c="日付"/><Th c="出勤前チェック"/><Th c="退勤後チェック"/><Th c="判定"/>
            {role==="admin"&&<Th c="操作"/>}
          </tr></thead>
          <tbody>
            {recs.length===0&&<Tr0 cols={role==="admin"?5:4}/>}
            {recs.sort((a,b)=>b.date.localeCompare(a.date)).map(a=>{
              const drv=drivers.find(d=>d.id===a.driverId);
              const hasIssue=a.alcoholMorn==="異常"||a.alcoholEve==="異常";
              return(
                <tr key={a.id} style={{borderBottom:`1px solid ${C.bdr}`,background:hasIssue?C.redD+"66":""}}>
                  {role==="admin"&&<Td style={{fontWeight:600}}>{drv?.name}</Td>}
                  <Td style={{fontSize:12}}>{fmtDate(a.date)}</Td>
                  <Td>
                    {a.alcoholMorn
                      ?<Badge label={`出勤前: ${a.alcoholMorn}`} color={a.alcoholMorn==="異常"?C.red:C.grn}/>
                      :<Badge label="未実施" color={C.mut}/>}
                  </Td>
                  <Td>
                    {a.alcoholEve
                      ?<Badge label={`退勤後: ${a.alcoholEve}`} color={a.alcoholEve==="異常"?C.red:C.grn}/>
                      :<Badge label="未実施" color={C.mut}/>}
                  </Td>
                  <Td>
                    {hasIssue?<Badge label="異常検知" color={C.red}/>:
                     (!a.alcoholMorn||!a.alcoholEve)?<Badge label="要実施" color={C.ylw}/>:
                     <Badge label="正常" color={C.grn}/>}
                  </Td>
                  {role==="admin"&&<Td>
                    <div style={{display:"flex",gap:4}}>
                      <select value={a.alcoholMorn||""} onChange={e=>saveAlcohol(a.id,"alcoholMorn",e.target.value||null)}
                        style={{...inputSt,width:90,padding:"3px 6px",fontSize:11}}>
                        <option value="">出勤未</option><option value="正常">正常</option><option value="異常">異常</option>
                      </select>
                      <select value={a.alcoholEve||""} onChange={e=>saveAlcohol(a.id,"alcoholEve",e.target.value||null)}
                        style={{...inputSt,width:90,padding:"3px 6px",fontSize:11}}>
                        <option value="">退勤未</option><option value="正常">正常</option><option value="異常">異常</option>
                      </select>
                    </div>
                  </Td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal&&(
        <Modal title="アルコールチェック記録" onClose={()=>setModal(null)}>
          <p style={{color:C.txt,fontSize:13}}>{fmtDate(modal.date)} の記録</p>
          <Sel label="出勤前チェック" value={modal.alcoholMorn||""} onChange={e=>setModal(x=>({...x,alcoholMorn:e.target.value}))}
            opts={[{v:"",l:"選択..."},{v:"正常",l:"正常"},{v:"異常",l:"異常"}]}/>
          <Sel label="退勤後チェック" value={modal.alcoholEve||""} onChange={e=>setModal(x=>({...x,alcoholEve:e.target.value}))}
            opts={[{v:"",l:"選択..."},{v:"正常",l:"正常"},{v:"異常",l:"異常"}]}/>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}>
            <Btn v="ghost" onClick={()=>setModal(null)}>キャンセル</Btn>
            <Btn onClick={()=>{
              setData(d=>({...d,attendance:d.attendance.map(a=>a.id===modal.id?{...a,alcoholMorn:modal.alcoholMorn,alcoholEve:modal.alcoholEve}:a)}));
              setModal(null);
            }}>保存</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── 通知管理 ───────────────────────────────────────
function Notifications({data}){
  const {drivers,vehicles}=data;
  const notifs=[];
  drivers.forEach(d=>{
    const du=daysUntil(d.licenseExpiry);
    if(du<=90) notifs.push({type:du<=30?"danger":du<=60?"warn":"info",cat:"免許更新",
      msg:`${d.name}の免許証更新期限`,date:d.licenseExpiry,days:du});
  });
  vehicles.forEach(v=>{
    const du=daysUntil(v.inspDate);
    if(du<=90) notifs.push({type:du<=30?"danger":du<=60?"warn":"info",cat:"車検",
      msg:`${v.plate}(${v.type})の車検期限`,date:v.inspDate,days:du});
    const od=daysUntil(v.oilDate);
    if(od<=60) notifs.push({type:od<=15?"danger":od<=30?"warn":"info",cat:"オイル交換",
      msg:`${v.plate}のオイル交換目安`,date:v.oilDate,days:od});
  });
  notifs.sort((a,b)=>a.days-b.days);
  const typeColor={danger:C.red,warn:C.ylw,info:C.blue};
  return(
    <div>
      <PageHd title="通知管理"/>
      {notifs.length===0?<p style={{color:C.dim,fontSize:13}}>90日以内の通知はありません ✓</p>:
        notifs.map((n,i)=>(
          <div key={i} style={{background:C.s1,border:`1px solid ${typeColor[n.type]}44`,borderRadius:8,
            padding:"12px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
            <div style={{width:60,height:60,borderRadius:8,background:typeColor[n.type]+"18",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{color:typeColor[n.type],fontWeight:900,fontSize:20,fontFamily:"'Courier New',monospace",lineHeight:1}}>{Math.max(0,n.days)}</span>
              <span style={{color:typeColor[n.type],fontSize:9,fontWeight:700}}>日後</span>
            </div>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                <Badge label={n.cat} color={typeColor[n.type]}/>
                {n.days<=0&&<Badge label="期限超過" color={C.red}/>}
              </div>
              <div style={{color:C.txt,fontSize:14,fontWeight:600}}>{n.msg}</div>
              <div style={{color:C.mut,fontSize:12,marginTop:2}}>期限：{fmtDate(n.date)}</div>
            </div>
          </div>
        ))
      }
    </div>
  );
}

// ── メッセージ ──────────────────────────────────────
function Messages({data,setData,role,cDrvId}){
  const [selDrv,setSelDrv]=useState(role==="driver"?"admin":data.drivers[0]?.id||"");
  const [input,setInput]=useState("");
  const {messages,drivers}=data;
  const me=role==="admin"?"admin":cDrvId;

  const thread=messages.filter(m=>
    (m.from===me&&m.to===selDrv)||(m.from===selDrv&&m.to===me)
  ).sort((a,b)=>a.ts.localeCompare(b.ts));

  const send=()=>{
    if(!input.trim()) return;
    const msg={id:genId(),from:me,to:selDrv,content:input.trim(),ts:new Date().toISOString(),read:false};
    setData(d=>({...d,messages:[...d.messages,msg]}));
    setInput("");
  };

  const contacts=role==="admin"?drivers:[{id:"admin",name:"管理者",group:""}];

  return(
    <div style={{height:"calc(100vh - 140px)",display:"flex",flexDirection:"column"}}>
      <PageHd title="メッセージ"/>
      <div style={{display:"flex",gap:12,flex:1,minHeight:0}}>
        {role==="admin"&&(
          <div style={{width:180,background:C.s1,borderRadius:8,border:`1px solid ${C.bdr}`,overflowY:"auto",flexShrink:0}}>
            {drivers.map(d=>{
              const unread=messages.filter(m=>m.from===d.id&&m.to==="admin"&&!m.read).length;
              return(
                <button key={d.id} onClick={()=>setSelDrv(d.id)} style={{
                  width:"100%",textAlign:"left",background:selDrv===d.id?C.accD:"none",
                  border:"none",borderLeft:selDrv===d.id?`3px solid ${C.acc}`:"3px solid transparent",
                  padding:"10px 12px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:selDrv===d.id?C.acc:C.txt,fontSize:13,fontWeight:600}}>{d.name}</div>
                    <div style={{color:C.mut,fontSize:10}}>{d.group}</div>
                  </div>
                  {unread>0&&<span style={{background:C.red,color:"#fff",borderRadius:"50%",width:18,height:18,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>{unread}</span>}
                </button>
              );
            })}
          </div>
        )}
        <div style={{flex:1,display:"flex",flexDirection:"column",background:C.s1,borderRadius:8,border:`1px solid ${C.bdr}`,minHeight:0}}>
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.bdr}`,color:C.txt,fontWeight:700,fontSize:13,flexShrink:0}}>
            {role==="admin"?drivers.find(d=>d.id===selDrv)?.name||"-":"管理者"}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:14,display:"flex",flexDirection:"column",gap:8}}>
            {thread.length===0&&<p style={{color:C.dim,fontSize:13,textAlign:"center",marginTop:40}}>メッセージなし</p>}
            {thread.map(m=>{
              const isMine=m.from===me;
              return(
                <div key={m.id} style={{display:"flex",justifyContent:isMine?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"72%",background:isMine?C.accD:C.s2,borderRadius:8,
                    border:`1px solid ${isMine?C.acc+"44":C.bdr}`,padding:"8px 12px"}}>
                    <div style={{color:isMine?C.acc:C.txt,fontSize:13}}>{m.content}</div>
                    <div style={{color:C.mut,fontSize:10,marginTop:4,textAlign:"right"}}>{m.ts.slice(11,16)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{padding:"10px 14px",borderTop:`1px solid ${C.bdr}`,display:"flex",gap:8,flexShrink:0}}>
            <input value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
              placeholder="メッセージを入力..." style={{...inputSt,flex:1}}/>
            <Btn onClick={send} disabled={!input.trim()}>送信</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 請求管理 ───────────────────────────────────────
// 請求書プレビューモーダル（ポップアップブロック回避）
function InvoicePreviewModal({bill, company, onClose}){
  const printRef = useRef(null);
  const doPrint = () => {
    const css = `
      @media print {
        body > * { display: none !important; }
        #inv-print-root { display: block !important; }
      }
      #inv-print-root {
        font-family: 'MS Gothic','Hiragino Kaku Gothic Pro',sans-serif;
        color: #1a1a1a; font-size: 13px; padding: 30px; max-width: 800px;
        position: fixed; top: 0; left: 0; right: 0; background: #fff; z-index: 99999;
      }
    `;
    const style = document.createElement('style');
    style.id = 'inv-print-style';
    style.textContent = css;
    document.head.appendChild(style);
    const el = document.getElementById('inv-print-root');
    if(el) el.style.display = 'block';
    window.print();
    setTimeout(()=>{ style.remove(); if(el) el.style.display='none'; }, 500);
  };
  const co = company || {};
  const total = Number(bill.amount||0) + Number(bill.tax||0);
  return(
    <Modal title="請求書プレビュー" onClose={onClose} wide>
      {/* 印刷ボタン */}
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:16}}>
        <Btn v="ghost" onClick={onClose}>閉じる</Btn>
        <Btn onClick={doPrint}>🖨 印刷する</Btn>
      </div>
      {/* プレビュー本体 */}
      <div id="inv-print-root" style={{background:"#fff",padding:"28px 32px",borderRadius:8,
        border:"1px solid #ddd",color:"#1a1a1a",fontFamily:"sans-serif",display:"block"}}>
        <div style={{textAlign:"center",marginBottom:8}}>
          <div style={{fontSize:26,fontWeight:"bold",letterSpacing:"0.2em"}}>請　求　書</div>
          <div style={{color:"#555",fontSize:12,marginBottom:32}}>{bill.no}</div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:16}}>
          <div>
            <div style={{fontSize:18,fontWeight:"bold",borderBottom:"2px solid #1a1a1a",
              paddingBottom:6,marginBottom:4}}>{bill.customer||"顧客名未設定"}　御中</div>
            <div style={{fontSize:12,color:"#555",marginTop:6}}>下記の通りご請求申し上げます。</div>
            <div style={{marginTop:12,fontSize:13}}>
              <strong>お支払期限：</strong>{bill.dueDate||"--"}
            </div>
          </div>
          <div style={{textAlign:"right",fontSize:12,lineHeight:1.8}}>
            <div style={{fontSize:15,fontWeight:"bold"}}>{co.name||"株式会社〇〇運送"}</div>
            <div>{co.address||"〒000-0000 大阪府〇〇市〇〇町1-1"}</div>
            <div>TEL: {co.phone||"06-0000-0000"}</div>
            <div>登録番号: {co.regNo||"T0000000000000"}</div>
            <div style={{marginTop:6}}>発行日: {bill.issueDate||"--"}</div>
          </div>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",marginBottom:8}}>
          <thead>
            <tr>
              <th style={{background:"#1a1a1a",color:"#fff",padding:"10px 12px",textAlign:"left",fontSize:12}}>品目</th>
              <th style={{background:"#1a1a1a",color:"#fff",padding:"10px 12px",textAlign:"right",fontSize:12}}>金額</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{padding:"10px 12px",borderBottom:"1px solid #ddd"}}>
              運送料金（{bill.note||"配送サービス"}）
            </td><td style={{padding:"10px 12px",borderBottom:"1px solid #ddd",textAlign:"right",fontFamily:"'Courier New',monospace"}}>
              ¥{Number(bill.amount||0).toLocaleString()}
            </td></tr>
            <tr style={{background:"#f5f5f5",fontWeight:"bold"}}>
              <td style={{padding:"10px 12px",borderBottom:"1px solid #ddd"}}>小計</td>
              <td style={{padding:"10px 12px",borderBottom:"1px solid #ddd",textAlign:"right",fontFamily:"'Courier New',monospace"}}>¥{Number(bill.amount||0).toLocaleString()}</td>
            </tr>
            <tr><td style={{padding:"10px 12px",borderBottom:"1px solid #ddd"}}>消費税（10%）</td>
              <td style={{padding:"10px 12px",borderBottom:"1px solid #ddd",textAlign:"right",fontFamily:"'Courier New',monospace"}}>¥{Number(bill.tax||0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        <div style={{fontSize:18,fontWeight:"bold",textAlign:"right",padding:"12px 16px",
          background:"#1a1a1a",color:"#fff",marginBottom:16}}>
          合計金額　¥{total.toLocaleString()}
        </div>
        {bill.note&&<div style={{padding:"10px 12px",background:"#f9f9f9",borderLeft:"3px solid #aaa",
          fontSize:12,color:"#555",marginBottom:12}}>備考：{bill.note}</div>}
        <div style={{padding:"14px",border:"1px solid #ddd",borderRadius:4,fontSize:12}}>
          <div style={{fontWeight:"bold",marginBottom:6}}>お振込先</div>
          <div>{co.bankName||"〇〇銀行 〇〇支店"}</div>
          <div>口座種別：{co.bankType||"普通"}　口座番号：{co.bankNo||"0000000"}</div>
          <div>口座名義：{co.bankHolder||"カブシキガイシャ〇〇ウンソウ"}</div>
        </div>
      </div>
    </Modal>
  );
}

function BillModal({bill, orders, onSave, onClose}){
  const [f,setF]=useState(bill||{
    customer:"", orderIds:[], amount:0, tax:0,
    status:"請求済", issueDate:todayStr(), dueDate:"", note:""
  });
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  const toggle=(id)=>s("orderIds", f.orderIds.includes(id)
    ? f.orderIds.filter(x=>x!==id)
    : [...f.orderIds, id]
  );
  // 関連注文から金額自動合計
  const autoSum=()=>{
    const sel=(orders||[]).filter(o=>f.orderIds.includes(o.id));
    const subtotal=sel.reduce((s,o)=>s+(Number(o.amount)||0),0);
    setF(x=>({...x, amount:subtotal, tax:Math.round(subtotal*0.1)}));
  };
  return(
    <Modal title={bill?"請求編集":"新規請求"} onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
        <Inp label="顧客名" value={f.customer} onChange={e=>s("customer",e.target.value)}/>
        <Sel label="ステータス" value={f.status} onChange={e=>s("status",e.target.value)}
          opts={["請求済","未入金","入金済","キャンセル"]}/>
        <Inp label="発行日" type="date" value={f.issueDate} onChange={e=>s("issueDate",e.target.value)}/>
        <Inp label="支払期限" type="date" value={f.dueDate} onChange={e=>s("dueDate",e.target.value)}/>
        <Inp label="金額(税抜)" type="number" value={f.amount} onChange={e=>s("amount",Number(e.target.value))}/>
        <Inp label="消費税" type="number" value={f.tax} onChange={e=>s("tax",Number(e.target.value))}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <label style={{color:C.mut,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>
          関連注文 ({f.orderIds.length}件選択)
        </label>
        <Btn sm v="ghost" onClick={autoSum}>選択注文から金額自動計算</Btn>
      </div>
      <div style={{background:C.s2,borderRadius:4,padding:10,border:`1px solid ${C.bdr}`,
        maxHeight:150,overflowY:"auto",marginBottom:12}}>
        {(orders||[]).length===0
          ? <p style={{color:C.dim,fontSize:12,margin:0}}>注文データなし</p>
          : (orders||[]).map(o=>(
            <label key={o.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",cursor:"pointer"}}>
              <input type="checkbox" checked={f.orderIds.includes(o.id)} onChange={()=>toggle(o.id)}/>
              <code style={{color:C.acc,fontSize:11}}>{o.no}</code>
              <span style={{fontSize:12,color:C.txt}}>{o.customer}</span>
              <span style={{fontSize:11,color:C.mut,marginLeft:"auto"}}>¥{Number(o.amount||0).toLocaleString()}</span>
            </label>
          ))
        }
      </div>
      <Inp label="備考" value={f.note} onChange={e=>s("note",e.target.value)}/>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
        <Btn v="ghost" onClick={onClose}>キャンセル</Btn>
        <Btn onClick={()=>onSave({...f, id:bill?.id})}>保存</Btn>
      </div>
    </Modal>
  );
}

function Billing({data,setData}){
  const [modal,setModal]=useState(null);
  const [printBill,setPrintBill]=useState(null);
  const [sortB,setSortB]=useState("date_desc");
  const [showCompany,setShowCompany]=useState(false);
  const [company,setCompany]=useState(()=>{
    try{ return JSON.parse(localStorage.getItem("tms-company")||"{}"); }catch{ return {}; }
  });
  const [showImport,setShowImport]=useState(false);
  const {billing,orders}=data;

  const save=(form)=>{
    if(form.id) setData(d=>({...d,billing:d.billing.map(b=>b.id===form.id?form:b)}));
    else {
      const no="INV-"+String(data.billing.length+1).padStart(3,"0");
      setData(d=>({...d,billing:[...d.billing,{...form,id:genId(),no}]}));
    }
    setModal(null);
  };
  const del=(id)=>{ if(!confirm("削除？")) return; setData(d=>({...d,billing:d.billing.filter(b=>b.id!==id)})); };

  const sorted=[...billing].sort((a,b)=>{
    if(sortB==="date_desc") return (b.issueDate||"").localeCompare(a.issueDate||"");
    if(sortB==="date_asc") return (a.issueDate||"").localeCompare(b.issueDate||"");
    if(sortB==="amount_desc") return (b.amount+b.tax)-(a.amount+a.tax);
    if(sortB==="customer") return (a.customer||"").localeCompare(b.customer||"");
    if(sortB==="due") return (a.dueDate||"").localeCompare(b.dueDate||"");
    return 0;
  });

  const total=billing.reduce((s,b)=>s+(b.amount||0)+(b.tax||0),0);
  const unpaid=billing.filter(b=>b.status==="未入金").reduce((s,b)=>s+(b.amount||0)+(b.tax||0),0);

  const saveCompany=(c)=>{
    try{ localStorage.setItem("tms-company",JSON.stringify(c)); }catch{}
    setCompany(c); setShowCompany(false);
  };

  const handleImport=(rows)=>{
    const newItems=rows.map(r=>({
      id:genId(), no:"INV-"+String(billing.length+newItems?.length+1||1).padStart(3,"0"),
      customer:r["顧客名"]||"", amount:Number(r["金額(税抜)"]||r["金額"]||0),
      tax:Number(r["消費税"]||0), status:r["ステータス"]||"請求済",
      issueDate:fmtExcelDate(r["発行日"])||todayStr(),
      dueDate:fmtExcelDate(r["支払期限"])||"",
      orderIds:[], note:r["備考"]||""
    }));
    setData(d=>({...d,billing:[...d.billing,...newItems]}));
    setShowImport(false);
  };

  return(
    <div>
      <PageHd title="請求管理" action={
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <Btn v="ghost" sm onClick={()=>setShowImport(true)}>📥 Excel取込</Btn>
          <Btn v="ghost" sm onClick={()=>setShowCompany(true)}>自社情報</Btn>
          <Btn onClick={()=>setModal({})}>＋ 新規請求</Btn>
        </div>
      }/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:18}}>
        <StatCard label="総請求額" val={`¥${total.toLocaleString()}`} color={C.acc}/>
        <StatCard label="未入金" val={`¥${unpaid.toLocaleString()}`} color={unpaid>0?C.red:C.mut} alert={unpaid>0}/>
        <StatCard label="件数" val={`${billing.length}件`} color={C.txt}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <select value={sortB} onChange={e=>setSortB(e.target.value)} style={{...inputSt,width:180}}>
          <option value="date_desc">発行日（新しい順）</option>
          <option value="date_asc">発行日（古い順）</option>
          <option value="due">支払期限順</option>
          <option value="amount_desc">金額（大きい順）</option>
          <option value="customer">顧客名順</option>
        </select>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",background:C.s1,borderRadius:8,overflow:"hidden"}}>
          <thead><tr>
            <Th c="請求書番号"/><Th c="顧客"/><Th c="合計金額"/>
            <Th c="発行日"/><Th c="支払期限"/><Th c="ステータス"/><Th c="操作"/>
          </tr></thead>
          <tbody>
            {sorted.length===0&&<Tr0 cols={7}/>}
            {sorted.map(b=>(
              <tr key={b.id} style={{borderBottom:`1px solid ${C.bdr}`}}>
                <Td><code style={{color:C.acc,fontSize:11}}>{b.no}</code></Td>
                <Td>{b.customer}</Td>
                <Td style={{fontFamily:"'Courier New',monospace",fontWeight:700}}>
                  ¥{((b.amount||0)+(b.tax||0)).toLocaleString()}
                </Td>
                <Td style={{fontSize:11}}>{fmtDate(b.issueDate)}</Td>
                <Td style={{fontSize:11,color:daysUntil(b.dueDate)<=0&&b.status!=="入金済"?C.red:C.txt}}>
                  {fmtDate(b.dueDate)}
                </Td>
                <Td>
                  <Badge label={b.status} color={b.status==="入金済"?C.grn:b.status==="未入金"?C.red:C.blue}/>
                </Td>
                <Td>
                  <div style={{display:"flex",gap:4}}>
                    <Btn sm onClick={()=>setModal(b)}>編集</Btn>
                    <Btn sm v="blue" onClick={()=>setPrintBill(b)}>印刷</Btn>
                    <Btn sm v="danger" onClick={()=>del(b.id)}>削除</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal!==null&&<BillModal bill={modal.id?modal:null} orders={orders} onSave={save} onClose={()=>setModal(null)}/>}
      {printBill&&<InvoicePreviewModal bill={printBill} company={company} onClose={()=>setPrintBill(null)}/>}
      {showCompany&&<CompanyModal company={company} onSave={saveCompany} onClose={()=>setShowCompany(false)}/>}
      {showImport&&<ExcelImporter type="billing" data={data} onImport={handleImport} onClose={()=>setShowImport(false)}/>}
    </div>
  );
}

function CompanyModal({company, onSave, onClose}){
  const [f,setF]=useState(company||{name:"",address:"",phone:"",regNo:"",bankName:"",bankType:"普通",bankNo:"",bankHolder:""});
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  return(
    <Modal title="自社情報設定（請求書に印刷）" onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
        <Inp label="会社名" value={f.name||""} onChange={e=>s("name",e.target.value)}/>
        <Inp label="電話番号" value={f.phone||""} onChange={e=>s("phone",e.target.value)}/>
      </div>
      <Inp label="住所" value={f.address||""} onChange={e=>s("address",e.target.value)}/>
      <Inp label="インボイス登録番号" value={f.regNo||""} onChange={e=>s("regNo",e.target.value)}/>
      <div style={{background:C.s2,borderRadius:8,padding:"12px",marginTop:4}}>
        <div style={{color:C.mut,fontSize:11,fontWeight:700,textTransform:"uppercase",marginBottom:10}}>振込先口座</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
          <Inp label="銀行名・支店名" value={f.bankName||""} onChange={e=>s("bankName",e.target.value)}/>
          <Sel label="口座種別" value={f.bankType||"普通"} onChange={e=>s("bankType",e.target.value)} opts={["普通","当座"]}/>
          <Inp label="口座番号" value={f.bankNo||""} onChange={e=>s("bankNo",e.target.value)}/>
          <Inp label="口座名義（カタカナ）" value={f.bankHolder||""} onChange={e=>s("bankHolder",e.target.value)}/>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:10}}>
        <Btn v="ghost" onClick={onClose}>キャンセル</Btn>
        <Btn onClick={()=>onSave(f)}>保存</Btn>
      </div>
    </Modal>
  );
}


// ── 納品先カルテ ────────────────────────────────────
function Destinations({data,setData}){
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [sortDst,setSortDst]=useState("name");
  const [showDstImport,setShowDstImport]=useState(false);
  const {destinations,orders}=data;

  const save=(form)=>{
    if(form.id) setData(d=>({...d,destinations:d.destinations.map(x=>x.id===form.id?form:x)}));
    else setData(d=>({...d,destinations:[...d.destinations,{...form,id:genId()}]}));
    setModal(null);
  };
  const del=(id)=>{ if(!confirm("削除？")) return; setData(d=>({...d,destinations:d.destinations.filter(x=>x.id!==id)})); };

  const getCount=(id)=>orders.filter(o=>o.destId===id).length;
  const getLast=(id)=>orders.filter(o=>o.destId===id).sort((a,b)=>b.date.localeCompare(a.date))[0];

  let shown=[...destinations]
    .filter(d=>{
      if(!search) return true;
      const q=search.toLowerCase();
      return d.name.includes(q)||d.address?.includes(q)||d.contact?.includes(q)||d.phone?.includes(q);
    })
    .sort((a,b)=>{
      if(sortDst==="name") return a.name.localeCompare(b.name);
      if(sortDst==="count_desc") return getCount(b.id)-getCount(a.id);
      if(sortDst==="last_desc"){
        const la=getLast(a.id)?.date||"";
        const lb=getLast(b.id)?.date||"";
        return lb.localeCompare(la);
      }
      return 0;
    });

  return(
    <div>
      <PageHd title="デジタル納品先カルテ" action={<div style={{display:"flex",gap:6}}><Btn v="ghost" sm onClick={()=>setShowDstImport(true)}>📥 Excel取込</Btn><Btn onClick={()=>setModal({})}>＋ 追加</Btn></div>}/>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <input placeholder="🔍 名称・住所・担当者で検索..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{...inputSt,flex:1,minWidth:180}}/>
        <select value={sortDst} onChange={e=>setSortDst(e.target.value)} style={{...inputSt,width:160}}>
          <option value="name">名称順</option>
          <option value="count_desc">配送実績（多い順）</option>
          <option value="last_desc">最終配送（新しい順）</option>
        </select>
      </div>
      <div style={{color:C.mut,fontSize:12,marginBottom:10}}>{shown.length}件 表示中</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
        {shown.map(dst=>{
          const cnt=getCount(dst.id);
          const last=getLast(dst.id);
          return(
            <div key={dst.id} style={{background:C.s1,border:`1px solid ${C.bdr}`,borderRadius:8,padding:"14px 16px"}}>
              <div style={{color:C.acc,fontWeight:700,fontSize:14,marginBottom:8}}>{dst.name}</div>
              <div style={{fontSize:12,color:C.txt,marginBottom:4}}>{dst.address}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 10px",fontSize:12,marginTop:8}}>
                <div><span style={{color:C.mut}}>担当者：</span>{dst.contact}</div>
                <div><span style={{color:C.mut}}>TEL：</span>{dst.phone}</div>
                <div><span style={{color:C.mut}}>積込目安：</span>{dst.loadMin}分</div>
                <div><span style={{color:C.mut}}>荷降目安：</span>{dst.unloadMin}分</div>
                <div><span style={{color:C.mut}}>配送実績：</span><span style={{color:C.acc,fontWeight:700}}>{cnt}件</span></div>
                {last&&<div><span style={{color:C.mut}}>最終：</span>{fmtDate(last.date)}</div>}
              </div>
              {dst.note&&<div style={{color:C.ylw,fontSize:11,marginTop:8}}>⚠ {dst.note}</div>}
              <div style={{display:"flex",gap:6,marginTop:12}}>
                <Btn sm full onClick={()=>setModal(dst)}>編集</Btn>
                <Btn sm v="danger" onClick={()=>del(dst.id)}>削除</Btn>
              </div>
            </div>
          );
        })}
      </div>
      {modal!==null&&<DestModal dst={modal.id?modal:null} onSave={save} onClose={()=>setModal(null)}/>}
      {showDstImport&&<ExcelImporter type="destinations" data={data} onImport={rows=>{
        const newItems=rows.map(r=>({id:genId(),
          name:r["名称"]||"",address:r["住所"]||"",contact:r["担当者名"]||"",
          phone:r["電話番号"]||"",loadMin:Number(r["積込目安(分)"]||30),
          unloadMin:Number(r["荷降目安(分)"]||30),note:r["備考"]||""}));
        setData(d=>({...d,destinations:[...d.destinations,...newItems]}));setShowDstImport(false);
      }} onClose={()=>setShowDstImport(false)}/>}
    </div>
  );
}

function DestModal({dst,onSave,onClose}){
  const [f,setF]=useState(dst||{name:"",address:"",contact:"",phone:"",note:"",loadMin:30,unloadMin:30});
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  return(
    <Modal title={dst?"納品先編集":"納品先追加"} onClose={onClose}>
      <Inp label="納品先名称" value={f.name} onChange={e=>s("name",e.target.value)}/>
      <Inp label="住所" value={f.address} onChange={e=>s("address",e.target.value)}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
        <Inp label="担当者" value={f.contact} onChange={e=>s("contact",e.target.value)}/>
        <Inp label="電話番号" value={f.phone} onChange={e=>s("phone",e.target.value)}/>
        <Inp label="積込目安(分)" type="number" value={f.loadMin} onChange={e=>s("loadMin",Number(e.target.value))}/>
        <Inp label="荷降目安(分)" type="number" value={f.unloadMin} onChange={e=>s("unloadMin",Number(e.target.value))}/>
      </div>
      <Inp label="備考・注意事項" value={f.note} onChange={e=>s("note",e.target.value)}/>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
        <Btn v="ghost" onClick={onClose}>キャンセル</Btn>
        <Btn onClick={()=>onSave({...f,id:dst?.id})}>保存</Btn>
      </div>
    </Modal>
  );
}

// ── 運行履歴 ───────────────────────────────────────
// ※「運行管理」は配車・配送の指示を管理するもの。
//   「運行履歴」は実際に走った記録（走行距離・燃料費）を記録するもの。
function OpLogs({data,setData,role,cDrvId}){
  const [modal,setModal]=useState(null);
  const [sortOp,setSortOp]=useState("date_desc");
  const [filtDrv,setFiltDrv]=useState(role==="driver"?cDrvId:"all");
  const [filtMonth,setFiltMonth]=useState("");
  const [showOpImport,setShowOpImport]=useState(false);
  const {opLogs,drivers,vehicles}=data;

  let shown=opLogs.filter(l=>{
    if(filtDrv!=="all"&&l.driverId!==filtDrv) return false;
    if(filtMonth&&!l.date.startsWith(filtMonth)) return false;
    return true;
  });
  shown=[...shown].sort((a,b)=>{
    if(sortOp==="date_desc") return b.date.localeCompare(a.date);
    if(sortOp==="date_asc") return a.date.localeCompare(b.date);
    if(sortOp==="dist_desc") return (b.distance||0)-(a.distance||0);
    if(sortOp==="fuel_desc") return (b.fuelCost||0)-(a.fuelCost||0);
    return 0;
  });

  const save=(form)=>{
    if(form.id) setData(d=>({...d,opLogs:d.opLogs.map(l=>l.id===form.id?form:l)}));
    else setData(d=>({...d,opLogs:[...d.opLogs,{...form,id:genId()}]}));
    setModal(null);
  };
  const del=(id)=>{ if(!confirm("削除？")) return; setData(d=>({...d,opLogs:d.opLogs.filter(l=>l.id!==id)})); };

  const totalDist=shown.reduce((s,l)=>s+(l.distance||0),0);
  const totalFuel=shown.reduce((s,l)=>s+(l.fuelCost||0),0);
  const totalLiter=shown.reduce((s,l)=>s+(l.fuelLiter||0),0);

  // 燃料種別集計
  const fuelByType={};
  shown.forEach(l=>{
    if(l.fuelType){
      fuelByType[l.fuelType]=(fuelByType[l.fuelType]||0)+(l.fuelCost||0);
    }
  });

  return(
    <div>
      <PageHd title="運行履歴記録" action={<div style={{display:"flex",gap:6}}><Btn v="ghost" sm onClick={()=>setShowOpImport(true)}>📥 Excel取込</Btn><Btn onClick={()=>setModal({})}>＋ 登録</Btn></div>}/>
      <div style={{background:C.blueD,border:`1px solid ${C.blue}33`,borderRadius:8,padding:"8px 12px",
        marginBottom:14,fontSize:12,color:C.blue}}>
        💡 <strong>運行履歴</strong> = 実際に走った記録（距離・燃料費） ／ <strong>配車管理</strong> = 誰が何を運ぶかの指示
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:16}}>
        <StatCard label="走行距離計" val={`${totalDist.toLocaleString()}km`} color={C.blue}/>
        <StatCard label="燃料費計" val={`¥${totalFuel.toLocaleString()}`} color={C.ylw}/>
        {totalLiter>0&&<StatCard label="給油量計" val={`${totalLiter.toFixed(1)}L`} color={C.pur}/>}
        <StatCard label="件数" val={`${shown.length}件`} color={C.txt}/>
      </div>
      {Object.keys(fuelByType).length>0&&(
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          {Object.entries(fuelByType).map(([type,cost])=>(
            <div key={type} style={{background:C.s2,borderRadius:6,padding:"6px 12px",fontSize:12}}>
              <span style={{color:C.mut}}>{type}：</span>
              <span style={{color:C.ylw,fontWeight:700}}>¥{cost.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <input type="month" value={filtMonth} onChange={e=>setFiltMonth(e.target.value)}
          style={{...inputSt,width:140}} placeholder="月で絞り込み"/>
        {role==="admin"&&<select value={filtDrv} onChange={e=>setFiltDrv(e.target.value)} style={{...inputSt,width:150}}>
          <option value="all">全ドライバー</option>
          {drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select>}
        <select value={sortOp} onChange={e=>setSortOp(e.target.value)} style={{...inputSt,width:160}}>
          <option value="date_desc">日付（新しい順）</option>
          <option value="date_asc">日付（古い順）</option>
          <option value="dist_desc">走行距離（長い順）</option>
          <option value="fuel_desc">燃料費（高い順）</option>
        </select>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",background:C.s1,borderRadius:8,overflow:"hidden"}}>
          <thead><tr>
            {role==="admin"&&<Th c="ドライバー"/>}
            <Th c="日付"/><Th c="車両"/><Th c="出発〜到着"/>
            <Th c="走行距離"/><Th c="燃料種別"/><Th c="給油量"/><Th c="燃料費"/><Th c="ルート"/><Th c="操作"/>
          </tr></thead>
          <tbody>
            {shown.length===0&&<Tr0 cols={role==="admin"?10:9}/>}
            {shown.map(l=>{
              const drv=drivers.find(d=>d.id===l.driverId);
              const veh=vehicles.find(v=>v.id===l.vehicleId);
              return(
                <tr key={l.id} style={{borderBottom:`1px solid ${C.bdr}`}}>
                  {role==="admin"&&<Td style={{fontWeight:600}}>{drv?.name}</Td>}
                  <Td style={{fontSize:11}}>{fmtDate(l.date)}</Td>
                  <Td style={{fontSize:11,color:C.mut}}>{veh?.plate||"-"}</Td>
                  <Td><code style={{fontSize:11}}>{l.startTime}〜{l.endTime}</code></Td>
                  <Td style={{fontFamily:"'Courier New',monospace"}}>{l.distance}km</Td>
                  <Td style={{fontSize:11}}>{l.fuelType||<span style={{color:C.dim}}>-</span>}</Td>
                  <Td style={{fontSize:11}}>{l.fuelLiter?`${l.fuelLiter}L`:<span style={{color:C.dim}}>-</span>}</Td>
                  <Td style={{fontFamily:"'Courier New',monospace",color:C.ylw}}>¥{l.fuelCost?.toLocaleString()}</Td>
                  <Td style={{fontSize:12,color:C.mut}}>{l.route||"-"}</Td>
                  <Td>
                    <div style={{display:"flex",gap:4}}>
                      <Btn sm onClick={()=>setModal(l)}>編集</Btn>
                      {role==="admin"&&<Btn sm v="danger" onClick={()=>del(l.id)}>削除</Btn>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modal!==null&&<OpModal log={modal.id?modal:null} drivers={drivers} vehicles={vehicles} onSave={save} onClose={()=>setModal(null)}/>}
      {showOpImport&&<ExcelImporter type="oplogs" data={data} onImport={rows=>{
        const newItems=rows.map(r=>({id:genId(),
          driverId:findDrvId(drivers,r["ドライバー氏名"]),vehicleId:"",
          date:fmtExcelDate(r["日付"])||todayStr(),
          startTime:String(r["出発時刻"]||"").slice(0,5),
          endTime:String(r["到着時刻"]||"").slice(0,5),
          odomStart:0,odomEnd:0,
          distance:Number(r["走行距離(km)"]||0),
          fuelType:r["燃料種別"]||"軽油",
          fuelLiter:Number(r["給油量(L)"]||0)||null,
          fuelCost:Number(r["燃料費(円)"]||0),
          route:r["ルート名"]||"",note:""}));
        setData(d=>({...d,opLogs:[...d.opLogs,...newItems]}));setShowOpImport(false);
      }} onClose={()=>setShowOpImport(false)}/>}
    </div>
  );
}

function OpModal({log,drivers,vehicles,onSave,onClose}){
  const [f,setF]=useState(log||{driverId:drivers[0]?.id||"",vehicleId:"",date:todayStr(),
    startTime:"",endTime:"",odomStart:0,odomEnd:0,distance:0,route:"",fuelType:"軽油",fuelLiter:null,fuelCost:0,note:""});
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  return(
    <Modal title={log?"運行記録編集":"運行記録登録"} onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
        <Sel label="ドライバー" value={f.driverId} onChange={e=>s("driverId",e.target.value)}
          opts={drivers.map(d=>({v:d.id,l:d.name}))}/>
        <Sel label="車両" value={f.vehicleId||""} onChange={e=>s("vehicleId",e.target.value)}
          opts={[{v:"",l:"未選択"},...vehicles.map(v=>({v:v.id,l:`${v.plate}(${v.type})`}))]}/>
        <Inp label="日付" type="date" value={f.date} onChange={e=>s("date",e.target.value)}/>
        <Inp label="ルート名" value={f.route} onChange={e=>s("route",e.target.value)}/>
        <Inp label="出発時刻" type="time" value={f.startTime} onChange={e=>s("startTime",e.target.value)}/>
        <Inp label="到着時刻" type="time" value={f.endTime} onChange={e=>s("endTime",e.target.value)}/>
        <Inp label="出発時 ODO(km)" type="number" value={f.odomStart} onChange={e=>s("odomStart",Number(e.target.value))}/>
        <Inp label="到着時 ODO(km)" type="number" value={f.odomEnd} onChange={e=>s("odomEnd",Number(e.target.value))}/>
        <Inp label="走行距離(km)" type="number" value={f.distance} onChange={e=>s("distance",Number(e.target.value))}/>
      </div>
      <div style={{background:C.s2,borderRadius:8,padding:"12px",marginBottom:14}}>
        <div style={{color:C.mut,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>燃料情報</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0 14px"}}>
          <Sel label="燃料種別" value={f.fuelType||""} onChange={e=>s("fuelType",e.target.value)}
            opts={[{v:"",l:"未記録"},{v:"軽油",l:"軽油"},{v:"ガソリン",l:"ガソリン"},{v:"LPG",l:"LPG"},{v:"電気",l:"電気（EV）"}]}/>
          <Inp label="給油量(L)" type="number" value={f.fuelLiter||""} onChange={e=>s("fuelLiter",Number(e.target.value)||null)}/>
          <Inp label="燃料費(円)" type="number" value={f.fuelCost} onChange={e=>s("fuelCost",Number(e.target.value))}/>
        </div>
      </div>
      <Inp label="備考" value={f.note} onChange={e=>s("note",e.target.value)}/>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
        <Btn v="ghost" onClick={onClose}>キャンセル</Btn>
        <Btn onClick={()=>onSave({...f,id:log?.id})}>保存</Btn>
      </div>
    </Modal>
  );
}

// ── 管理者台帳 ──────────────────────────────────────
function AdminLedger({data,setData}){
  const [modal,setModal]=useState(null);
  const admins=data.admins||[];
  const save=(form)=>{
    if(form.id) setData(d=>({...d,admins:(d.admins||[]).map(x=>x.id===form.id?form:x)}));
    else setData(d=>({...d,admins:[...(d.admins||[]),{...form,id:genId()}]}));
    setModal(null);
  };
  const del=(id)=>{ if(!confirm("削除？")) return; setData(d=>({...d,admins:(d.admins||[]).filter(x=>x.id!==id)})); };
  return(
    <div>
      <PageHd title="デジタル管理者台帳" action={<Btn onClick={()=>setModal({})}>＋ 追加</Btn>}/>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",background:C.s1,borderRadius:8,overflow:"hidden"}}>
          <thead><tr><Th c="氏名"/><Th c="役職"/><Th c="資格"/><Th c="電話番号"/><Th c="メールアドレス"/><Th c="操作"/></tr></thead>
          <tbody>
            {admins.length===0&&<Tr0 cols={6}/>}
            {admins.map(a=>(
              <tr key={a.id} style={{borderBottom:`1px solid ${C.bdr}`}}>
                <Td style={{fontWeight:600}}>{a.name}</Td>
                <Td>{a.role}</Td>
                <Td style={{fontSize:12}}>{a.qualification||"-"}</Td>
                <Td><code style={{fontSize:12}}>{a.phone}</code></Td>
                <Td style={{fontSize:12,color:C.mut}}>{a.email}</Td>
                <Td>
                  <div style={{display:"flex",gap:4}}>
                    <Btn sm onClick={()=>setModal(a)}>編集</Btn>
                    <Btn sm v="danger" onClick={()=>del(a.id)}>削除</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal!==null&&(
        <Modal title={modal.id?"管理者編集":"管理者追加"} onClose={()=>setModal(null)}>
          {[["name","氏名"],["role","役職"],["qualification","資格"],["phone","電話番号"],["email","メールアドレス"]].map(([k,l])=>(
            <Inp key={k} label={l} value={modal[k]||""} onChange={e=>setModal(x=>({...x,[k]:e.target.value}))}/>
          ))}
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
            <Btn v="ghost" onClick={()=>setModal(null)}>キャンセル</Btn>
            <Btn onClick={()=>save({...modal,id:modal.id})}>保存</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Excel インポーター ────────────────────────────────
const EXCEL_TEMPLATES = {
  orders:      {title:"配送管理",      cols:["顧客名","届け先住所","重量(kg)","配送予定日","金額(円)","備考"],example:["山田商事","大阪市中央区本町1-1","500","2026-04-01","25000","精密機器注意"]},
  attendance:  {title:"勤怠管理",      cols:["ドライバー氏名","日付","出勤時刻","退勤時刻","運転時間(分)","備考"],example:["田中 一郎","2026-04-01","08:00","18:00","360",""]},
  shifts:      {title:"シフト・有給",   cols:["ドライバー氏名","日付","種別"],example:["田中 一郎","2026-04-05","年休"]},
  billing:     {title:"請求管理",      cols:["顧客名","金額(税抜)","消費税","発行日","支払期限","ステータス","備考"],example:["山田商事","25000","2500","2026-04-01","2026-04-30","請求済",""]},
  drivers:     {title:"運転者台帳",    cols:["氏名","フリガナ","電話番号","免許種別","免許証番号","免許有効期限","入社日","グループ","雇用形態"],example:["田中 一郎","タナカ イチロウ","090-1234-5678","大型第一種","東京12-345678","2026-12-01","2018-04-01","A班","正社員"]},
  vehicles:    {title:"車両台帳",      cols:["ナンバープレート","車種","最大積載量(kg)","年式","車検期限","走行距離(km)","備考"],example:["大阪 100 あ 1234","2トントラック","2000","2019","2026-06-30","85000",""]},
  destinations:{title:"納品先カルテ", cols:["名称","住所","担当者名","電話番号","積込目安(分)","荷降目安(分)","備考"],example:["山田商事 大阪本社","大阪市中央区本町3-4-5","山田太郎","06-1234-5678","30","45","搬入口：北側"]},
  oplogs:      {title:"運行履歴",      cols:["ドライバー氏名","日付","出発時刻","到着時刻","走行距離(km)","燃料種別","給油量(L)","燃料費(円)","ルート名"],example:["田中 一郎","2026-04-01","08:00","18:30","350","軽油","45","6800","大阪北ルート"]},
};

function ExcelImporter({type, data, onImport, onClose}){
  const [rows,setRows]=useState(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const tmpl = EXCEL_TEMPLATES[type];
  if(!tmpl) return null;

  const handleFile=(e)=>{
    const file=e.target.files&&e.target.files[0];
    if(!file){setError("ファイルを選択してください");return;}
    setError(""); setBusy(true);
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const parsed=XLSX.utils.sheet_to_json(ws,{defval:""});
        if(parsed.length===0){setError("データが見つかりません。ヘッダー行と1件以上のデータが必要です。");setBusy(false);return;}
        setRows(parsed);
      }catch(err){setError("ファイル読み込みエラー: "+(err.message||"不明"));}
      setBusy(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate=()=>{
    const ws=XLSX.utils.aoa_to_sheet([tmpl.cols,tmpl.example]);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,tmpl.title);
    XLSX.writeFile(wb,"template_"+type+".xlsx");
  };

  return(
    <Modal title={"Excelインポート："+tmpl.title} onClose={onClose} wide>
      <Alert type="info">1行目をヘッダー行にしてください。列の順番は問いません。</Alert>
      <div style={{background:C.s2,borderRadius:8,padding:"10px 14px",marginBottom:14}}>
        <div style={{color:C.mut,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>必要な列名</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {tmpl.cols.map(function(c,i){return(
            <span key={i} style={{background:C.s1,border:"1px solid "+C.bdr,borderRadius:4,
              padding:"3px 8px",fontSize:12,color:C.acc,fontFamily:"'Courier New',monospace"}}>{c}</span>
          );})}
        </div>
        <button onClick={downloadTemplate} style={{background:"none",border:"1px solid "+C.grn+"44",
          borderRadius:4,padding:"5px 12px",color:C.grn,fontSize:12,cursor:"pointer",fontWeight:700}}>
          ↓ テンプレートをダウンロード
        </button>
      </div>
      <div style={{border:"2px dashed "+C.bdr,borderRadius:8,padding:"20px",
        textAlign:"center",marginBottom:14,cursor:"pointer"}}
        onClick={function(){document.getElementById("xl-file-input").click();}}>
        <div style={{fontSize:30,marginBottom:6}}>📂</div>
        <div style={{color:C.txt,fontSize:14,fontWeight:700}}>クリックしてExcelを選択</div>
        <div style={{color:C.mut,fontSize:12,marginTop:3}}>.xlsx / .xls 形式</div>
        <input id="xl-file-input" type="file" accept=".xlsx,.xls" onChange={handleFile} style={{display:"none"}}/>
      </div>
      {busy&&<p style={{color:C.blue,fontSize:13,textAlign:"center"}}>読み込み中...</p>}
      {error&&<Alert type="danger">{error}</Alert>}
      {rows&&rows.length>0&&(
        <div>
          <div style={{color:C.grn,fontSize:13,fontWeight:700,marginBottom:8}}>{"✓ "+rows.length+"件のデータを検出（先頭3件プレビュー）"}</div>
          <div style={{overflowX:"auto",marginBottom:14}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr>{Object.keys(rows[0]).map(function(k){return(
                <th key={k} style={{background:C.s2,color:C.mut,padding:"5px 8px",
                  textAlign:"left",fontWeight:700,whiteSpace:"nowrap",borderBottom:"1px solid "+C.bdr}}>{k}</th>
              );})}</tr></thead>
              <tbody>{rows.slice(0,3).map(function(r,i){return(
                <tr key={i} style={{borderBottom:"1px solid "+C.bdr}}>
                  {Object.values(r).map(function(v,j){return(
                    <td key={j} style={{padding:"4px 8px",color:C.txt,whiteSpace:"nowrap"}}>{String(v)}</td>
                  );})}
                </tr>
              );})}</tbody>
            </table>
          </div>
          <Alert type="warn">既存データに追加されます（上書きではありません）</Alert>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}>
        <Btn v="ghost" onClick={onClose}>キャンセル</Btn>
        <Btn onClick={function(){onImport(rows);}} disabled={!rows||rows.length===0}>
          {rows?rows.length+"件をインポート":"インポート"}
        </Btn>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════
//  NAVIGATION + APP SHELL
// ══════════════════════════════════════════════════

const ADMIN_NAV = [
  {id:"dashboard",icon:"📊",label:"ダッシュボード"},
  {id:"dispatch",icon:"🚦",label:"配車管理"},
  {id:"orders",icon:"📦",label:"配送管理"},
  {id:"labor",icon:"⚖️",label:"改善基準管理"},
  {id:"attendance",icon:"🕐",label:"勤怠管理"},
  {id:"shifts",icon:"📅",label:"シフト・有給"},
  {id:"safety",icon:"🔍",label:"安全管理"},
  {id:"notifications",icon:"🔔",label:"通知管理"},
  {id:"messages",icon:"💬",label:"メッセージ"},
  {id:"billing",icon:"💴",label:"請求管理"},
  {id:"drivers",icon:"👤",label:"運転者台帳"},
  {id:"vehicles",icon:"🚛",label:"車両台帳"},
  {id:"destinations",icon:"📍",label:"納品先カルテ"},
  {id:"oplogs",icon:"📋",label:"運行履歴"},
  {id:"admins",icon:"🏢",label:"管理者台帳"},
];

const DRIVER_NAV = [
  {id:"dashboard", icon:"🏠", label:"ホーム"},
  {id:"attendance",icon:"🕐", label:"出退勤"},
  {id:"orders",    icon:"📦", label:"配送"},
  {id:"safety",    icon:"🔍", label:"安全"},
  {id:"messages",  icon:"💬", label:"連絡"},
];

// ══════════════════════════════════════════════════
//  MOBILE DRIVER COMPONENTS
// ══════════════════════════════════════════════════

const mSt = {
  card: {
    background:C.s1, border:`1px solid ${C.bdr}`, borderRadius:12,
    padding:"16px", marginBottom:12
  },
  label: { color:C.mut, fontSize:13, marginBottom:4, display:"block" },
  val:   { color:C.txt, fontSize:17, fontWeight:700 },
  bigBtn: {
    width:"100%", border:"none", borderRadius:12, padding:"18px",
    fontSize:18, fontWeight:900, cursor:"pointer", display:"flex",
    alignItems:"center", justifyContent:"center", gap:10, lineHeight:1
  },
};

function MCard({children, alert, style={}}){
  return <div style={{...mSt.card, border:`1px solid ${alert?C.red:C.bdr}`, ...style}}>{children}</div>;
}

function MRow({label, value, color}){
  return(
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center",
      padding:"10px 0", borderBottom:`1px solid ${C.bdr}`}}>
      <span style={{color:C.mut, fontSize:15}}>{label}</span>
      <span style={{color:color||C.txt, fontSize:15, fontWeight:600}}>{value}</span>
    </div>
  );
}

function MSection({title, children}){
  return(
    <div style={{marginBottom:20}}>
      <div style={{color:C.mut, fontSize:12, fontWeight:700, textTransform:"uppercase",
        letterSpacing:"0.1em", marginBottom:8, paddingLeft:4}}>{title}</div>
      {children}
    </div>
  );
}

// ── モバイル: マイページ ──────────────────────────
function MDriverDashboard({data, cDrvId, setTab}){
  const {drivers, orders, attendance, messages} = data;
  const drv = drivers.find(d=>d.id===cDrvId);
  const today = todayStr();
  const myAtt = attendance.find(a=>a.driverId===cDrvId&&a.date===today);
  const lr = calcLabor(myAtt);
  const myOrders = orders.filter(o=>o.driverId===cDrvId && o.date===today && o.status!=="完了" && o.status!=="キャンセル");
  const unread = messages.filter(m=>m.to===cDrvId&&!m.read).length;
  const licDu = daysUntil(drv?.licenseExpiry);

  return(
    <div style={{paddingBottom:100}}>
      {/* ヘッダーカード */}
      <div style={{background:C.accD, border:`1px solid ${C.acc}44`, borderRadius:12,
        padding:"20px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:14}}>
        <div style={{width:54, height:54, borderRadius:"50%", background:C.acc+"33",
          display:"flex", alignItems:"center", justifyContent:"center",
          color:C.acc, fontWeight:900, fontSize:22}}>
          {drv?.name?.slice(0,1)}
        </div>
        <div>
          <div style={{color:C.acc, fontWeight:900, fontSize:20}}>{drv?.name}</div>
          <div style={{color:C.txt, fontSize:14, marginTop:2}}>{drv?.group} / {drv?.license}</div>
          <div style={{marginTop:6, display:"flex", gap:6}}>
            <span style={{background:drv?.status==="待機中"?C.grnD:C.ylwD,
              color:drv?.status==="待機中"?C.grn:C.ylw,
              padding:"3px 10px", borderRadius:20, fontSize:13, fontWeight:700}}>
              {drv?.status||"待機中"}
            </span>
            {myAtt && <span style={{background:C.blueD, color:C.blue,
              padding:"3px 10px", borderRadius:20, fontSize:13, fontWeight:700}}>
              出勤中
            </span>}
          </div>
        </div>
      </div>

      {/* アラート */}
      {licDu <= 60 && (
        <div style={{background:licDu<=30?C.redD:C.ylwD, border:`1px solid ${licDu<=30?C.red:C.ylw}44`,
          borderRadius:10, padding:"12px 14px", marginBottom:12, display:"flex", gap:10, alignItems:"center"}}>
          <span style={{fontSize:22}}>⚠️</span>
          <div>
            <div style={{color:licDu<=30?C.red:C.ylw, fontWeight:700, fontSize:15}}>免許証の更新が必要です</div>
            <div style={{color:C.mut, fontSize:13, marginTop:2}}>期限まで残り{licDu}日（{fmtDate(drv?.licenseExpiry)}）</div>
          </div>
        </div>
      )}

      {/* 労務サマリー */}
      {lr && (
        <MSection title="本日の労務状況">
          <MCard alert={lr.over13}>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:4, textAlign:"center"}}>
              {[
                {label:"拘束時間", val:fmtHM(lr.total), color:lr.over16?C.red:lr.over13?C.ylw:C.txt},
                {label:"運転時間", val:fmtHM(lr.drive), color:lr.driveOver?C.ylw:C.txt},
                {label:"残業時間", val:fmtHM(lr.overtime), color:lr.overtime>0?C.ylw:C.mut},
              ].map((item,i)=>(
                <div key={i} style={{padding:"10px 4px"}}>
                  <div style={{color:C.mut, fontSize:12, marginBottom:4}}>{item.label}</div>
                  <div style={{color:item.color, fontSize:20, fontWeight:900,
                    fontFamily:"'Courier New',monospace"}}>{item.val}</div>
                </div>
              ))}
            </div>
            {lr.over16 && <div style={{background:C.red+"22", borderRadius:8, padding:"8px 10px", marginTop:8,
              color:C.red, fontWeight:700, fontSize:14, textAlign:"center"}}>⚠ 拘束16時間超過（改善基準違反）</div>}
            {!lr.over16 && lr.over13 && <div style={{background:C.ylw+"22", borderRadius:8, padding:"8px 10px", marginTop:8,
              color:C.ylw, fontWeight:700, fontSize:14, textAlign:"center"}}>⚠ 拘束13時間超過</div>}
          </MCard>
        </MSection>
      )}

      {/* 本日の配送 */}
      <MSection title={`本日の担当配送 (${myOrders.length}件)`}>
        {myOrders.length===0
          ? <div style={{...mSt.card, textAlign:"center", color:C.mut, fontSize:15, padding:24}}>本日の配送なし</div>
          : myOrders.map(o=>(
            <MCard key={o.id}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8}}>
                <code style={{color:C.acc, fontSize:13}}>{o.no}</code>
                <span style={{background:o.status==="配送中"?C.ylwD:C.blueD,
                  color:o.status==="配送中"?C.ylw:C.blue,
                  padding:"3px 10px", borderRadius:20, fontSize:13, fontWeight:700}}>{o.status}</span>
              </div>
              <div style={{color:C.txt, fontSize:17, fontWeight:700, marginBottom:4}}>{o.customer}</div>
              <div style={{color:C.mut, fontSize:14, marginBottom:12}}>{o.address}</div>
              {o.note && <div style={{color:C.ylw, fontSize:13, marginBottom:10}}>⚠ {o.note}</div>}
            </MCard>
          ))
        }
      </MSection>

      {/* クイックアクション */}
      <MSection title="クイックアクション">
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
          {[
            {label:"出退勤", icon:"🕐", tab:"attendance", bg:C.blueD, color:C.blue},
            {label:"アルコール\nチェック", icon:"🔍", tab:"safety", bg:C.grnD, color:C.grn},
            {label:"配送確認", icon:"📦", tab:"orders", bg:C.accD, color:C.acc},
            {label:"メッセージ"+(unread>0?` (${unread})`:""), icon:"💬", tab:"messages", bg:unread>0?C.redD:C.s2, color:unread>0?C.red:C.mut},
          ].map((item,i)=>(
            <button key={i} onClick={()=>setTab(item.tab)} style={{
              background:item.bg, border:`1px solid ${item.color}33`,
              borderRadius:12, padding:"16px 12px", cursor:"pointer",
              textAlign:"center"}}>
              <div style={{fontSize:28, marginBottom:6}}>{item.icon}</div>
              <div style={{color:item.color, fontWeight:700, fontSize:14, whiteSpace:"pre-line", lineHeight:1.3}}>{item.label}</div>
            </button>
          ))}
        </div>
      </MSection>
    </div>
  );
}

// ── モバイル: 出退勤 ──────────────────────────────
function MAttendance({data, setData, cDrvId}){
  const {attendance, drivers} = data;
  const today = todayStr();
  const myAtt = attendance.find(a=>a.driverId===cDrvId&&a.date===today);
  const lr = calcLabor(myAtt);
  const [breaking, setBreaking] = useState(false);

  const clockIn = () => {
    if(myAtt) return alert("本日すでに出勤登録済みです");
    setData(d=>({...d, attendance:[...d.attendance,{
      id:genId(), driverId:cDrvId, date:today,
      clockIn:nowTime(), clockOut:null, breaks:[],
      driveMin:0, status:"出勤中", alcoholMorn:null, alcoholEve:null, note:""
    }]}));
  };

  const clockOut = () => {
    if(!myAtt) return alert("本日の出勤記録がありません");
    if(!confirm("退勤しますか？")) return;
    setData(d=>({...d, attendance:d.attendance.map(a=>
      a.id===myAtt.id ? {...a, clockOut:nowTime(), status:"退勤済"} : a
    )}));
  };

  const startBreak = () => {
    if(!myAtt) return;
    const newBrk = {start:nowTime(), end:null};
    setData(d=>({...d, attendance:d.attendance.map(a=>
      a.id===myAtt.id ? {...a, breaks:[...a.breaks, newBrk]} : a
    )}));
    setBreaking(true);
  };

  const endBreak = () => {
    if(!myAtt) return;
    const brks = [...myAtt.breaks];
    const last = brks.length-1;
    if(last>=0 && !brks[last].end) brks[last] = {...brks[last], end:nowTime()};
    setData(d=>({...d, attendance:d.attendance.map(a=>
      a.id===myAtt.id ? {...a, breaks:brks} : a
    )}));
    setBreaking(false);
  };

  const myRecs = attendance.filter(a=>a.driverId===cDrvId)
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);

  return(
    <div style={{paddingBottom:100}}>
      <div style={{color:C.txt, fontSize:20, fontWeight:900, marginBottom:16}}>出退勤管理</div>

      {/* 今日の状態 */}
      <MCard alert={lr?.over13}>
        <div style={{textAlign:"center", marginBottom:16}}>
          <div style={{color:C.mut, fontSize:13, marginBottom:4}}>{fmtDate(today)}</div>
          {myAtt
            ? <div style={{color:myAtt.clockOut?C.mut:C.grn, fontSize:16, fontWeight:700}}>
                {myAtt.clockOut ? "退勤済" : "出勤中"}
              </div>
            : <div style={{color:C.dim, fontSize:16}}>未出勤</div>
          }
        </div>
        {myAtt && (
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16}}>
            <div style={{background:C.s2, borderRadius:8, padding:"10px", textAlign:"center"}}>
              <div style={{color:C.mut, fontSize:12, marginBottom:4}}>出勤</div>
              <div style={{color:C.grn, fontSize:22, fontWeight:900, fontFamily:"'Courier New',monospace"}}>{myAtt.clockIn}</div>
            </div>
            <div style={{background:C.s2, borderRadius:8, padding:"10px", textAlign:"center"}}>
              <div style={{color:C.mut, fontSize:12, marginBottom:4}}>退勤</div>
              <div style={{color:myAtt.clockOut?C.txt:C.ylw, fontSize:22, fontWeight:900, fontFamily:"'Courier New',monospace"}}>
                {myAtt.clockOut || nowTime()}
              </div>
            </div>
          </div>
        )}
        {lr && (
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16}}>
            <div style={{background:C.s2, borderRadius:8, padding:"10px", textAlign:"center"}}>
              <div style={{color:C.mut, fontSize:12, marginBottom:4}}>拘束時間</div>
              <div style={{color:lr.over13?C.red:C.txt, fontSize:20, fontWeight:900,
                fontFamily:"'Courier New',monospace"}}>{fmtHM(lr.total)}</div>
            </div>
            <div style={{background:C.s2, borderRadius:8, padding:"10px", textAlign:"center"}}>
              <div style={{color:C.mut, fontSize:12, marginBottom:4}}>休憩合計</div>
              <div style={{color:C.blue, fontSize:20, fontWeight:900,
                fontFamily:"'Courier New',monospace"}}>{fmtHM(lr.breakMin)}</div>
            </div>
          </div>
        )}
        {/* ボタン群 */}
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          {!myAtt && (
            <button onClick={clockIn} style={{...mSt.bigBtn, background:C.grn, color:"#000"}}>
              <span style={{fontSize:24}}>🟢</span> 出勤する
            </button>
          )}
          {myAtt && !myAtt.clockOut && !breaking && (
            <button onClick={startBreak} style={{...mSt.bigBtn, background:C.blueD,
              color:C.blue, border:`2px solid ${C.blue}44`}}>
              <span style={{fontSize:22}}>⏸</span> 休憩開始
            </button>
          )}
          {myAtt && !myAtt.clockOut && breaking && (
            <button onClick={endBreak} style={{...mSt.bigBtn, background:C.ylwD,
              color:C.ylw, border:`2px solid ${C.ylw}44`}}>
              <span style={{fontSize:22}}>▶</span> 休憩終了
            </button>
          )}
          {myAtt && !myAtt.clockOut && (
            <button onClick={clockOut} style={{...mSt.bigBtn, background:C.redD,
              color:C.red, border:`2px solid ${C.red}44`}}>
              <span style={{fontSize:24}}>🔴</span> 退勤する
            </button>
          )}
        </div>
      </MCard>

      {/* 直近の記録 */}
      <MSection title="最近の記録">
        {myRecs.map(a=>{
          const r = calcLabor(a);
          return(
            <div key={a.id} style={{...mSt.card, borderLeft:`3px solid ${r?.over13?C.red:r?.total>0?C.grn:C.bdr}`}}>
              <div style={{display:"flex", justifyContent:"space-between", marginBottom:6}}>
                <span style={{color:C.txt, fontSize:15, fontWeight:700}}>{fmtDate(a.date)}</span>
                <span style={{color:a.status==="退勤済"?C.grn:a.status==="出勤中"?C.ylw:C.mut,
                  fontSize:13, fontWeight:700}}>{a.status}</span>
              </div>
              <div style={{display:"flex", gap:16, fontSize:14, color:C.mut}}>
                <span>出勤 <span style={{color:C.grn, fontFamily:"'Courier New',monospace"}}>{a.clockIn}</span></span>
                <span>退勤 <span style={{color:C.txt, fontFamily:"'Courier New',monospace"}}>{a.clockOut||"--"}</span></span>
                {r && <span>拘束 <span style={{color:r.over13?C.red:C.txt, fontFamily:"'Courier New',monospace",
                  fontWeight:700}}>{fmtHM(r.total)}</span></span>}
              </div>
            </div>
          );
        })}
      </MSection>
    </div>
  );
}

// ── モバイル: 担当配送 ────────────────────────────
function MOrders({data, setData, cDrvId}){
  const {orders, vehicles} = data;
  const [filt, setFilt] = useState("active");
  const base = orders.filter(o=>o.driverId===cDrvId);
  const shown = filt==="active"
    ? base.filter(o=>o.status!=="完了"&&o.status!=="キャンセル")
    : base.filter(o=>o.status==="完了"||o.status==="キャンセル");

  const changeStatus = (id, s) =>
    setData(d=>({...d, orders:d.orders.map(o=>o.id===id?{...o,status:s}:o)}));

  const updateTime = (id, field) =>
    setData(d=>({...d, orders:d.orders.map(o=>o.id===id?{...o,[field]:nowTime()}:o)}));

  return(
    <div style={{paddingBottom:100}}>
      <div style={{color:C.txt, fontSize:20, fontWeight:900, marginBottom:16}}>担当配送</div>
      <div style={{display:"flex", gap:8, marginBottom:16}}>
        {[["active","進行中"],["done","完了・済"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilt(v)} style={{
            flex:1, padding:"10px", border:"none", borderRadius:8,
            background:filt===v?C.acc:C.s2, color:filt===v?"#000":C.mut,
            fontSize:15, fontWeight:700, cursor:"pointer"}}>{l}</button>
        ))}
      </div>
      {shown.length===0
        ? <div style={{...mSt.card, textAlign:"center", color:C.mut, fontSize:16, padding:32}}>
            {filt==="active" ? "担当中の配送なし" : "完了した配送なし"}
          </div>
        : shown.map(o=>{
          const veh = vehicles.find(v=>v.id===o.vehicleId);
          return(
            <MCard key={o.id}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10}}>
                <code style={{color:C.acc, fontSize:13}}>{o.no}</code>
                <span style={{
                  background:o.status==="完了"?C.grnD:o.status==="配送中"?C.ylwD:C.blueD,
                  color:o.status==="完了"?C.grn:o.status==="配送中"?C.ylw:C.blue,
                  padding:"4px 12px", borderRadius:20, fontSize:14, fontWeight:700
                }}>{o.status}</span>
              </div>
              <div style={{color:C.txt, fontSize:18, fontWeight:700, marginBottom:4}}>{o.customer}</div>
              <div style={{color:C.mut, fontSize:15, marginBottom:4}}>{o.address}</div>
              <div style={{color:C.mut, fontSize:14, marginBottom:8}}>
                {o.weight}kg {o.date&&`/ ${fmtDate(o.date)}`}
                {veh&&<span style={{marginLeft:8}}>🚛 {veh.plate}</span>}
              </div>
              {o.note && <div style={{background:C.ylwD, borderRadius:8, padding:"8px 10px",
                color:C.ylw, fontSize:14, marginBottom:10}}>⚠ {o.note}</div>}

              {/* 積込・荷降ろし時間記録 */}
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12}}>
                <div style={{background:C.s2, borderRadius:8, padding:"8px 10px"}}>
                  <div style={{color:C.mut, fontSize:12, marginBottom:4}}>積込</div>
                  <div style={{color:C.grn, fontSize:14, fontFamily:"'Courier New',monospace"}}>
                    {o.loadStart||"--"} 〜 {o.loadEnd||"--"}
                  </div>
                </div>
                <div style={{background:C.s2, borderRadius:8, padding:"8px 10px"}}>
                  <div style={{color:C.mut, fontSize:12, marginBottom:4}}>荷降ろし</div>
                  <div style={{color:C.blue, fontSize:14, fontFamily:"'Courier New',monospace"}}>
                    {o.unloadStart||"--"} 〜 {o.unloadEnd||"--"}
                  </div>
                </div>
              </div>

              {/* アクションボタン */}
              {o.status==="配車済み" && (
                <div style={{display:"flex", flexDirection:"column", gap:8}}>
                  {!o.loadStart && <button onClick={()=>updateTime(o.id,"loadStart")} style={{
                    ...mSt.bigBtn, background:C.grnD, color:C.grn,
                    border:`1px solid ${C.grn}44`, fontSize:15}}>
                    📥 積込開始
                  </button>}
                  {o.loadStart && !o.loadEnd && <button onClick={()=>updateTime(o.id,"loadEnd")} style={{
                    ...mSt.bigBtn, background:C.grnD, color:C.grn,
                    border:`1px solid ${C.grn}44`, fontSize:15}}>
                    ✅ 積込完了
                  </button>}
                  {o.loadEnd && <button onClick={()=>changeStatus(o.id,"配送中")} style={{
                    ...mSt.bigBtn, background:C.ylwD, color:C.ylw,
                    border:`1px solid ${C.ylw}44`, fontSize:15}}>
                    🚛 出発・配送開始
                  </button>}
                </div>
              )}
              {o.status==="配送中" && (
                <div style={{display:"flex", flexDirection:"column", gap:8}}>
                  {!o.unloadStart && <button onClick={()=>updateTime(o.id,"unloadStart")} style={{
                    ...mSt.bigBtn, background:C.blueD, color:C.blue,
                    border:`1px solid ${C.blue}44`, fontSize:15}}>
                    📤 荷降ろし開始
                  </button>}
                  {o.unloadStart && !o.unloadEnd && <button onClick={()=>{
                    updateTime(o.id,"unloadEnd");
                    changeStatus(o.id,"完了");
                  }} style={{
                    ...mSt.bigBtn, background:C.grnD, color:C.grn,
                    border:`1px solid ${C.grn}44`, fontSize:15}}>
                    🎉 荷降ろし完了・配送完了
                  </button>}
                  {o.unloadEnd && <button onClick={()=>changeStatus(o.id,"完了")} style={{
                    ...mSt.bigBtn, background:C.grnD, color:C.grn,
                    border:`1px solid ${C.grn}44`, fontSize:15}}>
                    ✅ 配送完了
                  </button>}
                </div>
              )}
            </MCard>
          );
        })
      }
    </div>
  );
}

// ── モバイル: 安全管理 ────────────────────────────
function MSafety({data, setData, cDrvId}){
  const {attendance} = data;
  const today = todayStr();
  const myAtt = attendance.find(a=>a.driverId===cDrvId&&a.date===today);
  const [result, setResult] = useState(null);

  const saveCheck = (field, val) => {
    if(!myAtt){alert("先に出勤登録を行ってください"); return;}
    setData(d=>({...d, attendance:d.attendance.map(a=>
      a.id===myAtt.id ? {...a, [field]:val} : a
    )}));
    setResult({field, val});
  };

  const myRecs = attendance.filter(a=>a.driverId===cDrvId)
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);

  return(
    <div style={{paddingBottom:100}}>
      <div style={{color:C.txt, fontSize:20, fontWeight:900, marginBottom:16}}>安全管理</div>

      <MSection title="アルコールチェック">
        <MCard>
          <div style={{textAlign:"center", marginBottom:16}}>
            <div style={{fontSize:36, marginBottom:8}}>🍺</div>
            <div style={{color:C.txt, fontSize:16, fontWeight:700}}>本日 {fmtDate(today)}</div>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
            <div style={{background:C.s2, borderRadius:10, padding:"10px", textAlign:"center"}}>
              <div style={{color:C.mut, fontSize:12, marginBottom:6}}>出勤前</div>
              <div style={{color:myAtt?.alcoholMorn==="正常"?C.grn:myAtt?.alcoholMorn==="異常"?C.red:C.dim,
                fontSize:16, fontWeight:700, marginBottom:6}}>
                {myAtt?.alcoholMorn||"未実施"}
              </div>
            </div>
            <div style={{background:C.s2, borderRadius:10, padding:"10px", textAlign:"center"}}>
              <div style={{color:C.mut, fontSize:12, marginBottom:6}}>退勤後</div>
              <div style={{color:myAtt?.alcoholEve==="正常"?C.grn:myAtt?.alcoholEve==="異常"?C.red:C.dim,
                fontSize:16, fontWeight:700, marginBottom:6}}>
                {myAtt?.alcoholEve||"未実施"}
              </div>
            </div>
          </div>

          {result && (
            <div style={{background:result.val==="正常"?C.grnD:C.redD,
              borderRadius:10, padding:"12px", textAlign:"center", marginBottom:12,
              color:result.val==="正常"?C.grn:C.red, fontWeight:700, fontSize:16}}>
              {result.val==="正常" ? "✅ 正常を記録しました" : "⚠️ 異常を記録しました"}
            </div>
          )}

          <div style={{marginBottom:12}}>
            <div style={{color:C.mut, fontSize:14, fontWeight:700, marginBottom:8}}>出勤前チェック</div>
            <div style={{display:"flex", gap:8}}>
              <button onClick={()=>saveCheck("alcoholMorn","正常")} style={{
                flex:1, padding:"14px", border:`2px solid ${C.grn}44`,
                borderRadius:10, background:C.grnD, color:C.grn,
                fontSize:16, fontWeight:900, cursor:"pointer"}}>✅ 正常</button>
              <button onClick={()=>saveCheck("alcoholMorn","異常")} style={{
                flex:1, padding:"14px", border:`2px solid ${C.red}44`,
                borderRadius:10, background:C.redD, color:C.red,
                fontSize:16, fontWeight:900, cursor:"pointer"}}>❌ 異常</button>
            </div>
          </div>
          <div>
            <div style={{color:C.mut, fontSize:14, fontWeight:700, marginBottom:8}}>退勤後チェック</div>
            <div style={{display:"flex", gap:8}}>
              <button onClick={()=>saveCheck("alcoholEve","正常")} style={{
                flex:1, padding:"14px", border:`2px solid ${C.grn}44`,
                borderRadius:10, background:C.grnD, color:C.grn,
                fontSize:16, fontWeight:900, cursor:"pointer"}}>✅ 正常</button>
              <button onClick={()=>saveCheck("alcoholEve","異常")} style={{
                flex:1, padding:"14px", border:`2px solid ${C.red}44`,
                borderRadius:10, background:C.redD, color:C.red,
                fontSize:16, fontWeight:900, cursor:"pointer"}}>❌ 異常</button>
            </div>
          </div>
        </MCard>
      </MSection>

      <MSection title="チェック履歴">
        {myRecs.map(a=>(
          <div key={a.id} style={{...mSt.card,
            borderLeft:`3px solid ${a.alcoholMorn==="異常"||a.alcoholEve==="異常"?C.red:
              a.alcoholMorn&&a.alcoholEve?C.grn:C.bdr}`}}>
            <div style={{display:"flex", justifyContent:"space-between", marginBottom:6}}>
              <span style={{color:C.txt, fontSize:15, fontWeight:700}}>{fmtDate(a.date)}</span>
              {a.alcoholMorn==="異常"||a.alcoholEve==="異常"
                ? <span style={{color:C.red, fontWeight:700}}>異常あり</span>
                : a.alcoholMorn&&a.alcoholEve
                  ? <span style={{color:C.grn, fontWeight:700}}>✓ 完了</span>
                  : <span style={{color:C.ylw}}>未完了</span>}
            </div>
            <div style={{display:"flex", gap:16, fontSize:14}}>
              <span style={{color:C.mut}}>出勤前：
                <span style={{color:a.alcoholMorn==="正常"?C.grn:a.alcoholMorn==="異常"?C.red:C.dim,
                  fontWeight:700, marginLeft:4}}>{a.alcoholMorn||"未"}</span>
              </span>
              <span style={{color:C.mut}}>退勤後：
                <span style={{color:a.alcoholEve==="正常"?C.grn:a.alcoholEve==="異常"?C.red:C.dim,
                  fontWeight:700, marginLeft:4}}>{a.alcoholEve||"未"}</span>
              </span>
            </div>
          </div>
        ))}
      </MSection>
    </div>
  );
}

// ── モバイル: メッセージ ──────────────────────────
function MMessages({data, setData, cDrvId}){
  const {messages} = data;
  const [input, setInput] = useState("");
  const thread = messages
    .filter(m=>(m.from===cDrvId&&m.to==="admin")||(m.from==="admin"&&m.to===cDrvId))
    .sort((a,b)=>a.ts.localeCompare(b.ts));
  const endRef = useRef(null);

  useEffect(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),[thread.length]);

  const send = () => {
    if(!input.trim()) return;
    const msg={id:genId(), from:cDrvId, to:"admin", content:input.trim(),
      ts:new Date().toISOString(), read:false};
    setData(d=>({...d, messages:[...d.messages, msg]}));
    setInput("");
  };

  return(
    <div style={{display:"flex", flexDirection:"column", height:"calc(100vh - 140px)"}}>
      <div style={{color:C.txt, fontSize:20, fontWeight:900, marginBottom:12}}>管理者へのメッセージ</div>
      <div style={{flex:1, overflowY:"auto", marginBottom:10}}>
        {thread.length===0 && <div style={{textAlign:"center", color:C.mut, fontSize:15, marginTop:40}}>
          メッセージなし
        </div>}
        {thread.map(m=>{
          const isMine = m.from===cDrvId;
          return(
            <div key={m.id} style={{display:"flex", justifyContent:isMine?"flex-end":"flex-start", marginBottom:10}}>
              {!isMine && <div style={{width:34, height:34, borderRadius:"50%", background:C.accD,
                display:"flex", alignItems:"center", justifyContent:"center", color:C.acc,
                fontSize:13, fontWeight:900, marginRight:8, flexShrink:0, marginTop:2}}>管</div>}
              <div style={{
                maxWidth:"78%", padding:"12px 14px", borderRadius:isMine?"14px 14px 4px 14px":"14px 14px 14px 4px",
                background:isMine?C.accD:C.s2,
                border:`1px solid ${isMine?C.acc+"44":C.bdr}`}}>
                <div style={{color:isMine?C.acc:C.txt, fontSize:16, lineHeight:1.5}}>{m.content}</div>
                <div style={{color:C.mut, fontSize:11, marginTop:4, textAlign:"right"}}>{m.ts.slice(11,16)}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef}/>
      </div>
      <div style={{display:"flex", gap:8, paddingBottom:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder="メッセージを入力..." style={{
            ...inputSt, flex:1, fontSize:16, padding:"12px 14px", borderRadius:10}}/>
        <button onClick={send} disabled={!input.trim()} style={{
          background:input.trim()?C.acc:C.s2, color:input.trim()?"#000":C.dim,
          border:"none", borderRadius:10, padding:"0 18px", fontSize:16, fontWeight:900,
          cursor:input.trim()?"pointer":"default"}}>送信</button>
      </div>
    </div>
  );
}

// ── モバイル: ボトムナビ ──────────────────────────
function BottomNav({tab, setTab, data, cDrvId}){
  const unread = data.messages.filter(m=>m.to===cDrvId&&!m.read).length;
  return(
    <nav style={{
      position:"fixed", bottom:0, left:0, right:0,
      background:C.s1, borderTop:`1px solid ${C.bdr}`,
      display:"flex", zIndex:100,
      paddingBottom:"env(safe-area-inset-bottom, 0px)"
    }}>
      {DRIVER_NAV.map(t=>{
        const isMsg = t.id==="messages";
        const active = tab===t.id;
        return(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            flex:1, background:"none", border:"none",
            padding:"10px 4px 8px", cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:3,
            borderTop:active?`2px solid ${C.acc}`:"2px solid transparent",
            position:"relative"}}>
            <span style={{fontSize:22}}>{t.icon}</span>
            <span style={{color:active?C.acc:C.mut, fontSize:11, fontWeight:active?700:400,
              lineHeight:1}}>{t.label}</span>
            {isMsg && unread>0 && (
              <span style={{position:"absolute", top:6, right:"50%", marginRight:-12,
                background:C.red, color:"#fff", borderRadius:"50%",
                width:18, height:18, display:"flex", alignItems:"center",
                justifyContent:"center", fontSize:10, fontWeight:900}}>{unread}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function RoleSelect({onSelect,drivers}){
  const [did,setDid]=useState(drivers[0]?.id||"");
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"'Segoe UI','Noto Sans JP',system-ui,sans-serif",padding:20}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontSize:52,marginBottom:10}}>🚛</div>
          <div style={{color:C.acc,fontSize:22,fontWeight:900,letterSpacing:"0.1em",marginBottom:4}}>TRANSPORT MGR</div>
          <div style={{color:C.mut,fontSize:13}}>2024年問題対応 運行管理システム</div>
        </div>

        {/* ドライバーログイン（スマホ向けに上に大きく） */}
        <div style={{background:C.s1,border:`2px solid ${C.bdr}`,borderRadius:16,padding:"24px 20px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
            <span style={{fontSize:32}}>🚗</span>
            <div style={{color:C.txt,fontWeight:900,fontSize:20}}>ドライバー</div>
          </div>
          <label style={{color:C.mut,fontSize:14,display:"block",marginBottom:8}}>名前を選んでください</label>
          <select value={did} onChange={e=>setDid(e.target.value)}
            style={{...inputSt,fontSize:18,padding:"14px",marginBottom:16,borderRadius:10}}>
            {drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button onClick={()=>onSelect("driver",did)} style={{
            width:"100%",background:C.acc,color:"#000",border:"none",
            borderRadius:12,padding:"16px",fontSize:18,fontWeight:900,cursor:"pointer"}}>
            ログイン
          </button>
        </div>

        {/* 管理者ログイン（小さめに） */}
        <button onClick={()=>onSelect("admin",null)} style={{
          width:"100%",background:"none",border:`1px solid ${C.bdr}`,
          borderRadius:12,padding:"14px 20px",cursor:"pointer",
          display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:22}}>🖥</span>
          <div style={{textAlign:"left"}}>
            <div style={{color:C.txt,fontSize:15,fontWeight:700}}>管理者ログイン</div>
            <div style={{color:C.mut,fontSize:12}}>PC推奨</div>
          </div>
        </button>
      </div>
    </div>
  );
}

function Sidebar({tab,setTab,role,onLogout,driverName,data}){
  const nav=role==="admin"?ADMIN_NAV:DRIVER_NAV;
  const unreadMsg=data.messages.filter(m=>m.to===(role==="admin"?"admin":"")||role==="admin"?false:m.to===data.drivers.find(d=>d.status!=="")?.id).length;
  return(
    <nav style={{width:188,background:C.s1,borderRight:`1px solid ${C.bdr}`,display:"flex",flexDirection:"column",
      flexShrink:0,height:"100vh",overflowY:"auto"}}>
      <div style={{padding:"16px 14px 12px",borderBottom:`1px solid ${C.bdr}`,flexShrink:0}}>
        <div style={{color:C.acc,fontWeight:900,fontSize:12,letterSpacing:"0.12em"}}>🚛 TRANSPORT MGR</div>
        <div style={{color:C.dim,fontSize:10,letterSpacing:"0.07em",marginTop:3}}>
          {role==="admin"?"管理者":driverName}
        </div>
      </div>
      <div style={{flex:1,padding:"4px 0"}}>
        {nav.map(t=>{
          const hasAlert=t.id==="notifications"&&data.drivers.concat(data.vehicles).some(x=>{
            const du=daysUntil(x.licenseExpiry||x.inspDate);
            return du<=60;
          });
          return(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              width:"100%",textAlign:"left",background:tab===t.id?C.accD:"none",
              border:"none",borderLeft:tab===t.id?`3px solid ${C.acc}`:"3px solid transparent",
              padding:"8px 12px",color:tab===t.id?C.acc:C.mut,cursor:"pointer",
              fontSize:12,fontWeight:tab===t.id?700:400,
              display:"flex",alignItems:"center",gap:8,lineHeight:1.3}}>
              <span style={{fontSize:13,width:18,textAlign:"center"}}>{t.icon}</span>
              <span style={{flex:1}}>{t.label}</span>
              {hasAlert&&<span style={{width:6,height:6,borderRadius:"50%",background:C.red}}/>}
            </button>
          );
        })}
      </div>
      <div style={{padding:"10px 12px",borderTop:`1px solid ${C.bdr}`,flexShrink:0}}>
        <Btn v="ghost" onClick={onLogout} sm full>ログアウト</Btn>
      </div>
    </nav>
  );
}

// ── App ───────────────────────────────────────────
export default function App(){
  const [role,setRole]=useState(null);
  const [cDrvId,setCDrvId]=useState(null);
  const [tab,setTab]=useState("dashboard");
  const [data,setData]=useState(null);
  const [ready,setReady]=useState(false);

  useEffect(()=>{
    (async()=>{
      const stored=await DB.load();
      setData(stored||SEED);
      setReady(true);
    })();
  },[]);

  useEffect(()=>{ if(data) DB.save(data); },[data]);

  if(!ready) return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:C.acc,fontSize:14,fontFamily:"'Courier New',monospace",letterSpacing:"0.15em"}}>LOADING...</div>
    </div>
  );

  if(!role) return <RoleSelect onSelect={(r,d)=>{setRole(r);setCDrvId(d);setTab("dashboard");}} drivers={data.drivers}/>;

  const driverName=data.drivers.find(d=>d.id===cDrvId)?.name;
  const p={data,setData,role,cDrvId};

  // ── ドライバー: スマホレイアウト ──
  if(role==="driver"){
    return(
      <div style={{background:C.bg, minHeight:"100vh",
        fontFamily:"'Segoe UI','Noto Sans JP',system-ui,sans-serif", color:C.txt}}>
        {/* ヘッダー */}
        <div style={{background:C.s1, borderBottom:`1px solid ${C.bdr}`,
          padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center",
          position:"sticky", top:0, zIndex:50}}>
          <div>
            <div style={{color:C.acc, fontWeight:900, fontSize:13, letterSpacing:"0.08em"}}>🚛 TRANSPORT MGR</div>
            <div style={{color:C.mut, fontSize:12}}>{driverName}</div>
          </div>
          <button onClick={()=>setRole(null)} style={{
            background:"none", border:`1px solid ${C.bdr}`, borderRadius:8,
            padding:"6px 12px", color:C.mut, fontSize:13, cursor:"pointer"}}>ログアウト</button>
        </div>

        {/* コンテンツ */}
        <div style={{padding:"16px 14px"}}>
          {tab==="dashboard" && <MDriverDashboard {...p} setTab={setTab}/>}
          {tab==="attendance"&& <MAttendance {...p}/>}
          {tab==="orders"    && <MOrders {...p}/>}
          {tab==="safety"    && <MSafety {...p}/>}
          {tab==="messages"  && <MMessages {...p}/>}
        </div>

        {/* ボトムナビ */}
        <BottomNav tab={tab} setTab={setTab} data={data} cDrvId={cDrvId}/>
      </div>
    );
  }

  // ── 管理者: PC レイアウト ──
  return(
    <div style={{display:"flex",height:"100vh",background:C.bg,
      fontFamily:"'Segoe UI','Noto Sans JP',system-ui,sans-serif",overflow:"hidden",color:C.txt}}>
      <Sidebar tab={tab} setTab={setTab} role={role} onLogout={()=>setRole(null)} driverName={driverName} data={data}/>
      <main style={{flex:1,overflow:"auto",padding:24}}>
        {tab==="dashboard"&&<Dashboard {...p}/>}
        {tab==="dispatch"&&<Dispatch {...p}/>}
        {tab==="orders"&&<Orders {...p}/>}
        {tab==="labor"&&<LaborMgmt {...p}/>}
        {tab==="attendance"&&<Attendance {...p}/>}
        {tab==="shifts"&&<ShiftMgmt {...p}/>}
        {tab==="safety"&&<Safety {...p}/>}
        {tab==="notifications"&&<Notifications {...p}/>}
        {tab==="messages"&&<Messages {...p}/>}
        {tab==="billing"&&<Billing {...p}/>}
        {tab==="drivers"&&<DriverLedger {...p}/>}
        {tab==="vehicles"&&<VehicleLedger {...p}/>}
        {tab==="destinations"&&<Destinations {...p}/>}
        {tab==="oplogs"&&<OpLogs {...p}/>}
        {tab==="admins"&&<AdminLedger {...p}/>}
      </main>
    </div>
  );
}
