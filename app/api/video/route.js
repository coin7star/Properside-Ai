import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const PIAPI_BASE_URL = process.env.PIAPI_BASE_URL || "https://api.piapi.ai";
const PIAPI_TASK_ENDPOINT = process.env.PIAPI_TASK_ENDPOINT || "/api/v1/task";
const VIDEO_INPUT_BUCKET = process.env.VIDEO_INPUT_BUCKET || "video-inputs";

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getPiapiHeaders() {
  const key = process.env.PIAPI_API_KEY;

  if (!key) {
    throw new Error("PIAPI_API_KEY belum diisi di environment.");
  }

  return {
    "Content-Type": "application/json",
    "x-api-key": key
  };
}

function getTaskId(data) {
  return (
    data?.data?.task_id ||
    data?.data?.id ||
    data?.task_id ||
    data?.id ||
    data?.result?.task_id ||
    data?.result?.id ||
    ""
  );
}

function getStatus(data) {
  return (
    data?.data?.status ||
    data?.status ||
    data?.result?.status ||
    data?.data?.state ||
    data?.state ||
    "unknown"
  );
}

function getVideoUrl(data) {
  return (
    data?.data?.output?.video_url ||
    data?.data?.output?.url ||
    data?.data?.video_url ||
    data?.data?.url ||
    data?.result?.video_url ||
    data?.result?.url ||
    data?.output?.video_url ||
    data?.output?.url ||
    ""
  );
}

function normalizePiapiTask(data) {
  return {
    raw: data,
    task_id: getTaskId(data),
    status: getStatus(data),
    video_url: getVideoUrl(data)
  };
}

async function uploadInputImageToSupabase({ file, user_email }) {
  const supabase = getSupabaseAdmin();

  const ext =
    file.type?.includes("png")
      ? "png"
      : file.type?.includes("webp")
      ? "webp"
      : "jpg";

  const safeEmail = String(user_email || "user").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${safeEmail}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(VIDEO_INPUT_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: false
    });

  if (uploadError) {
    throw new Error(
      `Gagal upload gambar ke Supabase Storage bucket "${VIDEO_INPUT_BUCKET}": ${uploadError.message}`
    );
  }

  const { data } = supabase.storage.from(VIDEO_INPUT_BUCKET).getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error("Gagal membuat public URL gambar input.");
  }

  return data.publicUrl;
}

async function createKlingImageToVideoTask({ prompt, image_url, duration, aspect_ratio, model }) {
  const url = `${PIAPI_BASE_URL}${PIAPI_TASK_ENDPOINT}`;

  /*
    Catatan:
    PiAPI biasanya memakai endpoint task.
    Kalau dashboard PiAPI kamu punya format body berbeda, cukup edit bagian body ini.
  */
  const body = {
    model: model || "kling",
    task_type: "image_to_video",
    input: {
      prompt,
      image_url,
      duration: duration || "5",
      aspect_ratio: aspect_ratio || "16:9"
    },
    config: {
      service_mode: "public"
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: getPiapiHeaders(),
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.message || data?.error || "PiAPI gagal membuat task video.",
      detail: data
    };
  }

  return {
    ok: true,
    ...normalizePiapiTask(data)
  };
}

async function checkKlingTask(task_id) {
  const url = `${PIAPI_BASE_URL}${PIAPI_TASK_ENDPOINT}/${encodeURIComponent(task_id)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getPiapiHeaders()
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.message || data?.error || "PiAPI gagal cek status task.",
      detail: data
    };
  }

  return {
    ok: true,
    ...normalizePiapiTask(data)
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const task_id = searchParams.get("task_id");

    if (!task_id) {
      return Response.json(
        { success: false, error: "task_id wajib ada." },
        { status: 400 }
      );
    }

    const result = await checkKlingTask(task_id);

    return Response.json({
      success: result.ok,
      ...result
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let prompt = "";
    let user_email = "";
    let image_url = "";
    let duration = "5";
    let aspect_ratio = "16:9";
    let model = "kling";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      prompt = String(formData.get("prompt") || "");
      user_email = String(formData.get("user_email") || "");
      image_url = String(formData.get("image_url") || "");
      duration = String(formData.get("duration") || "5");
      aspect_ratio = String(formData.get("aspect_ratio") || "16:9");
      model = String(formData.get("model") || "kling");

      const file = formData.get("image");

      if (!image_url && file && typeof file === "object" && file.size > 0) {
        image_url = await uploadInputImageToSupabase({
          file,
          user_email
        });
      }
    } else {
      const body = await req.json();

      prompt = String(body?.prompt || "");
      user_email = String(body?.user_email || "");
      image_url = String(body?.image_url || "");
      duration = String(body?.duration || "5");
      aspect_ratio = String(body?.aspect_ratio || "16:9");
      model = String(body?.model || "kling");
    }

    if (!user_email) {
      return Response.json(
        { success: false, error: "User belum login." },
        { status: 401 }
      );
    }

    if (!prompt.trim()) {
      return Response.json(
        { success: false, error: "Prompt video wajib diisi." },
        { status: 400 }
      );
    }

    if (!image_url) {
      return Response.json(
        { success: false, error: "Gambar wajib diupload atau image_url wajib ada." },
        { status: 400 }
      );
    }

    const task = await createKlingImageToVideoTask({
      prompt: prompt.trim(),
      image_url,
      duration,
      aspect_ratio,
      model
    });

    return Response.json({
      success: task.ok,
      prompt: prompt.trim(),
      source_image_url: image_url,
      duration,
      aspect_ratio,
      model,
      ...task
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
