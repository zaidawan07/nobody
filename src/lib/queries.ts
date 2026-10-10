import { supabase } from "@/integrations/supabase/client";
import type { Tables, Database } from "@/integrations/supabase/types";

// Every function here runs as the signed-in user via the browser client, so
// Postgres RLS (migrations 0000 + 0001) is what actually scopes the results
// -- an employee calling fetchProperties() simply gets fewer rows back than
// an agency admin calling the same function. Nothing here re-implements
// access control; it only shapes what RLS already returned for display.

async function idsToMap(
  table: "properties" | "leads" | "profiles",
  labelColumn: string,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => !!id)));
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from(table)
    .select(`id, ${labelColumn}` as "id")
    .in("id", unique);
  if (error) throw error;
  const out = new Map<string, string>();
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    out.set(row["id"] as string, (row[labelColumn] as string | null) ?? "Untitled");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Platform (super admin)
// ---------------------------------------------------------------------------

export interface PlatformStats {
  total: number;
  active: number;
  suspended: number;
  pending: number;
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const { data, error } = await supabase.from("agencies").select("status");
  if (error) throw error;
  const rows = data ?? [];
  return {
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    suspended: rows.filter((r) => r.status === "suspended").length,
    pending: rows.filter((r) => r.status === "pending").length,
  };
}

export interface AgencyListRow extends Tables<"agencies"> {
  member_count: number;
  property_count: number;
}

export async function fetchAgencies(): Promise<AgencyListRow[]> {
  const { data: agencies, error } = await supabase
    .from("agencies")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!agencies?.length) return [];

  const [{ data: profiles, error: profilesError }, { data: properties, error: propertiesError }] =
    await Promise.all([
      supabase.from("profiles").select("agency_id"),
      supabase.from("properties").select("agency_id"),
    ]);
  if (profilesError) throw profilesError;
  if (propertiesError) throw propertiesError;

  const memberCounts = countBy(profiles ?? []);
  const propertyCounts = countBy(properties ?? []);

  return agencies.map((a) => ({
    ...a,
    member_count: memberCounts[a.id] ?? 0,
    property_count: propertyCounts[a.id] ?? 0,
  }));
}

function countBy(rows: { agency_id: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (!row.agency_id) continue;
    out[row.agency_id] = (out[row.agency_id] ?? 0) + 1;
  }
  return out;
}

export interface AgencyDetail extends Tables<"agencies"> {
  members: Pick<Tables<"profiles">, "id" | "full_name" | "email" | "status">[];
  propertyCount: number;
  leadCount: number;
}

