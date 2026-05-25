"use client";

import { useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!message.trim()) return;

    setLoading(true);
    setReply("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: message.trim()
        })
      });

      const data = await res.json();
      setReply(data.reply || "Tidak ada jawaban.");
    } catch {
      setReply("Gagal menghubungi API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="card">
        <div className="badge">ONLINE</div>

        <h1>Properside AI</h1>

        <p className="subtitle">
          Project awal berhasil. Nanti bisa disambungkan ke Groq, Supabase, dan Login Google.
        </p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tulis pesan percobaan..."
        />

        <button onClick={sendMessage} disabled={loading}>
          {loading ? "Mengirim..." : "Kirim"}
        </button>

        {reply && (
          <div className="answer">
            <h3>Response:</h3>
            <p>{reply}</p>
          </div>
        )}
      </div>
    </main>
  );
}
