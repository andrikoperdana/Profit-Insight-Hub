import { prisma } from "./index.js";
import { allocateDailyHours } from "./cap-daily-hours.js";

const ZWSP = "\u200B";
const SEED_TS_DESCS = new Set([
  "Control gap assessment session","Evidence collection","Drafting findings",
  "API endpoint testing","PCI audit fieldwork","Authentication bypass test",
  "Risk assessment workshop","Documentation review",
]);
const isGen = (d: string | null | undefined) => {
  if (!d) return false;
  if (d.includes(ZWSP) || d.includes("[sample]")) return true;
  return SEED_TS_DESCS.has(d.trim());
};

async function main() {
  const rows = (await prisma.timesheet.findMany({
    where: { status: { not: "REJECTED" } },
    select: { id:true, userId:true, workDate:true, hours:true, description:true },
  })).map(r => ({ ...r, gen: isGen(r.description) }));

  const dk = (u:string,d:Date)=>`${u}|${Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())}`;
  const wk = (u:string,d:Date)=>{const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));x.setUTCDate(x.getUTCDate()-((x.getUTCDay()+6)%7));return `${u}|${x.getTime()}`;};

  const byDay = new Map<string, typeof rows>();
  for (const r of rows){ const k=dk(r.userId,r.workDate); (byDay.get(k) ?? byDay.set(k,[]).get(k)!).push(r); }

  const nh = new Map(rows.map(r=>[r.id,r.hours]));
  let changed=0;
  const residualHumanDays:{key:string;total:number;descs:string[]}[]=[];
  for (const [k,dr] of byDay){
    const total=dr.reduce((s,r)=>s+r.hours,0);
    if(total<=8) continue;
    const edit=dr.filter(r=>r.gen);
    const fixed=dr.filter(r=>!r.gen).reduce((s,r)=>s+r.hours,0);
    const budget=Math.max(0,8-fixed);
    const next=allocateDailyHours(edit.map(r=>r.hours),budget);
    edit.forEach((r,i)=>{ if(next[i]!==r.hours){nh.set(r.id,next[i]!);changed++;} });
    // residual: even after capping gen rows, day still >8 because human rows alone exceed
    if (fixed>8) residualHumanDays.push({key:k,total:fixed,descs:dr.filter(r=>!r.gen).map(r=>`${r.hours}h:${(r.description??"").slice(0,22)}`)});
  }

  const ext=(g:(r:typeof rows[0])=>number)=>{const d=new Map<string,number>(),w=new Map<string,number>();
    for(const r of rows){const h=g(r);d.set(dk(r.userId,r.workDate),(d.get(dk(r.userId,r.workDate))??0)+h);w.set(wk(r.userId,r.workDate),(w.get(wk(r.userId,r.workDate))??0)+h);}
    return {maxD:Math.max(...d.values()),maxW:Math.max(...w.values()),overD:[...d.values()].filter(x=>x>8).length,overW:[...w.values()].filter(x=>x>40).length};};
  const b=ext(r=>r.hours), a=ext(r=>nh.get(r.id)!);
  const touchedHuman=rows.filter(r=>!r.gen && nh.get(r.id)!==r.hours).length;

  console.log(`Rows: ${rows.length} | generator(incl base-seed): ${rows.filter(r=>r.gen).length} | human: ${rows.filter(r=>!r.gen).length}`);
  console.log(`BEFORE -> AFTER (cap generator rows only):`);
  console.log(`  worst day:  ${b.maxD}h -> ${a.maxD}h`);
  console.log(`  worst week: ${b.maxW}h -> ${a.maxW}h`);
  console.log(`  days >8h:   ${b.overD} -> ${a.overD}`);
  console.log(`  weeks >40h: ${b.overW} -> ${a.overW}`);
  console.log(`  generator rows changed: ${changed}`);
  console.log(`  HUMAN rows changed (must be 0): ${touchedHuman}`);
  console.log(`\nResidual human-only days still >8h (left untouched): ${residualHumanDays.length}`);
  residualHumanDays.slice(0,10).forEach(d=>console.log(`  ${d.total}h ${JSON.stringify(d.descs)}`));
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
