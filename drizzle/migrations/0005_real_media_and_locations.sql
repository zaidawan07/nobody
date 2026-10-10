-- ============================================================================
-- 0005: Real property media (thumbnails, posters, mime/size, cover photo),
-- the full PKR rental period, Pakistan-wide location columns, and a proper
-- normalized `locations` hierarchy.
-- ============================================================================

-- ---------- 1. New statuses the UI wants ----------
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'unavailable';
ALTER TYPE public.property_status ADD VALUE IF NOT EXISTS 'expired';

-- ---------- 2. Property: Pakistan location hierarchy + rental period ----------
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS tehsil text,
  ADD COLUMN IF NOT EXISTS block text,
  ADD COLUMN IF NOT EXISTS rent_period text
    CHECK (rent_period IS NULL OR rent_period IN ('daily','weekly','monthly','yearly'));

CREATE INDEX IF NOT EXISTS properties_city_idx ON public.properties (city);
CREATE INDEX IF NOT EXISTS properties_district_province_idx ON public.properties (province, district);
CREATE INDEX IF NOT EXISTS properties_price_idx ON public.properties (price_pkr);
CREATE INDEX IF NOT EXISTS properties_assigned_idx ON public.properties (assigned_to);

-- ---------- 3. property_media: thumbnail/poster/metadata/cover ----------
ALTER TABLE public.property_media
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS poster_path text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS is_cover boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS property_media_cover_idx ON public.property_media (property_id, is_cover);

-- One cover photo per property (enforced by a partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS property_media_one_cover_idx
  ON public.property_media (property_id) WHERE is_cover = true;

-- ---------- 4. Normalized location hierarchy ----------
-- country -> province -> division -> district -> city -> tehsil -> locality
-- locality -> society -> phase -> block. Written import-ready (parent_id
-- links), with a lean Pakistan-wide seed below. Localities/societies are
-- added progressively per agency so we don't fabricate data.
CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('country','province','division','district','city','tehsil','locality','society','phase','block')),
  parent_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS locations_parent_idx ON public.locations (parent_id);
CREATE INDEX IF NOT EXISTS locations_kind_parent_idx ON public.locations (kind, parent_id);

GRANT SELECT ON public.locations TO authenticated, anon;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "locations readable by all roles" ON public.locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "locations readable by anon" ON public.locations FOR SELECT TO anon USING (true);

-- ---------- 5. Location seed (country/provinces/divisions/districts/cities) ----------
INSERT INTO public.locations (name, kind) VALUES ('Pakistan', 'country');

WITH root AS (SELECT id FROM public.locations WHERE name = 'Pakistan' AND kind = 'country')
INSERT INTO public.locations (name, kind, parent_id)
SELECT name, 'province', root.id FROM root,
  (VALUES
    ('Punjab'),('Sindh'),('Khyber Pakhtunkhwa'),('Balochistan'),
    ('Islamabad Capital Territory'),('Gilgit-Baltistan'),('Azad Jammu and Kashmir')
  ) AS v(name);

WITH parent AS (SELECT id, name FROM public.locations WHERE kind = 'province')
INSERT INTO public.locations (name, kind, parent_id)
SELECT v.name, 'division', parent.id
FROM parent
JOIN (VALUES
  ('Punjab','Lahore Division'),('Punjab','Gujranwala Division'),('Punjab','Rawalpindi Division'),
  ('Punjab','Multan Division'),('Punjab','Faisalabad Division'),('Punjab','Sargodha Division'),
  ('Punjab','Bahawalpur Division'),('Punjab','Sahiwal Division'),('Punjab','Dera Ghazi Khan Division'),
  ('Sindh','Karachi Division'),('Sindh','Hyderabad Division'),('Sindh','Sakhar Division'),
  ('Sindh','Mirpur Khas Division'),('Sindh','Larkana Division'),('Sindh','Sukkur Division'),
  ('Khyber Pakhtunkhwa','Peshawar Division'),('Khyber Pakhtunkhwa','Malakand Division'),
  ('Khyber Pakhtunkhwa','Kohat Division'),('Khyber Pakhtunkhwa','Bannu Division'),
  ('Khyber Pakhtunkhwa','Hazara Division'),('Khyber Pakhtunkhwa','Dera Ismail Khan Division'),
  ('Balochistan','Quetta Division'),('Balochistan','Rakhshan Division'),('Balochistan','Naseerabad Division'),
  ('Balochistan','Zhob Division'),('Balochistan','Kalat Division'),('Balochistan','Makran Division'),
  ('Islamabad Capital Territory','Islamabad'),('Gilgit-Baltistan','Gilgit-Baltistan'),
  ('Azad Jammu and Kashmir','Muzaffarabad Division'),('Azad Jammu and Kashmir','Mirpur Division'),('Azad Jammu and Kashmir','Poonch Division')
) AS v(province, name) ON v.province = parent.name;

