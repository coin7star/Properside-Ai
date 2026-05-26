export const runtime = "edge";
export const dynamic = "force-dynamic";

function getGeminiImageUrl() {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function getFalModel() {
  return process.env.FAL_IMAGE_MODEL || "fal-ai/flux/schnell";
}

function getHuggingFaceModel() {
  return process.env.HF_IMAGE_MODEL || "ByteDance/Hyper-SD";
}

function getDefaultImageProvider() {
  return (process.env.IMAGE_PROVIDER || "auto").toLowerCase();
}

function normalizeProvider(provider) {
  const value = String(provider || "").toLowerCase().trim();

  if (value === "gemini") return "gemini";
  if (value === "fal") return "fal";
  if (value === "huggingface") return "huggingface";
  if (value === "hf") return "huggingface";

  return "auto";
}

function cleanGeminiError(message = "") {
  const lower = message.toLowerCase();

  if (
    lower.includes("quota") ||
    lower.includes("exceeded") ||
    lower.includes("limit")
  ) {
    return "Quota Gemini Image kamu habis / belum aktif untuk model ini.";
  }

  if (
    lower.includes("api key") ||
    lower.includes("permission") ||
    lower.includes("unauthorized")
  ) {
    return "GEMINI_API_KEY salah, belum aktif, atau tidak punya izin untuk model image.";
  }

  if (lower.includes("not found") || lower.includes("model")) {
    return "Model Gemini Image tidak tersedia untuk API key ini.";
  }

  return message || "Gagal generate gambar dari Gemini.";
}

function cleanFalError(message = "") {
  const lower = message.toLowerCase();

  if (
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("api key") ||
    lower.includes("credentials")
  ) {
    return "FAL_KEY salah, belum aktif, atau belum diatur di environment.";
  }

  if (
    lower.includes("quota") ||
    lower.includes("limit") ||
    lower.includes("insufficient") ||
    lower.includes("billing") ||
    lower.includes("saldo")
  ) {
    return "Quota / saldo fal.ai kamu tidak cukup atau limit habis.";
  }

  if (lower.includes("model")) {
    return "Model fal.ai tidak tersedia. Coba cek FAL_IMAGE_MODEL.";
  }

  return message || "Gagal generate gambar dari fal.ai.";
}

function cleanHuggingFaceError(message = "") {
  const lower = message.toLowerCase();

  if (
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("token") ||
    lower.includes("authorization") ||
    lower.includes("permission")
  ) {
    return "HF_TOKEN salah, belum aktif, atau belum punya izin Inference Providers.";
  }

  if (
    lower.includes("quota") ||
    lower.includes("limit") ||
    lower.includes("billing") ||
    lower.includes("insufficient") ||
    lower.includes("exceeded")
  ) {
    return "Quota / limit Hugging Face kamu habis atau belum aktif.";
  }

  if (
    lower.includes("loading") ||
    lower.includes("currently loading")
  ) {
    return "Model Hugging Face sedang loading. Coba ulang beberapa saat lagi.";
  }

  if (
    lower.includes("not found") ||
    lower.includes("model")
  ) {
    return "Model Hugging Face tidak tersedia. Coba ganti HF_IMAGE_MODEL.";
  }

  return message || "Gagal generate gambar dari Hugging Face.";
}

function isQuotaError(message = "") {
  const lower = message.toLowerCase();

  return (
    lower.includes("quota") ||
    lower.includes("exceeded") ||
    lower.includes("limit") ||
    lower.includes("billing") ||
    lower.includes("insufficient")
  );
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  return btoa(binary);
}

function extractErrorMessage(rawText) {
  if (!rawText) return "";

  try {
    const data = JSON.parse(rawText);

    if (typeof data?.error === "string") return data.error;
    if (typeof data?.message === "string") return data.message;
    if (typeof data?.detail === "string") return data.detail;

    if (Array.isArray(data?.detail)) {
      return data.detail
        .map((item) => item?.msg || item?.message || JSON.stringify(item))
        .join(", ");
    }

    return JSON.stringify(data);
  } catch {
    return rawText;
  }
}

async function imageUrlToBase64(imageUrl) {
  const res = await fetch(imageUrl, {
    method: "GET",
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error("Gagal mengambil gambar dari URL hasil generate.");
  }

  const mimeType = res.headers.get("content-type") || "image/png";
  const buffer = await res.arrayBuffer();

  return {
    base64: arrayBufferToBase64(buffer),
    mimeType
  };
}

async function generateWithGemini(prompt, apiKey) {
  const geminiRes = await fetch(`${getGeminiImageUrl()}?key=${apiKey}`, {
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
              text: prompt
            }
          ]
        }
      ]
    })
  });

  const rawText = await geminiRes.text();
  let data = null;

  try {
    data = JSON.parse(rawText);
  } catch {
    data = null;
  }

  if (!geminiRes.ok) {
    const rawMessage =
      data?.error?.message ||
      extractErrorMessage(rawText) ||
      "Gagal menghubungi Gemini API.";

    return {
      success: false,
      error: cleanGeminiError(rawMessage),
      rawError: rawMessage,
      isQuota: isQuotaError(rawMessage),
      provider: "gemini"
    };
  }

  const parts =
    data?.candidates?.flatMap(
      (candidate) => candidate?.content?.parts || []
    ) || [];

  const imagePart = parts.find((part) => part?.inlineData?.data);
  const textPart = parts.find((part) => part?.text)?.text || "";

  if (!imagePart?.inlineData?.data) {
    return {
      success: false,
      error:
        "Gemini tidak mengembalikan gambar. Coba prompt lain atau cek akses model image.",
      rawError: "No inlineData returned from Gemini.",
      isQuota: false,
      provider: "gemini"
    };
  }

  return {
    success: true,
    image: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
    text: textPart || "Gambar berhasil dibuat memakai Gemini Image.",
    provider: "gemini"
  };
}

