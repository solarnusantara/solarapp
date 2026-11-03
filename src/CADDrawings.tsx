import { useRef, useState } from "react";
import { Download, FileUp, Grid2X2, MousePointer2, Minus, RectangleHorizontal, Ruler, Type, Trash2, Layers, Save, FileText } from "lucide-react";

type Tool = "select" | "line" | "rect" | "text" | "dimension";
type Entity = { id: number; type: "line" | "rect" | "text" | "dimension"; x1: number; y1: number; x2: number; y2: number; text?: string; layer: string };
const W = 1000, H = 620, SCALE = 1;
const layerNames = ["PV Module", "Structure", "Cable Tray", "Electrical", "Dimensions", "Annotations"];
const colors: Record<string,string> = { "PV Module":"#8bbcff", Structure:"#b5c0cc", "Cable Tray":"#f5b942", Electrical:"#63d8b4", Dimensions:"#e5e7eb", Annotations:"#c4b5fd" };

export default function CADDrawings({ lang = "en" }: { lang?: "en" | "id" }) {
  const idText = lang === "id";
  const [tool,setTool] = useState<Tool>("select");
  const [layer,setLayer] = useState("Structure");
  const [entities,setEntities] = useState<Entity[]>([
    {id:1,type:"rect",x1:180,y1:140,x2:820,y2:470,layer:"Structure"},
    {id:2,type:"rect",x1:225,y1:180,x2:330,y2:225,layer:"PV Module"},
    {id:3,type:"rect",x1:350,y1:180,x2:455,y2:225,layer:"PV Module"},
    {id:4,type:"rect",x1:475,y1:180,x2:580,y2:225,layer:"PV Module"},
    {id:5,type:"rect",x1:600,y1:180,x2:705,y2:225,layer:"PV Module"},
    {id:6,type:"rect",x1:225,y1:245,x2:330,y2:290,layer:"PV Module"},
    {id:7,type:"rect",x1:350,y1:245,x2:455,y2:290,layer:"PV Module"},
    {id:8,type:"rect",x1:475,y1:245,x2:580,y2:290,layer:"PV Module"},
    {id:9,type:"rect",x1:600,y1:245,x2:705,y2:290,layer:"PV Module"},
    {id:10,type:"dimension",x1:180,y1:110,x2:820,y2:110,text:"6400 mm",layer:"Dimensions"},
    {id:11,type:"dimension",x1:850,y1:140,x2:850,y2:470,text:"3300 mm",layer:"Dimensions"},
  ]);
  const [visible,setVisible] = useState<Record<string,boolean>>(Object.fromEntries(layerNames.map(n=>[n,true])));
  const [project,setProject] = useState("PLTS Technical Drawing");
  const [drawingNo,setDrawingNo] = useState("PLTS-CAD-001");
  const [revision,setRevision] = useState("A");
  const [scaleFactor,setScaleFactor] = useState(10);
  const [view,setView] = useState("Top View");
  const [textInput,setTextInput] = useState("NOTE");
  const [pending,setPending] = useState<{x:number;y:number}|null>(null);
  const [selected,setSelected] = useState<number|null>(null);
  const [status,setStatus] = useState(idText ? "Siap menggambar" : "Ready to draw");
  const fileRef = useRef<HTMLInputElement>(null);
  const toolbarBtn = (active:boolean): React.CSSProperties => ({display:"inline-flex",alignItems:"center",gap:6,padding:"8px 10px",borderRadius:8,border:"1px solid "+(active?"#a3e635":"#303b36"),background:active?"#24351d":"#151d19",color:active?"#c4f36b":"#d3ddd7",cursor:"pointer",fontSize:12});
  const card: React.CSSProperties = {background:"#111916",border:"1px solid #28352e",borderRadius:12,padding:14,color:"#e6eee8"};
  const add = (e:Entity) => {setEntities(prev=>[...prev,e]);setSelected(e.id);setStatus(idText?"Objek ditambahkan":"Entity added");};
  const point = (ev: React.MouseEvent<SVGSVGElement>) => {
    const r=ev.currentTarget.getBoundingClientRect();
    return {x:Math.round((ev.clientX-r.left)*W/r.width/10)*10,y:Math.round((ev.clientY-r.top)*H/r.height/10)*10};
  };
  const clickCanvas = (ev: React.MouseEvent<SVGSVGElement>) => {
    const p=point(ev);
    if(tool==="select"){setSelected(null);return;}
    if(tool==="text"){add({id:Date.now(),type:"text",x1:p.x,y1:p.y,x2:p.x,y2:p.y,text:textInput||"TEXT",layer});return;}
    if(!pending){setPending(p);setStatus(idText?"Klik titik kedua":"Click second point");return;}
    const type = tool==="line"?"line":tool==="rect"?"rect":"dimension";
    if(p.x===pending.x && p.y===pending.y){setPending(null);return;}
    add({id:Date.now(),type,x1:pending.x,y1:pending.y,x2:p.x,y2:p.y,text:type==="dimension"?`${Math.round(Math.hypot(p.x-pending.x,p.y-pending.y)*scaleFactor)} mm`:undefined,layer:tool==="dimension"?"Dimensions":layer});
    setPending(null);
  };
  const exportDxf = () => {
    const pair=(n:number)=>String(Math.round(n * Math.max(0.001, scaleFactor) * 1000) / 1000);
    let out="0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";
    for(const e of entities){
      const lay=e.layer.replace(/\s+/g,"_");
      if(e.type==="line") out+=`0\nLINE\n8\n${lay}\n10\n${pair(e.x1)}\n20\n${pair(-e.y1)}\n30\n0\n11\n${pair(e.x2)}\n21\n${pair(-e.y2)}\n31\n0\n`;
      else if(e.type==="rect") out+=`0\nLWPOLYLINE\n8\n${lay}\n90\n4\n70\n1\n10\n${pair(e.x1)}\n20\n${pair(-e.y1)}\n10\n${pair(e.x2)}\n20\n${pair(-e.y1)}\n10\n${pair(e.x2)}\n20\n${pair(-e.y2)}\n10\n${pair(e.x1)}\n20\n${pair(-e.y2)}\n`;
      else if(e.type==="text") out+=`0\nTEXT\n8\n${lay}\n10\n${pair(e.x1)}\n20\n${pair(-e.y1)}\n30\n0\n40\n12\n1\n${(e.text||"TEXT").replace(/[\r\n]/g," ")}\n`;
      else if(e.type==="dimension") out+=`0\nLINE\n8\n${lay}\n10\n${pair(e.x1)}\n20\n${pair(-e.y1)}\n30\n0\n11\n${pair(e.x2)}\n21\n${pair(-e.y2)}\n31\n0\n0\nTEXT\n8\n${lay}\n10\n${pair((e.x1+e.x2)/2)}\n20\n${pair(-(e.y1+e.y2)/2-12)}\n30\n0\n40\n10\n1\n${(e.text||"DIM").replace(/[\r\n]/g," ")}\n`;
    }
    // Add a compact title block as DXF text entities in the drawing units.
    out += `0\nTEXT\n8\nTITLE_BLOCK\n10\n${pair(25)}\n20\n${pair(-590)}\n30\n0\n40\n${pair(3)}\n1\n${project.replace(/[\r\n]/g," ")}\n`;
    out += `0\nTEXT\n8\nTITLE_BLOCK\n10\n${pair(25)}\n20\n${pair(-605)}\n30\n0\n40\n${pair(2)}\n1\nDWG: ${drawingNo} | REV: ${revision} | SCALE: 1:${Math.round(1000/Math.max(scaleFactor,0.001))}\n`;
    out+="0\nENDSEC\n0\nEOF\n";
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([out],{type:"application/dxf"}));a.download=`${(drawingNo||"solar-apps-drawing").replace(/[^a-z0-9_-]/gi,"_")}.dxf`;a.click();URL.revokeObjectURL(a.href);setStatus(idText?"DXF berhasil diekspor":"DXF exported");
  };
  const saveJson=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({project,drawingNo,revision,units:"mm",scaleFactor,view,entities},null,2)],{type:"application/json"}));a.download="solar-apps-drawing.json";a.click();URL.revokeObjectURL(a.href);setStatus(idText?"JSON tersimpan":"JSON saved");};
  const loadJson=(f?:File)=>{if(!f)return;const reader=new FileReader();reader.onload=()=>{try{const d=JSON.parse(String(reader.result));if(!Array.isArray(d.entities))throw new Error("Invalid");setEntities(d.entities);setProject(d.project||"Imported drawing");setDrawingNo(d.drawingNo||"PLTS-CAD-001");setRevision(d.revision||"A");setScaleFactor(Number(d.scaleFactor)||10);setView(d.view||"Top View");setStatus(idText?"Gambar berhasil dibuka":"Drawing loaded");}catch{setStatus(idText?"File JSON tidak valid":"Invalid drawing JSON");}};reader.readAsText(f);};
  const applyView = (next: string) => {
    setView(next); setPending(null); setSelected(null);
    const presets: Record<string, Entity[]> = {
      "Top View": [
        {id:1,type:"rect",x1:180,y1:140,x2:820,y2:470,layer:"Structure"},
        ...Array.from({length:8},(_,i)=>({id:10+i,type:"rect" as const,x1:225+(i%4)*125,y1:180+Math.floor(i/4)*65,x2:330+(i%4)*125,y2:225+Math.floor(i/4)*65,layer:"PV Module"})),
        {id:30,type:"dimension",x1:180,y1:110,x2:820,y2:110,text:`${Math.round(640*scaleFactor)} mm`,layer:"Dimensions"},
        {id:31,type:"dimension",x1:850,y1:140,x2:850,y2:470,text:`${Math.round(330*scaleFactor)} mm`,layer:"Dimensions"}
      ],
      "Front View": [
        {id:1,type:"line",x1:180,y1:420,x2:820,y2:420,layer:"Structure"},
        {id:2,type:"line",x1:220,y1:420,x2:280,y2:250,layer:"Structure"},{id:3,type:"line",x1:720,y1:420,x2:780,y2:250,layer:"Structure"},
        {id:4,type:"line",x1:250,y1:250,x2:750,y2:250,layer:"Structure"},
        ...Array.from({length:6},(_,i)=>({id:10+i,type:"rect" as const,x1:280+i*70,y1:195,x2:340+i*70,y2:238,layer:"PV Module"})),
        {id:25,type:"dimension",x1:180,y1:455,x2:820,y2:455,text:`${Math.round(640*scaleFactor)} mm`,layer:"Dimensions"},
        {id:26,type:"dimension",x1:145,y1:250,x2:145,y2:420,text:`${Math.round(170*scaleFactor)} mm`,layer:"Dimensions"}
      ],
      "Side View": [
        {id:1,type:"line",x1:250,y1:420,x2:700,y2:420,layer:"Structure"},{id:2,type:"line",x1:290,y1:420,x2:350,y2:250,layer:"Structure"},{id:3,type:"line",x1:650,y1:420,x2:710,y2:250,layer:"Structure"},{id:4,type:"line",x1:350,y1:250,x2:710,y2:250,layer:"Structure"},
        ...Array.from({length:3},(_,i)=>({id:10+i,type:"rect" as const,x1:390+i*95,y1:205,x2:475+i*95,y2:242,layer:"PV Module"})),
        {id:20,type:"dimension",x1:250,y1:455,x2:700,y2:455,text:`${Math.round(450*scaleFactor)} mm`,layer:"Dimensions"}
      ],
      "Mounting Detail": [
        {id:1,type:"rect",x1:300,y1:200,x2:700,y2:245,layer:"PV Module"},{id:2,type:"rect",x1:330,y1:245,x2:670,y2:280,layer:"Structure"},{id:3,type:"rect",x1:455,y1:280,x2:545,y2:420,layer:"Structure"},{id:4,type:"rect",x1:410,y1:420,x2:590,y2:440,layer:"Structure"},
        {id:5,type:"line",x1:500,y1:435,x2:500,y2:470,layer:"Electrical"},{id:6,type:"text",x1:710,y1:225,x2:710,y2:225,text:"PV module",layer:"Annotations"},{id:7,type:"text",x1:710,y1:265,x2:710,y2:265,text:"Rail / clamp",layer:"Annotations"},{id:8,type:"text",x1:710,y1:350,x2:710,y2:350,text:"Support",layer:"Annotations"},{id:9,type:"text",x1:710,y1:430,x2:710,y2:430,text:"Base plate",layer:"Annotations"}
      ]
    };
    setEntities(presets[next] || presets["Top View"]); setStatus(idText?`Tampilan ${next} dimuat`:`${next} loaded`);
  };
  const removeSelected=()=>{if(selected!==null){setEntities(es=>es.filter(e=>e.id!==selected));setSelected(null);}};
  return <section style={{display:"grid",gap:14,color:"#e8efe9"}}>
    <div className="module-page-heading"><div><span className="eyebrow">ENGINEERING MODULE</span><h1>CAD &amp; Drawings</h1><p style={{color:"#94a99c",marginTop:4}}>{idText?"Workspace gambar teknik PLTS dengan layer, dimensi, dan ekspor DXF.":"PV technical drawing workspace with layers, dimensions and DXF export."}</p></div><span className="status status-planning"><i/>{idText?"Draft":"Drawing draft"}</span></div>
    <div style={{...card,display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
      <label style={{fontSize:12,color:"#9eb2a5"}}>{idText?"Nama gambar":"Drawing name"}<input value={project} onChange={e=>setProject(e.target.value)} style={{display:"block",marginTop:5,background:"#0c1210",border:"1px solid #34443a",borderRadius:7,padding:"9px 10px",color:"#e8efe9",minWidth:230}} /></label>
      <label style={{fontSize:12,color:"#9eb2a5"}}>{idText?"Nomor gambar":"Drawing No."}<input value={drawingNo} onChange={e=>setDrawingNo(e.target.value)} style={{display:"block",marginTop:5,background:"#0c1210",border:"1px solid #34443a",borderRadius:7,padding:"9px 10px",color:"#e8efe9",width:130}} /></label>
      <label style={{fontSize:12,color:"#9eb2a5"}}>Revision<input value={revision} onChange={e=>setRevision(e.target.value)} style={{display:"block",marginTop:5,background:"#0c1210",border:"1px solid #34443a",borderRadius:7,padding:"9px 10px",color:"#e8efe9",width:70}} /></label>
      <label style={{fontSize:12,color:"#9eb2a5"}}>{idText?"Skala koordinat (mm/unit)":"Coordinate scale (mm/unit)"}<input type="number" min="0.001" step="0.1" value={scaleFactor} onChange={e=>setScaleFactor(Math.max(0.001,Number(e.target.value)||1))} style={{display:"block",marginTop:5,background:"#0c1210",border:"1px solid #34443a",borderRadius:7,padding:"9px 10px",color:"#e8efe9",width:110}} /></label>
      <label style={{fontSize:12,color:"#9eb2a5"}}>{idText?"Tampilan gambar":"Drawing view"}<select value={view} onChange={e=>applyView(e.target.value)} style={{display:"block",marginTop:5,background:"#0c1210",border:"1px solid #34443a",borderRadius:7,padding:"9px 10px",color:"#e8efe9"}}><option>Top View</option><option>Front View</option><option>Side View</option><option>Mounting Detail</option></select></label>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"end"}}>
        <button style={toolbarBtn(tool==="select")} onClick={()=>{setTool("select");setPending(null)}}><MousePointer2 size={14}/>{idText?"Pilih":"Select"}</button>
        <button style={toolbarBtn(tool==="line")} onClick={()=>{setTool("line");setPending(null)}}><Minus size={14}/>{idText?"Garis":"Line"}</button>
        <button style={toolbarBtn(tool==="rect")} onClick={()=>{setTool("rect");setPending(null)}}><RectangleHorizontal size={14}/>{idText?"Persegi":"Rectangle"}</button>
        <button style={toolbarBtn(tool==="dimension")} onClick={()=>{setTool("dimension");setPending(null)}}><Ruler size={14}/>{idText?"Dimensi":"Dimension"}</button>
        <button style={toolbarBtn(tool==="text")} onClick={()=>{setTool("text");setPending(null)}}><Type size={14}/>{idText?"Teks":"Text"}</button>
      </div>
      <div style={{display:"flex",gap:6,marginLeft:"auto",flexWrap:"wrap"}}>
        <button style={toolbarBtn(false)} onClick={()=>fileRef.current?.click()}><FileUp size={14}/>{idText?"Buka JSON":"Open JSON"}</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e=>loadJson(e.target.files?.[0])}/>
        <button style={toolbarBtn(false)} onClick={saveJson}><Save size={14}/>{idText?"Simpan":"Save JSON"}</button>
        <button style={toolbarBtn(false)} onClick={exportDxf}><Download size={14}/>Export DXF</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 220px",gap:12,alignItems:"start"}}>
      <div style={{...card,padding:8,minWidth:0}}>
        <div style={{display:"flex",justifyContent:"space-between",padding:"7px 8px",fontSize:12,color:"#9eb2a5"}}><span>MODEL SPACE · {idText?"Satuan":"Units"}: mm</span><span>{entities.length} {idText?"objek":"entities"}</span></div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="CAD drawing workspace" onClick={clickCanvas} style={{display:"block",width:"100%",height:"auto",background:"#0a100e",borderRadius:8,cursor:tool==="select"?"default":"crosshair",touchAction:"none"}}>
          <defs><pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="#1b2922" strokeWidth=".7"/></pattern><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="url(#smallGrid)"/><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#2b3c32" strokeWidth="1"/></pattern></defs>
          <rect width={W} height={H} fill="url(#grid)"/>
          <text x="18" y="28" fill="#6e8879" fontSize="12">SOLAR APPS / MODEL SPACE</text>
          {entities.filter(e=>visible[e.layer]).map(e=>{
            const c=colors[e.layer]||"#d4ddd7", sel=e.id===selected;
            if(e.type==="line")return <line key={e.id} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={c} strokeWidth={sel?4:2} />;
            if(e.type==="rect")return <rect key={e.id} x={Math.min(e.x1,e.x2)} y={Math.min(e.y1,e.y2)} width={Math.abs(e.x2-e.x1)} height={Math.abs(e.y2-e.y1)} fill={e.layer==="PV Module"?"#243f61":"none"} stroke={sel?"#c4f36b":c} strokeWidth={sel?3:2}/>;
            if(e.type==="text")return <text key={e.id} x={e.x1} y={e.y1} fill={c} fontSize="16">{e.text}</text>;
            return <g key={e.id} stroke={c} fill={c}><line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} strokeWidth="1.5"/><line x1={e.x1-5} y1={e.y1-5} x2={e.x1+5} y2={e.y1+5}/><line x1={e.x2-5} y1={e.y2-5} x2={e.x2+5} y2={e.y2+5}/><text x={(e.x1+e.x2)/2} y={(e.y1+e.y2)/2-9} stroke="none" fontSize="14" textAnchor="middle">{e.text}</text></g>;
          })}
          {pending&&<circle cx={pending.x} cy={pending.y} r="5" fill="#c4f36b"/>}
          <text x="18" y={H-18} fill="#6e8879" fontSize="12">GRID 10 · SNAP ON · DXF R12 · {drawingNo} REV {revision}</text>
        </svg>
        <div style={{display:"flex",justifyContent:"space-between",padding:"8px 4px 2px",fontSize:12,color:"#8fa497"}}><span>{status}</span><span>{idText?"Klik dua titik untuk garis/persegi/dimensi.":"Click two points for line/rectangle/dimension."}</span></div>
      </div>
      <aside style={{display:"grid",gap:12}}>
        <div style={card}><h3 style={{fontSize:14,margin:"0 0 10px",display:"flex",gap:7,alignItems:"center"}}><Layers size={16}/>{idText?"Layer":"Layers"}</h3>
          {layerNames.map(n=><label key={n} style={{display:"flex",gap:8,alignItems:"center",fontSize:12,margin:"9px 0",color:colors[n]}}><input type="checkbox" checked={visible[n]} onChange={e=>setVisible(v=>({...v,[n]:e.target.checked}))}/><span style={{display:"inline-block",width:9,height:9,borderRadius:2,background:colors[n]}}/>{n}</label>)}
          <label style={{display:"block",fontSize:12,color:"#9eb2a5",marginTop:12}}>{idText?"Layer aktif":"Active layer"}<select value={layer} onChange={e=>setLayer(e.target.value)} style={{display:"block",width:"100%",marginTop:5,padding:8,borderRadius:7,background:"#0c1210",color:"#e8efe9",border:"1px solid #34443a"}}>{layerNames.filter(n=>n!=="Dimensions").map(n=><option key={n}>{n}</option>)}</select></label>
        </div>
        <div style={card}><h3 style={{fontSize:14,margin:"0 0 10px"}}>{idText?"Tambah anotasi":"Add annotation"}</h3><label style={{fontSize:12,color:"#9eb2a5"}}>{idText?"Isi teks":"Text content"}<input value={textInput} onChange={e=>setTextInput(e.target.value)} style={{display:"block",width:"100%",boxSizing:"border-box",marginTop:5,padding:8,borderRadius:7,background:"#0c1210",color:"#e8efe9",border:"1px solid #34443a"}}/></label>
          <p style={{fontSize:11,color:"#7f9587",lineHeight:1.5}}>{idText?"Pilih tool Teks lalu klik kanvas untuk menempatkan teks.":"Choose Text, then click the canvas to place a label."}</p>
          <button style={{...toolbarBtn(false),width:"100%",justifyContent:"center"}} disabled={selected===null} onClick={removeSelected}><Trash2 size={14}/>{idText?"Hapus objek terpilih":"Delete selected"}</button>
          <button style={{...toolbarBtn(false),width:"100%",justifyContent:"center",marginTop:7}} onClick={()=>{setEntities([]);setSelected(null);setPending(null);setStatus(idText?"Kanvas dikosongkan":"Canvas cleared")}}><Trash2 size={14}/>{idText?"Kosongkan gambar":"Clear drawing"}</button>
        </div>
        <div style={{...card,fontSize:11,color:"#93a89a",lineHeight:1.55}}><strong style={{color:"#e8efe9"}}><FileText size={13} style={{display:"inline",verticalAlign:"middle",marginRight:5}}/>Engineering note</strong><p style={{marginBottom:0}}>{idText?"DXF memakai skala mm/unit yang dikonfigurasi. Verifikasi satuan, skala, dan title block di AutoCAD sebelum konstruksi. Tampilan masih skematik dan dimensi belum tersertifikasi.":"DXF exports coordinates using the configured mm/unit scale. Verify units, scale, and title block in AutoCAD before construction use. Views are schematic drafts; dimensions are not certified."}</p></div>
      </aside>
    </div>
  </section>;
}
