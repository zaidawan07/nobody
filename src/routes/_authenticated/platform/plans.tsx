"use client";

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ListChecks,
  Plus,
  Loader2,
  AlertCircle,
  DollarSign,
  Check,
  X,
  Edit,
  Trash2,
  ArrowUpDown,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPkr } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import {
  planSchema,
  createPlan as createPlanFn,
  updatePlan as updatePlanFn,
  deletePlan as deletePlanFn,
  upsertPlanFeature as upsertPlanFeatureFn,
  deletePlanFeature as deletePlanFeatureFn,
  reorderPlans as reorderPlansFn,
} from "@/lib/plans.functions";

export const Route = createFileRoute("/_authenticated/platform/plans")({
  head: () => ({ meta: [{ title: "Plans — EstateOS" }] }),
  component: PlansPage,
});

const featureSchema = z.object({
  feature_key: z.string().min(1, "Feature key is required"),
  feature_value: z.string().optional(),
  included: z.boolean(),
  limit_value: z.number().nullable().optional(),
});

interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  price_pkr: number;
  interval: "monthly" | "yearly";
  trial_days: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface PlanFeatureRow {
  id: string;
  plan_id: string;
  feature_key: string;
  feature_value: string | null;
  included: boolean;
  limit_value: number | null;
  created_at: string;
}

async function fetchPlans(): Promise<(PlanRow & { features: PlanFeatureRow[] })[]> {
  const { data: plans, error } = await supabase
    .from("plans")
    .select("*, plan_features(*)")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (plans ?? []).map((plan) => ({
    ...plan,
    features: plan.plan_features ?? [],
  }));
}

