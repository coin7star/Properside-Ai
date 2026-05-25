export const runtime = "edge";
export const dynamic = "force-dynamic";

const GEMINI_IMAGE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

export async function POST(req) {
  try {
    const { prompt } = await req.json();

    if (!prompt || !prompt.trim()) {
      return Response.json(
        {
          success: false,
          error: "Prompt wajib diisi."
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          success: false,
          error: "GEMINI_API_KEY belum diatur di environment."
        },
        { status: 500 }
      );
    }

    const geminiRes = await fetch(`${GEMINI_IMAGE_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt.trim()
              }
            ]
          }
        ]
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return Response.json(
        {
          success: false,
          error: data?.error?.message || "Gagal menghubungi Gemini API.",
          raw: data
        },
        { status: geminiRes.status }
      );
    }

    const parts =
      data?.candidates?.flatMap(
        (candidate) => candidate?.content?.parts || []
      ) || [];

    const imagePart = parts.find((part) => part?.inlineData?.data);
    const textPart = parts.find((part) => part?.text)?.text || "";

    if (!imagePart?.inlineData?.data) {
      return Response.json(
        {
          success: false,
          error: "Gemini tidak mengembalikan gambar.",
          raw: data
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      image: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || "image/png",
      text: textPart
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Terjadi error pada route image."
      },
      { status: 500 }
    );
  }
}