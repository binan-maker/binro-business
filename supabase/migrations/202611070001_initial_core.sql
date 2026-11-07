
-- ==========================================
-- BINRO: INITIAL CORE DATABASE
-- Migration: 202611070001_initial_core.sql
-- ==========================================

-- 1. Updated-at timestamp function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- 2. User profiles
-- One profile per Supabase authentication user.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT UNIQUE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- Automatically create a profile when a user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, email)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    ),
    NEW.phone,
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();


-- Also create profiles for users who already exist.
INSERT INTO public.profiles (id, full_name, phone, email)
SELECT
  id,
  COALESCE(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'),
  phone,
  email
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- 3. Businesses
-- A business is the owner's account, not an individual property.
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.profiles(id),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 4. Business memberships
-- Connects users to businesses with specific roles.
CREATE TABLE public.business_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'warden')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (business_id, user_id)
);


-- 5. Automatically add the business creator as its owner.
CREATE OR REPLACE FUNCTION public.add_business_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.business_members (
    business_id,
    user_id,
    role,
    status
  )
  VALUES (
    NEW.id,
    NEW.owner_user_id,
    'owner',
    'active'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_business_created
AFTER INSERT ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.add_business_owner();


-- 6. Membership permission helpers.
-- SECURITY DEFINER avoids recursive membership RLS checks.
CREATE OR REPLACE FUNCTION public.is_business_member(
  target_business_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_members
    WHERE business_id = target_business_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
  );
$$;


CREATE OR REPLACE FUNCTION public.is_business_admin(
  target_business_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_members
    WHERE business_id = target_business_id
      AND user_id = (SELECT auth.uid())
      AND role IN ('owner', 'admin')
      AND status = 'active'
  );
$$;


-- 7. Updated-at triggers.
CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER businesses_updated_at
BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER business_members_updated_at
BEFORE UPDATE ON public.business_members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 8. Enable Row Level Security.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;


-- 9. Profile policies.
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));


-- 10. Business policies.
CREATE POLICY "Members can view their businesses"
ON public.businesses
FOR SELECT
TO authenticated
USING (public.is_business_member(id));

CREATE POLICY "Users can create their own businesses"
ON public.businesses
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can update their businesses"
ON public.businesses
FOR UPDATE
TO authenticated
USING (public.is_business_admin(id))
WITH CHECK (public.is_business_admin(id));


-- 11. Business membership policies.
CREATE POLICY "Members can view business memberships"
ON public.business_members
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.is_business_admin(business_id)
);

CREATE POLICY "Admins can update business memberships"
ON public.business_members
FOR UPDATE
TO authenticated
USING (public.is_business_admin(business_id))
WITH CHECK (public.is_business_admin(business_id));


-- ==========================================
-- END OF INITIAL CORE MIGRATION
-- ==========================================
