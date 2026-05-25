export const runtime = "edge";
export const dynamic = "force-dynamic";

const BASE_URL = "https://logam-mulia-api.iamutaki.workers.dev";

const allowedSources = [
  "anekalogam",
  "hargaemas-org",
  "lakuemas",
  "sakumas",
  "kursdolar",
  "cermati",
  "indogold",
  "hargaemas-net",
  "hargaemas-com",
  "treasury",
  "logammulia",
  "emasku",
  "hartadinataabadi",
  "galeri24",
  "sampoernagold",
  "bankbsi",
  "brankaslm",
  "pegadaian"
];

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const source = searchParams.get("source") || "logammulia";
    const mode = searchParams.get("mode") || "latest";
    const refresh = searchParams.get("refresh") || "false";
    const page = searchParams.get("page") || "1";
    const length = searchParams.get("length") || "20";
    const weight = searchParams.get("weight") || "";
    const materialType = searchParams.get("materialType") || "";

    if (!allowedSources.includes(source)) {
      return Response.json(
        {
          success: false,
          error: "Source tidak valid."
        },
        { status: 400 }
      );
    }

    const endpoint =
      mode === "history"
        ? `/api/prices/${source}/history`
        : `/api/prices/${source}`;

    const url = new URL(`${BASE_URL}${endpoint}`);

    if (mode === "latest" && refresh === "true") {
      url.searchParams.set("refresh", "true");
    }

    if (mode === "history") {
      url.searchParams.set("page", page);
      url.searchParams.set("length", length);

      if (weight) {
        url.searchParams.set("weight", weight);
      }

      if (materialType) {
        url.searchParams.set("materialType", materialType);
      }
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const data = await res.json();

    return Response.json({
      success: res.ok,
      source,
      mode,
      requestUrl: url.toString(),
      data
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Gagal mengambil data harga gold."
      },
      { status: 500 }
    );
  }
}
