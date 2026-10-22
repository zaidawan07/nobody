-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('super_admin','agency_admin','employee');
CREATE TYPE public.account_status AS ENUM ('active','suspended','pending');
CREATE TYPE public.property_purpose AS ENUM ('sale','rent');
CREATE TYPE public.property_type AS ENUM ('house','apartment','plot','commercial','office','shop','warehouse','agricultural');
CREATE TYPE public.property_status AS ENUM ('available','reserved','sold','rented','inactive');
CREATE TYPE public.area_unit AS ENUM ('marla','kanal','sqft','sqyd','acre');
CREATE TYPE public.lead_status AS ENUM ('new','contacted','qualified','visit_scheduled','negotiating','won','lost');
CREATE TYPE public.visit_status AS ENUM ('requested','confirmed','completed','cancelled','no_show');
CREATE TYPE public.whatsapp_connection_status AS ENUM ('not_connected','pending','connected','error');
CREATE TYPE public.conversation_state AS ENUM ('ai_active','human_active','closed');
CREATE TYPE public.message_sender AS ENUM ('customer','ai','employee','system');
CREATE TYPE public.media_kind AS ENUM ('photo','video','document');

-- ============ AGENCIES ============
CREATE TABLE public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  logo_url text,
  phone text,
  whatsapp_number text,
  email text,
  office_address text,
  cities_served text[] NOT NULL DEFAULT '{}',
  description text,
  working_hours text,
  status public.account_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies TO authenticated;
GRANT ALL ON public.agencies TO service_role;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  email text,
  job_title text,
  status public.account_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin');
$$;

-- Tenant key for the current user: the agency their profile belongs to.
CREATE OR REPLACE FUNCTION public.current_agency_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT agency_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_agency_admin(_agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'agency_admin' AND ur.agency_id = _agency_id
  );
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Auto-create a profile row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.email, NEW.raw_user_meta_data ->> 'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ POLICIES: agencies / profiles / roles ============
CREATE POLICY "super admin manages agencies" ON public.agencies FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "members read own agency" ON public.agencies FOR SELECT TO authenticated
  USING (id = public.current_agency_id());
CREATE POLICY "agency admin updates own agency" ON public.agencies FOR UPDATE TO authenticated
  USING (public.is_agency_admin(id)) WITH CHECK (public.is_agency_admin(id));

CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "read agency colleagues" ON public.profiles FOR SELECT TO authenticated
  USING (agency_id IS NOT NULL AND agency_id = public.current_agency_id());
CREATE POLICY "super admin reads profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_super_admin());
CREATE POLICY "super admin writes profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "agency admin manages team profiles" ON public.profiles FOR ALL TO authenticated
  USING (agency_id IS NOT NULL AND public.is_agency_admin(agency_id))
  WITH CHECK (agency_id IS NOT NULL AND public.is_agency_admin(agency_id));

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "super admin reads roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "agency admin reads agency roles" ON public.user_roles FOR SELECT TO authenticated
  USING (agency_id IS NOT NULL AND public.is_agency_admin(agency_id));

-- ============ PROPERTIES ============
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  reference_code text,
  title text NOT NULL,
  property_type public.property_type NOT NULL,
  purpose public.property_purpose NOT NULL,
  status public.property_status NOT NULL DEFAULT 'available',
  price_pkr numeric(16,2),
  area_value numeric(12,2),
  area_unit public.area_unit,
  city text,
  society text,
  phase_block text,
  locality text,
  address text,
  latitude double precision,
  longitude double precision,
  bedrooms int,
  bathrooms int,
  furnished boolean NOT NULL DEFAULT false,
  description text,
  features text[] NOT NULL DEFAULT '{}',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, reference_code)
);
CREATE INDEX properties_agency_status_idx ON public.properties (agency_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.property_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  kind public.media_kind NOT NULL DEFAULT 'photo',
  storage_path text NOT NULL,
  caption text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_media TO authenticated;
GRANT ALL ON public.property_media TO service_role;
ALTER TABLE public.property_media ENABLE ROW LEVEL SECURITY;

-- ============ LEADS ============
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name text,
  phone text,
  whatsapp_number text,
  requirement_text text,
  budget_min_pkr numeric(16,2),
  budget_max_pkr numeric(16,2),
  preferred_city text,
  preferred_locality text,
  property_type public.property_type,
  purpose public.property_purpose,
  status public.lead_status NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_agency_status_idx ON public.leads (agency_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  requested_at timestamptz,
  scheduled_at timestamptz,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.visit_status NOT NULL DEFAULT 'requested',
  notes text,
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_visits TO authenticated;
GRANT ALL ON public.site_visits TO service_role;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

-- ============ WHATSAPP AI FOUNDATION ============
CREATE TABLE public.whatsapp_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL UNIQUE REFERENCES public.agencies(id) ON DELETE CASCADE,
  whatsapp_number text,
  display_name text,
  connection_status public.whatsapp_connection_status NOT NULL DEFAULT 'not_connected',
  connection_error text,
  ai_enabled boolean NOT NULL DEFAULT false,
  ai_greeting text,
  ai_language text NOT NULL DEFAULT 'auto',
  ai_tone text,
  ai_instructions text,
  handoff_keywords text[] NOT NULL DEFAULT '{}',
  auto_create_leads boolean NOT NULL DEFAULT true,
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_configs TO authenticated;
GRANT ALL ON public.whatsapp_configs TO service_role;
ALTER TABLE public.whatsapp_configs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  customer_name text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  state public.conversation_state NOT NULL DEFAULT 'ai_active',
  handoff_requested boolean NOT NULL DEFAULT false,
  handoff_reason text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, customer_phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender public.message_sender NOT NULL,
  body text,
  media_url text,
  referenced_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversation_messages_conv_idx ON public.conversation_messages (conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_messages TO authenticated;
GRANT ALL ON public.conversation_messages TO service_role;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

-- ============ TENANT-SCOPED POLICIES ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','property_media','leads','site_visits','whatsapp_configs','conversations','conversation_messages']
  LOOP
    EXECUTE format($f$
      CREATE POLICY "tenant members access %1$s" ON public.%1$I FOR ALL TO authenticated
        USING (agency_id = public.current_agency_id())
        WITH CHECK (agency_id = public.current_agency_id());
      CREATE POLICY "super admin access %1$s" ON public.%1$I FOR ALL TO authenticated
        USING (public.is_super_admin())
        WITH CHECK (public.is_super_admin());
    $f$, t);
  END LOOP;
END $$;

-- ============ updated_at TRIGGERS ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agencies','profiles','properties','leads','site_visits','whatsapp_configs','conversations']
  LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t);
  END LOOP;
END $$;
