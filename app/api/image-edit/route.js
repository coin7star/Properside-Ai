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

function normalizeProvider(provider) {
  const value = String(provider || "auto").toLowerCase().trim();

  if (value === "gemini") return "gemini";
  if (value === "huggingface") return "huggingface";
  if (value === "hf") return "huggingface";

  return "auto";
}

function getGeminiEditModel() {
  return process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
}

function getHuggingFaceEditModel() {
  return process.env.HF_EDIT_IMAGE_MODEL || "timbrooks/instruct-pix2pix";
}

function cleanGeminiEditError(message = "") {
  const lower = String(message || "").toLowerCase();

  if (
    lower.includes("not found") ||
    lower.includes("not supported") ||
    lower.includes("model")
  ) {
    return "Model Gemini Image tidak tersedia untuk API key ini. Coba set GEMINI_IMAGE_MODEL=gemini-2.5-flash-image di Cloudflare ENV.";
  }

  if (
    lower.includes("quota") ||
    lower.includes("exceeded") ||
    lower.includes("limit") ||
    lower.includes("billing")
  ) {
    return "Quota Gemini Image kamu habis atau fitur image belum aktif di API key ini.";
  }

  if (
    lower.includes("api key") ||
    lower.includes("permission") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  ) {
    return "GEMINI_API_KEY salah, belum aktif, atau belum punya akses Gemini Image.";
  }

  return message || "Gagal edit gambar dengan Gemini.";
}

function cleanHuggingFaceEditError(message = "") {
  const lower = String(message || "").toLowerCase();

  if (
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("token") ||
    lower.includes("authorization") ||
    lower.includes("permission")
  ) {
    return "HF_TOKEN salah, belum aktif, atau belum punya akses Inference Provider.";
  }

  if (
    lower.includes("quota") ||
    lower.includes("limit") ||
    lower.includes("billing") ||
    lower.includes("exceeded") ||
    lower.includes("insufficient")
  ) {
    return "Quota / credit Hugging Face kamu habis atau belum aktif.";
  }

  if (
    lower.includes("not found") ||
    lower.includes("model") ||
    lower.includes("does not exist")
  ) {
    return "Model HF edit image tidak tersedia. Coba set HF_EDIT_IMAGE_MODEL=timbrooks/instruct-pix2pix.";
  }

  if (
    lower.includes("loading") ||
    lower.includes("currently loading")
  ) {
    return "Model Hugging Face sedang loading. Coba ulang beberapa saat lagi.";
  }

  if (
    lower.includes("unsupported") ||
    lower.includes("task") ||
    lower.includes("pipeline")
  ) {
    return "Model Hugging Face ini belum support image edit lewat API. Coba model edit lain.";
  }

  if (
    lower.includes("1016") ||
    lower.includes("dns") ||
    lower.includes("origin")
  ) {
    return "Endpoint Hugging Face tidak bisa diakses dari Cloudflare saat ini.";
  }

  return message || "Gagal edit gambar dengan Hugging Face.";
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

      if (part?.inline_data?.data) {
        image = part.inline_data.data;
        mimeType = part.inline_data.mime_type || "image/png";
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
  const model = getGeminiEditModel();

  if (!apiKey) {
    return {
      ok: false,
      error: "GEMINI_API_KEY belum diatur di Cloudflare."
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Edit gambar ini sesuai instruksi user. Pertahankan objek utama dari gambar asli jika masih relevan. Instruksi user: ${prompt}`
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

  const rawText = await response.text();
  let result = null;

  try {
    result = JSON.parse(rawText);
  } catch {
    result = null;
  }

  if (!response.ok) {
    const rawMessage =
      result?.error?.message ||
      rawText ||
      "Gagal edit gambar dengan Gemini.";

    return {
      ok: false,
      error: cleanGeminiEditError(rawMessage),
      rawError: rawMessage,
      provider: "gemini"
    };
  }

  const extracted = extractGeminiResult(result);

  if (!extracted.image) {
    return {
      ok: false,
      error:
        "Gemini tidak mengembalikan hasil gambar. Coba prompt lain atau cek quota Gemini Image.",
      rawError: result,
      provider: "gemini"
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

async function callHuggingFaceRouterJson({
  prompt,
  imageBase64,
  mimeType,
  hfToken
}) {
  const model = getHuggingFaceEditModel();

  const response = await fetch(
    `https://router.huggingface.co/hf-inference/models/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
        Accept: "image/png"
      },
      body: JSON.stringify({
        inputs: {
          prompt,
          image: `data:${mimeType};base64,${imageBase64}`
        },
        parameters: {
          image_guidance_scale: 1.5,
          guidance_scale: 7.5,
          num_inference_steps: 20
        },
        options: {
          wait_for_model: true
        }
      })
    }
  );

  return response;
}

async function callHuggingFaceLegacyJson({
  prompt,
  imageBase64,
  mimeType,
  hfToken
}) {
  const model = getHuggingFaceEditModel();

  const response = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
        Accept: "image/png"
      },
      body: JSON.stringify({
        inputs: {
          prompt,
          image: `data:${mimeType};base64,${imageBase64}`
        },
        parameters: {
          image_guidance_scale: 1.5,
          guidance_scale: 7.5,
          num_inference_steps: 20
        },
        options: {
          wait_for_model: true
        }
      })
    }
  );

  return response;
}

