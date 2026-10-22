import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  beginWhatsappSignup,
  completeWhatsappSignup,
  listWhatsappInbox,
  listWhatsappMessages,
  listWhatsappFollowups,
  recordWhatsappConsent,
  scheduleWhatsappFollowup,
  cancelWhatsappFollowup,
  markWhatsappConversationRead,
  resumeWhatsappAi,
  sendWhatsappReply,
  assignWhatsappConversation,
} from "@/lib/whatsapp.functions";
import { fetchTeamMembers } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/agency/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — EstateOS" }] }),
  component: WhatsAppPage,
});

type SignupInfo = { wabaId: string; phoneNumberId?: string; coexistence: boolean };
type FacebookLoginResponse = { authResponse?: { code?: string } };
type EmbeddedSignupEvent = {
  type?: string;
  event?: string;
  data?: {
    waba_id?: string | number;
    phone_number_id?: string | number;
    error_message?: string;
  };
};
type WhatsAppContactSummary = {
  name: string | null;
  phone: string | null;
  opt_in_status: "unknown" | "opted_in" | "opted_out";
  opt_in_source: string | null;
  opt_in_at: string | null;
};
type InboxConversation = {
  id: string;
  last_message_at: string | null;
  unread_count: number;
  window_expires_at: string | null;
  ai_paused_at: string | null;
  handoff_reason: string | null;
  assigned_to: string | null;
  whatsapp_contacts: WhatsAppContactSummary | WhatsAppContactSummary[] | null;
};
type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  body: string | null;
  created_at: string;
};
type ScheduledFollowup = {
  id: string;
  due_at: string;
  mode: "freeform" | "template";
  body: string | null;
  template_name: string | null;
  status: string;
  last_error: string | null;
};

