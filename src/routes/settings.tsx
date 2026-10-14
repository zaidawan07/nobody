import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Save, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { updateAgencySettings } from "@/lib/provisioning.functions";

export const Route = createFileRoute("/settings")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Settings — EstateOS" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const access = useAccess();
  const client = useQueryClient();
  const updateAgency = useServerFn(updateAgencySettings);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [agencyPhone, setAgencyPhone] = useState("");
  const [agencyEmail, setAgencyEmail] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [citiesServed, setCitiesServed] = useState("");
  const [description, setDescription] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [agencyBusy, setAgencyBusy] = useState(false);
  const [agencyError, setAgencyError] = useState("");
  const [agencyNotice, setAgencyNotice] = useState("");

  const profile = useQuery({
    queryKey: ["my-profile", access.data?.userId],
    enabled: !!access.data?.userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("id,full_name,phone,job_title,email,status")
        .eq("id", access.data!.userId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const agency = useQuery({
    queryKey: ["agency-settings", access.data?.agencyId],
    enabled: access.data?.role === "agency_admin" && !!access.data?.agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("agencies")
        .select("id,name,phone,email,office_address,cities_served,description,working_hours")
        .eq("id", access.data!.agencyId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!profile.data) return;
    setFullName(profile.data.full_name ?? "");
    setPhone(profile.data.phone ?? "");
    setJobTitle(profile.data.job_title ?? "");
  }, [profile.data]);

  useEffect(() => {
    if (!agency.data) return;
    setAgencyName(agency.data.name ?? "");
    setAgencyPhone(agency.data.phone ?? "");
    setAgencyEmail(agency.data.email ?? "");
    setOfficeAddress(agency.data.office_address ?? "");
    setCitiesServed((agency.data.cities_served ?? []).join(", "));
    setDescription(agency.data.description ?? "");
    setWorkingHours(agency.data.working_hours ?? "");
  }, [agency.data]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!access.data?.userId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error } = await supabase.from("profiles").update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        job_title: jobTitle.trim() || null,
      }).eq("id", access.data.userId);
      if (error) throw error;
      await Promise.all([
        client.invalidateQueries({ queryKey: ["my-profile", access.data.userId] }),
        client.invalidateQueries({ queryKey: ["my-access"] }),
      ]);
      setNotice("Your profile has been saved.");
    } catch {
      setError("We couldn't save your profile. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAgency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAgencyBusy(true);
    setAgencyError("");
    setAgencyNotice("");
    try {
      await updateAgency({
        data: {
          name: agencyName,
          phone: agencyPhone,
          email: agencyEmail,
          officeAddress,
          citiesServed: citiesServed.split(",").map((city) => city.trim()).filter(Boolean),
          description,
          workingHours,
        },
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["agency-settings", access.data?.agencyId] }),
        client.invalidateQueries({ queryKey: ["my-access"] }),
      ]);
      setAgencyNotice("Agency profile has been saved.");
    } catch (error) {
      setAgencyError(error instanceof Error ? error.message : "We couldn't save the agency profile.");
    } finally {
      setAgencyBusy(false);
    }
  }

  return (
    <AppShell title="Settings" description="Manage your personal details and, if you are an agency administrator, your public agency profile.">
      <div className="space-y-6">
        <section className="surface-panel max-w-2xl p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></span>
            <div><h2 className="font-semibold">Personal details</h2><p className="mt-1 text-sm text-muted-foreground">Update the information your teammates use to contact you.</p></div>
          </div>
          {profile.isLoading ? <p className="mt-6 text-sm text-muted-foreground">Loading your profile…</p> : null}
          {profile.isError ? <p role="alert" className="mt-6 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">Your profile couldn't be loaded. Refresh the page and try again.</p> : null}
          {profile.data ? (
            <form onSubmit={saveProfile} className="mt-6 space-y-5">
              <label className="block space-y-1.5 text-sm font-medium">Full name
                <input required maxLength={120} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">Email
                <input disabled value={profile.data.email ?? access.data?.email ?? ""} className="h-11 w-full rounded-lg border border-input bg-muted px-3 font-normal text-muted-foreground" />
                <span className="block text-xs font-normal text-muted-foreground">Email changes are handled by the authentication provider.</span>
              </label>
              <label className="block space-y-1.5 text-sm font-medium">Phone
                <input maxLength={30} type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+92 300 1234567" className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">Job title
                <input maxLength={100} autoComplete="organization-title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Property consultant" className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
              </label>
              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
                <button type="submit" disabled={busy || !fullName.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"><Save className="size-4" />{busy ? "Saving…" : "Save profile"}</button>
                {profile.data.status !== "active" ? <span className="text-xs text-destructive">Account status: {profile.data.status}</span> : null}
              </div>
              {error ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
              {notice ? <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm">{notice}</p> : null}
            </form>
          ) : null}
        </section>

        {access.data?.role === "agency_admin" ? (
          <section className="surface-panel max-w-2xl p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></span>
              <div><h2 className="font-semibold">Agency profile</h2><p className="mt-1 text-sm text-muted-foreground">Keep your office details and service areas current for the team.</p></div>
            </div>
            {agency.isLoading ? <p className="mt-6 text-sm text-muted-foreground">Loading agency settings…</p> : null}
            {agency.isError ? <p role="alert" className="mt-6 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">Agency settings couldn't be loaded. Refresh and try again.</p> : null}
            {agency.data ? (
              <form onSubmit={saveAgency} className="mt-6 space-y-5">
                <label className="block space-y-1.5 text-sm font-medium">Agency name
                  <input required minLength={2} maxLength={150} value={agencyName} onChange={(event) => setAgencyName(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm font-medium">Office phone
                    <input maxLength={40} type="tel" value={agencyPhone} onChange={(event) => setAgencyPhone(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">Contact email
                    <input maxLength={254} type="email" value={agencyEmail} onChange={(event) => setAgencyEmail(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
                  </label>
                </div>
                <label className="block space-y-1.5 text-sm font-medium">Office address
                  <input maxLength={300} value={officeAddress} onChange={(event) => setOfficeAddress(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
                </label>
                <label className="block space-y-1.5 text-sm font-medium">Cities served
                  <input maxLength={2000} value={citiesServed} onChange={(event) => setCitiesServed(event.target.value)} placeholder="Lahore, Islamabad, Rawalpindi" className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
                  <span className="block text-xs font-normal text-muted-foreground">Separate cities with commas (up to 20).</span>
                </label>
                <label className="block space-y-1.5 text-sm font-medium">About the agency
                  <textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 font-normal" />
                </label>
                <label className="block space-y-1.5 text-sm font-medium">Working hours
                  <input maxLength={500} value={workingHours} onChange={(event) => setWorkingHours(event.target.value)} placeholder="Mon–Sat, 9:00 AM–6:00 PM" className="h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
                </label>
                <div className="border-t border-border pt-5">
                  <button type="submit" disabled={agencyBusy || !agencyName.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"><Save className="size-4" />{agencyBusy ? "Saving…" : "Save agency profile"}</button>
                </div>
                {agencyError ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{agencyError}</p> : null}
                {agencyNotice ? <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm">{agencyNotice}</p> : null}
              </form>
            ) : null}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
