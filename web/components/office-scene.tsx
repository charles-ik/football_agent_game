import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/** The office is a view of actual premises and staff, never a second game state. */
export function OfficeScene({name,level,people,milestones}: {name:string;level:number;people:number;milestones:number}) {
 const desks = Array.from({length:Math.min(8, Math.max(2,level*2))},(_,i)=>({x:275+(i%4)*126,y:268+Math.floor(i/4)*88,occupied:i<people}));
 return <section className="office-scene relative overflow-hidden rounded-2xl border border-[#bba477]/30" aria-label={`Your level ${level} office, ${people} staff and ${milestones} milestones`}>
   <svg viewBox="0 0 960 480" className="block w-full" role="img" aria-label={`${name} headquarters illustration`}>
     <defs>
       <linearGradient id="office-wall" x2="0" y2="1"><stop stopColor="#c8bfa8"/><stop offset="1" stopColor="#918978"/></linearGradient>
       <linearGradient id="office-floor" x2="1" y2="1"><stop stopColor="#755944"/><stop offset="1" stopColor="#3e342d"/></linearGradient>
       <pattern id="office-boards" width="80" height="28" patternUnits="userSpaceOnUse"><path d="M0 0H80V28H0" fill="none" stroke="#d9bd92" strokeOpacity=".1"/></pattern>
       <linearGradient id="office-sky" x2="0" y2="1"><stop stopColor="#b4d0c4"/><stop offset="1" stopColor="#f1dfb0"/></linearGradient>
       <filter id="office-shadow"><feDropShadow dx="0" dy="8" stdDeviation="6" floodOpacity=".22"/></filter>
     </defs>
     <rect width="960" height="480" fill="#202e29"/>
     <path d="M0 0H960V243L120 283 0 235Z" fill="url(#office-wall)"/>
     <path d="M0 237L120 278 960 242V480H0Z" fill="url(#office-floor)"/>
     <path d="M0 237L120 278 960 242V480H0Z" fill="url(#office-boards)"/>
     <path d="M0 0L122 35V280L0 236" fill="#9b917b"/>
     {[0,1,2].map(i=><g key={i} transform={`translate(${600+i*110} 43)`}><rect width="90" height="167" rx="2" fill="#34483f"/><rect x="7" y="7" width="76" height="150" fill="url(#office-sky)"/><path d="M45 6V160M5 84H85" stroke="#34483f" strokeWidth="5"/><path d="M8 144h75v12H8" fill="#789385"/></g>)}
     <rect x="161" y="65" width="350" height="136" rx="4" fill="#594f3a" filter="url(#office-shadow)"/>
     <rect x="167" y="71" width="338" height="124" fill="#234137"/>
     <text x="190" y="103" fill="#ddd8b6" fontSize="12" letterSpacing="4">FOOTBALL · REPRESENTATION</text>
     <text x="190" y="139" fill="#f4ecd1" fontSize="25" fontFamily="Georgia, serif">{name.length>24?name.slice(0,23)+"…":name}</text>
     <path d="M190 155H470" stroke="#a4ad88" strokeOpacity=".5"/>
     <text x="190" y="178" fill="#c5cbae" fontSize="12">Good careers. Lasting relationships.</text>
     <path d="M226 265L780 243 864 452 166 452Z" fill="#203e34" stroke="#bea779" strokeWidth="3"/>
     <path d="M242 280L766 259 839 435 190 435Z" fill="none" stroke="#74866d"/>
     {desks.map(({x,y,occupied},i)=><g key={i} transform={`translate(${x} ${y})`} filter="url(#office-shadow)">
       <path d="M-15 0H67L79 31H-27Z" fill="#b28c5d" stroke="#d1b37d"/>
       <path d="M-27 31H79V39H-27Z" fill="#80613f"/>
       <path d="M-20 39V59M71 39V59" stroke="#39382b" strokeWidth="6"/>
       <rect x="7" y="-17" width="34" height="23" rx="2" fill="#25302b"/><rect x="10" y="-14" width="28" height="17" fill={occupied?"#85aaa0":"#45574f"}/>
       <path d="M24 5V12H12H38" stroke="#29392f" strokeWidth="3"/>
       <rect x="-12" y="14" width="21" height="11" fill="#eee1be" transform="rotate(-8)"/>
       {occupied&&<g><ellipse cx="32" cy="47" rx="17" ry="9" fill="#142c25"/><path d="M21 42Q32 27 43 42L45 52H19Z" fill={i%2?"#9f7859":"#557b71"}/><circle cx="32" cy="30" r="9" fill={i%3?"#d6ae86":"#865d41"}/></g>}
     </g>)}
     <g transform="translate(850 255)"><path d="M-15 2H18L13 46H-10Z" fill="#b99162"/><path d="M0 5V-61M0-20Q-60-59-33-59Q-8-61 0-20M0-36Q39-87 48-65Q45-44 0-36M0-8Q-46-25-38-39Q-22-49 0-8" fill="#416a4e" stroke="#294f38" strokeWidth="3"/></g>
     <path d="M144 223H492V230H144Z" fill="#66523b"/>
     {Array.from({length:Math.min(6,milestones)},(_,i)=><g key={i} transform={`translate(${185+i*49} 220)`}><path d="M-10-26H10L7-10 0-6-7-10Z" fill="#d5b960"/><path d="M0-6V0M-8 0H8M-10-23Q-24-23-9-12M10-23Q24-23 9-12" fill="none" stroke="#d5b960" strokeWidth="3"/></g>)}
     <text x="42" y="447" fill="#d8c9a5" fontSize="10" letterSpacing="3">PREMISES / LEVEL 0{level}</text>
   </svg>
   <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
     <span className="rounded-full border border-white/20 bg-[#14271f]/85 px-3 py-1 text-xs text-[#eee3c7]">Your agency, taking shape</span>
     <Link href="/agency" className="flex items-center gap-1 rounded-full bg-[#eee3c7] px-3 py-1.5 text-xs font-semibold text-[#20392e]">Manage office <ArrowUpRight size={13}/></Link>
   </div>
   <div className="flex flex-wrap gap-2 border-t border-[#bba477]/20 bg-[#182a23] p-3">
     {[['/agency','Staff & departments'],['/scouting','Scouting room'],['/market','Deal room'],['/careers','Client lounge'],['/season-review','Trophy shelf']].map(([href,label])=><Link key={href} href={href} className="rounded-lg border border-[#bba477]/25 px-3 py-2 text-xs text-[#e5ddc6] transition hover:bg-white/10">{label} <span aria-hidden>↗</span></Link>)}
   </div>
 </section>;
}