async function callHuggingFaceFormData({ prompt, imageFile, hfToken }) {
  const model = getHuggingFaceEditModel();

  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append("image", imageFile);
  formData.append("image_guidance_scale", "1.5");
  formData.append("guidance_scale", "7.5");
  formData.append("num_inference_steps", "20");

  const response = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        Accept: "image/png"
      },
      body: formData
    }
  );

  return response;
}

async function parseHuggingFaceImageResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    const rawText = await response.text();
    const rawMessage =
      extractErrorMessage(rawText) ||
      `Hugging Face error status ${response.status}`;

    return {
      ok: false,
      error: cleanHuggingFaceEditError(rawMessage),
      rawError: rawMessage
    };
  }

  if (!contentType.startsWith("image/")) {
    const rawText = await response.text();
    const rawMessage =
      extractErrorMessage(rawText) ||
      "Hugging Face tidak mengembalikan gambar.";

    return {
      ok: false,
      error: cleanHuggingFaceEditError(rawMessage),
      rawError: rawMessage
    };
  }

  const buffer = await response.arrayBuffer();

  return {
    ok: true,
    image: arrayBufferToBase64(buffer),
    mimeType: contentType || "image/png",
    text: "Berhasil mengedit gambar memakai Hugging Face.",
    provider: "huggingface"
  };
}

async function editWithHuggingFace({
  prompt,
  imageBase64,
  mimeType,
  imageFile
}) {
  const hfToken = process.env.HF_TOKEN;

  if (!hfToken) {
    return {
      ok: false,
      error: "HF_TOKEN belum diatur di Cloudflare.",
      provider: "huggingface"
    };
  }

  const attempts = [
    {
      name: "router-json",
      run: () =>
        callHuggingFaceRouterJson({
          prompt,
          imageBase64,
          mimeType,
          hfToken
        })
    },
    {
      name: "legacy-json",
      run: () =>
        callHuggingFaceLegacyJson({
          prompt,
          imageBase64,
          mimeType,
          hfToken
        })
    },
    {
      name: "form-data",
      run: () =>
        callHuggingFaceFormData({
          prompt,
          imageFile,
          hfToken
        })
    }
  ];

  const errors = [];

  for (const attempt of attempts) {
    try {
      const response = await attempt.run();
      const parsed = await parseHuggingFaceImageResponse(response);

      if (parsed.ok) {
        return parsed;
      }

      errors.push(`${attempt.name}: ${parsed.rawError || parsed.error}`);
    } catch (error) {
      errors.push(`${attempt.name}: ${error?.message || "fetch failed"}`);
    }
  }

  const finalError = errors.join(" | ");

  return {
    ok: false,
    error: cleanHuggingFaceEditError(finalError),
    rawError: finalError,
    provider: "huggingface"
  };
}

export async function POST(req) {
  try {
    const formData = await req.formData();

    const prompt = String(formData.get("prompt") || "").trim();
    const provider = normalizeProvider(formData.get("provider") || "auto");
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

    const arrayBuffer = await imageFile.arrayBuffer();
    const imageBase64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = imageFile.type || "image/png";

    if (provider === "huggingface") {
      const hfResult = await editWithHuggingFace({
        prompt,
        imageBase64,
        mimeType,
        imageFile
      });

      if (hfResult.ok) {
        return jsonResponse({
          success: true,
          edited: true,
          provider: hfResult.provider,
          image: hfResult.image,
          mimeType: hfResult.mimeType,
          text: hfResult.text || "Berhasil mengedit gambar."
        });
      }

      return jsonResponse(
        {
          success: false,
          error: hfResult.error,
          rawError: hfResult.rawError || ""
        },
        400
      );
    }

    if (provider === "gemini") {
      const geminiResult = await editWithGemini({
        prompt,
        imageBase64,
        mimeType
      });

      if (geminiResult.ok) {
        return jsonResponse({
          success: true,
          edited: true,
          provider: geminiResult.provider,
          image: geminiResult.image,
          mimeType: geminiResult.mimeType,
          text: geminiResult.text || "Berhasil mengedit gambar."
        });
      }

      return jsonResponse(
        {
          success: false,
          error: geminiResult.error,
          rawError: geminiResult.rawError || ""
        },
        400
      );
    }

    const hfToken = process.env.HF_TOKEN;

    if (hfToken) {
      const hfResult = await editWithHuggingFace({
        prompt,
        imageBase64,
        mimeType,
        imageFile
      });

      if (hfResult.ok) {
        return jsonResponse({
          success: true,
          edited: true,
          provider: hfResult.provider,
          image: hfResult.image,
          mimeType: hfResult.mimeType,
          text:
            "Berhasil mengedit gambar memakai Hugging Face. Mode Auto memilih Hugging Face."
        });
      }
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (geminiKey) {
      const geminiResult = await editWithGemini({
        prompt,
        imageBase64,
        mimeType
      });

      if (geminiResult.ok) {
        return jsonResponse({
          success: true,
          edited: true,
          provider: geminiResult.provider,
          image: geminiResult.image,
          mimeType: geminiResult.mimeType,
          text:
            "Berhasil mengedit gambar memakai Gemini. Mode Auto memilih Gemini."
        });
      }
    }

    return jsonResponse(
      {
        success: false,
        error:
          "Semua provider edit gambar gagal. Coba pilih Hugging Face atau cek HF_EDIT_IMAGE_MODEL."
      },
      400
    );
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