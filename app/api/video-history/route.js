import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
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
    const user_email = searchParams.get("user_email");

    if (!user_email) {
      return Response.json(
        { success: false, error: "user_email wajib ada." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("video_history")
      .select("*")
      .eq("user_email", user_email)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, data: data || [] });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const user_email = body?.user_email;
    const prompt = body?.prompt || "";
    const provider = body?.provider || "piapi";
    const model = body?.model || "kling";
    const source_image_url = body?.source_image_url || "";
    const video_url = body?.video_url || "";
    const task_id = body?.task_id || "";
    const status = body?.status || "completed";

    if (!user_email) {
      return Response.json(
        { success: false, error: "user_email wajib ada." },
        { status: 400 }
      );
    }

    if (!video_url) {
      return Response.json(
        { success: false, error: "video_url wajib ada." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("video_history")
      .insert({
        user_email,
        prompt,
        provider,
        model,
        source_image_url,
        video_url,
        task_id,
        status
      })
      .select()
      .single();

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id");
    const user_email = searchParams.get("user_email");

    if (!id || !user_email) {
      return Response.json(
        { success: false, error: "id dan user_email wajib ada." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("video_history")
      .delete()
      .eq("id", id)
      .eq("user_email", user_email);

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
