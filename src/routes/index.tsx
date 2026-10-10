import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Bot, ShieldCheck, Home, UserSquare2, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EstateOS — Run every agency, and its WhatsApp AI, in one place" },
      {
        name: "description",
        content:
          "A multi-agency platform for Pakistani real estate: property inventory in Marla and Kanal, leads, site visits, teams, and a WhatsApp AI assistant per agency.",
      },
      { property: "og:title", content: "EstateOS — Multi-agency real estate platform" },
      {
        property: "og:description",
        content:
          "Property inventory, leads, site visits and a per-agency WhatsApp AI assistant, with every agency's data kept strictly separate.",
      },
    ],
  }),
  component: Landing,
});

const levels = [
  {
    icon: ShieldCheck,
    title: "Platform owner",
    body: "Create agencies, give each one its first admin, and suspend or reactivate any agency.",
  },
  {
    icon: Building2,
    title: "Agency admin",
    body: "Own the agency profile, team accounts, inventory and the WhatsApp assistant settings.",
  },
  {
    icon: UserSquare2,
    title: "Employees",
    body: "Work their assigned properties, leads and site visits, and take over chats from the AI.",
  },
];

const capabilities = [
  { icon: Home, label: "Inventory in Marla, Kanal, Sq Ft, Sq Yard and Acre" },
  { icon: UserSquare2, label: "Leads with budget in lakh and crore" },
  { icon: CalendarCheck, label: "Site visit requests and confirmations" },
  { icon: Bot, label: "A WhatsApp assistant per agency number" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <p className="font-display text-lg font-semibold">EstateOS</p>
        <Button asChild size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="hero-gradient mx-4 rounded-3xl px-6 py-16 text-center md:mx-auto md:max-w-6xl md:px-12 md:py-24">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">
          For property dealers, brokers and agency teams
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold text-white md:text-6xl">
          Every agency gets its own workspace, inventory and WhatsApp AI.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-white/75">
          One platform for many agencies. Each agency sees only its own properties, photos, leads,
          team and customer chats — enforced by the database, not by trust.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/auth">I already have an account</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold">Three levels, one platform</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {levels.map((level) => (
            <div key={level.title} className="surface-panel p-6">
              <level.icon className="size-6 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{level.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{level.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="surface-panel grid gap-6 p-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">Built for Pakistani property work</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Houses, flats, plots, shops, offices, warehouses and agricultural land — for sale or
              for rent, priced in PKR, sized the way buyers actually ask.
            </p>
          </div>
          <ul className="space-y-3">
            {capabilities.map((item) => (
              <li key={item.label} className="flex items-center gap-3 text-sm">
                <span className="rounded-md bg-secondary p-2 text-secondary-foreground">
                  <item.icon className="size-4" />
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
        EstateOS — multi-agency real estate operations.
      </footer>
    </div>
  );
}