async function fetchPlansAdmin(): Promise<PlanRow[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchPlanFeatures(planId: string): Promise<PlanFeatureRow[]> {
  const { data, error } = await supabase
    .from("plan_features")
    .select("*")
    .eq("plan_id", planId)
    .order("feature_key");
  if (error) throw error;
  return data ?? [];
}

function PlansPage() {
  const { access } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"plans" | "features">("plans");

  const { data: plans, isLoading } = useQuery({
    queryKey: ["platform-plans"],
    queryFn: fetchPlansAdmin,
  });

  const { data: features } = useQuery({
    queryKey: ["plan-features", editingPlan?.id],
    queryFn: () => (editingPlan ? fetchPlanFeatures(editingPlan.id) : Promise.resolve([])),
    enabled: !!editingPlan,
  });

  // Writes run through real server functions (src/lib/plans.functions.ts):
  // each one asserts the caller is a super admin and then writes with the
  // caller's own connection so RLS enforces it a second time. The previous
  // version passed raw async functions to useServerFn, which executed them in
  // the browser with no role check at all.
  const createPlan = useServerFn(createPlanFn);
  const updatePlan = useServerFn(updatePlanFn);
  const deletePlan = useServerFn(deletePlanFn);
  const upsertFeature = useServerFn(upsertPlanFeatureFn);
  const deleteFeature = useServerFn(deletePlanFeatureFn);
  const reorderPlans = useServerFn(reorderPlansFn);

  const [formError, setFormError] = useState<string | null>(null);
  const [featureFormError, setFeatureFormError] = useState<string | null>(null);

  const planForm = useForm<z.infer<typeof planSchema>>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: "",
      description: "",
      price_pkr: 0,
      interval: "monthly",
      trial_days: 0,
      is_active: true,
      sort_order: 0,
    },
  });

  const featureForm = useForm<z.infer<typeof featureSchema>>({
    resolver: zodResolver(featureSchema),
    defaultValues: {
      feature_key: "",
      feature_value: "",
      included: true,
      limit_value: null,
    },
  });

  const handlePlanSubmit = async (values: z.infer<typeof planSchema>) => {
    setFormError(null);
    try {
      if (editingPlan) {
        await updatePlan({ data: { ...values, id: editingPlan.id } });
        toast.success("Plan updated");
      } else {
        const result = await createPlan({ data: values });
        toast.success("Plan created");
        setEditingPlan({ ...values, id: result.planId } as PlanRow);
      }
      setOpen(false);
      setEditingPlan(null);
      planForm.reset();
      queryClient.invalidateQueries({ queryKey: ["platform-plans"] });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save the plan.");
    }
  };

  const handleFeatureSubmit = async (values: z.infer<typeof featureSchema>) => {
    setFeatureFormError(null);
    try {
      await upsertFeature({
        data: { ...values, plan_id: editingPlan!.id, id: editingFeatureId ?? undefined },
      });
      toast.success(editingFeatureId ? "Feature updated" : "Feature added");
      setEditingFeatureId(null);
      featureForm.reset();
      queryClient.invalidateQueries({ queryKey: ["plan-features", editingPlan?.id] });
    } catch (e) {
      setFeatureFormError(e instanceof Error ? e.message : "Couldn't save the feature.");
    }
  };

  const handleDeleteFeature = async (featureId: string) => {
    if (!confirm("Delete this feature?")) return;
    try {
      await deleteFeature({ data: { id: featureId } });
      toast.success("Feature deleted");
      queryClient.invalidateQueries({ queryKey: ["plan-features", editingPlan?.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the feature.");
    }
  };

  const handleDeletePlan = async (planId: string, planName: string) => {
    if (!confirm(`Delete plan "${planName}"?`)) return;
    try {
      await deletePlan({ data: { id: planId } });
      toast.success("Plan deleted");
      queryClient.invalidateQueries({ queryKey: ["platform-plans"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the plan.");
    }
  };

  const handleReorderPlans = async (orderedIds: string[]) => {
    await reorderPlans({ data: { orderedIds } });
    toast.success("Plans reordered");
    queryClient.invalidateQueries({ queryKey: ["platform-plans"] });
  };

  const newPlanButton = (
    <Button
      size="sm"
      onClick={() => {
        setEditingPlan(null);
        setOpen(true);
        setActiveTab("plans");
      }}
    >
      <Plus className="size-4" /> New plan
    </Button>
  );

  // Render the plans tab content
  function PlansTabContent() {
    if (isLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      );
    }

    if (plans && plans.length > 0) {
      return (
        <Card>
          <div className="surface-panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Trial</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(plans ?? []).map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium text-foreground">{plan.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatPkr(plan.price_pkr)}/{plan.interval}
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {plan.interval}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {plan.trial_days > 0 ? `${plan.trial_days} days` : "None"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${plan.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                      >
                        {plan.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{plan.sort_order}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => setEditingPlan(plan)}>
                          <Edit className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDeletePlan(plan.id, plan.name)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      );
    }

    return (
      <Card>
        <div className="surface-panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
            <ListChecks className="size-5" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">No plans yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create the first plan to start offering subscriptions.
            </p>
          </div>
          <Button
            className="mt-2"
            onClick={() => {
              setEditingPlan(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Create your first plan
          </Button>
        </div>
      </Card>
    );
  }

  function FeaturesTabContent() {
    if (!editingPlan) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
              <ListChecks className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">Select a plan to manage features</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Choose a plan from the Plans tab to add or edit its features.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Features for {editingPlan.name}</h3>
            <p className="text-sm text-muted-foreground">
              Manage feature flags and limits for this plan
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingFeatureId(null);
              featureForm.reset({
                feature_key: "",
                feature_value: "",
                included: true,
                limit_value: null,
              });
            }}
          >
            <Plus className="size-4" /> Add feature
          </Button>
        </div>

        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Included</TableHead>
                <TableHead>Limit</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(features ?? []).map((feature) => (
                <TableRow key={feature.id}>
                  <TableCell className="font-medium text-foreground">
                    {feature.feature_key}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {feature.feature_value ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={feature.included ? "default" : "secondary"}>
                      {feature.included ? "Included" : "Excluded"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {(() => {
                      if (feature.limit_value === null || feature.limit_value === undefined)
                        return "Unlimited";
                      if (feature.limit_value === -1) return "Unlimited";
                      return feature.limit_value.toString();
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingFeatureId(feature.id);
                          featureForm.reset({
                            feature_key: feature.feature_key,
                            feature_value: feature.feature_value ?? "",
                            included: feature.included,
                            limit_value: feature.limit_value ?? null,
                          });
                        }}
                      >
                        <Edit className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDeleteFeature(feature.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      title="Subscription Plans"
      description="Define what each subscription tier includes."
      actions={newPlanButton}
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "plans" | "features")}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-4">
          <PlansTabContent />
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          <FeaturesTabContent />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Plan Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit plan" : "New plan"}</DialogTitle>
            <DialogDescription>
              {editingPlan ? "Update the plan details." : "Create a new subscription plan."}
            </DialogDescription>
          </DialogHeader>
          {formError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          {featureFormError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{featureFormError}</AlertDescription>
            </Alert>
          ) : null}
          <Form {...planForm}>
            <form onSubmit={planForm.handleSubmit(handlePlanSubmit)} className="space-y-4">
              <FormField
                control={planForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan name</FormLabel>
                    <FormControl>
                      <Input placeholder="Professional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={planForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Plan description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={planForm.control}
                  name="price_pkr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (PKR)</FormLabel>
                      <FormControl>
                        <Input type="number" inputMode="numeric" placeholder="50000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={planForm.control}
                  name="interval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing interval</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={planForm.control}
                  name="trial_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trial days</FormLabel>
                      <FormControl>
                        <Input type="number" inputMode="numeric" placeholder="14" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={planForm.control}
                  name="sort_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort order</FormLabel>
                      <FormControl>
                        <Input type="number" inputMode="numeric" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={planForm.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <FormLabel>Active</FormLabel>
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="flex gap-2 pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setOpen(false);
                    setEditingPlan(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={planForm.formState.isSubmitting}>
                  {planForm.formState.isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : editingPlan ? (
                    "Update plan"
                  ) : (
                    "Create plan"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
