import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi.");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function normalizeMessages(data) {
  return (
    data?.result?.data?.messages ||
    data?.result?.messages ||
    data?.messages ||
    []
  );
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const action = searchParams.get("action");
    const user_email = searchParams.get("user_email");
    const token = searchParams.get("token");

    if (action === "list") {
      if (!user_email) {
        return Response.json(
          {
            error: "user_email wajib ada."
          },
          {
            status: 400
          }
        );
      }

      const supabase = getSupabaseAdmin();

      const { data, error } = await supabase
        .from("tempmails")
        .select("*")
        .eq("user_email", user_email)
        .order("created_at", {
          ascending: false
        });

      if (error) {
        return Response.json(
          {
            error: error.message
          },
          {
            status: 500
          }
        );
      }

      return Response.json({
        data: data || []
      });
    }

    if (action === "check") {
      if (!token) {
        return Response.json(
          {
            error: "token wajib ada."
          },
          {
            status: 400
          }
        );
      }

      const apiUrl =
        "https://bintangapi.full.diskon.cloud/api/tempmail/check/?token=" +
        encodeURIComponent(token);

      const res = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      const data = await res.json();

      const messages = normalizeMessages(data);

      return Response.json({
        mailbox:
          data?.result?.data?.mailbox ||
          data?.mailbox ||
          null,
        messages
      });
    }

    return Response.json(
      {
        error: "Action tidak dikenal."
      },
      {
        status: 400
      }
    );
  } catch (error) {
    return Response.json(
      {
        error: error.message
      },
      {
        status: 500
      }
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const user_email = body?.user_email || null;

    const res = await fetch(
      "https://bintangapi.full.diskon.cloud/api/tempmail/create/",
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      }
    );

    const data = await res.json();

    const result = data?.result?.data;

    if (!result?.email || !result?.email_token) {
      return Response.json(
        {
          error: "Gagal membuat tempmail.",
          detail: data
        },
        {
          status: 500
        }
      );
    }

    if (!user_email) {
      return Response.json({
        data: {
          id: crypto.randomUUID(),
          user_email: null,
          email: result.email,
          email_token: result.email_token,
          deleted_in: result.deleted_in || null,
          guest: true
        }
      });
    }

    const supabase = getSupabaseAdmin();

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

    if (error) {
      return Response.json(
        {
          error: error.message
        },
        {
          status: 500
        }
      );
    }

    return Response.json({
      data: saved
    });
  } catch (error) {
    return Response.json(
      {
        error: error.message
      },
      {
        status: 500
      }
    );
  }
}
