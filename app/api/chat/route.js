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
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  const action = searchParams.get("action");
  const user_email = searchParams.get("user_email");
  const session_id = searchParams.get("session_id");

  if (!user_email) {
    return Response.json({ error: "user_email wajib ada." }, { status: 400 });
  }

  if (action === "sessions") {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_email", user_email)
      .order("created_at", { ascending: false });

    return Response.json({ data, error });
  }

  if (action === "messages") {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_email", user_email)
      .eq("session_id", session_id)
      .order("created_at", { ascending: true });

    return Response.json({ data, error });
  }

  return Response.json({ error: "Action tidak dikenal." }, { status: 400 });
}

export async function POST(req) {
  try {
    const body = await req.json();

    const message = body?.message;
    const user_email = body?.user_email;
    let session_id = body?.session_id;

    if (!user_email) {
      return Response.json({ reply: "User belum login." }, { status: 401 });
    }

    if (!message || !message.trim()) {
      return Response.json({ reply: "Pesan kosong." }, { status: 400 });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    const supabase = getSupabaseAdmin();

    if (!groqApiKey) {
      return Response.json({ reply: "GROQ_API_KEY belum diisi." });
    }

    if (!session_id) {
      const title =
        message.length > 35 ? message.slice(0, 35) + "..." : message;

      const { data: sessionData, error: sessionError } = await supabase
        .from("chat_sessions")
        .insert({
          user_email,
          title
        })
        .select()
        .single();

      if (sessionError) {
        return Response.json({
          reply: "Gagal membuat session chat.",
          detail: sessionError.message
        });
      }

      session_id = sessionData.id;
    }

    await supabase.from("chat_messages").insert({
      session_id,
      user_email,
      role: "user",
      content: message
    });

    const { data: oldMessages } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", session_id)
      .eq("user_email", user_email)
      .order("created_at", { ascending: true })
      .limit(20);

    const groqMessages = [
      {
        role: "system",
        content:
          "Kamu adalah Properside AI. Jawab dalam bahasa Indonesia yang jelas, ramah, dan mudah dipahami pemula."
      },
      ...(oldMessages || []).map((msg) => ({
        role: msg.role === "ai" ? "assistant" : "user",
        content: msg.content
      }))
    ];

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: groqMessages,
          temperature: 0.7
        })
      }
    );

    const data = await groqResponse.json();

    if (!groqResponse.ok) {
      return Response.json({
        reply: "Groq API error.",
        detail: data
      });
    }

    const aiText =
      data?.choices?.[0]?.message?.content ||
      "AI tidak memberikan jawaban.";

    await supabase.from("chat_messages").insert({
      session_id,
      user_email,
      role: "ai",
      content: aiText
    });

    return Response.json({
      reply: aiText,
      session_id
    });
  } catch (error) {
    return Response.json(
      {
        reply: "Server error: " + error.message
      },
      {
        status: 500
      }
    );
  }
}

export async function PATCH(req) {
  const supabase = getSupabaseAdmin();
  const { session_id, user_email, title } = await req.json();

  if (!session_id || !user_email || !title) {
    return Response.json({ error: "Data rename belum lengkap." }, { status: 400 });
  }

  const { error } = await supabase
    .from("chat_sessions")
    .update({ title })
    .eq("id", session_id)
    .eq("user_email", user_email);

  return Response.json({ success: !error, error });
}

export async function DELETE(req) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  const session_id = searchParams.get("session_id");
  const user_email = searchParams.get("user_email");

  if (!session_id || !user_email) {
    return Response.json({ error: "Data delete belum lengkap." }, { status: 400 });
  }

  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", session_id)
    .eq("user_email", user_email);

  return Response.json({ success: !error, error });
}