export async function fetchAgencyDetail(agencyId: string): Promise<AgencyDetail | null> {
  const [
    { data: agency, error },
    { data: members, error: membersError },
    { data: properties, error: propertiesError },
    { data: leads, error: leadsError },
  ] = await Promise.all([
    supabase.from("agencies").select("*").eq("id", agencyId).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, email, status")
      .eq("agency_id", agencyId)
      .order("full_name"),
    supabase.from("properties").select("id").eq("agency_id", agencyId),
    supabase.from("leads").select("id").eq("agency_id", agencyId),
  ]);
  if (error) throw error;
  if (membersError) throw membersError;
  if (propertiesError) throw propertiesError;
  if (leadsError) throw leadsError;
  if (!agency) return null;

  return {
    ...agency,
    members: members ?? [],
    propertyCount: properties?.length ?? 0,
    leadCount: leads?.length ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Agency (agency admin)
// ---------------------------------------------------------------------------

export interface AgencyStats {
  totalProperties: number;
  availableProperties: number;
  leads: number;
  upcomingVisits: number;
  employees: number;
}

export async function fetchAgencyStats(agencyId: string): Promise<AgencyStats> {
  const [
    { data: properties, error: pErr },
    { data: leads, error: lErr },
    { data: visits, error: vErr },
    { data: roles, error: rErr },
  ] = await Promise.all([
    supabase.from("properties").select("status").eq("agency_id", agencyId),
    supabase.from("leads").select("id").eq("agency_id", agencyId),
    supabase
      .from("site_visits")
      .select("id")
      .eq("agency_id", agencyId)
      .in("status", ["requested", "confirmed"]),
    supabase.from("user_roles").select("role").eq("agency_id", agencyId),
  ]);
  if (pErr) throw pErr;
  if (lErr) throw lErr;
  if (vErr) throw vErr;
  if (rErr) throw rErr;

  return {
    totalProperties: properties?.length ?? 0,
    availableProperties: properties?.filter((p) => p.status === "available").length ?? 0,
    leads: leads?.length ?? 0,
    upcomingVisits: visits?.length ?? 0,
    employees: roles?.filter((r) => r.role === "employee").length ?? 0,
  };
}

export interface AgencySubscriptionFeature {
  feature_key: string;
  feature_value: string | null;
  included: boolean;
  limit_value: number | null;
}

export interface AgencySubscription {
  status: Tables<"subscriptions">["status"];
  trial_ends_at: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  plan: {
    id: string;
    name: string;
    price_pkr: number;
    interval: Tables<"plans">["interval"];
    trial_days: number;
    features: AgencySubscriptionFeature[];
  } | null;
}

/**
 * Super-admin view of one agency's subscription row plus the plan it points
 * at. Returns null when the agency has no row in `subscriptions` -- the app
 * never writes that table, so an empty result is the normal state today.
 */
export async function fetchAgencySubscription(
  agencyId: string,
): Promise<AgencySubscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "status, trial_ends_at, current_period_end, canceled_at, plans(id, name, price_pkr, interval, trial_days, plan_features(feature_key, feature_value, included, limit_value))",
    )
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const plan = data.plans;
  return {
    status: data.status,
    trial_ends_at: data.trial_ends_at,
    current_period_end: data.current_period_end,
    canceled_at: data.canceled_at,
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          price_pkr: plan.price_pkr,
          interval: plan.interval,
          trial_days: plan.trial_days,
          features: plan.plan_features ?? [],
        }
      : null,
  };
}

export interface TeamMember {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  status: Tables<"profiles">["status"];
  role: Tables<"user_roles">["role"] | null;
}

export async function fetchTeamMembers(agencyId: string): Promise<TeamMember[]> {
  const [{ data: profiles, error }, { data: roles, error: rolesError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, job_title, status")
      .eq("agency_id", agencyId)
      .order("full_name"),
    supabase.from("user_roles").select("user_id, role").eq("agency_id", agencyId),
  ]);
  if (error) throw error;
  if (rolesError) throw rolesError;
  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
  return (profiles ?? []).map((p) => ({ ...p, role: roleByUser.get(p.id) ?? null }));
}

