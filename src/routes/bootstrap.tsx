import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { claimSuperAdmin } from "@/lib/access.functions";

export const Route=createFileRoute("/bootstrap")({
  ssr:false,
  beforeLoad:async()=>{const {data,error}=await supabase.auth.getUser();if(error||!data.user)throw redirect({to:"/auth"});},
  head:()=>({meta:[{title:"Platform owner setup — EstateOS"}]}),
  component:BootstrapPage,
});
function BootstrapPage(){
  const access=useAccess(),navigate=useNavigate(),claim=useServerFn(claimSuperAdmin);
  const [secret,setSecret]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");try{await claim({data:{bootstrapSecret:secret}});setSuccess(true);setSecret("");await access.refetch();await navigate({to:"/platform",replace:true});}catch(e){setError(e instanceof Error?e.message:"Could not initialize the platform.");}finally{setBusy(false);}}
  if(access.data?.platformHasSuperAdmin){
    return <main className="min-h-screen bg-background px-6 py-16"><div className="surface-panel mx-auto max-w-lg p-8"><ShieldCheck className="size-8 text-primary"/><h1 className="mt-4 text-2xl font-semibold">Platform already initialized</h1><p className="mt-2 text-sm text-muted-foreground">The platform-owner seat has already been claimed. If your account has access, continue to your workspace.</p><Link to={access.data.role==="super_admin"?"/platform":"/agency"} className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Continue</Link></div></main>;
  }
  return <main className="min-h-screen bg-background px-6 py-16"><div className="surface-panel mx-auto max-w-lg p-8"><div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><KeyRound className="size-5"/></div><p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">One-time setup</p><h1 className="mt-2 text-3xl font-semibold">Claim platform ownership</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">This action is available only while no platform owner exists and requires the server-side bootstrap secret. Configure PLATFORM_BOOTSTRAP_SECRET in the server environment before continuing. Never place it in a public VITE_ variable.</p>
  <form onSubmit={submit} className="mt-6 space-y-4"><label className="block space-y-1.5 text-sm font-medium">Bootstrap secret<input type="password" required autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)} className="mt-1 block h-11 w-full rounded-lg border border-input bg-background px-3 font-normal"/></label>{error?<p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>:null}{success?<p role="status" className="text-sm text-primary">Platform owner created.</p>:null}<button disabled={busy||access.isLoading} className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy?"Verifying…":"Claim platform owner"}</button></form>
  <p className="mt-5 text-xs text-muted-foreground">If you did not receive the bootstrap secret from the platform operator, do not proceed. <Link to="/auth" className="font-medium text-primary hover:underline">Return to sign in</Link>.</p></div></main>;
}
