import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getSafeReturnUrl } from "@/lib/validations/url.validation";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const next = getSafeReturnUrl(rawNext) ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to login with an error query param if exchange fails
  return NextResponse.redirect(`${origin}/login?error=auth_exchange_failed`);
}

