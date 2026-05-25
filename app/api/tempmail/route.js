import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(req) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const action = searchParams.get("action");
    const user_email = searchParams.get("user_email");
    const token = searchParams.get("token");

    if (!user_email) {
      return Response.json(
        { error: "user_email wajib ada." },
        { status: 400 }
      );
    }

    if (action === "load") {
      const { data, error } = await supabase
        .from("tempmails")
        .select("*")
        .eq("user_email", user_email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return Response.json({ data, error });
    }

    if (action === "check") {
      if (!token) {
        return Response.json(
          { error: "token wajib ada." },
          { status: 400 }
        );
      }

      const res = await fetch(
        `https://bintangapi.full.diskon.cloud/api/tempmail/check/?token=${encodeURIComponent(
          token
        )}`
      );

      const data = await res.json();

      const messages =
        data?.result?.data?.messages ||
        data?.result?.messages ||
        data?.messages ||
        [];

      return Response.json({
        mailbox: data?.result?.data?.mailbox || null,
        messages
      });
    }

    return Response.json(
      { error: "Action tidak dikenal." },
      { status: 400 }
    );
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const supabase = getSupabaseAdmin();
    const { user_email } = await req.json();

    if (!user_email) {
      return Response.json(
        { error: "user_email wajib ada." },
        { status: 400 }
      );
    }

    const res = await fetch(
      "https://bintangapi.full.diskon.cloud/api/tempmail/create/"
    );

    const data = await res.json();
    const result = data?.result?.data;

    if (!result?.email || !result?.email_token) {
      return Response.json(
        { error: "Gagal membuat tempmail.", detail: data },
        { status: 500 }
      );
    }

    const { data: saved, error } = await supabase
      .from("tempmails")
      .insert({
        user_email,
        email: result.email,
        email_token: result.email_token,
        deleted_in: result.deleted_in || null
      })
      .select()
      .single();

    return Response.json({
      data: saved,
      error
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
