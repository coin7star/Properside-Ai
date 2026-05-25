"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "./utils/supabaseClient";

export const dynamic = "force-dynamic";

export default function Home() {
  const [supabase, setSupabase] = useState(null);
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const client = getSupabase();
    setSupabase(client);

    client.auth.getUser().then(({ data }) => {
      setUser(data?.user || null);
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      data?.subscription?.unsubscribe();
    };
  }, []);

  async function loginGoogle() {
    if (!supabase) return;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin
      }
    });
  }

  async function logout() {
    if (!supabase) return;

    await supabase.auth.signOut();
    setUser(null);
    setReply("");
  }

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
          message: message.trim(),
          user_email: user?.email || null
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

  if (!user) {
    return (
      <main className="page">
        <div className="card">
          <div className="badge">LOGIN REQUIRED</div>

          <h1>Properside AI</h1>

          <p className="subtitle">
            Login dengan Google untuk menggunakan Properside AI.
          </p>

          <button onClick={loginGoogle}>
            Login dengan Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="card">
        <div className="badge">GROQ + SUPABASE</div>

        <h1>Properside AI</h1>

        <p className="subtitle">
          Login sebagai: {user.email}
        </p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tulis pertanyaan..."
        />

        <button onClick={sendMessage} disabled={loading}>
          {loading ? "Properside AI mengetik..." : "Kirim"}
        </button>

        <button
          onClick={logout}
          style={{
            marginTop: 12,
            background: "#dc2626"
          }}
        >
          Logout
        </button>

        {reply && (
          <div className="answer">
            <h3>Jawaban AI:</h3>
            <p>{reply}</p>
          </div>
        )}
      </div>
    </main>
  );
}