WITH parent AS (SELECT id, name FROM public.locations WHERE kind = 'division')
INSERT INTO public.locations (name, kind, parent_id)
SELECT v.name, 'district', parent.id
FROM parent
JOIN (VALUES
  ('Lahore Division','Lahore'),('Lahore Division','Sheikhupura'),('Lahore Division','Kasur'),
  ('Gujranwala Division','Gujranwala'),('Gujranwala Division','Sialkot'),('Gujranwala Division','Gujrat'),
  ('Rawalpindi Division','Rawalpindi'),('Rawalpindi Division','Attock'),('Rawalpindi Division','Jhelum'),
  ('Multan Division','Multan'),('Multan Division','Vehari'),('Multan Division','Khanewal'),
  ('Faisalabad Division','Faisalabad'),('Faisalabad Division','Jhang'),('Faisalabad Division','Chiniot'),
  ('Sargodha Division','Sargodha'),('Sargodha Division','Khushab'),
  ('Bahawalpur Division','Bahawalpur'),('Bahawalpur Division','Bahawalnagar'),
  ('Sahiwal Division','Sahiwal'),('Sahiwal Division','Okara'),
  ('Dera Ghazi Khan Division','Dera Ghazi Khan'),
  ('Karachi Division','Karachi'),('Hyderabad Division','Hyderabad'),('Sakhar Division','Shikarpur'),
  ('Mirpur Khas Division','Mirpur Khas'),('Larkana Division','Larkana'),('Sukkur Division','Sukkur'),
  ('Peshawar Division','Peshawar'),('Peshawar Division','Mardan'),('Malakand Division','Swat'),
  ('Kohat Division','Kohat'),('Bannu Division','Bannu'),('Hazara Division','Abbottabad'),('Hazara Division','Mansehra'),
  ('Dera Ismail Khan Division','Dera Ismail Khan'),
  ('Quetta Division','Quetta'),('Rakhshan Division','Turbat'),('Naseerabad Division','Sibi'),
  ('Zhob Division','Zhob'),('Kalat Division','Kalat'),('Makran Division','Gwadar'),
  ('Islamabad','Islamabad'),('Gilgit-Baltistan','Gilgit'),('Gilgit-Baltistan','Hunza'),
  ('Muzaffarabad Division','Muzaffarabad'),('Mirpur Division','Mirpur'),('Poonch Division','Poonch')
) AS v(division, name) ON v.division = parent.name;

WITH parent AS (SELECT id, name FROM public.locations WHERE kind = 'district')
INSERT INTO public.locations (name, kind, parent_id)
SELECT v.name, 'city', parent.id
FROM parent
JOIN (VALUES
  ('Lahore','Lahore'),('Karachi','Karachi'),('Rawalpindi','Rawalpindi'),('Multan','Multan'),
  ('Faisalabad','Faisalabad'),('Gujranwala','Gujranwala'),('Sialkot','Sialkot'),('Peshawar','Peshawar'),
  ('Quetta','Quetta'),('Hyderabad','Hyderabad'),('Islamabad','Islamabad'),('Bahawalpur','Bahawalpur'),
  ('Sukkur','Sukkur'),('Abbottabad','Abbottabad'),('Gwadar','Gwadar'),('Mirpur','Mirpur'),
  ('Mardan','Mardan'),('Swat','Saidu Sharif'),('Sahiwal','Sahiwal'),('Dera Ghazi Khan','Dera Ghazi Khan'),
  ('Hunza','Karimabad'),('Attock','Attock City'),('Jhelum','Jhelum City'),('Vehari','Vehari'),
  ('Khanewal','Khanewal'),('Jhang','Jhang'),('Chiniot','Chiniot'),('Sargodha','Sargodha'),
  ('Okara','Okara'),('Gujrat','Gujrat'),('Kasur','Kasur'),('Sheikhupura','Sheikhupura'),
  ('Turbat','Turbat'),('Sibi','Sibi'),('Zhob','Zhob'),('Kalat','Kalat'),('Gilgit','Gilgit'),
  ('Muzaffarabad','Muzaffarabad'),('Poonch','Poonch'),('Mirpur Khas','Mirpur Khas'),('Larkana','Larkana'),
  ('Mansehra','Mansehra'),('Dera Ismail Khan','Dera Ismail Khan'),('Kohat','Kohat'),('Bannu','Bannu')
) AS v(district, name) ON v.district = parent.name;
