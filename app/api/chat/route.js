import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_CHAT_IMAGE_SIZE = 4 * 1024 * 1024;
const MAX_CHAT_IMAGES = 5;
const CHAT_IMAGE_BUCKET = "chat-images";

const ALLOWED_CHAT_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
];

const ALLOWED_TEXT_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b"
];

const DEFAULT_TEXT_MODEL = "llama-3.1-8b-instant";
const DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

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

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diatur."
    );
  }

  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    serviceRoleKey
  };
}

function jsonResponse(data, status = 200) {
  return Response.json(data, { status });
}

function getImageExt(mimeType = "image/png") {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

function safeFileName(text = "file") {
  return String(text)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
}

function safeEmailFolder(email = "user") {
  return String(email).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizeTextModel(model) {
  const selected = String(model || "").trim();

  if (ALLOWED_TEXT_MODELS.includes(selected)) {
    return selected;
  }

  if (ALLOWED_TEXT_MODELS.includes(process.env.GROQ_MODEL)) {
    return process.env.GROQ_MODEL;
  }

  return DEFAULT_TEXT_MODEL;
}

function validateImageFile(file) {
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    throw new Error("File gambar tidak valid.");
  }

  if (!ALLOWED_CHAT_IMAGE_TYPES.includes(file.type)) {
    throw new Error("File harus berupa gambar JPG, PNG, atau WEBP.");
  }

  if (file.size > MAX_CHAT_IMAGE_SIZE) {
    throw new Error("Ukuran gambar terlalu besar. Maksimal 4MB per gambar.");
  }

  return {
    file,
    mimeType: file.type || "image/png",
    size: file.size,
    name: file.name || "uploaded-image"
  };
}

async function uploadChatImageToStorage({
  supabase,
  file,
  user_email,
  session_id,
  storage_file_id,
  index
}) {
  const { supabaseUrl } = getSupabaseConfig();

  const ext = getImageExt(file.type);
  const emailFolder = safeEmailFolder(user_email);
  const originalName = safeFileName(file.name || `chat-image-${index}.${ext}`);

  const storagePath = `${emailFolder}/${session_id}/${storage_file_id}-${index}-${Date.now()}-${originalName}`;

  const buffer = await file.arrayBuffer();

  const { data, error } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "image/png",
      upsert: false
    });

  if (error) {
    throw new Error(
      "Gagal upload gambar chat ke Supabase Storage: " + error.message
    );
  }

  return {
    image_url: `${supabaseUrl}/storage/v1/object/public/${CHAT_IMAGE_BUCKET}/${data.path}`,
    image_storage_path: data.path,
    name: file.name || `chat-image-${index}.${ext}`,
    mimeType: file.type || "image/png",
    size: file.size
  };
}

async function parseChatRequest(req) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();

    const message = String(formData.get("message") || "").trim();
    const user_email = String(formData.get("user_email") || "").trim();
    const sessionIdRaw = String(formData.get("session_id") || "").trim();
    const selectedModel = String(formData.get("selected_model") || "").trim();

    const imageFiles = [];

    const multiImages = formData.getAll("images");
    const oldSingleImage = formData.get("image");

    for (const item of multiImages) {
      if (item && typeof item === "object" && "arrayBuffer" in item) {
        imageFiles.push(validateImageFile(item));
      }
    }

    if (
      oldSingleImage &&
      typeof oldSingleImage === "object" &&
      "arrayBuffer" in oldSingleImage &&
      imageFiles.length === 0
    ) {
      imageFiles.push(validateImageFile(oldSingleImage));
    }

    if (imageFiles.length > MAX_CHAT_IMAGES) {
      throw new Error(`Maksimal ${MAX_CHAT_IMAGES} gambar sekali kirim.`);
    }

    return {
      message,
      user_email,
      session_id: sessionIdRaw || null,
      selected_model: selectedModel || null,
      imageFiles
    };
  }

  const body = await req.json();

  return {
    message: String(body?.message || "").trim(),
    user_email: String(body?.user_email || "").trim(),
    session_id: body?.session_id || null,
    selected_model: body?.selected_model || null,
    imageFiles: []
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
    return "Groq gagal membaca gambar. Pastikan format JPG/PNG/WEBP dan ukuran maksimal 4MB per gambar.";
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
    return "Model Groq tidak tersedia atau nama model salah.";
  }

  return text;
}

