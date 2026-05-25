import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();

    const message = body?.message;
    const user_email = body?.user_email || null;

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

    const groqApiKey = process.env.GROQ_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!groqApiKey) {
      return Response.json({
        reply: "GROQ_API_KEY belum diisi."
      });
    }

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
          messages: [
            {
              role: "system",
              content:
                "Kamu adalah Properside AI. Jawab dalam bahasa Indonesia yang jelas, ramah, dan mudah dipahami pemula."
            },
            {
              role: "user",
              content: message
            }
          ],
          temperature: 0.7
        })
      }
    );

    const data = await groqResponse.json();

    if (!groqResponse.ok) {
      return Response.json({
        reply: "Groq API error. Cek API key atau model.",
        detail: data
      });
    }

    const aiText =
      data?.choices?.[0]?.message?.content ||
      "AI tidak memberikan jawaban.";

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(
        supabaseUrl,
        supabaseServiceKey
      );

      const { error } = await supabase.from("chats").insert({
        user_email,
        user_message: message,
        ai_response: aiText
      });

      if (error) {
        console.error("Supabase insert error:", error.message);
      }
    }

    return Response.json({
      reply: aiText
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
