"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { getSupabase } from "./utils/supabaseClient";

const tools = [
  { id: "chat", name: "AI Chat", icon: "💬" },
  { id: "tempmail", name: "Tempmail", icon: "📧" },
  { id: "image", name: "Image Tool", icon: "🖼️" },
  { id: "text", name: "Text Writer", icon: "✍️" },
  { id: "code", name: "Code Helper", icon: "💻" },
  { id: "translate", name: "Translate", icon: "🌐" },
  { id: "summary", name: "Summarizer", icon: "📄" },
  { id: "settings", name: "Settings", icon: "⚙️" }
];

function MessageContent({ text }) {
  if (!text) return null;

  const parts = text.split(/```/g);

  return (
    <div className="message-content">
      {parts.map((part, index) => {
        const isCode = index % 2 === 1;

        if (isCode) {
          const lines = part.split("\n");
          const language = lines[0]?.trim() || "code";
          const code = lines.slice(1).join("\n").trim();

          return (
            <div className="code-block" key={index}>
              <div className="code-header">
                <span>{language}</span>

                <button
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(code)}
                >
                  Copy
                </button>
              </div>

              <pre>
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        return <p key={index}>{part}</p>;
      })}
    </div>
  );
}

export default function Home() {
  const [supabase, setSupabase] = useState(null);
  const [user, setUser] = useState(null);
  const [activeTool, setActiveTool] = useState("chat");

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [message, setMessage] = useState("");
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);

  const [tempMails, setTempMails] = useState([]);
  const [activeTempMail, setActiveTempMail] = useState(null);
  const [tempMessages, setTempMessages] = useState([]);
  const [tempLoading, setTempLoading] = useState(false);

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

  useEffect(() => {
    if (user?.email) {
      loadSessions(user.email);
      loadTempMails(user.email);
    }
  }, [user]);

  async function loadSessions(email) {
    const res = await fetch(`/api/chat?action=sessions&user_email=${email}`);
    const data = await res.json();
    setSessions(data.data || []);
  }

  async function loadMessages(sessionId) {
    setActiveSessionId(sessionId);

    const res = await fetch(
      `/api/chat?action=messages&user_email=${user.email}&session_id=${sessionId}`
    );

    const data = await res.json();

    setChats(
      (data.data || []).map((msg) => ({
        role: msg.role,
        text: msg.content
      }))
    );
  }

  function newChat() {
    setActiveSessionId(null);
    setChats([]);
    setMessage("");
  }

  async function renameSession(sessionId) {
    const title = prompt("Nama chat baru:");
    if (!title || !title.trim()) return;

    await fetch("/api/chat", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: sessionId,
        user_email: user.email,
        title: title.trim()
      })
    });

    loadSessions(user.email);
  }

  async function deleteSession(sessionId) {
    const ok = confirm("Hapus history chat ini?");
    if (!ok) return;

    await fetch(
      `/api/chat?session_id=${sessionId}&user_email=${user.email}`,
      {
        method: "DELETE"
      }
    );

    if (activeSessionId === sessionId) {
      newChat();
    }

    loadSessions(user.email);
  }

  async function loadTempMails(email) {
    try {
      const res = await fetch(
        `/api/tempmail?action=list&user_email=${encodeURIComponent(email)}`
      );

      const data = await res.json();

      const mails = data?.data || [];

      setTempMails(mails);

      if (mails.length > 0 && !activeTempMail) {
        setActiveTempMail(mails[0]);
      }
    } catch {
      console.log("Gagal load tempmail.");
    }
  }

  async function createTempMail() {
    if (!user?.email) return;

    try {
      setTempLoading(true);

      const res = await fetch("/api/tempmail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_email: user.email
        })
      });

      const data = await res.json();

      if (data?.data) {
        setActiveTempMail(data.data);
        setTempMessages([]);
        loadTempMails(user.email);
      } else {
        alert(data?.error || "Gagal membuat tempmail.");
      }
    } catch {
      alert("Gagal membuat tempmail.");
    } finally {
      setTempLoading(false);
    }
  }

  async function checkTempMail(mail = activeTempMail) {
    if (!mail?.email_token || !user?.email) return;

    try {
      setTempLoading(true);
      setActiveTempMail(mail);

      const res = await fetch(
        `/api/tempmail?action=check&user_email=${encodeURIComponent(
          user.email
        )}&token=${encodeURIComponent(mail.email_token)}`
      );

      const data = await res.json();

      setTempMessages(data?.messages || []);
    } catch {
      alert("Gagal check inbox.");
    } finally {
      setTempLoading(false);
    }
  }

  function getMailBody(msg) {
    return (
      msg?.body ||
      msg?.text ||
      msg?.html ||
      msg?.content ||
      msg?.message ||
      msg?.message_text ||
      msg?.message_html ||
      msg?.description ||
      "Tidak ada isi pesan."
    );
  }

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
    setSessions([]);
    setActiveSessionId(null);
    setTempMails([]);
    setActiveTempMail(null);
    setTempMessages([]);
  }

  async function sendMessage() {
    if (!message.trim() || loading || !user?.email) return;

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
          user_email: user.email,
          session_id: activeSessionId
        })
      });

      const data = await res.json();

      if (data.session_id && !activeSessionId) {
        setActiveSessionId(data.session_id);
      }

      setChats((prev) => [
        ...prev,
        {
          role: "ai",
          text: data.reply || "Tidak ada jawaban."
        }
      ]);

      loadSessions(user.email);
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
            Login dengan Google untuk menyimpan history chat dan menggunakan
            workspace AI.
          </p>

          <button onClick={loginGoogle}>Login dengan Google</button>
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
                activeTool === tool.id ? "tool-button active" : "tool-button"
              }
              onClick={() => setActiveTool(tool.id)}
            >
              <span>{tool.icon}</span>
              {tool.name}
            </button>
          ))}
        </nav>

        <div className="history-box">
          <button className="new-chat-btn" onClick={newChat}>
            + Chat Baru
          </button>

          <h3>History Chat</h3>

          <div className="history-list">
            {sessions.length === 0 && (
              <p className="empty-history">Belum ada history.</p>
            )}

            {sessions.map((session) => (
              <div
                key={session.id}
                className={
                  activeSessionId === session.id
                    ? "history-item active"
                    : "history-item"
                }
              >
                <button onClick={() => loadMessages(session.id)}>
                  {session.title}
                </button>

                <div className="history-actions">
                  <span onClick={() => renameSession(session.id)}>✏️</span>
                  <span onClick={() => deleteSession(session.id)}>🗑️</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <p>{user.email}</p>
          <button onClick={logout}>Logout</button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <h1>{tools.find((t) => t.id === activeTool)?.name}</h1>
            <p>Properside AI Workspace.</p>
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
                  <p>Buat chat baru atau pilih history di sidebar kiri.</p>
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
                  <MessageContent text={chat.text} />
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
        ) : activeTool === "tempmail" ? (
          <section className="placeholder-panel">
            <div className="placeholder-card tempmail-panel">
              <div className="placeholder-icon">📧</div>

              <h2>Tempmail Tool</h2>

              <p>
                Buat banyak email sementara. Email lama tetap tersimpan dan bisa
                dicek kembali.
              </p>

              <button onClick={createTempMail}>
                {tempLoading ? "Membuat..." : "+ Buat Email Baru"}
              </button>

              <div className="tempmail-list">
                <h3>Daftar Email</h3>

                {tempMails.length === 0 ? (
                  <p>Belum ada tempmail.</p>
                ) : (
                  tempMails.map((mail) => (
                    <div
                      key={mail.id}
                      className={
                        activeTempMail?.id === mail.id
                          ? "tempmail-item active"
                          : "tempmail-item"
                      }
                    >
                      <button
                        onClick={() => {
                          setActiveTempMail(mail);
                          setTempMessages([]);
                        }}
                      >
                        <strong>{mail.email}</strong>
                        <small>Expired: {mail.deleted_in || "-"}</small>
                      </button>

                      <span onClick={() => checkTempMail(mail)}>📥</span>
                    </div>
                  ))
                )}
              </div>

              {activeTempMail && (
                <>
                  <div className="tempmail-box">
                    <h3>Email Aktif</h3>

                    <div className="tempmail-email">
                      {activeTempMail.email}
                    </div>

                    <p>Expired: {activeTempMail.deleted_in || "-"}</p>

                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(activeTempMail.email)
                      }
                    >
                      Copy Email
                    </button>

                    <button
                      onClick={() => checkTempMail(activeTempMail)}
                      style={{
                        marginTop: 10
                      }}
                    >
                      {tempLoading ? "Checking..." : "Check Inbox"}
                    </button>
                  </div>

                  <div className="tempmail-messages">
                    {tempMessages.length === 0 ? (
                      <p>Belum ada pesan masuk untuk email ini.</p>
                    ) : (
                      tempMessages.map((msg, index) => (
                        <div key={index} className="tempmail-message">
                          <h4>{msg.subject || msg.title || "No Subject"}</h4>

                          <p>
                            From:{" "}
                            {msg.from ||
                              msg.sender ||
                              msg.from_email ||
                              "Unknown"}
                          </p>

                          <div className="tempmail-content">
                            {getMailBody(msg)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
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
                Fitur ini sudah disiapkan sebagai menu. Nanti bisa kita
                sambungkan ke tool khusus.
              </p>

              <button>Coming Soon</button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
