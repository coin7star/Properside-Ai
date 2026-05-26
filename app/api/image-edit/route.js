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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function fileToDataUrl(file) {
  const buffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const mimeType = file.type || "image/png";
  return `data:${mimeType};base64,${base64}`;
}

function normalizeImageInput(body) {
  if (!body || typeof body !== "object") return "";

  if (typeof body.imageDataUrl === "string" && body.imageDataUrl.trim()) {
    return body.imageDataUrl.trim();
  }

  if (typeof body.inputImage === "string" && body.inputImage.trim()) {
    return body.inputImage.trim();
  }

  if (typeof body.imageUrl === "string" && body.imageUrl.trim()) {
    return body.imageUrl.trim();
  }

  if (typeof body.image === "string" && body.image.trim()) {
    const raw = body.image.trim();

    if (raw.startsWith("data:image/")) {
      return raw;
    }

    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return raw;
    }
  }

  if (typeof body.base64 === "string" && body.base64.trim()) {
    const mimeType = body.mimeType || "image/png";
    return `data:${mimeType};base64,${body.base64.trim()}`;
  }

  return "";
}

function cleanReplicateError(message = "") {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();

  if (!text) {
    return "Gagal edit gambar dari Replicate.";
  }

  if (
    lower.includes("authentication") ||
    lower.includes("authorization") ||
    lower.includes("invalid token") ||
    lower.includes("unauthorized")
  ) {
    return "REPLICATE_API_TOKEN tidak valid atau belum diatur.";
  }

  if (
    lower.includes("billing") ||
    lower.includes("payment") ||
    lower.includes("insufficient") ||
    lower.includes("quota") ||
    lower.includes("credit")
  ) {
    return "Quota / billing Replicate tidak cukup atau belum aktif.";
  }

  if (
    lower.includes("not found") ||
    lower.includes("no such model") ||
    lower.includes("model not found")
  ) {
    return "Model Replicate edit image tidak ditemukan. Cek REPLICATE_EDIT_IMAGE_MODEL.";
  }

  if (
    lower.includes("input_image") ||
    lower.includes("image") ||
    lower.includes("file")
  ) {
    return "Input gambar tidak valid. Upload ulang gambar lalu coba lagi.";
  }

  return text;
}

function extractOutputUrl(prediction) {
  const output = prediction?.output;

  if (!output) return "";

  if (typeof output === "string") {
    return output;
  }

  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];

    if (typeof first === "string") {
      return first;
    }

    if (first && typeof first === "object") {
      if (typeof first.url === "string") return first.url;
      if (typeof first.href === "string") return first.href;
    }
  }

  if (typeof output === "object") {
    if (typeof output.url === "string") return output.url;
    if (typeof output.href === "string") return output.href;
  }

  return "";
}

async function createPrediction({ token, model, input }) {
  const [owner, name] = model.split("/");

  if (!owner || !name) {
    throw new Error("Format model Replicate tidak valid.");
  }

  const res = await fetch(
    `https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=1"
      },
      body: JSON.stringify({ input })
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      data?.detail ||
      data?.error ||
      data?.title ||
      "Gagal membuat prediction Replicate.";
    throw new Error(message);
  }

  return data;
}

async function pollPrediction(getUrl, token) {
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    const res = await fetch(getUrl, {
      headers: {
        Authorization: `Token ${token}`
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message =
        data?.detail ||
        data?.error ||
        "Gagal mengambil status prediction Replicate.";
      throw new Error(message);
    }

    const status = data?.status;

    if (status === "succeeded") {
      return data;
    }

    if (status === "failed" || status === "canceled") {
      throw new Error(
        data?.error || `Prediction ${status}. Tidak ada hasil gambar.`
      );
    }

    attempts += 1;
    await sleep(1500);
  }

  throw new Error("Timeout: proses edit gambar terlalu lama.");
}

async function fetchImageAsBase64(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Gagal mengambil hasil gambar dari Replicate.");
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer = await res.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);

  return {
    mimeType: contentType,
    base64
  };
}

export async function POST(request) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;

    if (!token) {
      return jsonResponse(
        {
          success: false,
          error: "REPLICATE_API_TOKEN belum diatur."
        },
        500
      );
    }

    const defaultModel = "black-forest-labs/flux-kontext-pro";
    const model =
      process.env.REPLICATE_EDIT_IMAGE_MODEL ||
      process.env.REPLICATE_EDIT_MODEL ||
      defaultModel;

    const contentType = request.headers.get("content-type") || "";

    let prompt = "";
    let inputImage = "";
    let outputFormat = "jpg";
    let aspectRatio = "match_input_image";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();

      prompt = String(formData.get("prompt") || "").trim();
      outputFormat = String(formData.get("outputFormat") || "jpg").trim();
      aspectRatio = String(
        formData.get("aspectRatio") || "match_input_image"
      ).trim();

      const imageFile = formData.get("image");

      if (imageFile && typeof imageFile === "object" && "arrayBuffer" in imageFile) {
        inputImage = await fileToDataUrl(imageFile);
      }
    } else {
      const body = await request.json().catch(() => ({}));

      prompt = String(body?.prompt || "").trim();
      outputFormat = String(body?.outputFormat || "jpg").trim();
      aspectRatio = String(
        body?.aspectRatio || "match_input_image"
      ).trim();
      inputImage = normalizeImageInput(body);
    }

    if (!prompt) {
      return jsonResponse(
        {
          success: false,
          error: "Prompt edit gambar wajib diisi."
        },
        400
      );
    }

    if (!inputImage) {
      return jsonResponse(
        {
          success: false,
          error: "Gambar upload / input image wajib diisi."
        },
        400
      );
    }

    const input = {
      prompt,
      input_image: inputImage,
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      safety_tolerance: 2
    };

    let prediction = await createPrediction({
      token,
      model,
      input
    });

    if (prediction?.status !== "succeeded") {
      const getUrl = prediction?.urls?.get;

      if (!getUrl) {
        throw new Error("URL polling prediction Replicate tidak ditemukan.");
      }

      prediction = await pollPrediction(getUrl, token);
    }

    const outputUrl = extractOutputUrl(prediction);

    if (!outputUrl) {
      throw new Error("Replicate tidak mengembalikan URL hasil gambar.");
    }

    const imageResult = await fetchImageAsBase64(outputUrl);

    return jsonResponse({
      success: true,
      provider: "replicate",
      model,
      prompt,
      mimeType: imageResult.mimeType,
      image: imageResult.base64,
      text: "Gambar berhasil diedit dengan Replicate."
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: cleanReplicateError(error?.message || "Unknown error")
      },
      500
    );
  }
}