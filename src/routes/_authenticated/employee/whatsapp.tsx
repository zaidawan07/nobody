import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  listWhatsappInbox,
  listWhatsappMessages,
  markWhatsappConversationRead,
  sendWhatsappReply,
} from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/employee/whatsapp")({
  head: () => ({ meta: [{ title: "My WhatsApp conversations — EstateOS" }] }),
  component: EmployeeWhatsappPage,
});

type Conversation = {
  id: string;
  last_message_at: string | null;
  unread_count: number;
  ai_paused_at: string | null;
  handoff_reason: string | null;
  whatsapp_contacts: { name: string | null; phone: string | null } | null;
};
type Message = {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  body: string | null;
  created_at: string;
};

function EmployeeWhatsappPage() {
  const { access } = Route.useRouteContext();
  const agencyId = access.agencyId!;
  const queryClient = useQueryClient();
  const loadInbox = useServerFn(listWhatsappInbox);
  const loadMessages = useServerFn(listWhatsappMessages);
  const sendReply = useServerFn(sendWhatsappReply);
  const markRead = useServerFn(markWhatsappConversationRead);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const { data: inbox, isLoading } = useQuery({
    queryKey: ["whatsapp-inbox", agencyId],
    queryFn: () => loadInbox(),
    refetchInterval: 30_000,
  });
  const { data: messageResult, isLoading: messagesLoading } = useQuery({
    queryKey: ["whatsapp-messages", selectedId],
    queryFn: () => loadMessages({ data: { conversationId: selectedId! } }),
    enabled: Boolean(selectedId),
    refetchInterval: 10_000,
  });
  const conversations = (inbox?.conversations ?? []) as Conversation[];
  const messages = (messageResult?.messages ?? []) as Message[];
  const selected = conversations.find((conversation) => conversation.id === selectedId);

  useEffect(() => {
    if (!selectedId) return;
    void markRead({ data: { conversationId: selectedId } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox", agencyId] }))
      .catch(() => undefined);
  }, [selectedId, markRead, queryClient, agencyId]);

  async function submitReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !body.trim()) return;
    setSending(true);
    try {
      await sendReply({
        data: { conversationId: selectedId, body: body.trim(), requestId },
      });
      setBody("");
      setRequestId(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", selectedId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reply could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell title="My WhatsApp conversations" description="Conversations assigned to you.">
      <div className="surface-panel grid min-h-[520px] overflow-hidden lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)]">
        <section className="border-b lg:border-b-0 lg:border-r">
          <div className="border-b p-4">
            <h2 className="font-semibold">Assigned conversations</h2>
          </div>
          {isLoading ? <Skeleton className="m-4 h-20" /> : null}
          {!isLoading && conversations.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No WhatsApp conversations are assigned to you.
            </p>
          ) : null}
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => setSelectedId(conversation.id)}
              className={`w-full border-b px-4 py-3 text-left hover:bg-muted/50 ${selectedId === conversation.id ? "bg-muted" : ""}`}
            >
              <span className="block truncate text-sm font-medium">
                {conversation.whatsapp_contacts?.name ||
                  conversation.whatsapp_contacts?.phone ||
                  "WhatsApp contact"}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {conversation.unread_count} unread
              </span>
              {conversation.ai_paused_at ? (
                <span className="mt-1 block text-xs font-medium text-amber-700">
                  Needs attention · {conversation.handoff_reason || "AI paused"}
                </span>
              ) : null}
            </button>
          ))}
        </section>
        <section className="flex min-h-[520px] flex-col">
          {selected ? (
            <>
              <div className="border-b p-4 font-medium">
                {selected.whatsapp_contacts?.name ||
                  selected.whatsapp_contacts?.phone ||
                  "Customer"}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messagesLoading ? <Skeleton className="h-16" /> : null}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${message.direction === "outbound" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    <p className="mt-1 text-[10px] opacity-70">
                      {new Date(message.created_at).toLocaleTimeString()} · {message.status}
                    </p>
                  </div>
                ))}
              </div>
              <form onSubmit={submitReply} className="flex items-end gap-2 border-t p-3">
                <Textarea
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                  rows={2}
                  maxLength={4000}
                  aria-label="WhatsApp reply"
                  placeholder="Write a reply…"
                />
                <Button
                  type="submit"
                  disabled={sending || !body.trim()}
                  aria-label="Send WhatsApp reply"
                >
                  <Send className="size-4" />
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <MessageCircle className="size-8" />
              Select an assigned conversation.
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
