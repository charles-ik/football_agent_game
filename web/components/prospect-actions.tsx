"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {NegotiationDialog, type NegotiationRequest} from "@/components/negotiation/negotiation-dialog";
import {expansionAction} from "@/lib/actions";
import {buttonClass} from "@/components/ui";
export function ProspectActions({id,canApproach,reason,shortlisted,revision}:{id:number;canApproach:boolean;reason:string;shortlisted:boolean;revision:number}) {
 const [request,setRequest]=useState<NegotiationRequest|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const router=useRouter();
 return <div className="space-y-3"><div className="flex flex-wrap gap-2"><button disabled={!canApproach} className={buttonClass.primary} onClick={()=>setRequest({kind:"signing",playerId:id})}>Approach player</button><button disabled={busy} className={buttonClass.secondary} onClick={async()=>{setBusy(true);setError("");try{const r=await expansionAction("management","shortlist",{player_id:id},revision);if(!r.ok)setError(r.message);router.refresh();}catch(e){setError(e instanceof Error?e.message:"Could not update shortlist.");}finally{setBusy(false);}}}>{shortlisted?"Remove from shortlist":"Add to shortlist"}</button></div>{!canApproach&&<p className="t-note">{reason}</p>}{error&&<p role="alert" className="text-sm text-bad">{error}</p>}<NegotiationDialog request={request} onClose={()=>setRequest(null)}/></div>;
}
