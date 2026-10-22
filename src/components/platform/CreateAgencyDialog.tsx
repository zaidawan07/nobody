"use client";

import { useState } from "react";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { CopyLinkButton } from "@/components/shared/CopyLinkButton";
import { provisionAgency } from "@/lib/provisioning.functions";

// No password: the first admin sets their own on /accept-invitation, from a
// link issued here exactly the way the team screen issues one.
const schema = z.object({
  agencyName: z.string().min(2, "Enter an agency name"),
  city: z.string().optional(),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  adminName: z.string().min(2, "Enter the admin's name"),
  adminEmail: z.string().min(1, "Enter the admin's email").email("Enter a valid email"),
});

type FormValues = z.infer<typeof schema>;

type ProvisionResult = {
  agencyId: string;
  actionLink: string;
  emailSent: boolean;
  emailError: string | null;
};

export function CreateAgencyDialog({ onCreated }: { onCreated: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      agencyName: "",
      city: "",
      phone: "",
      whatsappNumber: "",
      adminName: "",
      adminEmail: "",
    },
  });

  const handleSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      const out = (await provisionAgency({ data: values })) as ProvisionResult;
      setResult(out);
      toast.success("Agency provisioned");
      form.reset();
      onCreated();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't provision the agency.");
    }
  };

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{result ? "Agency created" : "Add agency"}</DialogTitle>
        <DialogDescription>
          {result
            ? "This link is the only copy — give it to the admin now."
            : "Provision a new agency and invite its first admin."}
        </DialogDescription>
      </DialogHeader>
      {formError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      {result ? (
        <div className="space-y-4">
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertDescription>
              Agency created.{" "}
              {result.emailSent
                ? "An invitation email was also sent."
                : "No email was sent — copy the link below and pass it to the admin yourself."}
            </AlertDescription>
          </Alert>

          {result.emailError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>
                The email could not be sent ({result.emailError}), but the link below works.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              First admin's invitation link
            </p>
            <div className="flex gap-2">
              <Input readOnly value={result.actionLink} className="font-mono text-xs" />
              <CopyLinkButton value={result.actionLink} />
            </div>
            {/* Known gap, not glossed over: this link has no agency_invitations
                row behind it, so unlike a team invite it cannot be listed,
                resent or revoked from the team screen. The panel therefore says
                "copy it now" rather than implying it can be retrieved. Logged in
                docs/PRELAUNCH.md. */}
            <p className="text-xs text-muted-foreground">
              The admin chooses their own password when they open it — you never see it. This dialog
              does not keep a copy, so send it to them now.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResult(null)}>
              Create another agency
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="agencyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agency name</FormLabel>
                  <FormControl>
                    <Input placeholder="Skyline Realtors" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="Karachi" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+92 300 0000000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="whatsappNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp number</FormLabel>
                  <FormControl>
                    <Input placeholder="+92 300 0000000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="adminName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Admin name</FormLabel>
                  <FormControl>
                    <Input placeholder="Ayesha Khan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="adminEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Admin email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="admin@agency.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="flex gap-2 pt-3">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Create agency"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      )}
    </DialogContent>
  );
}
