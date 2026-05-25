export const runtime = "edge";
export const dynamic = "force-dynamic";

function getGeminiImageUrl() {
  const model =
    process.env.GEMINI_IMAGE_MODEL ||
    "gemini-2.5-flash-image";

  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function cleanGeminiError(message = "") {
  const lower = message.toLowerCase();

  if (
    lower.includes("quota") ||
    lower.includes("exceeded") ||
    lower.includes("limit")
  ) {
    return "Quota Gemini Image kamu habis / belum aktif untuk model ini. Coba cek limit di Google AI Studio atau ganti API key.";
  }

  if (
    lower.includes("api key") ||
    lower.includes("permission") ||
    lower.includes("unauthorized")
  ) {
    return "GEMINI_API_KEY salah, belum aktif, atau tidak punya izin untuk model image.";
  }

  if (
    lower.includes("not found") ||
    lower.includes("model")
  ) {
    return "Model Gemini Image tidak tersedia untuk API key ini. Coba ganti GEMINI_IMAGE_MODEL.";
  }

  return message || "Gagal generate gambar dari Gemini.";
}

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

    const geminiRes = await fetch(
      `${getGeminiImageUrl()}?key=${apiKey}`,
      {
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
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const rawMessage =
        data?.error?.message ||
        "Gagal menghubungi Gemini API.";

      return Response.json(
        {
          success: false,
          error: cleanGeminiError(rawMessage),
          rawError: rawMessage
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
          error: "Gemini tidak mengembalikan gambar. Coba prompt lain atau cek akses model image."
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
        error:
          error?.message ||
          "Terjadi error pada route image."
      },
      { status: 500 }
    );
  }
}