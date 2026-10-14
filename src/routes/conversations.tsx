import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, MessageSquare, Search, Send, StickyNote, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAccess } from "@/hooks/useAccess";
import { assignConversation, createInternalNote, markConversationRead } from "@/lib/conversations.functions";
import { sendWhatsAppMessage } from "@/lib/whatsapp.functions";

type ConversationState = Database["public"]["Enums"]["conversation_state"];
const PAGE_SIZE = 20;

export const Route = createFileRoute("/conversations")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "WhatsApp inbox — EstateOS" }] }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const access = useAccess();
  const client = useQueryClient();
  const sendMessage = useServerFn(sendWhatsAppMessage);
  const assign = useServerFn(assignConversation);
  const markRead = useServerFn(markConversationRead);
  const saveNote = useServerFn(createInternalNote);

  const [selectedId, setSelectedId] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [noteMode, setNoteMode] = useState(false);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<ConversationState | "all">("all");
  const [page, setPage] = useState(1);
  const [sending, setSending] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendNotice, setSendNotice] = useState("");

  const list = useQuery({
    queryKey: ["conversations", access.data?.agencyId],
    enabled: !!access.data?.agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("*")
        .eq("agency_id", access.data!.agencyId!)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(250);
      if (error) throw error;
      return data;
    },
  });

  const profiles = useQuery({
    queryKey: ["conversation-assignees", access.data?.agencyId],
    enabled: !!access.data?.agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("id,full_name,phone")
        .eq("agency_id", access.data!.agencyId!)
        .eq("status", "active")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const teammateLabels = useMemo(
    () => new Map((profiles.data ?? []).map((profile) => [profile.id, profile.full_name || profile.phone || "Team member"])),
    [profiles.data],
  );

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (list.data ?? []).filter((conversation) => {
      const matchesSearch = !query || [
        conversation.customer_name,
        conversation.customer_phone,
        teammateLabels.get(conversation.assigned_to ?? ""),
      ].some((value) => value?.toLocaleLowerCase().includes(query));
      return matchesSearch && (stateFilter === "all" || conversation.state === stateFilter);
    });
  }, [list.data, search, stateFilter, teammateLabels]);

  const pageCount = Math.max(1, Math.ceil(filteredConversations.length / PAGE_SIZE));
  const visibleConversations = filteredConversations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, stateFilter]);

  useEffect(() => {
    if (filteredConversations.length === 0) {
      setSelectedId("");
      return;
    }
    if (!selectedId || !filteredConversations.some((item) => item.id === selectedId)) {
      setSelectedId(filteredConversations[0]!.id);
    }
  }, [filteredConversations, selectedId]);

  const selected = list.data?.find((item) => item.id === selectedId);

  const messages = useQuery({
    queryKey: ["conversation-messages", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase.from("conversation_messages")
        .select("id,conversation_id,sender,body,created_at,media_url,message_kind,created_by,provider_status")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).reverse();
    },
  });

  useEffect(() => {
    if (!selectedId || !selected?.unread_count) return;
    let cancelled = false;
    void markRead({ data: { conversationId: selectedId } })
      .then(async () => {
        if (!cancelled) await client.invalidateQueries({ queryKey: ["conversations"] });
      })
      .catch((error) => {
        if (!cancelled) setSendError(error instanceof Error ? error.message : "Could not mark the conversation as read.");
      });
    return () => { cancelled = true; };
  }, [selectedId, selected?.unread_count, markRead, client]);

  async function setState(id: string, state: ConversationState) {
    if (!access.data?.agencyId) return;
    const { error } = await supabase.from("conversations")
      .update({ state, handoff_requested: state === "human_active" })
      .eq("id", id)
      .eq("agency_id", access.data.agencyId);
    if (error) setSendError(error.message);
    else {
      setSendError("");
      await client.invalidateQueries({ queryKey: ["conversations"] });
    }
  }

  async function assignTo(id: string, assignedTo: string | null) {
    setSendError("");
    try {
      await assign({ data: { conversationId: id, assignedTo } });
      await client.invalidateQueries({ queryKey: ["conversations"] });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not assign the conversation.");
    }
  }

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setSending(true);
    setSendError("");
    setSendNotice("");
    try {
      const result = await sendMessage({
        data: { conversationId: selected.id, clientRequestId: crypto.randomUUID(), body: reply.trim() },
      });
      setReply("");
      setSendNotice(result.status === "sent"
        ? "Message accepted by WhatsApp."
        : "This message request already exists with status: " + result.status + ".");
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

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !note.trim()) return;
    setNoteBusy(true);
    setSendError("");
    setSendNotice("");
    try {
      await saveNote({ data: { conversationId: selected.id, body: note.trim() } });
      setNote("");
      setNoteMode(false);
      setSendNotice("Internal note saved. It was not sent to WhatsApp.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["conversation-messages", selected.id] }),
        client.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not save the internal note.");
    } finally {
      setNoteBusy(false);
    }
  }

  return (
    <AppShell title="WhatsApp inbox" description="Search, assign, and manage customer conversations with safe human replies and private internal notes.">
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
        <Bot className="mt-0.5 size-5 text-primary" />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Safe messaging:</span> incoming messages are verified and tenant-mapped by phone-number ID. Human replies require takeover, customer consent, and an open 24-hour service window. Internal notes stay in the CRM and are never sent to WhatsApp.
        </p>
      </div>

      {list.isError ? <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Could not load conversations.</p> : null}
      {sendError ? <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{sendError}</p> : null}
      {sendNotice ? <p role="status" className="mb-4 rounded-lg bg-primary/10 p-3 text-sm">{sendNotice}</p> : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]">
        <section className="surface-panel min-w-0 overflow-hidden">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Conversations</h2>
              <span className="text-xs text-muted-foreground">{filteredConversations.length} chats</span>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input aria-label="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, or assignee…" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" />
            </label>
            <select aria-label="Filter conversations by state" value={stateFilter} onChange={(event) => setStateFilter(event.target.value as ConversationState | "all")} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
              <option value="all">All states</option>
              <option value="ai_active">AI active</option>
              <option value="human_active">Human active</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {list.isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading conversations…</p> : filteredConversations.length === 0 ? (
            <div className="p-8 text-center"><MessageSquare className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No matching conversations</p><p className="mt-1 text-xs text-muted-foreground">Verified incoming messages appear here. Try a different search or state filter.</p></div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {visibleConversations.map((conversation) => (
                  <article key={conversation.id} className={conversation.id === selectedId ? "bg-primary/5 p-3" : "p-3"}>
                    <button type="button" onClick={() => { setSelectedId(conversation.id); setSendError(""); setSendNotice(""); }} className="w-full min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary"><UserRound className="size-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="block truncate text-sm font-medium">{conversation.customer_name || conversation.customer_phone}</span>
                            {conversation.unread_count > 0 ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">{conversation.unread_count}</span> : null}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{conversation.customer_phone}</span>
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleString() : "No activity"}</p>
                    </button>
                    <div className="mt-2 grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-secondary px-2 py-1 text-[11px]">{conversation.state.replace("_", " ")}</span>
                        <select aria-label="Conversation state" value={conversation.state} onChange={(event) => void setState(conversation.id, event.target.value as ConversationState)} className="h-8 max-w-32 rounded-md border border-input bg-background px-2 text-xs">
                          <option value="ai_active">AI active</option><option value="human_active">Human active</option><option value="closed">Closed</option>
                        </select>
                      </div>
                      <select aria-label="Assign conversation" value={conversation.assigned_to ?? ""} onChange={(event) => void assignTo(conversation.id, event.target.value || null)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                        <option value="">Unassigned</option>
                        {(profiles.data ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.phone || "Team member"}</option>)}
                      </select>
                    </div>
                  </article>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border p-3">
                <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-8 rounded-md border border-input px-3 text-xs disabled:opacity-50">Previous</button>
                <span className="text-xs text-muted-foreground">Page {Math.min(page, pageCount)} of {pageCount}</span>
                <button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="h-8 rounded-md border border-input px-3 text-xs disabled:opacity-50">Next</button>
              </div>
            </>
          )}
        </section>

        <section className="surface-panel flex min-w-0 flex-col overflow-hidden">
          {!selected ? (
            <div className="p-10 text-center"><MessageSquare className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">Choose a conversation</h2><p className="mt-1 text-sm text-muted-foreground">Select a customer chat to review messages.</p></div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                <div><h2 className="font-semibold">{selected.customer_name || selected.customer_phone}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.customer_phone}</p></div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs">{selected.state.replace("_", " ")}</span>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.isLoading ? <p className="text-sm text-muted-foreground">Loading latest messages…</p> : messages.isError ? <p role="alert" className="text-sm text-destructive">Could not load messages.</p> : (messages.data ?? []).length === 0 ? (
                  <div className="py-10 text-center"><p className="text-sm font-medium">No message history</p><p className="mt-1 text-xs text-muted-foreground">Messages are stored after a verified webhook is processed.</p></div>
                ) : (
                  <>
                    <p className="text-center text-[11px] text-muted-foreground">Showing the latest {messages.data.length} messages</p>
                    {messages.data.map((message) => {
                      const internalNote = message.message_kind === "internal_note";
                      const incoming = message.sender === "customer";
                      return (
                        <div key={message.id} className={internalNote ? "mx-auto max-w-[95%] rounded-xl border border-dashed border-border bg-muted/60 p-3" : incoming ? "mr-8 max-w-[85%] rounded-xl rounded-bl-sm bg-muted p-3" : "ml-8 max-w-[85%] rounded-xl rounded-br-sm bg-primary/10 p-3"}>
                          <p className="whitespace-pre-wrap break-words text-sm">{message.body || (message.media_url ? "Media attachment" : "Message content unavailable")}</p>
                          <p className="mt-2 text-[10px] capitalize text-muted-foreground">
                            {internalNote ? "Internal note" : message.sender === "employee" ? "Human reply" : message.sender}
                            {message.provider_status && !internalNote ? " · " + message.provider_status : ""}
                            {" · "}{new Date(message.created_at).toLocaleString()}
                          </p>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              <div className="border-t border-border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Notes are private to your agency and never sent to the customer.</p>
                  <button type="button" onClick={() => setNoteMode((value) => !value)} className="inline-flex h-8 items-center gap-2 rounded-md border border-input px-3 text-xs font-medium"><StickyNote className="size-3.5" />{noteMode ? "Cancel note" : "Add internal note"}</button>
                </div>

                {noteMode ? (
                  <form onSubmit={submitNote} className="space-y-3">
                    <label htmlFor="internal-note" className="block text-xs font-medium text-muted-foreground">Internal note · up to 2,000 characters</label>
                    <textarea id="internal-note" required maxLength={2000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="w-full resize-y rounded-lg border border-input bg-background p-3 text-sm" placeholder="Add context for your team…" />
                    <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{note.length}/2000</span><button disabled={noteBusy || !note.trim()} className="h-9 rounded-lg border border-input px-4 text-sm font-semibold disabled:opacity-60">{noteBusy ? "Saving…" : "Save internal note"}</button></div>
                  </form>
                ) : null}

                {selected.state !== "human_active" ? (
                  <div className="mt-3 rounded-lg bg-muted/40 p-3"><p className="text-sm text-muted-foreground">{selected.state === "closed" ? "This conversation is closed. If the customer opted out, outbound messaging remains blocked." : "Take over this conversation by switching its state to Human active before replying."}</p></div>
                ) : (
                  <form onSubmit={submitReply} className="mt-3 space-y-3">
                    <label htmlFor="reply" className="block text-xs font-medium text-muted-foreground">Human reply · free-form text only within the 24-hour service window</label>
                    <textarea id="reply" required maxLength={4096} rows={3} value={reply} onChange={(event) => setReply(event.target.value)} className="w-full resize-y rounded-lg border border-input bg-background p-3 text-sm" placeholder="Write a reply…" />
                    <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{reply.length}/4096 characters</p><button disabled={sending || !reply.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"><Send className="size-4" />{sending ? "Sending…" : "Send reply"}</button></div>
                  </form>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