async function generateWithFal(prompt, falKey) {
  const model = getFalModel();

  const falRes = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt,
      image_size: "square_hd",
      num_images: 1,
      enable_safety_checker: true,
      output_format: "png"
    })
  });

  const rawText = await falRes.text();
  let data = null;

  try {
    data = JSON.parse(rawText);
  } catch {
    data = null;
  }

  if (!falRes.ok) {
    const rawMessage =
      data?.detail ||
      data?.error ||
      data?.message ||
      extractErrorMessage(rawText) ||
      "Gagal menghubungi fal.ai.";

    return {
      success: false,
      error: cleanFalError(String(rawMessage)),
      rawError: rawMessage,
      isQuota: isQuotaError(String(rawMessage)),
      provider: "fal"
    };
  }

  const imageUrl = data?.images?.[0]?.url || data?.image?.url || data?.url || "";

  if (!imageUrl) {
    return {
      success: false,
      error: "fal.ai tidak mengembalikan URL gambar.",
      rawError: data || rawText,
      isQuota: false,
      provider: "fal"
    };
  }

  const imageData = await imageUrlToBase64(imageUrl);

  return {
    success: true,
    image: imageData.base64,
    mimeType:
      data?.images?.[0]?.content_type || imageData.mimeType || "image/png",
    text: "Gambar berhasil dibuat memakai fal.ai.",
    provider: "fal",
    imageUrl
  };
}

