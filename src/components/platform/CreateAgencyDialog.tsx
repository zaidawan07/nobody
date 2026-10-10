"use client";

import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
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
import { provisionAgency } from "@/lib/provisioning.functions";

const schema = z.object({
  agencyName: z.string().min(2, "Enter an agency name"),
  city: z.string().optional(),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  adminName: z.string().min(2, "Enter the admin's name"),
  adminEmail: z.string().min(1, "Enter the admin's email").email("Enter a valid email"),
  adminPassword: z.string().min(8, "At least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export function CreateAgencyDialog({ onCreated }: { onCreated: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      agencyName: "",
      city: "",
      phone: "",
      whatsappNumber: "",
      adminName: "",
      adminEmail: "",
      adminPassword: "",
    },
  });

  const handleSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      await provisionAgency({ data: values });
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
        <DialogTitle>Add agency</DialogTitle>
        <DialogDescription>Provision a new agency and its first admin account.</DialogDescription>
      </DialogHeader>
      {formError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
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
          <FormField
            control={form.control}
            name="adminPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Admin password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="At least 8 characters" {...field} />
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
    </DialogContent>
  );
}
