import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { message } = await req.json();

    if (!message || !message.trim()) {
      return Response.json(
        { reply: "Pesan kosong." },
        { status: 400 }
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

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
                "Kamu adalah Properside AI."
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

    const aiText =
      data?.choices?.[0]?.message?.content ||
      "AI tidak memberikan jawaban.";

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(
        supabaseUrl,
        supabaseServiceKey
      );

      await supabase.from("chats").insert({
        user_message: message,
        ai_response: aiText
      });
    }

    return Response.json({
      reply: aiText
    });
  } catch (error) {
    return Response.json({
      reply: error.message
    });
  }
}