function makeSystemPrompt(hasImage) {
  if (hasImage) {
    return [
      "Kamu adalah Properside AI.",
      "Jawab dalam bahasa Indonesia yang jelas, ramah, dan mudah dipahami pemula.",
      "User bisa mengirim satu atau banyak screenshot, tampilan web, UI, kode, atau gambar lain.",
      "Analisis semua gambar yang dikirim dengan teliti.",
      "Kalau ada beberapa gambar, bandingkan urutannya dan jelaskan perbedaan atau hubungan antar gambar.",
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

function buildGroqMessages({
  memoryMessages,
  currentStoredContent,
  uploadedImages
}) {
  const hasImage = uploadedImages.length > 0;

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
        ...uploadedImages.map((item) => ({
          type: "image_url",
          image_url: {
            url: item.image_url
          }
        }))
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
    const imageFiles = parsedReq.imageFiles || [];
    const selectedTextModel = normalizeTextModel(parsedReq.selected_model);

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

    const hasImage = imageFiles.length > 0;

    const visionModel =
      process.env.GROQ_VISION_MODEL || DEFAULT_VISION_MODEL;

    const selectedModel = hasImage ? visionModel : selectedTextModel;

    const imageInfoText = hasImage
      ? imageFiles
          .map((item, index) => {
            return `Gambar ${index + 1}: ${item.name}, ${item.mimeType}, ukuran ${(
              item.size /
              1024 /
              1024
            ).toFixed(2)}MB`;
          })
          .join("\n")
      : "";

    const currentStoredContent = hasImage
      ? `${message}

[User mengirim ${imageFiles.length} gambar untuk dianalisis.]
${imageInfoText}`
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
        return jsonResponse(
          {
            reply: "Gagal membuat session chat.",
            detail: sessionError.message
          },
          500
        );
      }

      session_id = sessionData.id;
    }

    const storageFileId = crypto.randomUUID();

    const uploadedImages = [];

    if (hasImage) {
      for (let i = 0; i < imageFiles.length; i += 1) {
        const item = imageFiles[i];

        const uploaded = await uploadChatImageToStorage({
          supabase,
          file: item.file,
          user_email,
          session_id,
          storage_file_id: storageFileId,
          index: i + 1
        });

        uploadedImages.push(uploaded);
      }
    }

    const imageUrls = uploadedImages.map((item) => item.image_url);
    const imageStoragePaths = uploadedImages.map(
      (item) => item.image_storage_path
    );

    const { error: insertUserMessageError } = await supabase
      .from("chat_messages")
      .insert({
        session_id,
        user_email,
        role: "user",
        content: currentStoredContent,
        image_url: imageUrls[0] || null,
        image_storage_path: imageStoragePaths[0] || null,
        image_urls: imageUrls,
        image_storage_paths: imageStoragePaths
      });

    if (insertUserMessageError) {
      return jsonResponse(
        {
          reply:
            "Gagal menyimpan chat user ke database: " +
            insertUserMessageError.message,
          session_id,
          image_url: imageUrls[0] || null,
          image_urls: imageUrls
        },
        500
      );
    }

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
      uploadedImages
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
          max_tokens: hasImage ? 1800 : 1400
        })
      }
    );

    const data = await groqResponse.json().catch(() => ({}));

    if (!groqResponse.ok) {
      return jsonResponse(
        {
          reply: cleanGroqError(data),
          detail: data,
          session_id,
          image_url: imageUrls[0] || null,
          image_urls: imageUrls,
          model: selectedModel
        },
        500
      );
    }

    const aiText =
      data?.choices?.[0]?.message?.content || "AI tidak memberikan jawaban.";

    const { error: insertAiMessageError } = await supabase
      .from("chat_messages")
      .insert({
        session_id,
        user_email,
        role: "ai",
        content: aiText
      });

    if (insertAiMessageError) {
      return jsonResponse(
        {
          reply:
            aiText +
            "\n\nCatatan: Jawaban AI berhasil dibuat, tapi gagal menyimpan jawaban ke history: " +
            insertAiMessageError.message,
          session_id,
          used_image: hasImage,
          image_url: imageUrls[0] || null,
          image_urls: imageUrls,
          model: selectedModel
        },
        200
      );
    }

    return jsonResponse({
      reply: aiText,
      session_id,
      used_image: hasImage,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      image_storage_paths: imageStoragePaths,
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