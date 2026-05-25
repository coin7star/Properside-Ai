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

    if (!groqApiKey) {
      return Response.json({
        reply: "GROQ_API_KEY belum diisi di Vercel."
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

    return Response.json({
      reply:
        data?.choices?.[0]?.message?.content ||
        "AI tidak memberikan jawaban."
    });
  } catch (error) {
    return Response.json({
      reply: "Server error: " + error.message
    });
  }
}
