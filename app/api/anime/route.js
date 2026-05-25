export const runtime = "edge";
export const dynamic = "force-dynamic";

const BASE_URL =
  "https://bintangapi.full.diskon.cloud/api/stream/anime";

async function fetchAnimeApi(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  return await res.json();
}

function normalizeAnimeData(action, raw) {
  const data =
    raw?.data ||
    raw?.result?.data ||
    raw?.result ||
    raw;

  if (action === "home") {
    return {
      mode: "home",
      ongoing: data?.ongoing?.animeList || [],
      completed: data?.completed?.animeList || [],
      pagination: raw?.pagination || null
    };
  }

  if (action === "schedule") {
    return {
      mode: "schedule",
      schedule: Array.isArray(data) ? data : [],
      pagination: raw?.pagination || null
    };
  }

  return {
    mode: action,
    animeList:
      data?.animeList ||
      data?.anime_list ||
      data?.list ||
      data?.results ||
      data?.anime ||
      data?.animes ||
      [],
    detail: data,
    pagination: raw?.pagination || null
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const action = searchParams.get("action") || "home";
    const page = searchParams.get("page") || "1";
    const query = searchParams.get("query") || searchParams.get("q") || "";
    const animeId = searchParams.get("animeId") || "";
    const serverId = searchParams.get("serverId") || "";
    const episodeId = searchParams.get("episodeId") || "";

    let raw;

    if (action === "home") {
      raw = await fetchAnimeApi("/home/");
    } else if (action === "schedule") {
      raw = await fetchAnimeApi("/schedule/");
    } else if (action === "ongoing") {
      raw = await fetchAnimeApi(`/ongoing/?page=${encodeURIComponent(page)}`);
    } else if (action === "complete") {
      raw = await fetchAnimeApi(`/complete/?page=${encodeURIComponent(page)}`);
    } else if (action === "search") {
      if (!query.trim()) {
        return Response.json(
          {
            success: false,
            error: "Parameter query wajib diisi."
          },
          {
            status: 400
          }
        );
      }

      raw = await fetchAnimeApi(
        `/search/?query=${encodeURIComponent(query.trim())}`
      );
    } else if (action === "detail") {
      if (!animeId.trim()) {
        return Response.json(
          {
            success: false,
            error: "Parameter animeId wajib diisi."
          },
          {
            status: 400
          }
        );
      }

      raw = await fetchAnimeApi(
        `/animeId/?animeId=${encodeURIComponent(animeId.trim())}`
      );
    } else if (action === "episode") {
      if (!episodeId.trim()) {
        return Response.json(
          {
            success: false,
            error: "Parameter episodeId wajib diisi."
          },
          {
            status: 400
          }
        );
      }

      raw = await fetchAnimeApi(
        `/episode/?episodeId=${encodeURIComponent(episodeId.trim())}`
      );
    } else if (action === "server") {
      if (!serverId.trim()) {
        return Response.json(
          {
            success: false,
            error: "Parameter serverId wajib diisi."
          },
          {
            status: 400
          }
        );
      }

      raw = await fetchAnimeApi(
        `/server/?serverId=${encodeURIComponent(serverId.trim())}`
      );
    } else {
      return Response.json(
        {
          success: false,
          error: "Action anime tidak dikenal."
        },
        {
          status: 400
        }
      );
    }

    if (raw?.status === false) {
      return Response.json(
        {
          success: false,
          error: raw?.msg || "API anime error.",
          raw
        },
        {
          status: 500
        }
      );
    }

    return Response.json({
      success: true,
      data: normalizeAnimeData(action, raw),
      raw
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      {
        status: 500
      }
    );
  }
}
