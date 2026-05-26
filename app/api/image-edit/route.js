export const runtime = "edge";
export const dynamic = "force-dynamic";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function extractGeminiResult(result) {
  const candidates = result?.candidates || [];
  let image = "";
  let mimeType = "image/png";
  const texts = [];

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];

    for (const part of parts) {
      if (part?.text) {
        texts.push(part.text);
      }

      if (part?.inlineData?.data) {
        image = part.inlineData.data;
        mimeType = part.inlineData.mimeType || "image/png";
      }
    }
  }

  return {
    image,
    mimeType,
    text: texts.join("\n").trim()
  };
}

async function editWithGemini({ prompt, imageBase64, mimeType }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model =
    process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image-preview";

  if (!apiKey) {
    return {
      ok: false,
      error: "GEMINI_API_KEY belum diatur."
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Edit gambar yang diberikan sesuai instruksi user. Pertahankan elemen penting dari gambar asli jika masih relevan. Instruksi user: ${prompt}`
          },
          {
            inlineData: {
              mimeType,
              data: imageBase64
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"]
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const result = await response.json();

  if (!response.ok) {
    return {
      ok: false,
      error:
        result?.error?.message ||
        "Gagal edit gambar dengan Gemini."
    };
  }

  const extracted = extractGeminiResult(result);

  if (!extracted.image) {
    return {
      ok: false,
      error: "Gemini tidak mengembalikan hasil gambar."
    };
  }

  return {
    ok: true,
    image: extracted.image,
    mimeType: extracted.mimeType,
    text: extracted.text,
    provider: "gemini"
  };
}

export async function POST(req) {
  try {
    const formData = await req.formData();

    const prompt = String(formData.get("prompt") || "").trim();
    const provider = String(formData.get("provider") || "auto").trim();
    const imageFile = formData.get("image");

    if (!prompt) {
      return jsonResponse(
        {
          success: false,
          error: "Prompt wajib diisi."
        },
        400
      );
    }

    if (!imageFile || typeof imageFile === "string") {
      return jsonResponse(
        {
          success: false,
          error: "File gambar wajib diupload."
        },
        400
      );
    }

    if (!imageFile.type?.startsWith("image/")) {
      return jsonResponse(
        {
          success: false,
          error: "File harus berupa gambar."
        },
        400
      );
    }

    if (!["auto", "gemini"].includes(provider)) {
      return jsonResponse(
        {
          success: false,
          error:
            "Fitur edit gambar saat ini hanya support Gemini atau Auto."
        },
        400
      );
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const imageBase64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = imageFile.type || "image/png";

    const result = await editWithGemini({
      prompt,
      imageBase64,
      mimeType
    });

    if (!result.ok) {
      return jsonResponse(
        {
          success: false,
          error: result.error
        },
        400
      );
    }

    return jsonResponse({
      success: true,
      edited: true,
      provider: result.provider,
      image: result.image,
      mimeType: result.mimeType,
      text: result.text || "Berhasil mengedit gambar."
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error?.message || "Terjadi error saat edit gambar."
      },
      500
    );
  }
}