import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_CHAT_IMAGE_SIZE = 4 * 1024 * 1024;

const ALLOWED_CHAT_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
];

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diatur."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function jsonResponse(data, status = 200) {
  return Response.json(data, { status });
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

async function imageFileToDataUrl(file) {
  if (!file) return null;

  if (!ALLOWED_CHAT_IMAGE_TYPES.includes(file.type)) {
    throw new Error("File harus berupa gambar JPG, PNG, atau WEBP.");
  }

  if (file.size > MAX_CHAT_IMAGE_SIZE) {
    throw new Error("Ukuran gambar terlalu besar. Maksimal 4MB.");
  }

  const buffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const mimeType = file.type || "image/png";

  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
    size: file.size,
    name: file.name || "uploaded-image"
  };
}

async function parseChatRequest(req) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();

    const message = String(formData.get("message") || "").trim();
    const user_email = String(formData.get("user_email") || "").trim();
    const sessionIdRaw = String(formData.get("session_id") || "").trim();

    const imageFile = formData.get("image");
    let imageData = null;

    if (
      imageFile &&
      typeof imageFile === "object" &&
      "arrayBuffer" in imageFile
    ) {
      imageData = await imageFileToDataUrl(imageFile);
    }

    return {
      message,
      user_email,
      session_id: sessionIdRaw || null,
      imageData
    };
  }

  const body = await req.json();

  return {
    message: String(body?.message || "").trim(),
    user_email: String(body?.user_email || "").trim(),
    session_id: body?.session_id || null,
    imageData: null
  };
}

function cleanGroqError(data) {
  const raw =
    data?.error?.message ||
    data?.message ||
    data?.detail ||
    "Groq API error.";

  const text = String(raw);
  const lower = text.toLowerCase();

  if (lower.includes("image")) {
    return "Groq gagal membaca gambar. Pastikan format JPG/PNG/WEBP dan ukuran maksimal 4MB.";
  }

  if (
    lower.includes("rate") ||
    lower.includes("limit") ||
    lower.includes("quota")
  ) {
    return "Limit Groq sedang habis atau terkena rate limit. Coba beberapa saat lagi.";
  }

  if (
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("auth")
  ) {
    return "GROQ_API_KEY tidak valid atau belum diatur.";
  }

  if (lower.includes("model")) {
    return "Model Groq tidak tersedia atau nama model salah. Cek GROQ_MODEL / GROQ_VISION_MODEL.";
  }

  return text;
}

function makeSystemPrompt(hasImage) {
  if (hasImage) {
    return [
      "Kamu adalah Properside AI.",
      "Jawab dalam bahasa Indonesia yang jelas, ramah, dan mudah dipahami pemula.",
      "User bisa mengirim screenshot error, tampilan web, UI, kode, atau gambar lain.",
      "Analisis gambar dengan teliti.",
      "Kalau gambar berisi error coding, jelaskan penyebabnya dan berikan solusi step-by-step.",
      "Kalau gambar berisi tampilan web/UI, berikan saran perbaikan yang praktis.",
      "Kalau user membahas kode/proyek sebelumnya, tetap gunakan konteks session chat yang tersedia.",
      "Kalau perlu memberi kode fix, pakai format FILE, AKSI, KODE FIX."
    ].join(" ");
  }

  return [
    "Kamu adalah Properside AI.",
    "Jawab dalam bahasa Indonesia yang jelas, ramah, dan mudah dipahami pemula.",
    "Kamu WAJIB mengingat konteks percakapan dalam session chat ini.",
    "Kalau user memberi instruksi pendek seperti 'warna merah', 'buat lebih keren', 'tambahkan tombol', 'ubah layout', atau 'lanjutkan', anggap itu merujuk ke pesan/kode/proyek sebelumnya di session yang sama.",
    "Jangan pindah topik kecuali user jelas meminta topik baru.",
    "Kalau user membahas kode sebelumnya, berikan kode fix yang relevan dengan kode sebelumnya."
  ].join(" ");
}

function buildGroqMessages({ memoryMessages, currentStoredContent, imageData }) {
  const hasImage = !!imageData?.dataUrl;

  const contextMessages = (memoryMessages || []).map((msg) => ({
    role: msg.role === "ai" ? "assistant" : "user",
    content: msg.content
  }));

  if (hasImage && contextMessages.length > 0) {
    const lastIndex = contextMessages.length - 1;

    contextMessages[lastIndex] = {
      role: "user",
      content: [
        {
          type: "text",
          text: currentStoredContent
        },
        {
          type: "image_url",
          image_url: {
            url: imageData.dataUrl
          }
        }
      ]
    };
  }

  return [
    {
      role: "system",
      content: makeSystemPrompt(hasImage)
    },
    ...contextMessages
  ];
}