async function generateWithHuggingFace(prompt, hfToken) {
  const model = getHuggingFaceModel();

  const hfRes = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
        Accept: "image/png"
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          width: 768,
          height: 768,
          num_inference_steps: 4
        },
        options: {
          wait_for_model: true
        }
      })
    }
  );

  const contentType = hfRes.headers.get("content-type") || "";

  if (!hfRes.ok) {
    const rawText = await hfRes.text();
    const rawMessage =
      extractErrorMessage(rawText) ||
      "Gagal menghubungi Hugging Face.";

    return {
      success: false,
      error: cleanHuggingFaceError(String(rawMessage)),
      rawError: rawMessage,
      isQuota: isQuotaError(String(rawMessage)),
      provider: "huggingface"
    };
  }

  if (!contentType.startsWith("image/")) {
    const rawText = await hfRes.text();
    const rawMessage =
      extractErrorMessage(rawText) ||
      "Hugging Face tidak mengembalikan gambar.";

    return {
      success: false,
      error: cleanHuggingFaceError(String(rawMessage)),
      rawError: rawMessage,
      isQuota: false,
      provider: "huggingface"
    };
  }

  const buffer = await hfRes.arrayBuffer();

  return {
    success: true,
    image: arrayBufferToBase64(buffer),
    mimeType: contentType || "image/png",
    text: "Gambar berhasil dibuat memakai Hugging Face.",
    provider: "huggingface"
  };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const prompt = body?.prompt;
    const requestedProvider = normalizeProvider(
      body?.provider || getDefaultImageProvider()
    );

    if (!prompt || !prompt.trim()) {
      return Response.json(
        {
          success: false,
          error: "Prompt wajib diisi."
        },
        { status: 400 }
      );
    }

    const finalPrompt = prompt.trim();

    const geminiKey = process.env.GEMINI_API_KEY;
    const falKey = process.env.FAL_KEY;
    const hfToken = process.env.HF_TOKEN;

    if (requestedProvider === "gemini") {
      if (!geminiKey) {
        return Response.json(
          {
            success: false,
            error: "GEMINI_API_KEY belum diatur di environment."
          },
          { status: 500 }
        );
      }

      const geminiResult = await generateWithGemini(finalPrompt, geminiKey);

      if (geminiResult.success) {
        return Response.json(geminiResult);
      }

      return Response.json(
        {
          success: false,
          error: geminiResult.error,
          rawError: geminiResult.rawError,
          provider: "gemini"
        },
        { status: 500 }
      );
    }

    if (requestedProvider === "fal") {
      if (!falKey) {
        return Response.json(
          {
            success: false,
            error: "FAL_KEY belum diatur di environment."
          },
          { status: 500 }
        );
      }

      const falResult = await generateWithFal(finalPrompt, falKey);

      if (falResult.success) {
        return Response.json(falResult);
      }

      return Response.json(
        {
          success: false,
          error: falResult.error,
          rawError: falResult.rawError,
          provider: "fal"
        },
        { status: 500 }
      );
    }

    if (requestedProvider === "huggingface") {
      if (!hfToken) {
        return Response.json(
          {
            success: false,
            error: "HF_TOKEN belum diatur di environment."
          },
          { status: 500 }
        );
      }

      const hfResult = await generateWithHuggingFace(finalPrompt, hfToken);

      if (hfResult.success) {
        return Response.json(hfResult);
      }

      return Response.json(
        {
          success: false,
          error: hfResult.error,
          rawError: hfResult.rawError,
          provider: "huggingface"
        },
        { status: 500 }
      );
    }

    if (geminiKey) {
      const geminiResult = await generateWithGemini(finalPrompt, geminiKey);

      if (geminiResult.success) {
        return Response.json(geminiResult);
      }
    }

    if (hfToken) {
      const hfResult = await generateWithHuggingFace(finalPrompt, hfToken);

      if (hfResult.success) {
        return Response.json({
          ...hfResult,
          text:
            "Gambar berhasil dibuat memakai Hugging Face. Mode Auto memindahkan generate ke Hugging Face."
        });
      }
    }

    if (falKey) {
      const falResult = await generateWithFal(finalPrompt, falKey);

      if (falResult.success) {
        return Response.json({
          ...falResult,
          text:
            "Gambar berhasil dibuat memakai fal.ai. Mode Auto memindahkan generate ke fal.ai."
        });
      }
    }

    return Response.json(
      {
        success: false,
        error:
          "Semua provider gagal atau belum ada API key image. Isi GEMINI_API_KEY, HF_TOKEN, atau FAL_KEY."
      },
      { status: 500 }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Terjadi error pada route image."
      },
      { status: 500 }
    );
  }
}