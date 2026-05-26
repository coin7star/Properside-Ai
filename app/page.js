"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { getSupabase } from "./utils/supabaseClient";

const tools = [
  { id: "home", name: "Beranda", icon: "🏠" },
  { id: "chat", name: "AI Chat", icon: "💬" },
  { id: "tempmail", name: "Tempmail", icon: "📧" },
  { id: "image", name: "AI Image", icon: "🖼️" },
  { id: "text", name: "AI Writer", icon: "✍️" },
  { id: "code", name: "AI Code", icon: "💻" },
  { id: "translate", name: "Translate", icon: "🌐" },
  { id: "summary", name: "Summarizer", icon: "📄" },
  { id: "settings", name: "Settings", icon: "⚙️" }
];

function renderInlineFormat(text, keyPrefix = "inline") {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, index) => {
    const isBold = part.startsWith("**") && part.endsWith("**");

    if (isBold) {
      return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return <span key={`${keyPrefix}-${index}`}>{part}</span>;
  });
}

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

        const lines = part.split("\n");
        const elements = [];
        let listItems = [];
        let listType = null;

        const flushList = () => {
          if (listItems.length === 0) return;

          if (listType === "ol") {
            elements.push(
              <ol key={`ol-${index}-${elements.length}`}>
                {listItems.map((item, i) => (
                  <li key={`oli-${i}`}>
                    {renderInlineFormat(item, `ol-${index}-${i}`)}
                  </li>
                ))}
              </ol>
            );
          }

          if (listType === "ul") {
            elements.push(
              <ul key={`ul-${index}-${elements.length}`}>
                {listItems.map((item, i) => (
                  <li key={`uli-${i}`}>
                    {renderInlineFormat(item, `ul-${index}-${i}`)}
                  </li>
                ))}
              </ul>
            );
          }

          listItems = [];
          listType = null;
        };

        lines.forEach((rawLine, lineIndex) => {
          const line = rawLine.trim();

          if (!line) {
            flushList();
            return;
          }

          if (/^\d+\.\s+/.test(line)) {
            const itemText = line.replace(/^\d+\.\s+/, "");

            if (listType !== "ol") {
              flushList();
              listType = "ol";
            }

            listItems.push(itemText);
            return;
          }

          if (/^[-*]\s+/.test(line)) {
            const itemText = line.replace(/^[-*]\s+/, "");

            if (listType !== "ul") {
              flushList();
              listType = "ul";
            }

            listItems.push(itemText);
            return;
          }

          flushList();

          elements.push(
            <p key={`p-${index}-${lineIndex}`}>
              {renderInlineFormat(line, `p-${index}-${lineIndex}`)}
            </p>
          );
        });

        flushList();

        return (
          <div key={index} className="formatted-block">
            {elements}
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [supabase, setSupabase] = useState(null);
  const [user, setUser] = useState(null);
  const [activeTool, setActiveTool] = useState("home");
  const [toolMenuOpen, setToolMenuOpen] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [message, setMessage] = useState("");
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);

  const [tempMails, setTempMails] = useState([]);
  const [activeTempMail, setActiveTempMail] = useState(null);
  const [tempMessages, setTempMessages] = useState([]);
  const [tempLoading, setTempLoading] = useState(false);

  const [imagePrompt, setImagePrompt] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [generatedImage, setGeneratedImage] = useState(null);
  const [imageProvider, setImageProvider] = useState("auto");
  const [uploadedImageFile, setUploadedImageFile] = useState(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState("");

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

  useEffect(() => {
    return () => {
      if (uploadedImagePreview) {
        URL.revokeObjectURL(uploadedImagePreview);
      }
    };
  }, [uploadedImagePreview]);

  async function loadSessions(email) {
    try {
      const res = await fetch(
        `/api/chat?action=sessions&user_email=${encodeURIComponent(email)}`
      );

      const data = await res.json();
      setSessions(data.data || []);
    } catch {
      console.log("Gagal load history chat.");
    }
  }

  async function loadMessages(sessionId) {
    setActiveSessionId(sessionId);
    setActiveTool("chat");
    setToolMenuOpen(false);

    try {
      const res = await fetch(
        `/api/chat?action=messages&user_email=${encodeURIComponent(
          user.email
        )}&session_id=${encodeURIComponent(sessionId)}`
      );

      const data = await res.json();

      setChats(
        (data.data || []).map((msg) => ({
          role: msg.role,
          text: msg.content
        }))
      );
    } catch {
      alert("Gagal membuka history chat.");
    }
  }

  function newChat() {
    setActiveTool("chat");
    setToolMenuOpen(false);
    setActiveSessionId(null);
    setChats([]);
    setMessage("");
  }

  async function renameSession(sessionId) {
    const title = prompt("Nama chat baru:");

    if (!title || !title.trim()) return;

    try {
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
    } catch {
      alert("Gagal rename chat.");
    }
  }

  async function deleteSession(sessionId) {
    const ok = confirm("Hapus history chat ini?");

    if (!ok) return;

    try {
      await fetch(
        `/api/chat?session_id=${encodeURIComponent(
          sessionId
        )}&user_email=${encodeURIComponent(user.email)}`,
        {
          method: "DELETE"
        }
      );

      if (activeSessionId === sessionId) {
        newChat();
      }

      loadSessions(user.email);
    } catch {
      alert("Gagal hapus chat.");
    }
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
    if (!user?.email || tempLoading) return;

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
    if (!mail?.email_token || !user?.email || tempLoading) return;

    try {
      setTempLoading(true);
      setActiveTempMail(mail);

      const res = await fetch(
        `/api/tempmail?action=check&user_email=${encodeURIComponent(
          user.email
        )}&token=${encodeURIComponent(mail.email_token)}`
      );

      const data = await res.json();

      if (data?.error) {
        alert(data.error);
        return;
      }

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
    setGeneratedImage(null);
    setImageError("");
    clearUploadedImage();
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

  function handleImageUpload(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      setImageError("File harus berupa gambar.");
      return;
    }

    if (uploadedImagePreview) {
      URL.revokeObjectURL(uploadedImagePreview);
    }

    const previewUrl = URL.createObjectURL(file);

    setUploadedImageFile(file);
    setUploadedImagePreview(previewUrl);
    setGeneratedImage(null);
    setImageError("");

    if (!["auto", "gemini"].includes(imageProvider)) {
      setImageProvider("gemini");
    }
  }

  function clearUploadedImage() {
    if (uploadedImagePreview) {
      URL.revokeObjectURL(uploadedImagePreview);
    }

    setUploadedImageFile(null);
    setUploadedImagePreview("");
  }

  async function generateImage() {
    if (!imagePrompt.trim() || imageLoading) return;

    try {
      setImageLoading(true);
      setImageError("");
      setGeneratedImage(null);

      let res;
      let data;

      if (uploadedImageFile) {
        if (!["auto", "gemini"].includes(imageProvider)) {
          setImageError(
            "Fitur edit gambar saat ini hanya support Gemini atau Auto."
          );
          return;
        }

        const formData = new FormData();
        formData.append("prompt", imagePrompt.trim());
        formData.append("provider", imageProvider);
        formData.append("image", uploadedImageFile);

        res = await fetch("/api/image-edit", {
          method: "POST",
          body: formData
        });

        data = await res.json();
      } else {
        res = await fetch("/api/image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            prompt: imagePrompt.trim(),
            provider: imageProvider
          })
        });

        data = await res.json();
      }

      if (!res.ok || !data?.success) {
        setImageError(data?.error || "Gagal generate gambar.");
        return;
      }

      setGeneratedImage({
        prompt: imagePrompt.trim(),
        text: data?.text || "",
        mimeType: data?.mimeType || "image/png",
        base64: data?.image || "",
        dataUrl: `data:${data?.mimeType || "image/png"};base64,${
          data?.image || ""
        }`,
        provider: data?.provider || imageProvider,
        edited: !!data?.edited
      });
    } catch (error) {
      setImageError(
        error?.message || "Terjadi error saat generate / edit gambar."
      );
    } finally {
      setImageLoading(false);
    }
  }

  function downloadGeneratedImage() {
    if (!generatedImage?.dataUrl) return;

    const ext =
      generatedImage?.mimeType?.includes("jpeg") ||
      generatedImage?.mimeType?.includes("jpg")
        ? "jpg"
        : "png";

    const link = document.createElement("a");
    link.href = generatedImage.dataUrl;
    link.download = `properside-ai-image.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function useExamplePrompt(text) {
    setImagePrompt(text);
    setActiveTool("image");
    setToolMenuOpen(false);
  }

  function getProviderLabel(provider) {
    if (provider === "gemini") return "Gemini";
    if (provider === "fal") return "fal.ai";
    if (provider === "huggingface") return "Hugging Face";
    return "Auto";
  }

  function renderChatHistory() {
    return (
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
    );
  }

  function renderImageTool() {
    return (
      <section className="placeholder-panel">
        <div
          className="placeholder-card"
          style={{
            maxWidth: 980,
            width: "100%",
            textAlign: "left"
          }}
        >
          <div className="placeholder-icon">🖼️</div>

          <h2 style={{ textAlign: "center" }}>AI Image Generator</h2>

          <p style={{ textAlign: "center" }}>
            Buat gambar dari teks atau upload gambar lalu minta AI mengubahnya
            sesuai prompt.
          </p>

          <div
            style={{
              marginTop: 18,
              display: "grid",
              gap: 12
            }}
          >
            <div>
              <strong style={{ display: "block", marginBottom: 10 }}>
                Pilih AI Model
              </strong>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap"
                }}
              >
                {[
                  { id: "auto", name: "Auto" },
                  { id: "gemini", name: "Gemini" },
                  { id: "fal", name: "fal.ai" },
                  { id: "huggingface", name: "Hugging Face" }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setImageProvider(item.id)}
                    style={{
                      background:
                        imageProvider === item.id ? "#3d63dd" : "#18181b",
                      border:
                        imageProvider === item.id
                          ? "1px solid #4e74f0"
                          : "1px solid #2f2f35",
                      color: "#fff",
                      borderRadius: 999,
                      padding: "10px 16px",
                      cursor: "pointer",
                      width: "auto"
                    }}
                  >
                    {item.name}
                  </button>
                ))}
              </div>

              <small
                style={{
                  display: "block",
                  marginTop: 10,
                  color: "#a1a1aa"
                }}
              >
                Mode aktif: {getProviderLabel(imageProvider)}
              </small>

              <small
                style={{
                  display: "block",
                  marginTop: 6,
                  color: "#a1a1aa"
                }}
              >
                Catatan: upload + edit gambar saat ini support Gemini / Auto.
              </small>
            </div>

            <div
              style={{
                display: "grid",
                gap: 10
              }}
            >
              <strong>Upload Gambar (opsional)</strong>

              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{
                  width: "100%",
                  borderRadius: 14,
                  border: "1px solid #2f2f35",
                  background: "#0f0f11",
                  color: "#fff",
                  padding: 12,
                  boxSizing: "border-box"
                }}
              />

              {uploadedImagePreview && (
                <div
                  style={{
                    background: "#101014",
                    border: "1px solid #27272a",
                    borderRadius: 20,
                    padding: 14
                  }}
                >
                  <img
                    src={uploadedImagePreview}
                    alt="Preview upload"
                    style={{
                      width: "100%",
                      display: "block",
                      borderRadius: 14,
                      marginBottom: 12
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap"
                    }}
                  >
                    <button
                      onClick={clearUploadedImage}
                      style={{
                        width: "auto"
                      }}
                    >
                      Hapus Gambar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder={
                uploadedImageFile
                  ? 'Contoh: "Ubah background jadi cyberpunk malam, tetap pertahankan wajah orangnya"'
                  : 'Contoh: "Buat gambar kucing astronaut lucu di bulan, style 3D, detail tinggi"'
              }
              rows={5}
              style={{
                width: "100%",
                borderRadius: 18,
                border: "1px solid #2f2f35",
                background: "#0f0f11",
                color: "#fff",
                padding: 16,
                fontSize: 15,
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box"
              }}
            />

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap"
              }}
            >
              <button onClick={generateImage} disabled={imageLoading}>
                {imageLoading
                  ? uploadedImageFile
                    ? "Editing..."
                    : "Generating..."
                  : uploadedImageFile
                  ? `Edit Image (${getProviderLabel(imageProvider)})`
                  : `Generate Image (${getProviderLabel(imageProvider)})`}
              </button>

              {generatedImage?.dataUrl && (
                <button onClick={downloadGeneratedImage}>Download Image</button>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap"
              }}
            >
              <button
                onClick={() =>
                  useExamplePrompt(
                    "Buat gambar mobil sport cyberpunk di jalan kota malam, neon lights, cinematic, ultra detail"
                  )
                }
                style={{
                  background: "#18181b",
                  border: "1px solid #2f2f35",
                  color: "#fff",
                  borderRadius: 999,
                  padding: "10px 14px",
                  cursor: "pointer",
                  width: "auto"
                }}
              >
                Cyberpunk Car
              </button>

              <button
                onClick={() =>
                  useExamplePrompt(
                    "Buat ilustrasi logo maskot kucing lucu memakai hoodie biru, gaya modern flat vector, background putih"
                  )
                }
                style={{
                  background: "#18181b",
                  border: "1px solid #2f2f35",
                  color: "#fff",
                  borderRadius: 999,
                  padding: "10px 14px",
                  cursor: "pointer",
                  width: "auto"
                }}
              >
                Mascot Logo
              </button>

              <button
                onClick={() =>
                  useExamplePrompt(
                    "Buat poster anime fantasy seorang pendekar wanita memegang pedang bercahaya di hutan malam"
                  )
                }
                style={{
                  background: "#18181b",
                  border: "1px solid #2f2f35",
                  color: "#fff",
                  borderRadius: 999,
                  padding: "10px 14px",
                  cursor: "pointer",
                  width: "auto"
                }}
              >
                Anime Poster
              </button>
            </div>

            {imageError && (
              <div
                style={{
                  background: "rgba(220, 38, 38, 0.15)",
                  color: "#fca5a5",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 14,
                  padding: 14,
                  overflowWrap: "anywhere",
                  wordBreak: "break-word"
                }}
              >
                {imageError}
              </div>
            )}

            {generatedImage?.dataUrl && (
              <div
                style={{
                  marginTop: 10,
                  background: "#101014",
                  border: "1px solid #27272a",
                  borderRadius: 22,
                  padding: 16
                }}
              >
                <img
                  src={generatedImage.dataUrl}
                  alt={generatedImage.prompt}
                  style={{
                    width: "100%",
                    borderRadius: 18,
                    display: "block"
                  }}
                />

                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gap: 8
                  }}
                >
                  <div>
                    <strong>Provider:</strong>
                    <p style={{ marginTop: 6 }}>
                      {getProviderLabel(generatedImage.provider)}
                    </p>
                  </div>

                  <div>
                    <strong>Tipe:</strong>
                    <p style={{ marginTop: 6 }}>
                      {generatedImage.edited
                        ? "Hasil edit gambar"
                        : "Hasil generate gambar"}
                    </p>
                  </div>

                  <div>
                    <strong>Prompt:</strong>
                    <p style={{ marginTop: 6 }}>{generatedImage.prompt}</p>
                  </div>

                  {generatedImage.text ? (
                    <div>
                      <strong>Keterangan AI:</strong>
                      <p style={{ marginTop: 6 }}>{generatedImage.text}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  function renderActiveTool() {
    if (activeTool === "home") {
      return (
        <section className="placeholder-panel">
          <div className="placeholder-card">
            <div className="placeholder-icon">🏠</div>

            <h2>Selamat Datang di Properside AI</h2>

            <p>
              Pilih tool di menu atas untuk mulai menggunakan AI Chat, AI Image,
              Tempmail, dan fitur lainnya.
            </p>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
                flexWrap: "wrap"
              }}
            >
              <button onClick={() => setActiveTool("chat")}>Mulai Chat AI</button>
              <button onClick={() => setActiveTool("image")}>Buka AI Image</button>
            </div>
          </div>
        </section>
      );
    }

    if (activeTool === "chat") {
      return (
        <section className="chat-panel">
          {renderChatHistory()}

          <div className="chat-box">
            {chats.length === 0 && (
              <div className="empty-chat">
                <h2>Apa yang ingin kamu buat hari ini?</h2>
                <p>Buat chat baru atau pilih history chat di atas.</p>
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
              {loading ? "Mengirim..." : "Kirim"}
            </button>
          </div>
        </section>
      );
    }

    if (activeTool === "tempmail") {
      return (
        <section className="placeholder-panel">
          <div className="placeholder-card tempmail-panel">
            <div className="placeholder-icon">📧</div>

            <h2>Tempmail Tool</h2>

            <p>
              Buat banyak email sementara. Email lama tetap tersimpan dan bisa
              dicek kembali.
            </p>

            <button onClick={createTempMail} disabled={tempLoading}>
              {tempLoading ? "Mohon tunggu..." : "+ Buat Email Baru"}
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

                  <div className="tempmail-email">{activeTempMail.email}</div>

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
                    disabled={tempLoading}
                    style={{ marginTop: 10 }}
                  >
                    {tempLoading ? "Mohon tunggu..." : "Check Inbox"}
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
      );
    }

    if (activeTool === "image") {
      return renderImageTool();
    }

    return (
      <section className="placeholder-panel">
        <div className="placeholder-card">
          <div className="placeholder-icon">
            {tools.find((t) => t.id === activeTool)?.icon}
          </div>

          <h2>{tools.find((t) => t.id === activeTool)?.name}</h2>

          <p>
            Fitur ini sudah disiapkan sebagai menu. Nanti bisa kita sambungkan ke
            tool khusus.
          </p>

          <button>Coming Soon</button>
        </div>
      </section>
    );
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

        <button
          className="tool-toggle-btn"
          onClick={() => setToolMenuOpen(!toolMenuOpen)}
        >
          {toolMenuOpen ? "Tutup Menu ▲" : "Buka Menu Tools ▼"}
        </button>

        <div className={toolMenuOpen ? "sidebar-body open" : "sidebar-body"}>
          <nav className="tool-list">
            {tools.map((tool) => (
              <button
                key={tool.id}
                className={
                  activeTool === tool.id ? "tool-button active" : "tool-button"
                }
                onClick={() => {
                  setActiveTool(tool.id);
                  setToolMenuOpen(false);
                }}
              >
                <span>{tool.icon}</span>
                {tool.name}
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <p>{user.email}</p>
            <button onClick={logout}>Logout</button>
          </div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <h1>{tools.find((t) => t.id === activeTool)?.name}</h1>
            <p>Properside AI Workspace.</p>
          </div>

          <div className="user-pill">{user.email?.charAt(0).toUpperCase()}</div>
        </header>

        {renderActiveTool()}
      </section>
    </main>
  );
}