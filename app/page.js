"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { getSupabase } from "./utils/supabaseClient";

const tools = [
  { id: "chat", name: "AI Chat", icon: "💬" },
  { id: "image", name: "Image Tool", icon: "🖼️" },
  { id: "text", name: "Text Writer", icon: "✍️" },
  { id: "code", name: "Code Helper", icon: "💻" },
  { id: "translate", name: "Translate", icon: "🌐" },
  { id: "summary", name: "Summarizer", icon: "📄" },
  { id: "history", name: "History", icon: "🕘" },
  { id: "settings", name: "Settings", icon: "⚙️" }
];

export default function Home() {
  const [supabase, setSupabase] = useState(null);
  const [user, setUser] = useState(null);
  const [activeTool, setActiveTool] = useState("chat");
  const [message, setMessage] = useState("");
  const [chats, setChats] = useState([]);
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
    setChats([]);
  }

  async function sendMessage() {
    if (!message.trim() || loading) return;

    const userText = message.trim();

    setMessage("");
    setLoading(true);

    setChats((prev) => [
      ...prev,
      {
        role: "user",
        text: userText
      }
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: userText,
          user_email: user?.email || null
        })
      });

      const data = await res.json();

      setChats((prev) => [
        ...prev,
        {
          role: "ai",
          text: data.reply || "Tidak ada jawaban."
        }
      ]);
    } catch {
      setChats((prev) => [
        ...prev,
        {
          role: "ai",
          text: "Gagal menghubungi API."
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="brand-logo">P</div>

          <h1>Properside AI</h1>

          <p>
            Workspace AI untuk chat, tools, automation, dan fitur lain yang akan ditambahkan.
          </p>

          <button onClick={loginGoogle}>
            Login dengan Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo small">P</div>

          <div>
            <h2>Properside</h2>
            <span>AI Workspace</span>
          </div>
        </div>

        <nav className="tool-list">
          {tools.map((tool) => (
            <button
              key={tool.id}
              className={
                activeTool === tool.id
                  ? "tool-button active"
                  : "tool-button"
              }
              onClick={() => setActiveTool(tool.id)}
            >
              <span>{tool.icon}</span>
              {tool.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p>{user.email}</p>

          <button onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <h1>{tools.find((t) => t.id === activeTool)?.name}</h1>
            <p>Selamat datang di Properside AI Workspace.</p>
          </div>

          <div className="user-pill">
            {user.email?.charAt(0).toUpperCase()}
          </div>
        </header>

        {activeTool === "chat" ? (
          <section className="chat-panel">
            <div className="chat-box">
              {chats.length === 0 && (
                <div className="empty-chat">
                  <h2>Apa yang ingin kamu buat hari ini?</h2>
                  <p>
                    Tanya apa saja ke Properside AI. Jawaban diproses menggunakan Groq dan tersimpan ke Supabase.
                  </p>
                </div>
              )}

              {chats.map((chat, index) => (
                <div
                  key={index}
                  className={
                    chat.role === "user"
                      ? "message user-message"
                      : "message ai-message"
                  }
                >
                  <p>{chat.text}</p>
                </div>
              ))}

              {loading && (
                <div className="message ai-message">
                  <p>Properside AI sedang mengetik...</p>
                </div>
              )}
            </div>

            <div className="input-area">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tulis perintah untuk AI..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />

              <button onClick={sendMessage} disabled={loading}>
                Kirim
              </button>
            </div>
          </section>
        ) : (
          <section className="placeholder-panel">
            <div className="placeholder-card">
              <div className="placeholder-icon">
                {tools.find((t) => t.id === activeTool)?.icon}
              </div>

              <h2>{tools.find((t) => t.id === activeTool)?.name}</h2>

              <p>
                Fitur ini sudah disiapkan sebagai menu. Nanti bisa disambungkan ke API, database, atau tool khusus.
              </p>

              <button>Coming Soon</button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
