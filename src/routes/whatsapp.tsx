import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, MessageCircle, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { completeWhatsAppEmbeddedSignup, createWhatsAppConnectionSession, registerWhatsAppPhoneNumber } from "@/lib/whatsapp.functions";

type FacebookLoginResponse = { authResponse?: { code?: string } | null };
type FacebookSdk = {
  init: (options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (callback: (response: FacebookLoginResponse) => void, options: { config_id: string; response_type: "code"; override_default_response_type: true; extras: { setup: Record<string, never> } }) => void;
};
type WindowWithFacebook = Window & { FB?: FacebookSdk };
type SignupSession = { state: string; appId: string; configId: string; graphApiVersion: string };

export const Route = createFileRoute("/whatsapp")({
  ssr: false,
  beforeLoad: async () => { const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw redirect({ to: "/auth" }); },
  head: () => ({ meta: [{ title: "WhatsApp assistant — EstateOS" }] }),
  component: WhatsAppSettings,
});

function WhatsAppSettings() {
  const access = useAccess(), client = useQueryClient();
  const startConnection = useServerFn(createWhatsAppConnectionSession);
  const finishConnection = useServerFn(completeWhatsAppEmbeddedSignup);
  const registerPhone = useServerFn(registerWhatsAppPhoneNumber);
  const [greeting, setGreeting] = useState(""), [instructions, setInstructions] = useState(""), [language, setLanguage] = useState("auto"), [tone, setTone] = useState("friendly"), [autoLead, setAutoLead] = useState(true), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [sdkReady, setSdkReady] = useState(false), [connecting, setConnecting] = useState(false), [connectNotice, setConnectNotice] = useState("");
  const [registrationPin, setRegistrationPin] = useState(""), [registering, setRegistering] = useState(false);
  const [preparedSession, setPreparedSession] = useState<SignupSession | null>(null);
  const [authCode, setAuthCode] = useState(""), [wabaId, setWabaId] = useState(""), [phoneNumberId, setPhoneNumberId] = useState("");
  const completionStarted = useRef(false);

  const config = useQuery({
    queryKey: ["whatsapp-config", access.data?.agencyId],
    enabled: !!access.data?.agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_configs")
        .select("id,agency_id,whatsapp_number,display_name,connection_status,connection_error,ai_enabled,ai_greeting,ai_language,ai_tone,ai_instructions,handoff_keywords,auto_create_leads,last_connected_at,created_at,updated_at")
        .eq("agency_id", access.data!.agencyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const prepareSession = useCallback(async () => {
    if (access.data?.role !== "agency_admin") return;
    try {
      setConnectNotice("");
      const session = await startConnection();
      setPreparedSession(session);
    } catch (error) {
      setConnectNotice(error instanceof Error ? error.message : "Could not prepare a secure Meta signup session.");
    }
  }, [access.data?.role, startConnection]);

  useEffect(() => {
    if (config.data) {
      setGreeting(config.data.ai_greeting ?? "");
      setInstructions(config.data.ai_instructions ?? "");
      setLanguage(config.data.ai_language);
      setTone(config.data.ai_tone ?? "friendly");
      setAutoLead(config.data.auto_create_leads);
    }
  }, [config.data]);

  useEffect(() => {
    const win = window as WindowWithFacebook;
    const existing = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
    if (win.FB) { setSdkReady(true); return; }
    const script = existing ?? document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.onload = () => setSdkReady(Boolean((window as WindowWithFacebook).FB));
    script.onerror = () => setConnectNotice("Meta's JavaScript SDK could not load. Check network or content-security settings.");
    if (!existing) document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (access.data?.role === "agency_admin" && !preparedSession && !connecting) void prepareSession();
  }, [access.data?.role, preparedSession, connecting, prepareSession]);

  useEffect(() => {
    const allowedOrigins = new Set(["https://www.facebook.com", "https://web.facebook.com"]);
    const onMessage = (event: MessageEvent) => {
      if (!allowedOrigins.has(event.origin) || !event.data || typeof event.data !== "object") return;
      const payload = event.data as { type?: unknown; data?: Record<string, unknown> };
      if (payload.type !== "WA_EMBEDDED_SIGNUP" || !payload.data) return;
      const data = payload.data;
      const eventName = typeof data["event"] === "string" ? data["event"] : "";
      if (eventName === "FINISH" || eventName === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
        if (typeof data["waba_id"] === "string") setWabaId(data["waba_id"]);
        if (typeof data["phone_number_id"] === "string") setPhoneNumberId(data["phone_number_id"]);
      } else if (eventName === "CANCEL" || eventName === "ERROR") {
        setConnecting(false);
        setConnectNotice("Meta signup was cancelled or could not complete. You can try again.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!preparedSession || !authCode || !wabaId || !phoneNumberId || completionStarted.current) return;
    completionStarted.current = true;
    setConnectNotice("Verifying the selected WhatsApp business and securely saving the connection…");
    void finishConnection({ data: { state: preparedSession.state, code: authCode, wabaId, phoneNumberId } })
      .then(async (result) => {
        setConnectNotice(result.needsPin ? "Meta assets are linked. Enter the six-digit phone registration PIN below to finish setup." : "WhatsApp connected for " + (result.phoneNumber ?? "your agency") + ". AI remains off until the messaging safeguards are enabled.");
        await client.invalidateQueries({ queryKey: ["whatsapp-config"] });
      })
      .catch((error: unknown) => {
        setConnectNotice(error instanceof Error ? error.message : "WhatsApp connection could not be completed.");
      })
      .finally(() => {
        setConnecting(false);
        setPreparedSession(null);
        setAuthCode(""); setWabaId(""); setPhoneNumberId("");
        completionStarted.current = false;
      });
  }, [preparedSession, authCode, wabaId, phoneNumberId, finishConnection, client]);

  function launchSignup() {
    if (!preparedSession) { setConnectNotice("Preparing a secure signup session. Try again in a moment."); void prepareSession(); return; }
    const sdk = (window as WindowWithFacebook).FB;
    if (!sdkReady || !sdk) { setConnectNotice("Meta's JavaScript SDK is still loading. Try again shortly."); return; }
    setAuthCode(""); setWabaId(""); setPhoneNumberId(""); completionStarted.current = false;
    setConnecting(true); setConnectNotice("Complete the secure signup flow in Meta's popup.");
    sdk.init({ appId: preparedSession.appId, autoLogAppEvents: true, xfbml: true, version: preparedSession.graphApiVersion });
    // v4 reads product configuration from the Meta Login for Business config ID.
    sdk.login((response) => {
      const code = response.authResponse?.code;
      if (!code) {
        setConnecting(false);
        setConnectNotice("Meta did not return an authorization code. Close the popup and try again.");
      } else {
        setAuthCode(code);
      }
    }, { config_id: preparedSession.configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } });
  }

  async function registerPhoneNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegistering(true); setConnectNotice("");
    try {
      await registerPhone({ data: { pin: registrationPin } });
      setRegistrationPin("");
      setConnectNotice("WhatsApp phone registration succeeded. AI remains disabled until outbound safeguards are deployed.");
      await client.invalidateQueries({ queryKey: ["whatsapp-config"] });
    } catch (error) {
      setConnectNotice(error instanceof Error ? error.message : "Phone registration failed. Verify the PIN and try again.");
    } finally {
      setRegistering(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config.data) { setNotice("WhatsApp configuration is not provisioned for this agency."); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase.from("whatsapp_configs").update({
      ai_greeting: greeting.trim() || null,
      ai_instructions: instructions.trim() || null,
      ai_language: language,
      ai_tone: tone,
      auto_create_leads: autoLead,
      ai_enabled: false,
    }).eq("agency_id", config.data.agency_id);
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    setNotice("Preferences saved. AI remains disabled until outbound messaging safeguards are deployed.");
    await client.invalidateQueries({ queryKey: ["whatsapp-config"] });
  }

  return <AppShell title="WhatsApp assistant" description="Connect the official Meta Cloud API and configure agency-specific assistant preferences.">
    <div className="mb-6 grid gap-4 md:grid-cols-2">
      <div className="surface-panel p-5">
        <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageCircle className="size-5"/></span><div><h2 className="font-semibold">Official Meta channel</h2><p className="text-sm text-muted-foreground">Status: {config.data?.connection_status ?? "loading"}</p></div></div>
        <p className="mt-4 text-sm text-muted-foreground">{config.data?.whatsapp_number ? "Connected number: " + config.data.whatsapp_number : "No business number is connected yet."} Embedded Signup uses a short-lived authorization code; tokens are exchanged and encrypted on the server.</p>
        {config.data?.connection_error ? <p role="alert" className="mt-3 text-sm text-destructive">{config.data.connection_error}</p> : null}
        {access.data?.role !== "agency_admin" ? <p className="mt-3 text-xs text-muted-foreground">Ask your agency administrator to connect the WhatsApp number.</p> : null}
        <button onClick={launchSignup} disabled={access.data?.role !== "agency_admin" || !sdkReady || !preparedSession || connecting} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">{connecting ? "Connecting…" : config.data?.connection_status === "connected" ? "Reconnect with Meta" : "Connect with Meta"}</button>
        {connectNotice ? <p role="status" className="mt-3 rounded-lg bg-muted p-3 text-sm">{connectNotice}</p> : null}
        {config.data?.connection_status === "pending" ? <form onSubmit={registerPhoneNumber} className="mt-4 space-y-3 rounded-lg border border-border p-3">
          <label className="block space-y-1.5 text-sm font-medium">Six-digit phone registration PIN<input required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} type="password" autoComplete="off" value={registrationPin} onChange={e => setRegistrationPin(e.target.value.replace(/\\D/g, "").slice(0, 6))} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" placeholder="••••••"/></label>
          <p className="text-xs text-muted-foreground">This is the six-digit PIN used for WhatsApp two-step verification, not your Meta password.</p>
          <button disabled={registering || registrationPin.length !== 6} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-60">{registering ? "Registering…" : "Register phone number"}</button>
        </form> : null}
      </div>
      <div className="surface-panel p-5"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-5"/></span><div><h2 className="font-semibold">Safety controls</h2><p className="text-sm text-muted-foreground">Human takeover always wins.</p></div></div><p className="mt-4 text-sm text-muted-foreground">Incoming messages are verified, mapped to a tenant by phone-number ID, and placed in a durable queue. Automated replies stay disabled until opt-out, template, 24-hour-window, quota and human-handoff rules are enforced.</p></div>
    </div>
    <form onSubmit={save} className="surface-panel space-y-5 p-5"><div className="flex items-center gap-2"><Bot className="size-5 text-primary"/><h2 className="font-semibold">Assistant preferences</h2></div>
      <label className="block space-y-1.5 text-sm font-medium">Greeting<textarea rows={2} value={greeting} onChange={e=>setGreeting(e.target.value)} className="block w-full rounded-lg border border-input bg-background p-3 font-normal" placeholder="Assalam-o-alaikum! How can we help with your property search?"/></label>
      <label className="block space-y-1.5 text-sm font-medium">Instructions<textarea rows={4} value={instructions} onChange={e=>setInstructions(e.target.value)} className="block w-full rounded-lg border border-input bg-background p-3 font-normal" placeholder="Approved agency information and how enquiries should be handled."/></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm font-medium">Language<select value={language} onChange={e=>setLanguage(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal"><option value="auto">Auto-detect</option><option value="ur">Urdu</option><option value="en">English</option><option value="ur-en">Urdu + English</option></select></label><label className="space-y-1.5 text-sm font-medium">Tone<select value={tone} onChange={e=>setTone(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 font-normal"><option value="friendly">Friendly</option><option value="professional">Professional</option><option value="concise">Concise</option></select></label></div>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={autoLead} onChange={e=>setAutoLead(e.target.checked)} className="size-4 accent-primary"/>Allow lead creation from incoming enquiries once processing is enabled</label>
      {notice ? <p role="status" className="rounded-lg bg-muted p-3 text-sm">{notice}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Saving preferences never activates outbound messaging.</p><button disabled={busy||config.isLoading} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy?"Saving…":"Save preferences"}</button></div>
    </form>
  </AppShell>;
}