declare global {
  interface Window {
    FB?: {
      init: (options: { appId: string; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function loadFacebookSdk(): Promise<void> {
  if (window.FB) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("facebook-jssdk");
    const timeout = window.setTimeout(
      () => reject(new Error("Meta login could not load.")),
      12_000,
    );
    window.fbAsyncInit = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    if (!existing) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Meta login could not load."));
      };
      document.body.appendChild(script);
    }
  });
}

function WhatsAppPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;
  const queryClient = useQueryClient();
  const beginSignup = useServerFn(beginWhatsappSignup);
  const finishSignup = useServerFn(completeWhatsappSignup);
  const loadInbox = useServerFn(listWhatsappInbox);
  const loadMessages = useServerFn(listWhatsappMessages);
  const loadFollowups = useServerFn(listWhatsappFollowups);
  const saveConsent = useServerFn(recordWhatsappConsent);
  const scheduleFollowup = useServerFn(scheduleWhatsappFollowup);
  const cancelFollowup = useServerFn(cancelWhatsappFollowup);
  const markRead = useServerFn(markWhatsappConversationRead);
  const resumeAi = useServerFn(resumeWhatsappAi);
  const sendReply = useServerFn(sendWhatsappReply);
  const assignConversation = useServerFn(assignWhatsappConversation);
  const [connecting, setConnecting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyRequestId, setReplyRequestId] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [consentSource, setConsentSource] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [followupMode, setFollowupMode] = useState<"freeform" | "template">("template");
  const [followupDate, setFollowupDate] = useState("");
  const [followupBody, setFollowupBody] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en_US");
  const [scheduling, setScheduling] = useState(false);
  const [resumingAi, setResumingAi] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const { data: assignableMembers = [] } = useQuery({
    queryKey: ["whatsapp-assignable-members", agencyId],
    queryFn: async () =>
      (await fetchTeamMembers(agencyId)).filter(
        (member) => member.role === "employee" && member.status === "active",
      ),
  });

  const { data: connection, isLoading: connectionLoading } = useQuery({
    queryKey: ["whatsapp-connection", agencyId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WhatsApp tables are not in the generated Database type until their migration is applied.
      const { data, error } = await (supabase as any)
        .from("whatsapp_connections")
        .select("id,state,display_number,display_name,is_coexistence,quality_rating")
        .eq("agency_id", agencyId)
        .eq("state", "connected")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: inboxData, isLoading: inboxLoading } = useQuery({
    queryKey: ["whatsapp-inbox", agencyId],
    queryFn: () => loadInbox(),
    refetchInterval: 30_000,
  });
  const { data: messageData, isLoading: messagesLoading } = useQuery({
    queryKey: ["whatsapp-messages", selectedId],
    queryFn: () => loadMessages({ data: { conversationId: selectedId! } }),
    enabled: Boolean(selectedId),
    refetchInterval: 10_000,
  });
  const { data: followupData } = useQuery({
    queryKey: ["whatsapp-followups", selectedId],
    queryFn: () => loadFollowups({ data: { conversationId: selectedId! } }),
    enabled: Boolean(selectedId),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const messages = document.getElementById("whatsapp-message-list");
    if (messages) messages.scrollTop = messages.scrollHeight;
  }, [messageData]);

  useEffect(() => {
    if (!selectedId) return;
    void markRead({ data: { conversationId: selectedId } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox", agencyId] }))
      .catch(() => undefined);
  }, [selectedId, markRead, queryClient, agencyId]);

  async function connectNumber() {
    setConnecting(true);
    try {
      const signup = await beginSignup();
      if (!signup.ready) {
        toast.error(signup.reason);
        return;
      }
      await loadFacebookSdk();
      window.FB?.init({ appId: signup.appId, xfbml: false, version: signup.graphVersion });
      if (!window.FB) throw new Error("Meta login failed to initialize.");
      const { code, info } = await new Promise<{ code: string; info: SignupInfo }>(
        (resolve, reject) => {
          let code: string | null = null;
          let info: SignupInfo | null = null;
          let settled = false;
          const cleanup = () => {
            window.clearTimeout(timeout);
            window.removeEventListener("message", listener);
          };
          const settleIfReady = () => {
            if (!settled && code && info) {
              settled = true;
              cleanup();
              resolve({ code, info });
            }
          };
          const fail = (message: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(message));
          };
          const listener = (event: MessageEvent) => {
            if (
              !event.origin.startsWith("https://") ||
              (!event.origin.endsWith(".facebook.com") && event.origin !== "https://facebook.com")
            )
              return;
            let eventData: unknown;
            try {
              eventData =
                typeof event.data === "string" ? (JSON.parse(event.data) as unknown) : event.data;
            } catch {
              return;
            }
            const signupEvent = eventData as EmbeddedSignupEvent | null;
            if (signupEvent?.type !== "WA_EMBEDDED_SIGNUP") return;
            if (signupEvent.event === "CANCEL" || signupEvent.event === "ERROR") {
              fail(signupEvent.data?.error_message || "Meta signup was cancelled.");
              return;
            }
            if (
              ["FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", "FINISH_ONLY_WABA"].includes(
                signupEvent.event ?? "",
              )
            ) {
              if (signupEvent.event !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
                fail(
                  "Choose the existing WhatsApp Business app number and finish Meta's Coexistence confirmation.",
                );
                return;
              }
              const wabaId = String(signupEvent.data?.waba_id ?? "");
              const phoneNumberId = String(signupEvent.data?.phone_number_id ?? "");
              const coexistence = true;
              if (!wabaId || (!phoneNumberId && !coexistence)) {
                fail("Meta signup did not return a completed WhatsApp number connection.");
                return;
              }
              info = {
                wabaId,
                ...(phoneNumberId ? { phoneNumberId } : {}),
                coexistence,
              };
              settleIfReady();
            }
          };
          const timeout = window.setTimeout(
            () =>
              fail("Meta signup did not return the authorization and WhatsApp account details."),
            120_000,
          );
          window.addEventListener("message", listener);
          window.FB!.login(
            (response) => {
              if (!response.authResponse?.code) {
                fail("Meta signup was cancelled or did not return an authorization code.");
                return;
              }
              code = response.authResponse.code;
              settleIfReady();
            },
            {
              config_id: signup.configId,
              response_type: "code",
              override_default_response_type: true,
              auth_type: "rerequest",
              extras: { featureType: "whatsapp_business_app_onboarding", setup: {} },
            },
          );
        },
      );
      const result = await finishSignup({ data: { code, ticket: signup.ticket, ...info } });
      toast.success(`${result.displayNumber} connected`);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-connection", agencyId] });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox", agencyId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "WhatsApp connection failed.");
    } finally {
      setConnecting(false);
    }
  }

  async function submitReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    try {
      await sendReply({
        data: { conversationId: selectedId, body: reply.trim(), requestId: replyRequestId },
      });
      setReply("");
      setReplyRequestId(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox", agencyId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reply could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function submitConsent() {
    if (!selectedId || !consentSource.trim() || !consentConfirmed) return;
    setSavingConsent(true);
    try {
      await saveConsent({
        data: { conversationId: selectedId, source: consentSource.trim(), confirmed: true },
      });
      setConsentConfirmed(false);
      toast.success("WhatsApp opt-in recorded");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox", agencyId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record opt-in.");
    } finally {
      setSavingConsent(false);
    }
  }

  async function submitFollowup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !followupDate) return;
    setScheduling(true);
    try {
      await scheduleFollowup({
        data: {
          conversationId: selectedId,
          dueAt: new Date(followupDate).toISOString(),
          mode: followupMode,
          ...(followupMode === "freeform"
            ? { body: followupBody }
            : { templateName, templateLanguage }),
        },
      });
      setFollowupBody("");
      setTemplateName("");
      setFollowupDate("");
      toast.success("Follow-up scheduled");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-followups", selectedId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not schedule follow-up.");
    } finally {
      setScheduling(false);
    }
  }

  async function removeFollowup(followupId: string) {
    if (!selectedId) return;
    try {
      await cancelFollowup({ data: { conversationId: selectedId, followupId } });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-followups", selectedId] });
      toast.success("Follow-up cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel follow-up.");
    }
  }

  async function unpauseAi() {
    if (!selectedId) return;
    setResumingAi(true);
    try {
      await resumeAi({ data: { conversationId: selectedId } });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox", agencyId] });
      toast.success("AI replies resumed for this conversation");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to resume AI.");
    } finally {
      setResumingAi(false);
    }
  }

  async function changeAssignment(assigneeId: string) {
    if (!selectedId) return;
    setAssigning(true);
    try {
      await assignConversation({
        data: { conversationId: selectedId, assigneeId: assigneeId || null },
      });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox", agencyId] });
      toast.success(assigneeId ? "Conversation assigned" : "Conversation unassigned");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign conversation.");
    } finally {
      setAssigning(false);
    }
  }

  const conversations = (inboxData?.conversations ?? []) as InboxConversation[];
  const messages = (messageData?.messages ?? []) as InboxMessage[];
  const followups = (followupData?.followups ?? []) as ScheduledFollowup[];
  const selected = conversations.find((item) => item.id === selectedId);

  return (
    <AppShell
      title="WhatsApp inbox"
      description="Connect an existing WhatsApp Business app number through Meta, then manage customer conversations."
    >
      <div className="space-y-5">
        <section className="surface-panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="font-medium">
              {connectionLoading
                ? "Checking connection…"
                : connection
                  ? `Connected: ${connection.display_number ?? connection.display_name ?? "WhatsApp number"}`
                  : "No WhatsApp number connected"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {connection?.is_coexistence
                ? "Connected through Meta coexistence. The customer can continue using the WhatsApp Business app."
                : "Meta will ask the number owner to authorize the Business account and available number."}
            </p>
          </div>
          <Button onClick={connectNumber} disabled={connecting || Boolean(connection)}>
            {connecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageCircle className="size-4" />
            )}
            {connecting
              ? "Connecting…"
              : connection
                ? "Number connected"
                : "Connect existing number"}
          </Button>
        </section>

        <Alert>
          <AlertCircle className="size-4" />
          <AlertDescription>
            Connecting requires a Meta Embedded Signup v4 app and configuration. Customers approve
            access in Meta; entering a phone number alone cannot enable API access. Automated
            replies use the configured OpenAI Responses API model, honor the service window and stop
            keywords, and pause for human handoff.
          </AlertDescription>
        </Alert>

        <section className="grid min-h-[520px] gap-4 lg:grid-cols-[minmax(250px,0.85fr)_minmax(0,1.5fr)]">
          <div className="surface-panel overflow-hidden">
            <div className="border-b p-4">
              <h2 className="font-semibold">Conversations</h2>
              <p className="text-xs text-muted-foreground">Recent customer messages</p>
            </div>
            <div className="max-h-[620px] overflow-y-auto">
              {inboxLoading ? <Skeleton className="m-4 h-20" /> : null}
              {!inboxLoading && conversations.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">
                  New WhatsApp conversations will appear here.
                </p>
              ) : null}
              {conversations.map((conversation) => {
                const contact = Array.isArray(conversation.whatsapp_contacts)
                  ? conversation.whatsapp_contacts[0]
                  : conversation.whatsapp_contacts;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedId(conversation.id)}
                    className={`w-full border-b px-4 py-3 text-left hover:bg-muted/50 ${selectedId === conversation.id ? "bg-muted" : ""}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {contact?.name || contact?.phone || "WhatsApp contact"}
                      </span>
                      {conversation.unread_count > 0 ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                          {conversation.unread_count}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {contact?.phone ?? ""} ·{" "}
                      {conversation.last_message_at
                        ? new Date(conversation.last_message_at).toLocaleString()
                        : "New"}
                    </span>
                    {conversation.ai_paused_at ? (
                      <span className="mt-1 block text-xs font-medium text-amber-700">
                        Needs a human · {conversation.handoff_reason || "AI paused"}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="surface-panel flex min-h-[520px] flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="border-b p-4">
                  <h2 className="font-semibold">
                    {(() => {
                      const contact = Array.isArray(selected.whatsapp_contacts)
                        ? selected.whatsapp_contacts[0]
                        : selected.whatsapp_contacts;
                      return contact?.name || contact?.phone || "Customer";
                    })()}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Customer service window{" "}
                    {selected.window_expires_at &&
                    Date.parse(selected.window_expires_at) > Date.now()
                      ? "is open"
                      : "has expired"}
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    Assigned agent
                    <select
                      value={selected.assigned_to ?? ""}
                      onChange={(event) => void changeAssignment(event.target.value)}
                      disabled={assigning}
                      aria-label="Assign WhatsApp conversation"
                      className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
                    >
                      <option value="">Unassigned</option>
                      {assignableMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.full_name || "Agency employee"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selected.ai_paused_at ? (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-amber-700">
                        AI paused · {selected.handoff_reason || "Human follow-up requested"}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={resumingAi}
                        onClick={unpauseAi}
                      >
                        {resumingAi ? <Loader2 className="size-4 animate-spin" /> : "Resume AI"}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div id="whatsapp-message-list" className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messagesLoading ? <Skeleton className="h-16" /> : null}
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${message.direction === "outbound" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p
                        className={`mt-1 text-[10px] ${message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                      >
                        {new Date(message.created_at).toLocaleTimeString()} · {message.status}
                      </p>
                    </div>
                  ))}
                </div>
                {(() => {
                  const contact = Array.isArray(selected.whatsapp_contacts)
                    ? selected.whatsapp_contacts[0]
                    : selected.whatsapp_contacts;
                  return (
                    <details className="border-t px-4 py-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        Follow-ups and permission · {contact?.opt_in_status ?? "unknown"}
                      </summary>
                      <div className="mt-3 space-y-4">
                        {contact?.opt_in_status !== "opted_in" ? (
                          <div className="space-y-2 rounded-lg bg-muted/60 p-3">
                            <p className="text-xs text-muted-foreground">
                              Record this only after the customer explicitly agreed to receive
                              WhatsApp follow-ups.
                            </p>
                            <Input
                              value={consentSource}
                              onChange={(event) => setConsentSource(event.target.value)}
                              placeholder="Where and when was consent collected?"
                              aria-label="Consent source"
                            />
                            <label className="flex items-start gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={consentConfirmed}
                                onChange={(event) => setConsentConfirmed(event.target.checked)}
                              />
                              I confirm the customer explicitly opted in to WhatsApp messages.
                            </label>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={savingConsent || !consentSource.trim() || !consentConfirmed}
                              onClick={submitConsent}
                            >
                              {savingConsent ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                "Record opt-in"
                              )}
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Opt-in recorded
                            {contact.opt_in_source ? `: ${contact.opt_in_source}` : ""}.
                          </p>
                        )}
                        <form
                          onSubmit={submitFollowup}
                          className="space-y-2 rounded-lg bg-muted/60 p-3"
                        >
                          <p className="text-sm font-medium">Schedule an automatic follow-up</p>
                          <p className="text-xs text-muted-foreground">
                            A free-form message must be due before the current 24-hour window
                            closes. Outside it, choose a pre-approved Meta template. The scheduler
                            stays paused until live sending is enabled.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
                              type="datetime-local"
                              value={followupDate}
                              onChange={(event) => setFollowupDate(event.target.value)}
                              aria-label="Follow-up time"
                              required
                            />
                            <select
                              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                              value={followupMode}
                              onChange={(event) =>
                                setFollowupMode(event.target.value as "freeform" | "template")
                              }
                              aria-label="Follow-up type"
                            >
                              <option value="template">Approved template</option>
                              <option value="freeform">Free-form inside service window</option>
                            </select>
                          </div>
                          {followupMode === "template" ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Input
                                value={templateName}
                                onChange={(event) => setTemplateName(event.target.value)}
                                placeholder="Approved template name"
                                required
                              />
                              <Input
                                value={templateLanguage}
                                onChange={(event) => setTemplateLanguage(event.target.value)}
                                placeholder="Language code, e.g. en_US"
                                required
                              />
                            </div>
                          ) : (
                            <Textarea
                              value={followupBody}
                              onChange={(event) => setFollowupBody(event.target.value)}
                              placeholder="Follow-up message"
                              maxLength={4000}
                              required
                            />
                          )}
                          <Button
                            type="submit"
                            size="sm"
                            disabled={scheduling || !connection || !followupDate}
                          >
                            {scheduling ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              "Schedule follow-up"
                            )}
                          </Button>
                        </form>
                        {followups.length ? (
                          <div className="space-y-2">
                            <p className="text-xs font-medium">Scheduled and recent</p>
                            {followups.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-2 rounded border p-2 text-xs"
                              >
                                <span>
                                  {new Date(item.due_at).toLocaleString()} ·{" "}
                                  {item.mode === "template" ? item.template_name : item.body} ·{" "}
                                  {item.status}
                                  {item.last_error ? ` · ${item.last_error}` : ""}
                                </span>
                                {item.status === "scheduled" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removeFollowup(item.id)}
                                  >
                                    Cancel
                                  </Button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  );
                })()}
                <form onSubmit={submitReply} className="flex items-end gap-2 border-t p-3">
                  <Textarea
                    value={reply}
                    onChange={(event) => {
                      setReply(event.target.value);
                      setReplyRequestId(crypto.randomUUID());
                    }}
                    rows={2}
                    maxLength={4000}
                    placeholder="Write a reply…"
                    aria-label="WhatsApp reply"
                  />
                  <Button
                    type="submit"
                    disabled={sending || !reply.trim()}
                    aria-label="Send WhatsApp reply"
                  >
                    {sending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                Select a conversation to view messages and reply.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
