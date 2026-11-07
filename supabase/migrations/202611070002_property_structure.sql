
-- ==========================================
-- BINRO: PROPERTY STRUCTURE
-- Migration: 202611070002_property_structure.sql
-- ==========================================

-- 1. Properties
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (id, business_id)
);

ALTER TABLE public.business_members
ADD CONSTRAINT business_members_id_business_unique
UNIQUE (id, business_id);

-- 2. Property staff assignments
CREATE TABLE public.property_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL,
  business_id UUID NOT NULL,
  business_member_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (property_id, business_id)
    REFERENCES public.properties(id, business_id) ON DELETE CASCADE,

  FOREIGN KEY (business_member_id, business_id)
    REFERENCES public.business_members(id, business_id) ON DELETE CASCADE,

  UNIQUE (property_id, business_member_id)
);

-- 3. Floors
CREATE TABLE public.floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  floor_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 4. Rooms
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  floor_id UUID REFERENCES public.floors(id) ON DELETE SET NULL,
  room_number TEXT NOT NULL,
  room_type TEXT NOT NULL DEFAULT 'shared'
    CHECK (room_type IN ('single', 'shared', 'dormitory')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'maintenance')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (property_id, room_number),
  UNIQUE (id, property_id)
);


-- 5. Beds
CREATE TABLE public.beds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  bed_number TEXT NOT NULL,
  monthly_rent BIGINT NOT NULL DEFAULT 0 CHECK (monthly_rent >= 0),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'occupied', 'maintenance', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (room_id, bed_number)
);


-- 6. Property access helper for wardens.
CREATE OR REPLACE FUNCTION public.is_property_staff(
  target_property_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.property_staff ps
    JOIN public.business_members bm
      ON bm.id = ps.business_member_id
    WHERE ps.property_id = target_property_id
      AND bm.user_id = (SELECT auth.uid())
      AND bm.status = 'active'
  );
$$;


-- 7. Property access helper for owners/admins.
CREATE OR REPLACE FUNCTION public.can_manage_property(
  target_property_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = target_property_id
      AND public.is_business_admin(p.business_id)
  );
$$;


-- 8. Enable RLS.
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;


-- 9. Property policies.
CREATE POLICY "Members can view accessible properties"
ON public.properties
FOR SELECT TO authenticated
USING (
  public.is_business_member(business_id)
);

CREATE POLICY "Admins can create properties"
ON public.properties
FOR INSERT TO authenticated
WITH CHECK (
  public.is_business_admin(business_id)
);

CREATE POLICY "Admins can update properties"
ON public.properties
FOR UPDATE TO authenticated
USING (public.is_business_admin(business_id))
WITH CHECK (public.is_business_admin(business_id));

CREATE POLICY "Admins can delete properties"
ON public.properties
FOR DELETE TO authenticated
USING (public.is_business_admin(business_id));


-- 10. Property staff policies.
CREATE POLICY "Users can view their own property assignments"
ON public.property_staff
FOR SELECT TO authenticated
USING (
  public.is_business_admin(business_id)
  OR EXISTS (
    SELECT 1
    FROM public.business_members bm
    WHERE bm.id = business_member_id
      AND bm.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Admins can create property assignments"
ON public.property_staff
FOR INSERT TO authenticated
WITH CHECK (public.is_business_admin(business_id));

CREATE POLICY "Admins can delete property assignments"
ON public.property_staff
FOR DELETE TO authenticated
USING (public.is_business_admin(business_id));


-- 11. Floor policies.
CREATE POLICY "Users can view accessible floors"
ON public.floors
FOR SELECT TO authenticated
USING (
  public.can_manage_property(property_id)
  OR public.is_property_staff(property_id)
);

CREATE POLICY "Admins can create floors"
ON public.floors
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_property(property_id));

CREATE POLICY "Admins can update floors"
ON public.floors
FOR UPDATE TO authenticated
USING (public.can_manage_property(property_id))
WITH CHECK (public.can_manage_property(property_id));

CREATE POLICY "Admins can delete floors"
ON public.floors
FOR DELETE TO authenticated
USING (public.can_manage_property(property_id));


-- 12. Room policies.
CREATE POLICY "Users can view accessible rooms"
ON public.rooms
FOR SELECT TO authenticated
USING (
  public.can_manage_property(property_id)
  OR public.is_property_staff(property_id)
);

CREATE POLICY "Admins can create rooms"
ON public.rooms
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_property(property_id));

CREATE POLICY "Admins can update rooms"
ON public.rooms
FOR UPDATE TO authenticated
USING (public.can_manage_property(property_id))
WITH CHECK (public.can_manage_property(property_id));

CREATE POLICY "Admins can delete rooms"
ON public.rooms
FOR DELETE TO authenticated
USING (public.can_manage_property(property_id));


-- 13. Bed policies.
CREATE POLICY "Users can view accessible beds"
ON public.beds
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = room_id
      AND (
        public.can_manage_property(r.property_id)
        OR public.is_property_staff(r.property_id)
      )
  )
);

CREATE POLICY "Admins can create beds"
ON public.beds
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = room_id
      AND public.can_manage_property(r.property_id)
  )
);

CREATE POLICY "Admins can update beds"
ON public.beds
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = room_id
      AND public.can_manage_property(r.property_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = room_id
      AND public.can_manage_property(r.property_id)
  )
);

CREATE POLICY "Admins can delete beds"
ON public.beds
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = room_id
      AND public.can_manage_property(r.property_id)
  )
);


-- 14. Updated-at triggers.
CREATE TRIGGER properties_updated_at
BEFORE UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER floors_updated_at
BEFORE UPDATE ON public.floors
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER rooms_updated_at
BEFORE UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER beds_updated_at
BEFORE UPDATE ON public.beds
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================================
-- END OF PROPERTY STRUCTURE MIGRATION
-- ==========================================
