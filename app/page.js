"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { getSupabase } from "./utils/supabaseClient";

const tools = [
  { id: "chat", name: "AI Chat", icon: "💬" },
  { id: "tempmail", name: "Tempmail", icon: "📧" },
  { id: "anime", name: "STREAM ANIME", icon: "🎬" },
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
  const [isGuest, setIsGuest] = useState(false);
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

  const [animeItems, setAnimeItems] = useState([]);
  const [animeLoading, setAnimeLoading] = useState(false);
  const [animeQuery, setAnimeQuery] = useState("");
  const [animePage, setAnimePage] = useState(1);
  const [animeMode, setAnimeMode] = useState("home");

  const isLoggedIn = !!user?.email;
  const canUseWorkspace = isLoggedIn || isGuest;

  useEffect(() => {
    const client = getSupabase();
    setSupabase(client);

    client.auth.getUser().then(({ data }) => {
      setUser(data?.user || null);
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);

      if (session?.user) {
        setIsGuest(false);
      }
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

  useEffect(() => {
    if (activeTool === "anime") {
      loadAnime("home", 1);
    }
  }, [activeTool]);

  async function loadSessions(email) {
    const res = await fetch(`/api/chat?action=sessions&user_email=${email}`);
    const data = await res.json();
    setSessions(data.data || []);
  }

  async function loadMessages(sessionId) {
    if (!user?.email) return;

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
    if (!user?.email) return;

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
    if (!user?.email) return;

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
    try {
      setTempLoading(true);

      const res = await fetch("/api/tempmail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_email: user?.email || null
        })
      });

      const data = await res.json();

      if (data?.data) {
        const newMail = data.data;

        setActiveTempMail(newMail);
        setTempMessages([]);

        if (user?.email) {
          loadTempMails(user.email);
        } else {
          setTempMails((prev) => [newMail, ...prev]);
        }
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
    if (!mail?.email_token) return;

    try {
      setTempLoading(true);
      setActiveTempMail(mail);

      const res = await fetch(
        `/api/tempmail?action=check&token=${encodeURIComponent(
          mail.email_token
        )}`
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

  function normalizeAnimeList(data) {
    if (Array.isArray(data)) return data;

    if (data?.mode === "home") {
      return [
        ...(data?.ongoing || []),
        ...(data?.completed || [])
      ];
    }

    if (data?.mode === "schedule") {
      return (data?.schedule || []).flatMap((day) =>
        (day?.anime_list || []).map((anime) => ({
          ...anime,
          releaseDay: day.day
        }))
      );
    }

    return (
      data?.animeList ||
      data?.anime_list ||
      data?.list ||
      data?.results ||
      data?.anime ||
      data?.animes ||
      []
    );
  }

  function getAnimeTitle(item) {
    return (
      item?.title ||
      item?.name ||
      item?.anime_title ||
      item?.judul ||
      item?.anime_name ||
      "No Title"
    );
  }

  function getAnimeImage(item) {
    return (
      item?.poster ||
      item?.image ||
      item?.thumbnail ||
      item?.thumb ||
      item?.cover ||
      item?.img ||
      ""
    );
  }

  function getAnimeInfo(item) {
    const episode = item?.episodes
      ? `Episode ${item.episodes}`
      : item?.episode ||
        item?.latest_episode ||
        "";

    const release =
      item?.releaseDay ||
      item?.release_day ||
      item?.day ||
      "";

    const date =
      item?.latestReleaseDate ||
      item?.lastReleaseDate ||
      "";

    const score = item?.score
      ? `Score ${item.score}`
      : "";

    return (
      [episode, release, date, score]
        .filter(Boolean)
        .join(" • ") ||
      item?.status ||
      item?.type ||
      "Info tidak tersedia"
    );
  }

  async function loadAnime(mode = "home", page = 1) {
    try {
      setAnimeLoading(true);
      setAnimeMode(mode);
      setAnimePage(page);

      let url = `/api/anime?action=${mode}&page=${page}`;

      if (mode === "search") {
        if (!animeQuery.trim()) {
          alert("Tulis judul anime dulu.");
          setAnimeLoading(false);
          return;
        }

        url += `&query=${encodeURIComponent(animeQuery.trim())}`;
      }

      const res = await fetch(url);
      const json = await res.json();

      if (!json.success) {
        alert(json.error || "Gagal mengambil data anime.");
        setAnimeItems([]);
        return;
      }

      const list = normalizeAnimeList(json?.data);

      setAnimeItems(Array.isArray(list) ? list : []);
    } catch {
      alert("Gagal mengambil data anime.");
    } finally {
      setAnimeLoading(false);
    }
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

  function enterGuestMode() {
    setIsGuest(true);
    setUser(null);
    setSessions([]);
    setActiveSessionId(null);
    setChats([]);
    setTempMails([]);
    setActiveTempMail(null);
    setTempMessages([]);
  }

  async function logout() {
    if (supabase && user?.email) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setIsGuest(false);
    setChats([]);
    setSessions([]);
    setActiveSessionId(null);
    setTempMails([]);
    setActiveTempMail(null);
    setTempMessages([]);
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
          user_email: user?.email || null,
          session_id: user?.email ? activeSessionId : null
        })
      });

      const data = await res.json();

      if (data.session_id && !activeSessionId && user?.email) {
        setActiveSessionId(data.session_id);
      }

      setChats((prev) => [
        ...prev,
        {
          role: "ai",
          text: data.reply || "Tidak ada jawaban."
        }
      ]);

      if (user?.email) {
        loadSessions(user.email);
      }
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

  if (!canUseWorkspace) {
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="brand-logo">P</div>

          <h1>Properside AI</h1>

          <p>
            Login dengan Google untuk menyimpan history chat, tempmail, dan data
            tools kamu.
          </p>

          <button onClick={loginGoogle}>Login dengan Google</button>

          <button
            onClick={enterGuestMode}
            style={{
              marginTop: 12,
              background: "#27272a"
            }}
          >
            Masuk sebagai Guest
          </button>

          <p className="guest-note">
            Mode Guest bisa pakai AI dan tools, tapi semua data tidak disimpan.
            Kalau halaman direload, chat dan tempmail guest akan hilang.
          </p>
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
            <span>{isLoggedIn ? "AI Workspace" : "Guest Mode"}</span>
          </div>
        </div>

        {!isLoggedIn && (
          <div className="guest-warning">
            <strong>Guest Mode</strong>
            <p>
              Data chat dan tools tidak disimpan. Login Google untuk menyimpan
              semuanya.
            </p>
          </div>
        )}

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

          {!isLoggedIn ? (
            <p className="empty-history">
              History tidak tersedia di Guest Mode.
            </p>
          ) : (
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
          )}
        </div>

        <div className="sidebar-footer">
          <p>{isLoggedIn ? user.email : "Guest User"}</p>
          <button onClick={logout}>
            {isLoggedIn ? "Logout" : "Keluar Guest"}
          </button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <h1>{tools.find((t) => t.id === activeTool)?.name}</h1>
            <p>
              {isLoggedIn
                ? "Data kamu tersimpan otomatis di akun Google."
                : "Guest Mode aktif. Data tidak akan tersimpan setelah reload."}
            </p>
          </div>

          <div className="user-pill">
            {isLoggedIn ? user.email?.charAt(0).toUpperCase() : "G"}
          </div>
        </header>

        {activeTool === "chat" ? (
          <section className="chat-panel">
            <div className="chat-box">
              {chats.length === 0 && (
                <div className="empty-chat">
                  <h2>Apa yang ingin kamu buat hari ini?</h2>
                  <p>
                    {isLoggedIn
                      ? "Buat chat baru atau pilih history di sidebar kiri."
                      : "Kamu sedang memakai Guest Mode. Chat tidak akan tersimpan."}
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
        ) : activeTool === "anime" ? (
          <section className="placeholder-panel">
            <div className="placeholder-card anime-panel">
              <div className="placeholder-icon">🎬</div>

              <h2>STREAM ANIME</h2>

              <p>
                Cari anime, lihat ongoing, complete, schedule, dan daftar
                terbaru. Mode ini hanya menampilkan katalog/info anime.
              </p>

              <div className="anime-controls">
                <button onClick={() => loadAnime("home", 1)}>Home</button>
                <button onClick={() => loadAnime("schedule", 1)}>
                  Schedule
                </button>
                <button onClick={() => loadAnime("ongoing", 1)}>
                  Ongoing
                </button>
                <button onClick={() => loadAnime("complete", 1)}>
                  Complete
                </button>
              </div>

              <div className="anime-search">
                <input
                  value={animeQuery}
                  onChange={(e) => setAnimeQuery(e.target.value)}
                  placeholder="Cari anime..."
                />

                <button onClick={() => loadAnime("search", 1)}>Search</button>
              </div>

              {animeLoading ? (
                <p>Loading anime...</p>
              ) : (
                <div className="anime-grid">
                  {animeItems.length === 0 ? (
                    <p>Belum ada data anime.</p>
                  ) : (
                    animeItems.map((item, index) => (
                      <div className="anime-card" key={index}>
                        {getAnimeImage(item) && (
                          <img
                            src={getAnimeImage(item)}
                            alt={getAnimeTitle(item)}
                          />
                        )}

                        <div className="anime-card-body">
                          <h3>{getAnimeTitle(item)}</h3>
                          <p>{getAnimeInfo(item)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {(animeMode === "ongoing" || animeMode === "complete") && (
                <div className="anime-pagination">
                  <button
                    onClick={() =>
                      loadAnime(animeMode, Math.max(1, animePage - 1))
                    }
                  >
                    Prev
                  </button>

                  <span>Page {animePage}</span>

                  <button onClick={() => loadAnime(animeMode, animePage + 1)}>
                    Next
                  </button>
                </div>
              )}
            </div>
          </section>
        ) : activeTool === "tempmail" ? (
          <section className="placeholder-panel">
            <div className="placeholder-card tempmail-panel">
              <div className="placeholder-icon">📧</div>

              <h2>Tempmail Tool</h2>

              <p>
                {isLoggedIn
                  ? "Buat banyak email sementara. Email lama tersimpan di akun Google kamu."
                  : "Guest Mode: tempmail bisa dipakai, tapi tidak tersimpan setelah reload."}
              </p>

              <button onClick={createTempMail}>
                {tempLoading ? "Membuat..." : "+ Buat Email Baru"}
              </button>

              <div className="tempmail-list">
                <h3>Daftar Email</h3>

                {tempMails.length === 0 ? (
                  <p>Belum ada tempmail.</p>
                ) : (
                  tempMails.map((mail, index) => (
                    <div
                      key={mail.id || index}
                      className={
                        activeTempMail?.email === mail.email
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
