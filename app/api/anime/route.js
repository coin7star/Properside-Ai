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

  const data = await res.json();

  return data;
}

function getData(data) {
  return (
    data?.result?.data ||
    data?.result ||
    data?.data ||
    data
  );
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const action = searchParams.get("action") || "home";
    const page = searchParams.get("page") || "1";
    const query = searchParams.get("q") || "";
    const animeId = searchParams.get("animeId") || "";

    let data;

    if (action === "home") {
      data = await fetchAnimeApi("/home/");
    } else if (action === "schedule") {
      data = await fetchAnimeApi("/schedule/");
    } else if (action === "ongoing") {
      data = await fetchAnimeApi(`/ongoing/?page=${page}`);
    } else if (action === "complete") {
      data = await fetchAnimeApi(`/complete/?page=${page}`);
    } else if (action === "search") {
      data = await fetchAnimeApi(
        `/search/?q=${encodeURIComponent(query)}`
      );
    } else if (action === "detail") {
      data = await fetchAnimeApi(
        `/animeId/?animeId=${encodeURIComponent(animeId)}`
      );
    } else {
      return Response.json(
        {
          error: "Action anime tidak dikenal."
        },
        {
          status: 400
        }
      );
    }

    return Response.json({
      success: true,
      data: getData(data),
      raw: data
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
