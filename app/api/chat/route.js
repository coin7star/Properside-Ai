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

function getGroqKey() {
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY belum diisi.");
  }

  return groqApiKey;
}

async function askGroq(message, oldMessages = []) {
  const groqApiKey = getGroqKey();

  const groqMessages = [
    {
      role: "system",
      content:
        "Kamu adalah Properside AI. Jawab dalam bahasa Indonesia yang jelas, ramah, dan mudah dipahami pemula."
    },
    ...oldMessages,
    {
      role: "user",
      content: message
    }
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

  const groqData = await groqResponse.json();

  if (!groqResponse.ok) {
    throw new Error("Groq API error.");
  }

  return (
    groqData?.choices?.[0]?.message?.content ||
    "AI tidak memberikan jawaban."
  );
}

export async function GET(req) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const action = searchParams.get("action");
    const user_email = searchParams.get("user_email");
    const session_id = searchParams.get("session_id");

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

    if (action === "sessions") {
      const { data, error } = await supabase
        .from("chat_sessions")
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

    if (action === "messages") {
      if (!session_id) {
        return Response.json(
          {
            error: "session_id wajib ada."
          },
          {
            status: 400
          }
        );
      }

      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_email", user_email)
        .eq("session_id", session_id)
        .order("created_at", {
          ascending: true
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

    const message = body?.message;
    const user_email = body?.user_email || null;
    let session_id = body?.session_id || null;

    if (!message || !message.trim()) {
      return Response.json(
        {
          reply: "Pesan kosong."
        },
        {
          status: 400
        }
      );
    }

    if (!user_email) {
      const aiText = await askGroq(message);

      return Response.json({
        reply: aiText,
        session_id: null,
        guest: true
      });
    }

    const supabase = getSupabaseAdmin();

    if (!session_id) {
      const title =
        message.length > 35
          ? message.slice(0, 35) + "..."
          : message;

      const { data: sessionData, error: sessionError } = await supabase
        .from("chat_sessions")
        .insert({
          user_email,
          title
        })
        .select()
        .single();

      if (sessionError) {
        return Response.json(
          {
            reply: "Gagal membuat session chat.",
            detail: sessionError.message
          },
          {
            status: 500
          }
        );
      }

      session_id = sessionData.id;
    }

    const { error: userMessageError } = await supabase
      .from("chat_messages")
      .insert({
        session_id,
        user_email,
        role: "user",
        content: message
      });

    if (userMessageError) {
      return Response.json(
        {
          reply: "Gagal menyimpan pesan user.",
          detail: userMessageError.message
        },
        {
          status: 500
        }
      );
    }

    const { data: oldMessages } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", session_id)
      .eq("user_email", user_email)
      .order("created_at", {
        ascending: true
      })
      .limit(20);

    const mappedOldMessages = (oldMessages || []).map((msg) => ({
      role: msg.role === "ai" ? "assistant" : "user",
      content: msg.content
    }));

    const aiText = await askGroq(message, mappedOldMessages);

    const { error: aiMessageError } = await supabase
      .from("chat_messages")
      .insert({
        session_id,
        user_email,
        role: "ai",
        content: aiText
      });

    if (aiMessageError) {
      console.log("Gagal simpan jawaban AI:", aiMessageError.message);
    }

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
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const session_id = body?.session_id;
    const user_email = body?.user_email;
    const title = body?.title;

    if (!session_id || !user_email || !title) {
      return Response.json(
        {
          error: "Data rename belum lengkap."
        },
        {
          status: 400
        }
      );
    }

    const { error } = await supabase
      .from("chat_sessions")
      .update({
        title
      })
      .eq("id", session_id)
      .eq("user_email", user_email);

    if (error) {
      return Response.json(
        {
          success: false,
          error: error.message
        },
        {
          status: 500
        }
      );
    }

    return Response.json({
      success: true
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      {
        status: 500
      }
    );
  }
}

export async function DELETE(req) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const session_id = searchParams.get("session_id");
    const user_email = searchParams.get("user_email");

    if (!session_id || !user_email) {
      return Response.json(
        {
          error: "Data delete belum lengkap."
        },
        {
          status: 400
        }
      );
    }

    const { error } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("id", session_id)
      .eq("user_email", user_email);

    if (error) {
      return Response.json(
        {
          success: false,
          error: error.message
        },
        {
          status: 500
        }
      );
    }

    return Response.json({
      success: true
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      {
        status: 500
      }
    );
  }
}
