import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const AI_IMAGE_BUCKET = "ai-images";

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

function getSupabaseUrl() {
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL belum diatur.");
  }

  return supabaseUrl.replace(/\/$/, "");
}

function jsonResponse(data, status = 200) {
  return Response.json(data, { status });
}

function safeEmailFolder(email = "user") {
  return String(email).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getImageExt(mimeType = "image/png") {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

function base64ToUint8Array(base64) {
  const cleanBase64 = String(base64 || "")
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "")
    .replace(/\s/g, "");

  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function getStoragePathFromPublicUrl(imageUrl = "") {
  const marker = `/storage/v1/object/public/${AI_IMAGE_BUCKET}/`;
  const index = String(imageUrl).indexOf(marker);

  if (index === -1) return null;

  return decodeURIComponent(String(imageUrl).slice(index + marker.length));
}

async function uploadAiImageToStorage({
  supabase,
  user_email,
  image,
  mimeType,
  image_type
}) {
  const supabaseUrl = getSupabaseUrl();

  const ext = getImageExt(mimeType);
  const emailFolder = safeEmailFolder(user_email);
  const storageId = crypto.randomUUID();

  const storagePath = `${emailFolder}/${image_type || "generate"}/${storageId}.${ext}`;

  const bytes = base64ToUint8Array(image);

  const { data, error } = await supabase.storage
    .from(AI_IMAGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: mimeType || "image/png",
      upsert: false
    });

  if (error) {
    throw new Error(
      "Gagal upload AI image ke Supabase Storage: " + error.message
    );
  }

  return {
    image_url: `${supabaseUrl}/storage/v1/object/public/${AI_IMAGE_BUCKET}/${data.path}`,
    image_storage_path: data.path,
    storage_path: data.path
  };
}

export async function GET(req) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const user_email = searchParams.get("user_email");

    if (!user_email) {
      return jsonResponse(
        {
          success: false,
          error: "user_email wajib ada."
        },
        400
      );
    }

    const { data, error } = await supabase
      .from("ai_images")
      .select("*")
      .eq("user_email", user_email)
      .order("created_at", { ascending: false });

    if (error) {
      return jsonResponse(
        {
          success: false,
          error: error.message
        },
        500
      );
    }

    return jsonResponse({
      success: true,
      data: data || []
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error?.message || "Gagal load image history."
      },
      500
    );
  }
}

export async function POST(req) {
  try {
    const supabase = getSupabaseAdmin();

    const body = await req.json();

    const user_email = String(body?.user_email || "").trim();
    const prompt = String(body?.prompt || "").trim();
    const provider = String(body?.provider || "unknown").trim();
    const image_type = String(body?.image_type || "generate").trim();
    const image = String(body?.image || "").trim();
    const mimeType = String(body?.mimeType || "image/png").trim();

    if (!user_email) {
      return jsonResponse(
        {
          success: false,
          error: "user_email wajib ada."
        },
        400
      );
    }

    if (!image) {
      return jsonResponse(
        {
          success: false,
          error: "Data gambar kosong."
        },
        400
      );
    }

    const uploaded = await uploadAiImageToStorage({
      supabase,
      user_email,
      image,
      mimeType,
      image_type
    });

    const insertPayload = {
      user_email,
      prompt,
      provider,
      image_type,
      image_url: uploaded.image_url,
      mime_type: mimeType,

      // Kolom baru
      image_storage_path: uploaded.image_storage_path,

      // Kolom lama yang di tabel kamu masih NOT NULL
      storage_path: uploaded.storage_path
    };

    const { data, error } = await supabase
      .from("ai_images")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      await supabase.storage
        .from(AI_IMAGE_BUCKET)
        .remove([uploaded.image_storage_path]);

      return jsonResponse(
        {
          success: false,
          error: "Gagal simpan data image history: " + error.message
        },
        500
      );
    }

    return jsonResponse({
      success: true,
      data
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
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id");
    const user_email = searchParams.get("user_email");

    if (!id || !user_email) {
      return jsonResponse(
        {
          success: false,
          error: "id dan user_email wajib ada."
        },
        400
      );
    }

    const { data: imageData, error: findError } = await supabase
      .from("ai_images")
      .select("id, image_url, image_storage_path, storage_path")
      .eq("id", id)
      .eq("user_email", user_email)
      .single();

    if (findError) {
      return jsonResponse(
        {
          success: false,
          error:
            "Gagal membaca data gambar sebelum delete: " + findError.message
        },
        500
      );
    }

    const storagePath =
      imageData?.image_storage_path ||
      imageData?.storage_path ||
      getStoragePathFromPublicUrl(imageData?.image_url);

    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from(AI_IMAGE_BUCKET)
        .remove([storagePath]);

      if (storageError) {
        return jsonResponse(
          {
            success: false,
            error:
              "Gagal hapus file gambar dari Supabase Storage: " +
              storageError.message
          },
          500
        );
      }
    }

    const { error: deleteError } = await supabase
      .from("ai_images")
      .delete()
      .eq("id", id)
      .eq("user_email", user_email);

    if (deleteError) {
      return jsonResponse(
        {
          success: false,
          error:
            "File storage sudah dihapus, tapi data database gagal dihapus: " +
            deleteError.message
        },
        500
      );
    }

    return jsonResponse({
      success: true,
      deleted_storage_file: !!storagePath
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error?.message || "Gagal hapus image history."
      },
      500
    );
  }
}