export const runtime = "edge";
export const dynamic = "force-dynamic";

const BUCKET_NAME = "ai-images";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diatur."
    );
  }

  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    serviceRoleKey
  };
}

function getPublicImageUrl(supabaseUrl, path) {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${path}`;
}

function getExtFromMime(mimeType = "image/png") {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "png";
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function parseImageInput({ image, mimeType }) {
  if (!image || typeof image !== "string") {
    throw new Error("Data gambar kosong.");
  }

  if (image.startsWith("data:image/")) {
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

    if (!match) {
      throw new Error("Format data URL gambar tidak valid.");
    }

    return {
      mimeType: match[1],
      bytes: base64ToBytes(match[2])
    };
  }

  return {
    mimeType: mimeType || "image/png",
    bytes: base64ToBytes(image)
  };
}

async function uploadToStorage({ supabaseUrl, serviceRoleKey, path, bytes, mimeType }) {
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/${BUCKET_NAME}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": mimeType,
        "x-upsert": "false"
      },
      body: bytes
    }
  );

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || "Gagal upload gambar ke Supabase Storage.");
  }
}

async function insertImageRow({
  supabaseUrl,
  serviceRoleKey,
  userEmail,
  prompt,
  provider,
  imageType,
  imageUrl,
  storagePath,
  mimeType
}) {
  const res = await fetch(`${supabaseUrl}/rest/v1/ai_images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      user_email: userEmail,
      prompt,
      provider,
      image_type: imageType,
      image_url: imageUrl,
      storage_path: storagePath,
      mime_type: mimeType
    })
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.message || "Gagal menyimpan history gambar.");
  }

  return Array.isArray(data) ? data[0] : data;
}

async function listImageRows({ supabaseUrl, serviceRoleKey, userEmail }) {
  const query = new URLSearchParams({
    user_email: `eq.${userEmail}`,
    select: "*",
    order: "created_at.desc",
    limit: "30"
  });

  const res = await fetch(`${supabaseUrl}/rest/v1/ai_images?${query}`, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey
    }
  });

  const data = await res.json().catch(() => []);

  if (!res.ok) {
    throw new Error(data?.message || "Gagal mengambil history gambar.");
  }

  return data;
}

async function getImageRowById({ supabaseUrl, serviceRoleKey, id, userEmail }) {
  const query = new URLSearchParams({
    id: `eq.${id}`,
    user_email: `eq.${userEmail}`,
    select: "*",
    limit: "1"
  });

  const res = await fetch(`${supabaseUrl}/rest/v1/ai_images?${query}`, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey
    }
  });

  const data = await res.json().catch(() => []);

  if (!res.ok) {
    throw new Error(data?.message || "Gagal mengambil data gambar.");
  }

  return data?.[0] || null;
}

async function deleteStorageObject({ supabaseUrl, serviceRoleKey, path }) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET_NAME}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prefixes: [path]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Gagal menghapus gambar dari Storage.");
  }
}

async function deleteImageRow({ supabaseUrl, serviceRoleKey, id, userEmail }) {
  const query = new URLSearchParams({
    id: `eq.${id}`,
    user_email: `eq.${userEmail}`
  });

  const res = await fetch(`${supabaseUrl}/rest/v1/ai_images?${query}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey
    }
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Gagal menghapus history gambar.");
  }
}

export async function GET(req) {
  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const { searchParams } = new URL(req.url);
    const userEmail = String(searchParams.get("user_email") || "").trim();

    if (!userEmail) {
      return jsonResponse(
        {
          success: false,
          error: "user_email wajib diisi."
        },
        400
      );
    }

    const data = await listImageRows({
      supabaseUrl,
      serviceRoleKey,
      userEmail
    });

    return jsonResponse({
      success: true,
      data
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error?.message || "Gagal mengambil image history."
      },
      500
    );
  }
}

export async function POST(req) {
  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const body = await req.json();

    const userEmail = String(body?.user_email || "").trim();
    const prompt = String(body?.prompt || "").trim();
    const provider = String(body?.provider || "unknown").trim();
    const imageType = String(body?.image_type || "generate").trim();
    const image = String(body?.image || "").trim();
    const inputMimeType = String(body?.mimeType || "image/png").trim();

    if (!userEmail) {
      return jsonResponse(
        {
          success: false,
          error: "user_email wajib diisi."
        },
        400
      );
    }

    if (!image) {
      return jsonResponse(
        {
          success: false,
          error: "Data gambar wajib diisi."
        },
        400
      );
    }

    const parsed = parseImageInput({
      image,
      mimeType: inputMimeType
    });

    const ext = getExtFromMime(parsed.mimeType);
    const safeEmail = userEmail.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const storagePath = `${safeEmail}/${fileName}`;

    await uploadToStorage({
      supabaseUrl,
      serviceRoleKey,
      path: storagePath,
      bytes: parsed.bytes,
      mimeType: parsed.mimeType
    });

    const imageUrl = getPublicImageUrl(supabaseUrl, storagePath);

    const row = await insertImageRow({
      supabaseUrl,
      serviceRoleKey,
      userEmail,
      prompt,
      provider,
      imageType,
      imageUrl,
      storagePath,
      mimeType: parsed.mimeType
    });

    return jsonResponse({
      success: true,
      data: row
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error?.message || "Gagal menyimpan image history."
      },
      500
    );
  }
}

export async function DELETE(req) {
  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const { searchParams } = new URL(req.url);

    const id = String(searchParams.get("id") || "").trim();
    const userEmail = String(searchParams.get("user_email") || "").trim();

    if (!id || !userEmail) {
      return jsonResponse(
        {
          success: false,
          error: "id dan user_email wajib diisi."
        },
        400
      );
    }

    const row = await getImageRowById({
      supabaseUrl,
      serviceRoleKey,
      id,
      userEmail
    });

    if (!row) {
      return jsonResponse(
        {
          success: false,
          error: "History gambar tidak ditemukan."
        },
        404
      );
    }

    await deleteStorageObject({
      supabaseUrl,
      serviceRoleKey,
      path: row.storage_path
    });

    await deleteImageRow({
      supabaseUrl,
      serviceRoleKey,
      id,
      userEmail
    });

    return jsonResponse({
      success: true
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error?.message || "Gagal menghapus image history."
      },
      500
    );
  }
}