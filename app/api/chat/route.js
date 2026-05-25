export async function POST(req) {
  try {
    const { message } = await req.json();

    return Response.json({
      reply:
        "Properside AI berhasil berjalan 🚀\n\nPesan kamu: " +
        message
    });
  } catch {
    return Response.json(
      {
        reply: "Terjadi error di API."
      },
      {
        status: 500
      }
    );
  }
}
