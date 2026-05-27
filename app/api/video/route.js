import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function normalizeDuration(value) {
  const num = Number(value);
  if (num === 10) return 10;
  return 5;
}

function normalizeRatio(value) {
  const ratio = safeText(value, "16:9");
  const allowed = ["16:9", "9:16", "1:1"];
  return allowed.includes(ratio) ? ratio : "16:9";
}

function getVideoUrlFromTask(task) {
  return (
    task?.data?.output?.video_url ||
    task?.data?.output?.video ||
    task?.data?.output?.url ||
    task?.output?.video_url ||
    task?.output?.video ||
    task?.output?.url ||
    task?.result?.video_url ||
    task?.result?.video ||
    task?.result?.url ||
    task?.video_url ||
    task?.video ||
    task?.url ||
    ""
  );
}

function getTaskStatus(task) {
  return (
    task?.data?.status ||
    task?.status ||
    task?.task_status ||
    task?.data?.task_status ||
    "unknown"
  );
}

function getTaskId(task) {
  return task?.data?.task_id || task?.task_id || task?.id || task?.data?.id || "";
}

async function uploadImageToSupabase(file, userEmail) {
  const supabase = getSupabaseAdmin();
  const ext = file?.name?.split(".")?.pop()?.toLowerCase() || "png";
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "png";
  const path = `${encodeURIComponent(userEmail)}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage.from("video-inputs").upload(path, arrayBuffer, {
    contentType: file.type || "image/png",
    upsert: false
  });

  if (error) {
    throw new Error(`Gagal upload gambar ke Supabase Storage: ${error.message}`);
  }

  const { data } = supabase.storage.from("video-inputs").getPublicUrl(path);

  return {
    path,
    url: data?.publicUrl || ""
  };
}

async function createPiapiKlingTask({ imageUrl, prompt, duration, ratio }) {
  const piapiKey = process.env.PIAPI_API_KEY;

  if (!piapiKey) {
    throw new Error("PIAPI_API_KEY belum diisi di Cloudflare ENV.");
  }

  if (!imageUrl) {
    throw new Error("Image URL kosong. Upload gambar dulu.");
  }

  const body = {
    model: "kling",
    task_type: "video_generation",
    input: {
      prompt,
      image_url: imageUrl,
      duration,
      aspect_ratio: ratio,
      mode: "std"
    }
  };

  const res = await fetch("https://api.piapi.ai/api/v1/task", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": piapiKey
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    return {
      success: false,
      error:
        data?.message ||
        data?.error ||
        data?.raw ||
        `PiAPI error status ${res.status}`,
      detail: data,
      sent_body: body
    };
  }

  return {
    success: true,
    data,
    task_id: getTaskId(data),
    status: getTaskStatus(data),
    video_url: getVideoUrlFromTask(data),
    sent_body: body
  };
}

export async function POST(req) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let userEmail = "";
    let prompt = "";
    let duration = 5;
    let ratio = "16:9";
    let imageUrl = "";
    let imageFile = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      userEmail = safeText(formData.get("user_email"));
      prompt = safeText(formData.get("prompt"));
      duration = normalizeDuration(formData.get("duration"));
      ratio = normalizeRatio(formData.get("ratio") || formData.get("aspect_ratio"));
      imageUrl = safeText(formData.get("image_url"));
      imageFile = formData.get("image");
    } else {
      const body = await req.json();

      userEmail = safeText(body?.user_email);
      prompt = safeText(body?.prompt);
      duration = normalizeDuration(body?.duration);
      ratio = normalizeRatio(body?.ratio || body?.aspect_ratio);
      imageUrl = safeText(body?.image_url);
    }

    if (!userEmail) {
      return Response.json({ success: false, error: "user_email wajib ada." }, { status: 400 });
    }

    if (!prompt) {
      return Response.json({ success: false, error: "Prompt video wajib diisi." }, { status: 400 });
    }

    if (!imageUrl && imageFile && typeof imageFile.arrayBuffer === "function") {
      const uploaded = await uploadImageToSupabase(imageFile, userEmail);
      imageUrl = uploaded.url;
    }

    if (!imageUrl) {
      return Response.json(
        { success: false, error: "Gambar wajib diupload atau image_url wajib ada." },
        { status: 400 }
      );
    }

    const result = await createPiapiKlingTask({
      imageUrl,
      prompt,
      duration,
      ratio
    });

    if (!result.success) {
      return Response.json(result, { status: 400 });
    }

    return Response.json({
      success: true,
      task_id: result.task_id,
      status: result.status,
      video_url: result.video_url,
      image_url: imageUrl,
      raw: result.data
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Server error saat generate video."
      },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("task_id");

    if (!taskId) {
      return Response.json({ success: false, error: "task_id wajib ada." }, { status: 400 });
    }

    const piapiKey = process.env.PIAPI_API_KEY;

    if (!piapiKey) {
      return Response.json(
        { success: false, error: "PIAPI_API_KEY belum diisi di Cloudflare ENV." },
        { status: 500 }
      );
    }

    const res = await fetch(`https://api.piapi.ai/api/v1/task/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: {
        "x-api-key": piapiKey
      },
      cache: "no-store"
    });

    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      return Response.json(
        {
          success: false,
          error: data?.message || data?.error || data?.raw || `PiAPI status error ${res.status}`,
          detail: data
        },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      task_id: taskId,
      status: getTaskStatus(data),
      video_url: getVideoUrlFromTask(data),
      raw: data
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Server error saat cek status video."
      },
      { status: 500 }
    );
  }
}