export async function GET(req) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const action = searchParams.get("action");
    const user_email = searchParams.get("user_email");
    const session_id = searchParams.get("session_id");

    if (!user_email) {
      return jsonResponse({ error: "user_email wajib ada." }, 400);
    }

    if (action === "sessions") {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_email", user_email)
        .order("created_at", { ascending: false });

      return jsonResponse({ data, error });
    }

    if (action === "messages") {
      if (!session_id) {
        return jsonResponse({ error: "session_id wajib ada." }, 400);
      }

      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_email", user_email)
        .eq("session_id", session_id)
        .order("created_at", { ascending: true });

      return jsonResponse({ data, error });
    }

    return jsonResponse({ error: "Action tidak dikenal." }, 400);
  } catch (error) {
    return jsonResponse(
      {
        error: error?.message || "Server error."
      },
      500
    );
  }
}

export async function POST(req) {
  try {
    const parsedReq = await parseChatRequest(req);

    const message = parsedReq.message;
    const user_email = parsedReq.user_email;
    let session_id = parsedReq.session_id;
    const imageData = parsedReq.imageData;

    if (!user_email) {
      return jsonResponse({ reply: "User belum login." }, 401);
    }

    if (!message || !message.trim()) {
      return jsonResponse({ reply: "Pesan kosong." }, 400);
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    const supabase = getSupabaseAdmin();

    if (!groqApiKey) {
      return jsonResponse({
        reply: "GROQ_API_KEY belum diisi."
      });
    }

    const hasImage = !!imageData?.dataUrl;

    const textModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

    const visionModel =
      process.env.GROQ_VISION_MODEL ||
      "meta-llama/llama-4-scout-17b-16e-instruct";

    const selectedModel = hasImage ? visionModel : textModel;

    const currentStoredContent = hasImage
      ? `${message}

[User mengirim gambar: ${imageData.name}, ${imageData.mimeType}, ukuran ${(imageData.size / 1024 / 1024).toFixed(
          2
        )}MB. Batas upload gambar AI Chat adalah maksimal 4MB.]`
      : message;

    if (!session_id) {
      const titleSource =
        message.length > 35 ? message.slice(0, 35) + "..." : message;

      const title = hasImage ? `🖼️ ${titleSource}` : titleSource;

      const { data: sessionData, error: sessionError } = await supabase
        .from("chat_sessions")
        .insert({
          user_email,
          title
        })
        .select()
        .single();

      if (sessionError) {
        return jsonResponse({
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
      content: currentStoredContent
    });

    const { data: memoryMessages, error: memoryError } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("session_id", session_id)
      .eq("user_email", user_email)
      .order("created_at", { ascending: true })
      .limit(40);

    if (memoryError) {
      console.error("Memory load error:", memoryError.message);
    }

    const groqMessages = buildGroqMessages({
      memoryMessages,
      currentStoredContent,
      imageData
    });

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: groqMessages,
          temperature: hasImage ? 0.4 : 0.6,
          max_tokens: hasImage ? 1600 : 1400
        })
      }
    );

    const data = await groqResponse.json().catch(() => ({}));

    if (!groqResponse.ok) {
      return jsonResponse(
        {
          reply: cleanGroqError(data),
          detail: data
        },
        500
      );
    }

    const aiText =
      data?.choices?.[0]?.message?.content || "AI tidak memberikan jawaban.";

    await supabase.from("chat_messages").insert({
      session_id,
      user_email,
      role: "ai",
      content: aiText
    });

    return jsonResponse({
      reply: aiText,
      session_id,
      used_image: hasImage,
      model: selectedModel
    });
  } catch (error) {
    return jsonResponse(
      {
        reply: "Server error: " + error.message
      },
      500
    );
  }
}

export async function PATCH(req) {
  try {
    const supabase = getSupabaseAdmin();

    const { session_id, user_email, title } = await req.json();

    if (!session_id || !user_email || !title) {
      return jsonResponse({ error: "Data rename belum lengkap." }, 400);
    }

    const { error } = await supabase
      .from("chat_sessions")
      .update({ title })
      .eq("id", session_id)
      .eq("user_email", user_email);

    return jsonResponse({
      success: !error,
      error
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error?.message || "Gagal rename chat."
      },
      500
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
      return jsonResponse({ error: "Data delete belum lengkap." }, 400);
    }

    const { error } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("id", session_id)
      .eq("user_email", user_email);

    return jsonResponse({
      success: !error,
      error
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error?.message || "Gagal hapus chat."
      },
      500
    );
  }
}