"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { getSupabase } from "./utils/supabaseClient";

const tools = [
  { id: "chat", name: "AI Chat", icon: "💬" },
  { id: "tempmail", name: "Tempmail", icon: "📧" },
  { id: "anime", name: "Stream Anime", icon: "🎬" },
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
  const [activeTool, setActiveTool] = useState("home");
  const [showProfileMenu, setShowProfileMenu] = useState(false);

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
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [animeDetail, setAnimeDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [episodeDetail, setEpisodeDetail] = useState(null);
  const [episodeLoading, setEpisodeLoading] = useState(false);

  const [animeBookmarks, setAnimeBookmarks] = useState([]);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

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
      loadAnimeBookmarks(user.email);
    }
  }, [user]);

  useEffect(() => {
    if (activeTool === "anime") {
      loadAnime("home", 1);
    }
  }, [activeTool]);

  function openTool(toolId) {
    setActiveTool(toolId);
    setShowProfileMenu(false);

    if (toolId === "chat") {
      newChat();
    }

    if (toolId === "anime") {
      loadAnime("home", 1);
    }
  }

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

    await fetch(`/api/chat?session_id=${sessionId}&user_email=${user.email}`, {
      method: "DELETE"
    });

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
      return [...(data?.ongoing || []), ...(data?.completed || [])];
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

  function getAnimeId(item) {
    return item?.animeId || item?.slug || item?.id || item?.anime_id || "";
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
    if (item?.info) return item.info;

    const episode = item?.episodes
      ? `Episode ${item.episodes}`
      : item?.episode || item?.latest_episode || "";

    const release = item?.releaseDay || item?.release_day || item?.day || "";

    const date = item?.latestReleaseDate || item?.lastReleaseDate || "";

    const score = item?.score ? `Score ${item.score}` : "";

    return (
      [episode, release, date, score].filter(Boolean).join(" • ") ||
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

  async function openAnimeDetail(item) {
    const animeId = getAnimeId(item);

    setSelectedAnime(item);
    setAnimeDetail(null);
    setSelectedEpisode(null);
    setEpisodeDetail(null);

    if (!animeId) {
      alert("Anime ID tidak ditemukan.");
      return;
    }

    try {
      setDetailLoading(true);

      const res = await fetch(
        `/api/anime?action=detail&animeId=${encodeURIComponent(animeId)}`
      );

      const json = await res.json();

      if (!json.success) {
        alert(json.error || "Gagal mengambil detail anime.");
        return;
      }

      setAnimeDetail(json.data?.detail || json.data || null);
    } catch {
      alert("Gagal mengambil detail anime.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function openEpisodeDetail(ep) {
    const episodeId = ep?.episodeId || ep?.id || ep?.slug || "";

    setSelectedEpisode(ep);
    setEpisodeDetail(null);

    if (!episodeId) {
      alert("Episode ID tidak ditemukan.");
      return;
    }

    try {
      setEpisodeLoading(true);

      const res = await fetch(
        `/api/anime?action=episode&episodeId=${encodeURIComponent(episodeId)}`
      );

      const json = await res.json();

      if (!json.success) {
        alert(json.error || "Gagal mengambil detail episode.");
        return;
      }

      setEpisodeDetail(json.data?.detail || json.data || null);
    } catch {
      alert("Gagal mengambil detail episode.");
    } finally {
      setEpisodeLoading(false);
    }
  }

  function closeAnimeDetail() {
    setSelectedAnime(null);
    setAnimeDetail(null);
    setSelectedEpisode(null);
    setEpisodeDetail(null);
  }

  function closeEpisodeDetail() {
    setSelectedEpisode(null);
    setEpisodeDetail(null);
  }

  function searchLegalAnime(title) {
    const q = encodeURIComponent(`${title} legal streaming anime`);
    window.open(`https://www.google.com/search?q=${q}`, "_blank");
  }

  function getAnimeDetailData() {
    return (
      animeDetail?.detail ||
      animeDetail?.anime ||
      animeDetail?.data ||
      animeDetail ||
      selectedAnime ||
      {}
    );
  }

  function renderValue(value) {
    if (!value) return "-";

    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") return item;

          return (
            item?.title ||
            item?.name ||
            item?.genre ||
            item?.serverName ||
            item?.quality ||
            JSON.stringify(item)
          );
        })
        .join(", ");
    }

    if (typeof value === "object") {
      return (
        value?.title ||
        value?.name ||
        value?.serverName ||
        value?.quality ||
        JSON.stringify(value)
      );
    }

    return value;
  }

  function getDetailEpisodes(detail) {
    return (
      detail?.episodeList ||
      detail?.episodesList ||
      detail?.episodes ||
      detail?.episode ||
      []
    );
  }

  function getEpisodeDetailData() {
    return (
      episodeDetail?.detail ||
      episodeDetail?.episode ||
      episodeDetail?.data ||
      episodeDetail ||
      selectedEpisode ||
      {}
    );
  }

  function getEpisodeServers(detail) {
    const rawServers =
      detail?.servers ||
      detail?.serverList ||
      detail?.streamingServers ||
      detail?.server ||
      detail?.data?.servers ||
      [];

    if (Array.isArray(rawServers)) return rawServers;

    if (typeof rawServers === "object" && rawServers !== null) {
      return Object.entries(rawServers).flatMap(([quality, servers]) => {
        if (Array.isArray(servers)) {
          return servers.map((server) => ({
            ...server,
            quality
          }));
        }

        return [
          {
            quality,
            ...servers
          }
        ];
      });
    }

    return [];
  }

  function getServerName(server, index) {
    return (
      server?.serverName ||
      server?.name ||
      server?.title ||
      server?.server ||
      server?.quality ||
      `Server ${index + 1}`
    );
  }

  function getServerQuality(server) {
    return server?.quality || server?.resolution || server?.type || "Default";
  }

  function getServerSource(server) {
    return (
      server?.source ||
      server?.provider ||
      server?.host ||
      "otakudesu.blog"
    );
  }

  async function loadAnimeBookmarks(email) {
    if (!email) return;

    try {
      const res = await fetch(
        `/api/bookmarks?user_email=${encodeURIComponent(email)}`
      );

      const data = await res.json();

      setAnimeBookmarks(data?.data || []);
    } catch {
      console.log("Gagal load bookmark anime.");
    }
  }

  function isAnimeBookmarked(item) {
    const animeId = getAnimeId(item);

    return animeBookmarks.some((bookmark) => bookmark.anime_id === animeId);
  }

  async function toggleAnimeBookmark(item, event) {
    if (event) {
      event.stopPropagation();
    }

    if (!user?.email) {
      alert("Login Google dulu untuk menyimpan bookmark anime.");
      return;
    }

    const animeId = getAnimeId(item);

    if (!animeId) {
      alert("Anime ID tidak ditemukan.");
      return;
    }

    try {
      setBookmarkLoading(true);

      const bookmarked = isAnimeBookmarked(item);

      if (bookmarked) {
        await fetch(
          `/api/bookmarks?user_email=${encodeURIComponent(
            user.email
          )}&anime_id=${encodeURIComponent(animeId)}`,
          {
            method: "DELETE"
          }
        );
      } else {
        await fetch("/api/bookmarks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            user_email: user.email,
            anime: {
              anime_id: animeId,
              title: getAnimeTitle(item),
              poster: getAnimeImage(item),
              info: getAnimeInfo(item)
            }
          })
        });
      }

      loadAnimeBookmarks(user.email);
    } catch {
      alert("Gagal update bookmark.");
    } finally {
      setBookmarkLoading(false);
    }
  }

  function showBookmarkedAnime() {
    const list = animeBookmarks.map((bookmark) => ({
      title: bookmark.title,
      poster: bookmark.poster,
      animeId: bookmark.anime_id,
      info: bookmark.info
    }));

    setAnimeMode("bookmark");
    setAnimeItems(list);
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
    setAnimeBookmarks([]);
  }

  async function logout() {
    if (supabase && user?.email) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setIsGuest(false);
    setShowProfileMenu(false);
    setChats([]);
    setSessions([]);
    setActiveSessionId(null);
    setTempMails([]);
    setActiveTempMail(null);
    setTempMessages([]);
    setAnimeBookmarks([]);
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
            Login dengan Google untuk menyimpan history chat, tempmail, bookmark
            anime, dan data tools kamu.
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
            Kalau halaman direload, chat, tempmail, dan bookmark guest akan
            hilang.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={activeTool === "home" ? "workspace home-mode" : "workspace"}
    >
      {activeTool !== "home" && (
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
            <button
              className={
                activeTool === "home" ? "tool-button active" : "tool-button"
              }
              onClick={() => setActiveTool("home")}
            >
              <span>🏠</span>
              Beranda
            </button>

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
      )}

      <section className="main-area">
        <header
          className={activeTool === "home" ? "topbar topbar-home" : "topbar"}
        >
          <div>
            <h1>
              {activeTool === "home"
                ? "Beranda"
                : tools.find((t) => t.id === activeTool)?.name}
            </h1>

            <p>
              {isLoggedIn
                ? "Data kamu tersimpan otomatis di akun Google."
                : "Guest Mode aktif. Data tidak akan tersimpan setelah reload."}
            </p>
          </div>

          <div className="topbar-actions">
            {activeTool !== "home" && (
              <button
                className="back-home-btn"
                onClick={() => setActiveTool("home")}
              >
                🏠 Beranda
              </button>
            )}

            <div className="profile-menu-wrap">
              <button
                className="user-pill"
                onClick={() => setShowProfileMenu((prev) => !prev)}
              >
                {isLoggedIn ? user.email?.charAt(0).toUpperCase() : "G"}
              </button>

              {showProfileMenu && (
                <div className="profile-menu">
                  <div className="profile-menu-head">
                    <strong>{isLoggedIn ? "Akun Google" : "Guest Mode"}</strong>
                    <small>{isLoggedIn ? user.email : "Data tidak disimpan"}</small>
                  </div>

                  <button
                    className="profile-menu-item"
                    onClick={() => {
                      setShowProfileMenu(false);
                      setActiveTool("home");
                    }}
                  >
                    🏠 Beranda
                  </button>

                  {activeTool === "home" && (
                    <>
                      <button
                        className="profile-menu-item"
                        onClick={() => openTool("chat")}
                      >
                        💬 AI Chat
                      </button>

                      <button
                        className="profile-menu-item"
                        onClick={() => openTool("tempmail")}
                      >
                        📧 Tempmail
                      </button>

                      <button
                        className="profile-menu-item"
                        onClick={() => openTool("anime")}
                      >
                        🎬 Stream Anime
                      </button>
                    </>
                  )}

                  <button
                    className="profile-menu-item danger"
                    onClick={logout}
                  >
                    {isLoggedIn ? "🚪 Logout" : "🚪 Keluar Guest"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {activeTool === "home" ? (
          <section className="workspace-home">
            <div className="workspace-hero">
              <div>
                <p className="hero-badge">TheProperSide Workspace</p>

                <h1>Selamat Datang di Workspace!</h1>

                <p>
                  Pilih aplikasi dan tools cerdas untuk mempermudah pekerjaan,
                  coding, email sementara, dan hiburan kamu hari ini.
                </p>
              </div>
            </div>

            <div className="workspace-app-grid">
              <button
                className="workspace-app-card"
                onClick={() => openTool("chat")}
              >
                <div className="app-icon purple">💬</div>
                <h2>AI Chat</h2>
                <p>
                  Ngobrol dengan AI untuk coding, menulis artikel, membuat ide,
                  atau bertanya apa saja.
                </p>
                <span>Buka Aplikasi →</span>
              </button>

              <button
                className="workspace-app-card"
                onClick={() => openTool("tempmail")}
              >
                <div className="app-icon green">📧</div>
                <h2>Tempmail</h2>
                <p>
                  Buat email sementara sekali pakai untuk daftar akun tanpa
                  takut inbox utama penuh spam.
                </p>
                <span>Buka Alat →</span>
              </button>

              <button
                className="workspace-app-card"
                onClick={() => openTool("anime")}
              >
                <div className="app-icon orange">🎬</div>
                <h2>Stream Anime</h2>
                <p>
                  Cari anime, lihat jadwal, ongoing, complete, detail episode,
                  dan bookmark anime favorit.
                </p>
                <span>Buka Tool →</span>
              </button>

              <button
                className="workspace-app-card"
                onClick={() => openTool("image")}
              >
                <div className="app-icon cyan">🖼️</div>
                <h2>Image Tool</h2>
                <p>
                  Menu image sudah disiapkan untuk nanti disambungkan ke fitur
                  gambar.
                </p>
                <span>Buka Menu →</span>
              </button>

              <button
                className="workspace-app-card"
                onClick={() => openTool("text")}
              >
                <div className="app-icon pink">✍️</div>
                <h2>Text Writer</h2>
                <p>
                  Menu penulis teks untuk artikel, caption, ide konten, dan
                  tulisan lainnya.
                </p>
                <span>Buka Menu →</span>
              </button>

              <button
                className="workspace-app-card"
                onClick={() => openTool("code")}
              >
                <div className="app-icon blue">💻</div>
                <h2>Code Helper</h2>
                <p>
                  Menu bantuan coding untuk project web, bug fixing, dan
                  pengembangan fitur.
                </p>
                <span>Buka Menu →</span>
              </button>

              <button
                className="workspace-app-card"
                onClick={() => openTool("translate")}
              >
                <div className="app-icon teal">🌐</div>
                <h2>Translate</h2>
                <p>
                  Menu translate untuk kebutuhan bahasa, ringkasan, dan
                  pemahaman teks.
                </p>
                <span>Buka Menu →</span>
              </button>

              <button
                className="workspace-app-card"
                onClick={() => openTool("summary")}
              >
                <div className="app-icon gray">📄</div>
                <h2>Summarizer</h2>
                <p>
                  Menu ringkasan untuk merangkum artikel, catatan, dokumen, dan
                  teks panjang.
                </p>
                <span>Buka Menu →</span>
              </button>
            </div>
          </section>
        ) : activeTool === "chat" ? (
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
              <h2>Stream Anime</h2>

              <p>
                Cari anime, lihat ongoing, complete, schedule, dan daftar
                terbaru. Klik card untuk melihat detail anime.
              </p>

              <div className="anime-controls">
                <button onClick={() => loadAnime("home", 1)}>Home</button>
                <button onClick={() => loadAnime("schedule", 1)}>Schedule</button>
                <button onClick={() => loadAnime("ongoing", 1)}>Ongoing</button>
                <button onClick={() => loadAnime("complete", 1)}>Complete</button>
                <button onClick={showBookmarkedAnime}>Bookmark</button>
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
                    <p>
                      {animeMode === "bookmark"
                        ? "Belum ada anime yang dibookmark."
                        : "Belum ada data anime."}
                    </p>
                  ) : (
                    animeItems.map((item, index) => (
                      <div
                        className="anime-card"
                        key={index}
                        onClick={() => openAnimeDetail(item)}
                      >
                        {getAnimeImage(item) && (
                          <img
                            src={getAnimeImage(item)}
                            alt={getAnimeTitle(item)}
                          />
                        )}

                        <div className="anime-card-body">
                          <div className="anime-card-title-row">
                            <h3>{getAnimeTitle(item)}</h3>

                            <button
                              className={
                                isAnimeBookmarked(item)
                                  ? "anime-bookmark-btn active"
                                  : "anime-bookmark-btn"
                              }
                              onClick={(event) =>
                                toggleAnimeBookmark(item, event)
                              }
                              disabled={bookmarkLoading}
                            >
                              {isAnimeBookmarked(item) ? "★" : "☆"}
                            </button>
                          </div>

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

              {selectedAnime && (
                <div className="anime-detail-overlay">
                  <div className="anime-detail-card">
                    <button
                      className="anime-detail-close"
                      onClick={closeAnimeDetail}
                    >
                      ✕
                    </button>

                    <div className="anime-detail-head">
                      {getAnimeImage(selectedAnime) && (
                        <img
                          src={getAnimeImage(selectedAnime)}
                          alt={getAnimeTitle(selectedAnime)}
                        />
                      )}

                      <div>
                        <h2>{getAnimeTitle(selectedAnime)}</h2>
                        <p>{getAnimeInfo(selectedAnime)}</p>

                        <p className="anime-id-text">
                          ID:{" "}
                          {selectedAnime.animeId || selectedAnime.slug || "-"}
                        </p>

                        <button
                          onClick={() =>
                            searchLegalAnime(getAnimeTitle(selectedAnime))
                          }
                        >
                          Cari Tontonan Legal
                        </button>

                        <button
                          onClick={(event) =>
                            toggleAnimeBookmark(selectedAnime, event)
                          }
                          style={{
                            marginTop: 10,
                            background: isAnimeBookmarked(selectedAnime)
                              ? "#ca8a04"
                              : "#27272a"
                          }}
                        >
                          {isAnimeBookmarked(selectedAnime)
                            ? "★ Sudah Bookmark"
                            : "☆ Bookmark Anime"}
                        </button>
                      </div>
                    </div>

                    <div className="anime-detail-body">
                      {detailLoading ? (
                        <p>Loading detail...</p>
                      ) : (
                        (() => {
                          const detail = getAnimeDetailData();
                          const episodes = getDetailEpisodes(detail);

                          return (
                            <>
                              <h3>Detail Anime</h3>

                              <div className="anime-info-grid">
                                <div className="anime-info-card blue">
                                  <span>Score</span>
                                  <strong>{renderValue(detail.score)}</strong>
                                </div>

                                <div className="anime-info-card green">
                                  <span>Status</span>
                                  <strong>{renderValue(detail.status)}</strong>
                                </div>

                                <div className="anime-info-card purple">
                                  <span>Type</span>
                                  <strong>{renderValue(detail.type)}</strong>
                                </div>

                                <div className="anime-info-card orange">
                                  <span>Duration</span>
                                  <strong>{renderValue(detail.duration)}</strong>
                                </div>
                              </div>

                              <div className="anime-detail-section">
                                <h4>Informasi</h4>

                                <div className="anime-detail-row">
                                  <span>Japanese</span>
                                  <p>{renderValue(detail.japanese)}</p>
                                </div>

                                <div className="anime-detail-row">
                                  <span>Producer</span>
                                  <p>{renderValue(detail.producers)}</p>
                                </div>

                                <div className="anime-detail-row">
                                  <span>Studio</span>
                                  <p>{renderValue(detail.studios)}</p>
                                </div>

                                <div className="anime-detail-row">
                                  <span>Released</span>
                                  <p>
                                    {renderValue(
                                      detail.aired || detail.releaseDate
                                    )}
                                  </p>
                                </div>

                                <div className="anime-detail-row">
                                  <span>Genre</span>
                                  <p>
                                    {renderValue(
                                      detail.genres || detail.genreList
                                    )}
                                  </p>
                                </div>
                              </div>

                              {(detail.synopsis || detail.synopsisText) && (
                                <div className="anime-detail-section">
                                  <h4>Sinopsis</h4>
                                  <p className="anime-synopsis">
                                    {renderValue(
                                      detail.synopsis || detail.synopsisText
                                    )}
                                  </p>
                                </div>
                              )}

                              {Array.isArray(episodes) &&
                                episodes.length > 0 && (
                                  <div className="anime-detail-section">
                                    <h4>Episode</h4>

                                    <div className="anime-episode-list">
                                      {episodes
                                        .slice(0, 12)
                                        .map((ep, index) => (
                                          <button
                                            className="anime-episode-item"
                                            key={index}
                                            onClick={() =>
                                              openEpisodeDetail(ep)
                                            }
                                          >
                                            <strong>
                                              {ep?.title ||
                                                ep?.episode ||
                                                ep?.name ||
                                                `Episode ${index + 1}`}
                                            </strong>

                                            <span>
                                              Klik untuk lihat server tersedia
                                            </span>
                                          </button>
                                        ))}
                                    </div>
                                  </div>
                                )}

                              {selectedEpisode && (
                                <div className="episode-detail-box">
                                  <div className="episode-detail-header">
                                    <h4>
                                      {selectedEpisode?.title ||
                                        selectedEpisode?.episode ||
                                        selectedEpisode?.name ||
                                        "Detail Episode"}
                                    </h4>

                                    <button onClick={closeEpisodeDetail}>
                                      Tutup
                                    </button>
                                  </div>

                                  {episodeLoading ? (
                                    <p>Loading episode...</p>
                                  ) : (
                                    (() => {
                                      const epDetail = getEpisodeDetailData();
                                      const servers =
                                        getEpisodeServers(epDetail);

                                      return (
                                        <div className="episode-detail-content">
                                          <p>
                                            Detail episode berhasil dimuat.
                                          </p>

                                          <p>
                                            <strong>Judul:</strong>{" "}
                                            {renderValue(
                                              epDetail.title ||
                                                selectedEpisode?.title
                                            )}
                                          </p>

                                          <p>
                                            <strong>Episode:</strong>{" "}
                                            {renderValue(
                                              epDetail.episode ||
                                                selectedEpisode?.episode
                                            )}
                                          </p>

                                          <p>
                                            <strong>Rilis:</strong>{" "}
                                            {renderValue(
                                              epDetail.releaseDate ||
                                                epDetail.date
                                            )}
                                          </p>

                                          <div className="episode-server-section">
                                            <h5>Server Tersedia</h5>

                                            {servers.length === 0 ? (
                                              <p className="episode-server-empty">
                                                Server belum tersedia dari API.
                                              </p>
                                            ) : (
                                              <div className="episode-server-list">
                                                {servers.map(
                                                  (server, index) => (
                                                    <div
                                                      className="episode-server-item"
                                                      key={index}
                                                    >
                                                      <div>
                                                        <strong>
                                                          {getServerName(
                                                            server,
                                                            index
                                                          )}
                                                        </strong>

                                                        <span>
                                                          {getServerQuality(
                                                            server
                                                          )}
                                                        </span>
                                                      </div>

                                                      <small>
                                                        Sumber:{" "}
                                                        {getServerSource(
                                                          server
                                                        )}
                                                      </small>
                                                    </div>
                                                  )
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })()
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()
                      )}
                    </div>
                  </div>
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
                      style={{ marginTop: 10 }}
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
