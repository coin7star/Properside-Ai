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

export async function GET(req) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const user_email = searchParams.get("user_email");

    if (!user_email) {
      return Response.json(
        { error: "user_email wajib ada." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("anime_bookmarks")
      .select("*")
      .eq("user_email", user_email)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return Response.json({
      data: data || []
    });
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
    const body = await req.json();

    const user_email = body?.user_email;
    const anime = body?.anime;

    if (!user_email) {
      return Response.json(
        { error: "Login Google dulu untuk bookmark." },
        { status: 401 }
      );
    }

    if (!anime?.anime_id || !anime?.title) {
      return Response.json(
        { error: "Data anime belum lengkap." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("anime_bookmarks")
      .upsert(
        {
          user_email,
          anime_id: anime.anime_id,
          title: anime.title,
          poster: anime.poster || null,
          info: anime.info || null
        },
        {
          onConflict: "user_email,anime_id"
        }
      )
      .select()
      .single();

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return Response.json({
      data
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const user_email = searchParams.get("user_email");
    const anime_id = searchParams.get("anime_id");

    if (!user_email || !anime_id) {
      return Response.json(
        { error: "Data delete bookmark belum lengkap." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("anime_bookmarks")
      .delete()
      .eq("user_email", user_email)
      .eq("anime_id", anime_id);

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return Response.json({
      success: true
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
