import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, MessageSquare, Send, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { sendWhatsAppMessage } from "@/lib/whatsapp.functions";
type ConversationState = Database["public"]["Enums"]["conversation_state"];
export const Route = createFileRoute("/conversations")({
  ssr: false,
  beforeLoad: async () => { const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw redirect({ to: "/auth" }); },
  head: () => ({ meta: [{ title: "WhatsApp inbox — EstateOS" }] }),
  component: ConversationsPage,
});
function ConversationsPage() {
  const client = useQueryClient(), sendMessage = useServerFn(sendWhatsAppMessage);
  const [selectedId, setSelectedId] = useState(""), [reply, setReply] = useState(""), [sending, setSending] = useState(false), [sendError, setSendError] = useState(""), [sendNotice, setSendNotice] = useState("");
  const list = useQuery({ queryKey: ["conversations"], queryFn: async () => { const { data, error } = await supabase.from("conversations").select("*").order("last_message_at", { ascending: false, nullsFirst: false }); if (error) throw error; return data; } });
  useEffect(() => {
    if (!list.data?.length) { setSelectedId(""); return; }
    if (!selectedId || !list.data.some((item) => item.id === selectedId)) {
      const firstId = list.data[0]?.id;
      if (firstId) setSelectedId(firstId);
    }
  }, [list.data, selectedId]);
  const selected = list.data?.find((item) => item.id === selectedId);
  const messages = useQuery({
    queryKey: ["conversation-messages", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase.from("conversation_messages")
        .select("id,conversation_id,sender,body,created_at,media_url")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
  async function setState(id: string, state: ConversationState) {
    const { error } = await supabase.from("conversations").update({ state, handoff_requested: state === "human_active" }).eq("id", id);
    if (error) setSendError(error.message);
    else { setSendError(""); await client.invalidateQueries({ queryKey: ["conversations"] }); }
  }
  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setSending(true); setSendError(""); setSendNotice("");
    try {
      const result = await sendMessage({ data: { conversationId: selected.id, clientRequestId: crypto.randomUUID(), body: reply.trim() } });
      setReply("");
      setSendNotice(result.status === "sent" ? "Message accepted by WhatsApp." : "This message request already exists with status: " + result.status + ".");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["conversation-messages", selected.id] }),
        client.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }
  return <AppShell title="WhatsApp inbox" description="Review customer messages, take over conversations, and send policy-checked human replies.">
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4"><Bot className="mt-0.5 size-5 text-primary" /><p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Safe messaging:</span> incoming messages are verified and tenant-mapped by phone-number ID. Human replies require takeover, customer consent, and an open 24-hour service window. AI replies and template messages remain disabled.</p></div>
    {list.isError ? <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Could not load conversations.</p> : null}
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]">
      <section className="surface-panel min-w-0 overflow-hidden">
        <div className="border-b border-border p-4"><h2 className="font-semibold">Conversations</h2><p className="mt-1 text-xs text-muted-foreground">{list.data?.length ?? 0} stored chats</p></div>
        {list.isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading conversations…</p> : (list.data ?? []).length === 0 ? <div className="p-8 text-center"><MessageSquare className="mx-auto size-8 text-muted-foreground"/><p className="mt-3 text-sm font-medium">No conversations yet</p><p className="mt-1 text-xs text-muted-foreground">Verified incoming messages appear here.</p></div> : <div className="divide-y divide-border">{(list.data ?? []).map(c => <article key={c.id} className={c.id === selectedId ? "bg-primary/5 p-3" : "p-3"}>
          <button onClick={() => { setSelectedId(c.id); setSendError(""); setSendNotice(""); }} className="w-full min-w-0 text-left"><div className="flex items-center gap-2"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary"><UserRound className="size-4"/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.customer_name || c.customer_phone}</span><span className="block truncate text-xs text-muted-foreground">{c.customer_phone}</span></span></div><p className="mt-2 text-xs text-muted-foreground">{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "No activity"}</p></button>
          <div className="mt-2 flex items-center justify-between gap-2"><span className="rounded-full bg-secondary px-2 py-1 text-[11px]">{c.state.replace("_", " ")}</span><select aria-label="Conversation state" value={c.state} onChange={e => setState(c.id, e.target.value as ConversationState)} className="h-8 max-w-32 rounded-md border border-input bg-background px-2 text-xs"><option value="ai_active">AI active</option><option value="human_active">Human active</option><option value="closed">Closed</option></select></div>
        </article>)}</div>}
      </section>
      <section className="surface-panel flex min-w-0 flex-col overflow-hidden">
        {!selected ? <div className="p-10 text-center"><MessageSquare className="mx-auto size-8 text-muted-foreground"/><h2 className="mt-3 font-semibold">Choose a conversation</h2><p className="mt-1 text-sm text-muted-foreground">Select a customer chat to review messages.</p></div> : <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><h2 className="font-semibold">{selected.customer_name || selected.customer_phone}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.customer_phone}</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs">{selected.state.replace("_", " ")}</span></div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.isLoading ? <p className="text-sm text-muted-foreground">Loading messages…</p> : messages.isError ? <p role="alert" className="text-sm text-destructive">Could not load messages.</p> : (messages.data ?? []).length === 0 ? <div className="py-10 text-center"><p className="text-sm font-medium">No message history</p><p className="mt-1 text-xs text-muted-foreground">Messages are stored after a verified webhook is processed.</p></div> : (messages.data ?? []).map(m => <div key={m.id} className={m.sender === "customer" ? "mr-8 max-w-[85%] rounded-xl rounded-bl-sm bg-muted p-3" : "ml-8 max-w-[85%] rounded-xl rounded-br-sm bg-primary/10 p-3"}><p className="whitespace-pre-wrap break-words text-sm">{m.body || (m.media_url ? "Media attachment" : "Message content unavailable")}</p><p className="mt-2 text-[10px] capitalize text-muted-foreground">{m.sender} · {new Date(m.created_at).toLocaleString()}</p></div>)}
          </div>
          {selected.state !== "human_active" ? <div className="border-t border-border bg-muted/30 p-4"><p className="text-sm text-muted-foreground">{selected.state === "closed" ? "This conversation is closed. If the customer opted out, outbound messaging remains blocked." : "Take over this conversation by switching its state to Human active before replying."}</p></div> : <form onSubmit={submitReply} className="border-t border-border p-4"><label htmlFor="reply" className="mb-2 block text-xs font-medium text-muted-foreground">Human reply · free-form text only within the 24-hour service window</label><textarea id="reply" required maxLength={4096} rows={3} value={reply} onChange={e => setReply(e.target.value)} className="w-full resize-y rounded-lg border border-input bg-background p-3 text-sm" placeholder="Write a reply…"/>{sendError ? <p role="alert" className="mt-2 text-sm text-destructive">{sendError}</p> : null}{sendNotice ? <p role="status" className="mt-2 text-sm text-primary">{sendNotice}</p> : null}<div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{reply.length}/4096 characters</p><button disabled={sending || !reply.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"><Send className="size-4"/>{sending ? "Sending…" : "Send reply"}</button></div></form>}
        </>}
      </section>
    </div>
  </AppShell>;
}