export async function fetchAssignableMembers(
  agencyId: string,
): Promise<{ id: string; full_name: string | null }[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("agency_id", agencyId)
    .eq("status", "active")
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Employee
// ---------------------------------------------------------------------------

export interface EmployeeStats {
  assignedProperties: number;
  assignedLeads: number;
  upcomingVisits: number;
}

export async function fetchEmployeeStats(userId: string): Promise<EmployeeStats> {
  const [
    { data: properties, error: pErr },
    { data: leads, error: lErr },
    { data: visits, error: vErr },
  ] = await Promise.all([
    supabase.from("properties").select("id").eq("assigned_to", userId),
    supabase.from("leads").select("id").eq("assigned_to", userId),
    supabase
      .from("site_visits")
      .select("id")
      .eq("assigned_to", userId)
      .in("status", ["requested", "confirmed"]),
  ]);
  if (pErr) throw pErr;
  if (lErr) throw lErr;
  if (vErr) throw vErr;
  return {
    assignedProperties: properties?.length ?? 0,
    assignedLeads: leads?.length ?? 0,
    upcomingVisits: visits?.length ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Properties / leads / visits (shared by the agency and employee route trees;
// RLS alone decides how many rows come back for a given signed-in user)
// ---------------------------------------------------------------------------

export type PropertyRow = Tables<"properties"> & {
  assignee_name: string | null;
  creator_name: string | null;
};

export async function fetchProperties(agencyId: string): Promise<PropertyRow[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const names = await idsToMap("profiles", "full_name", [
    ...rows.map((r) => r.assigned_to),
    ...rows.map((r) => r.created_by),
  ]);
  return rows.map((r) => ({
    ...r,
    assignee_name: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
    creator_name: r.created_by ? (names.get(r.created_by) ?? null) : null,
  }));
}

export async function fetchProperty(id: string): Promise<PropertyRow | null> {
  const { data, error } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const names = await idsToMap("profiles", "full_name", [data.assigned_to, data.created_by]);
  return {
    ...data,
    assignee_name: data.assigned_to ? (names.get(data.assigned_to) ?? null) : null,
    creator_name: data.created_by ? (names.get(data.created_by) ?? null) : null,
  };
}

export interface NewPropertyInput {
  agencyId: string;
  createdBy: string;
  assignedTo?: string | undefined;
  title: string;
  propertyType: Tables<"properties">["property_type"];
  purpose: Tables<"properties">["purpose"];
  status: Tables<"properties">["status"];
  pricePkr?: number | undefined;
  rentPeriod?: Tables<"properties">["rent_period"] | undefined;
  referenceCode?: string | undefined;
  city?: string | undefined;
  province?: string | undefined;
  division?: string | undefined;
  district?: string | undefined;
  tehsil?: string | undefined;
  locality?: string | undefined;
  block?: string | undefined;
  society?: string | undefined;
  phaseBlock?: string | undefined;
  areaValue?: number | undefined;
  areaUnit?: Tables<"properties">["area_unit"] | undefined;
  bedrooms?: number | undefined;
  bathrooms?: number | undefined;
  description?: string | undefined;
  furnished?: boolean | undefined;
  features?: string[] | undefined;
  ownerName?: string | undefined;
  ownerPhone?: string | undefined;
  tenantName?: string | undefined;
  tenantPhone?: string | undefined;
  realtorName?: string | undefined;
  realtorPhone?: string | undefined;
}

export async function createProperty(input: NewPropertyInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("properties")
    .insert({
      agency_id: input.agencyId,
      created_by: input.createdBy,
      assigned_to: input.assignedTo ?? input.createdBy,
      title: input.title,
      property_type: input.propertyType,
      purpose: input.purpose,
      status: input.status,
      price_pkr: input.pricePkr ?? null,
      rent_period: input.rentPeriod ?? null,
      reference_code: input.referenceCode ?? null,
      city: input.city ?? null,
      province: input.province ?? null,
      division: input.division ?? null,
      district: input.district ?? null,
      tehsil: input.tehsil ?? null,
      locality: input.locality ?? null,
      block: input.block ?? null,
      society: input.society ?? null,
      phase_block: input.phaseBlock ?? null,
      area_value: input.areaValue ?? null,
      area_unit: input.areaUnit ?? null,
      bedrooms: input.bedrooms ?? null,
      bathrooms: input.bathrooms ?? null,
      description: input.description ?? null,
      furnished: input.furnished ?? false,
      features: input.features ?? [],
      owner_name: input.ownerName ?? null,
      owner_phone: input.ownerPhone ?? null,
      tenant_name: input.tenantName ?? null,
      tenant_phone: input.tenantPhone ?? null,
      realtor_name: input.realtorName ?? null,
      realtor_phone: input.realtorPhone ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export type LeadRow = Tables<"leads"> & { assignee_name: string | null };

export async function fetchLeads(agencyId: string): Promise<LeadRow[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const names = await idsToMap(
    "profiles",
    "full_name",
    rows.map((r) => r.assigned_to),
  );
  return rows.map((r) => ({
    ...r,
    assignee_name: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
  }));
}

export async function createLead(input: {
  agency_id: string;
  name?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  requirement_text?: string | null;
  budget_min_pkr?: number | null;
  budget_max_pkr?: number | null;
  preferred_city?: string | null;
  preferred_locality?: string | null;
  property_type?: Database["public"]["Enums"]["property_type"] | null;
  purpose?: Database["public"]["Enums"]["property_purpose"] | null;
  status?: Database["public"]["Enums"]["lead_status"];
  assigned_to?: string | null;
  notes?: string | null;
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("leads")
    .insert(input as Database["public"]["Tables"]["leads"]["Insert"])
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateLead(id: string, patch: Partial<Tables<"leads">>): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update(patch as Database["public"]["Tables"]["leads"]["Update"])
    .eq("id", id);
  if (error) throw error;
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw error;
}

export async function createVisit(input: {
  agency_id: string;
  lead_id?: string | null;
  property_id?: string | null;
  requested_at?: string | null;
  scheduled_at?: string | null;
  assigned_to?: string | null;
  status?: Database["public"]["Enums"]["visit_status"];
  notes?: string | null;
  confirmed?: boolean;
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("site_visits")
    .insert(input as Database["public"]["Tables"]["site_visits"]["Insert"])
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateVisit(
  id: string,
  patch: Partial<Tables<"site_visits">>,
): Promise<void> {
  const { error } = await supabase
    .from("site_visits")
    .update(patch as Database["public"]["Tables"]["site_visits"]["Update"])
    .eq("id", id);
  if (error) throw error;
}

export async function deleteVisit(id: string): Promise<void> {
  const { error } = await supabase.from("site_visits").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Property check-in funnel (owner/tenant/realtor follow-ups) + media
// ---------------------------------------------------------------------------

export type CheckinRow = Tables<"property_checkins">;

export async function fetchCheckins(propertyId: string): Promise<CheckinRow[]> {
  const { data, error } = await supabase
    .from("property_checkins")
    .select("*")
    .eq("property_id", propertyId)
    .order("scheduled_for", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface NewCheckinInput {
  agencyId: string;
  assignedTo: string | null;
  propertyId: string;
  contactType: Tables<"property_checkins">["contact_type"];
  contactName?: string | undefined;
  contactPhone: string;
  channel: Tables<"property_checkins">["channel"];
  scheduledFor: string; // ISO timestamp
  createdBy: string;
}

export async function scheduleCheckin(input: NewCheckinInput): Promise<void> {
  const { error } = await supabase.from("property_checkins").insert({
    agency_id: input.agencyId,
    assigned_to: input.assignedTo,
    property_id: input.propertyId,
    contact_type: input.contactType,
    contact_name: input.contactName ?? null,
    contact_phone: input.contactPhone,
    channel: input.channel,
    scheduled_for: input.scheduledFor,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

export async function recordCheckinResponse(
  checkinId: string,
  fields: {
    responseText?: string | undefined;
    propertyCondition?: string | undefined;
    isVacant?: boolean | undefined;
  },
): Promise<void> {
  const { error } = await supabase
    .from("property_checkins")
    .update({
      status: "responded",
      response_text: fields.responseText ?? null,
      property_condition: fields.propertyCondition ?? null,
      is_vacant: fields.isVacant ?? null,
    })
    .eq("id", checkinId);
  if (error) throw error;
}

export async function markCheckinSkipped(checkinId: string): Promise<void> {
  const { error } = await supabase
    .from("property_checkins")
    .update({ status: "skipped" })
    .eq("id", checkinId);
  if (error) throw error;
}

export type MediaRow = Tables<"property_media">;

export async function fetchPropertyMedia(propertyId: string): Promise<MediaRow[]> {
  const { data, error } = await supabase
    .from("property_media")
    .select("*")
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Uploads to the private `property-media` bucket under agency_id/property_id/filename, then records the row. */
export interface UploadPropertyMediaParams {
  agencyId: string;
  propertyId: string;
  file: Blob;
  fileName: string;
  kind: Tables<"property_media">["kind"];
  mimeType?: string;
  sizeBytes?: number;
  thumbnailBlob?: Blob | undefined;
  posterBlob?: Blob | undefined;
  caption?: string;
  isCover?: boolean;
}

export async function uploadPropertyMedia(
  params: UploadPropertyMediaParams,
): Promise<{ id: string }> {
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const base = `${params.agencyId}/${params.propertyId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("property-media")
    .upload(base, params.file);
  if (uploadError) throw uploadError;

  let thumbnailPath: string | undefined;
  if (params.thumbnailBlob && params.kind === "photo") {
    try {
      const t = `${base}.thumb.jpg`;
      const { error } = await supabase.storage
        .from("property-media")
        .upload(t, params.thumbnailBlob);
      if (!error) thumbnailPath = t;
    } catch {
      // A missing thumbnail is not fatal; the full image is the fallback.
    }
  }

  let posterPath: string | undefined;
  if (params.posterBlob && params.kind === "video") {
    try {
      const p = `${base}.poster.jpg`;
      const { error } = await supabase.storage.from("property-media").upload(p, params.posterBlob);
      if (!error) posterPath = p;
    } catch {
      // Same for the poster.
    }
  }

  const { data, error } = await supabase
    .from("property_media")
    .insert({
      agency_id: params.agencyId,
      property_id: params.propertyId,
      kind: params.kind,
      storage_path: base,
      caption: params.caption ?? null,
      thumbnail_path: thumbnailPath ?? null,
      poster_path: posterPath ?? null,
      mime_type: params.mimeType ?? null,
      size_bytes: params.sizeBytes ?? params.file.size,
      is_cover: params.isCover ?? false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchMediaUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("property-media")
    .createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deletePropertyMedia(media: MediaRow): Promise<void> {
  const paths = [media.storage_path];
  if (media.thumbnail_path) paths.push(media.thumbnail_path);
  if (media.poster_path) paths.push(media.poster_path);
  const { error: storageError } = await supabase.storage.from("property-media").remove(paths);
  if (storageError) throw storageError;
  const { error } = await supabase.from("property_media").delete().eq("id", media.id);
  if (error) throw error;
}

export async function setCoverMedia(propertyId: string, mediaId: string | null): Promise<void> {
  await supabase
    .from("property_media")
    .update({ is_cover: false })
    .eq("property_id", propertyId)
    .eq("kind", "photo");
  if (mediaId) {
    await supabase.from("property_media").update({ is_cover: true }).eq("id", mediaId);
  }
}

export async function updateMediaCaption(id: string, caption: string | null): Promise<void> {
  const { error } = await supabase.from("property_media").update({ caption }).eq("id", id);
  if (error) throw error;
}

/** Persist a new left-to-right photo order (array of row ids in order). */
export async function reorderMedia(orderedIds: string[]): Promise<void> {
  // row-level update is small; data volumes are per-property media lists.
  for (const [i, id] of orderedIds.entries()) {
    const { error } = await supabase.from("property_media").update({ sort_order: i }).eq("id", id);
    if (error) throw error;
  }
}

/** Cover thumbnails for the list view, avoiding a full gallery fetch. */
export async function fetchCoverMedia(propertyIds: string[]): Promise<Map<string, MediaRow>> {
  if (propertyIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("property_media")
    .select("*")
    .in("property_id", propertyIds)
    .eq("is_cover", true)
    .eq("kind", "photo");
  if (error) throw error;
  const out = new Map<string, MediaRow>();
  for (const row of data ?? []) out.set(row.property_id, row);
  return out;
}

// ---------------------------------------------------------------------------
// Locations (normalized Pakistan hierarchy, read-only reference data)
// ---------------------------------------------------------------------------

export type LocationKind =
  | "country"
  | "province"
  | "division"
  | "district"
  | "city"
  | "tehsil"
  | "locality"
  | "society"
  | "phase"
  | "block";

export interface LocationOption {
  id: string;
  name: string;
  kind: LocationKind;
  parent_id: string | null;
  sort_order: number;
}

export async function fetchLocationsByKind(
  kind: LocationKind,
  parentIds: string[] | null,
): Promise<LocationOption[]> {
  let q = supabase
    .from("locations")
    .select("id, name, kind, parent_id, sort_order")
    .eq("kind", kind)
    .order("name");
  if (parentIds && parentIds.length > 0) q = q.in("parent_id", parentIds);
  if (parentIds === null) q = q.is("parent_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LocationOption[];
}

export async function fetchLocationChildren(
  kind: LocationKind,
  parentId: string,
): Promise<LocationOption[]> {
  return fetchLocationsByKind(kind, [parentId]);
}

// ---------------------------------------------------------------------------
// Server-side property search + pagination (never loads the whole table)
// ---------------------------------------------------------------------------

export interface PropertyPageParams {
  agencyId: string;
  q?: string | undefined; // title / reference_code ilike
  status?: string[] | undefined;
  propertyType?: string[] | undefined;
  purpose?: string[] | undefined;
  province?: string | undefined;
  district?: string | undefined;
  city?: string | undefined;
  locality?: string | undefined;
  society?: string | undefined;
  assignedTo?: string | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  areaMin?: number | undefined;
  areaMax?: number | undefined;
  bedroomsMin?: number | undefined;
  bathroomsMin?: number | undefined;
  page: number;
  pageSize: number;
  orderBy?: "created_at" | "price_pkr" | "area_value" | "title" | undefined;
  ascending?: boolean | undefined;
}

export interface PropertyPage {
  rows: PropertyRow[];
  total: number;
}

export async function fetchPropertiesPaged(params: PropertyPageParams): Promise<PropertyPage> {
  let q = supabase
    .from("properties")
    .select("*", { count: "exact" })
    .eq("agency_id", params.agencyId);

  if (params.q && params.q.trim()) {
    const needle = `%${params.q.trim().replaceAll("%", "\\%")}%`;
    q = q.or(
      `title.ilike.${needle},reference_code.ilike.${needle},city.ilike.${needle},society.ilike.${needle},district.ilike.${needle}` as string,
    );
  }
  if (params.status?.length) q = q.in("status", params.status as never);
  if (params.propertyType?.length) q = q.in("property_type", params.propertyType as never);
  if (params.purpose?.length) q = q.in("purpose", params.purpose as never);
  if (params.province) q = q.eq("province", params.province);
  if (params.district) q = q.eq("district", params.district);
  if (params.city) q = q.eq("city", params.city);
  if (params.locality) q = q.ilike("locality", `%${params.locality}%`);
  if (params.society) q = q.ilike("society", `%${params.society}%`);
  if (params.assignedTo) q = q.eq("assigned_to", params.assignedTo);
  if (params.priceMin !== undefined) q = q.gte("price_pkr", params.priceMin);
  if (params.priceMax !== undefined) q = q.lte("price_pkr", params.priceMax);
  if (params.areaMin !== undefined) q = q.gte("area_value", params.areaMin);
  if (params.areaMax !== undefined) q = q.lte("area_value", params.areaMax);
  if (params.bedroomsMin !== undefined) q = q.gte("bedrooms", params.bedroomsMin);
  if (params.bathroomsMin !== undefined) q = q.gte("bathrooms", params.bathroomsMin);

  const orderBy = params.orderBy ?? "created_at";
  q = q.order(orderBy, { ascending: params.ascending ?? false, nullsFirst: false });

  const from = (params.page - 1) * params.pageSize;
  q = q.range(from, from + params.pageSize - 1);

  const { data, count, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as PropertyRow[];
  const names = await idsToMap(
    "profiles",
    "full_name",
    rows.map((r) => r.assigned_to),
  );
  const enriched = rows.map((r) => ({
    ...r,
    creator_name: null,
    assignee_name: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
  }));
  return { rows: enriched, total: count ?? 0 };
}

export async function updateProperty(
  id: string,
  patch: Partial<Omit<Tables<"properties">, "id" | "agency_id">>,
): Promise<void> {
  const { error } = await supabase.from("properties").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setPropertyStatus(
  id: string,
  status: Tables<"properties">["status"],
): Promise<void> {
  const { error } = await supabase.from("properties").update({ status }).eq("id", id);
  if (error) throw error;
}

export type VisitRow = Tables<"site_visits"> & {
  assignee_name: string | null;
  property_title: string | null;
  lead_name: string | null;
};

export async function fetchVisits(agencyId: string): Promise<VisitRow[]> {
  const { data, error } = await supabase
    .from("site_visits")
    .select("*")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const [names, properties, leads] = await Promise.all([
    idsToMap(
      "profiles",
      "full_name",
      rows.map((r) => r.assigned_to),
    ),
    idsToMap(
      "properties",
      "title",
      rows.map((r) => r.property_id),
    ),
    idsToMap(
      "leads",
      "name",
      rows.map((r) => r.lead_id),
    ),
  ]);
  return rows.map((r) => ({
    ...r,
    assignee_name: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
    property_title: r.property_id ? (properties.get(r.property_id) ?? null) : null,
    lead_name: r.lead_id ? (leads.get(r.lead_id) ?? null) : null,
  }));
}
