"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./utils/supabaseClient";

const CHAT_IMAGE_MAX_SIZE = 4 * 1024 * 1024;
const CHAT_IMAGE_MAX_COUNT = 5;

const GROQ_CHAT_MODELS = [
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", note: "Cepat dan ringan" },
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", note: "Lebih pintar, lebih berat" },
  { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", note: "Cepat untuk coding/chat" },
  { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", note: "Lebih kuat untuk reasoning" }
];

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
  const parts = String(text || "").split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    const isBold = part.startsWith("**") && part.endsWith("**");
    if (isBold) return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>;
    return <span key={`${keyPrefix}-${index}`}>{part}</span>;
  });
}

function normalizeCodeLanguage(language = "") {
  return String(language || "").trim().toLowerCase().replace(/^language-/, "");
}

function looksLikeHtml(code = "") {
  const text = String(code || "").trim().toLowerCase();
  return (
    text.includes("<!doctype") ||
    text.includes("<html") ||
    text.includes("<body") ||
    text.includes("<div") ||
    text.includes("<section") ||
    text.includes("<button") ||
    text.includes("<main") ||
    text.includes("<header") ||
    text.includes("<form") ||
    text.includes("<style") ||
    text.includes("<script") ||
    text.includes("<canvas") ||
    text.includes("<svg")
  );
}

function buildPreviewHtml(language, code) {
  const lang = normalizeCodeLanguage(language);
  const rawCode = String(code || "").trim();
  if (!rawCode) return "";

  const baseStyle = `
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; font-family: Arial, sans-serif; background: #ffffff; color: #111827; }
    body { padding: 18px; }
  `;

  if (lang === "html" || lang === "xml" || looksLikeHtml(rawCode)) {
    const lower = rawCode.toLowerCase();
    if (lower.includes("<!doctype") || lower.includes("<html")) return rawCode;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>${baseStyle}</style></head><body>${rawCode}</body></html>`;
  }

  if (lang === "css") {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>${baseStyle}${rawCode}</style></head><body><main class="preview-demo"><h1>CSS Live Preview</h1><p>Ini contoh HTML dummy untuk melihat efek CSS kamu.</p><button>Contoh Button</button><div class="card"><h2>Card Demo</h2><p>Kalau CSS kamu memakai class tertentu, minta AI buatkan HTML + CSS dalam satu file.</p></div></main></body></html>`;
  }

  if (lang === "javascript" || lang === "js") {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>${baseStyle}#app{min-height:160px;border:1px dashed #cbd5e1;border-radius:12px;padding:16px;}pre{white-space:pre-wrap;background:#fee2e2;color:#991b1b;padding:12px;border-radius:12px;}</style></head><body><div id="app">JavaScript Live Preview siap.</div><script>window.addEventListener("error",function(event){const pre=document.createElement("pre");pre.textContent="JS Error: "+event.message;document.body.appendChild(pre);});try{${rawCode}}catch(error){const pre=document.createElement("pre");pre.textContent="JS Error: "+error.message;document.body.appendChild(pre);}</script></body></html>`;
  }

  if (lang === "svg") {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>${baseStyle}body{display:grid;place-items:center;min-height:100vh;}svg{max-width:100%;height:auto;}</style></head><body>${rawCode}</body></html>`;
  }

  return "";
}

function isPreviewableCode(language, code) {
  const lang = normalizeCodeLanguage(language);
  return ["html", "css", "javascript", "js", "svg"].includes(lang) || looksLikeHtml(code);
}

function CodePreviewBlock({ language, code, blockId }) {
  const [showPreview, setShowPreview] = useState(false);
  const [bigPreview, setBigPreview] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");

  const previewable = isPreviewableCode(language, code);
  const previewHtml = previewable ? buildPreviewHtml(language, code) : "";

  useEffect(() => {
    if (!showPreview || !previewable || !previewHtml) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl("");
      }
      return;
    }

    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [showPreview, refreshKey, previewHtml, previewable]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      alert("Gagal copy code.");
    }
  }

  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language || "code"}</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {previewable && (
            <button
              className="copy-btn"
              onClick={() => {
                setShowPreview((prev) => !prev);
                setRefreshKey((prev) => prev + 1);
              }}
            >
              {showPreview ? "Tutup Live" : "Live Preview"}
            </button>
          )}
          <button className="copy-btn" onClick={copyCode}>Copy</button>
        </div>
      </div>

      <pre><code>{code}</code></pre>

      {showPreview && previewable && (
        <div
          style={{
            marginTop: bigPreview ? 0 : 12,
            position: bigPreview ? "fixed" : "relative",
            inset: bigPreview ? 0 : "auto",
            zIndex: bigPreview ? 10000 : "auto",
            background: bigPreview ? "rgba(0,0,0,0.92)" : "#0f0f11",
            border: bigPreview ? "none" : "1px solid #27272a",
            borderRadius: bigPreview ? 0 : 14,
            padding: bigPreview ? 16 : 0,
            overflow: "hidden",
            display: "grid",
            gridTemplateRows: "auto 1fr",
            gap: bigPreview ? 12 : 0
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              alignItems: "center",
              padding: "10px 12px",
              border: "1px solid #27272a",
              borderRadius: bigPreview ? 14 : 0,
              background: "#18181b",
              flexWrap: "wrap"
            }}
          >
            <small style={{ color: "#a1a1aa" }}>{bigPreview ? "Live Preview Besar" : "Live HTML Preview"}</small>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="copy-btn" onClick={() => setRefreshKey((prev) => prev + 1)}>Refresh</button>
              <button className="copy-btn" onClick={() => setBigPreview((prev) => !prev)}>{bigPreview ? "Kecilkan" : "Buka Besar"}</button>
            </div>
          </div>

          {previewUrl ? (
            <iframe
              key={`preview-${blockId}-${refreshKey}`}
              title={`Live Preview ${blockId}`}
              sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
              src={previewUrl}
              style={{
                width: "100%",
                height: bigPreview ? "100%" : 420,
                minHeight: bigPreview ? 0 : 420,
                border: bigPreview ? "1px solid #27272a" : "none",
                borderRadius: bigPreview ? 16 : 0,
                background: "#fff",
                display: "block",
                pointerEvents: "auto",
                touchAction: "auto"
              }}
            />
          ) : (
            <div style={{ padding: 16, color: "#a1a1aa" }}>Menyiapkan live preview...</div>
          )}
        </div>
      )}

      {previewable && (
        <small style={{ display: "block", color: "#a1a1aa", marginTop: 8, lineHeight: 1.5 }}>
          Live Preview mendukung HTML, CSS, JavaScript, dan SVG. Klik Buka Besar tidak mereset preview. Yang reset hanya tombol Refresh.
        </small>
      )}
    </div>
  );
}

function MessageContent({ text }) {
  if (!text) return null;
  const parts = String(text).split(/```/g);

  return (
    <div className="message-content">
      {parts.map((part, index) => {
        const isCode = index % 2 === 1;
        if (isCode) {
          const lines = part.split("\n");
          const language = normalizeCodeLanguage(lines[0]?.trim() || "code");
          const code = lines.slice(1).join("\n").trim();
          return <CodePreviewBlock key={`code-${index}`} language={language} code={code} blockId={`code-${index}`} />;
        }

        const lines = part.split("\n");
        const elements = [];
        let listItems = [];
        let listType = null;

        const flushList = () => {
          if (!listItems.length) return;
          if (listType === "ol") {
            elements.push(<ol key={`ol-${index}-${elements.length}`}>{listItems.map((item, i) => <li key={`oli-${i}`}>{renderInlineFormat(item, `ol-${index}-${i}`)}</li>)}</ol>);
          }
          if (listType === "ul") {
            elements.push(<ul key={`ul-${index}-${elements.length}`}>{listItems.map((item, i) => <li key={`uli-${i}`}>{renderInlineFormat(item, `ul-${index}-${i}`)}</li>)}</ul>);
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
            if (listType !== "ol") {
              flushList();
              listType = "ol";
            }
            listItems.push(line.replace(/^\d+\.\s+/, ""));
            return;
          }
          if (/^[-*]\s+/.test(line)) {
            if (listType !== "ul") {
              flushList();
              listType = "ul";
            }
            listItems.push(line.replace(/^[-*]\s+/, ""));
            return;
          }
          flushList();
          elements.push(<p key={`p-${index}-${lineIndex}`}>{renderInlineFormat(line, `p-${index}-${lineIndex}`)}</p>);
        });

        flushList();
        return <div key={`text-${index}`} className="formatted-block">{elements}</div>;
      })}
    </div>
  );
}

export default function Home() {
  const [supabase, setSupabase] = useState(null);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  const [activeTool, setActiveTool] = useState("home");
  const [toolMenuOpen, setToolMenuOpen] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [message, setMessage] = useState("");
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);

  const [chatImageFiles, setChatImageFiles] = useState([]);
  const [chatImagePreviews, setChatImagePreviews] = useState([]);
  const [chatImageError, setChatImageError] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [selectedGroqModel, setSelectedGroqModel] = useState("llama-3.1-8b-instant");

  const [tempMails, setTempMails] = useState([]);
  const [activeTempMail, setActiveTempMail] = useState(null);
  const [tempMessages, setTempMessages] = useState([]);
  const [tempLoading, setTempLoading] = useState(false);

  const [imagePrompt, setImagePrompt] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [generatedImage, setGeneratedImage] = useState(null);
  const [imageProvider, setImageProvider] = useState("huggingface");
  const [uploadedImageFile, setUploadedImageFile] = useState(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState("");

  const [imageHistory, setImageHistory] = useState([]);
  const [imageHistoryLoading, setImageHistoryLoading] = useState(false);
  const [imageRefreshInfo, setImageRefreshInfo] = useState("");
  const [imageSaving, setImageSaving] = useState(false);
  const [savedImageKeys, setSavedImageKeys] = useState([]);
  const [imageSaveInfo, setImageSaveInfo] = useState("");

  const filteredSessions = useMemo(() => {
    const keyword = historySearch.trim().toLowerCase();
    if (!keyword) return sessions;
    return sessions.filter((session) => String(session?.title || "").toLowerCase().includes(keyword));
  }, [historySearch, sessions]);

  useEffect(() => {
    async function initAuth() {
      try {
        const client = getSupabase();
        if (!client) {
          setAuthError("Supabase belum siap. Cek NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di Cloudflare.");
          setAuthReady(true);
          return;
        }
        setSupabase(client);
        const { data, error } = await client.auth.getUser();
        if (error) console.log("Gagal membaca user:", error.message);
        setUser(data?.user || null);
        const { data: listener } = client.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
        setAuthReady(true);
        return () => listener?.subscription?.unsubscribe();
      } catch (error) {
        console.error("Auth init error:", error);
        setAuthError("Terjadi error saat menyiapkan login Supabase.");
        setAuthReady(true);
      }
    }

    let unsubscribe;
    initAuth().then((cleanup) => {
      unsubscribe = cleanup;
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    const savedModel = localStorage.getItem("properside_groq_model");
    if (savedModel && GROQ_CHAT_MODELS.some((item) => item.id === savedModel)) setSelectedGroqModel(savedModel);
  }, []);

  useEffect(() => {
    localStorage.setItem("properside_groq_model", selectedGroqModel);
  }, [selectedGroqModel]);

  useEffect(() => {
    if (user?.email) {
      loadSessions(user.email);
      loadTempMails(user.email);
      loadImageHistory(user.email);
    }
  }, [user]);

  useEffect(() => {
    setTimeout(() => {
      const panel = document.querySelector(".main-area > .placeholder-panel");
      const chatBox = document.querySelector(".chat-box");
      if (activeTool === "image" && panel) panel.scrollTo({ top: 0, behavior: "smooth" });
      if (activeTool === "chat" && chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    }, 80);
  }, [activeTool, chats.length]);

  useEffect(() => {
    return () => {
      if (uploadedImagePreview) URL.revokeObjectURL(uploadedImagePreview);
    };
  }, [uploadedImagePreview]);

  useEffect(() => {
    return () => {
      chatImagePreviews.forEach((item) => item?.url && URL.revokeObjectURL(item.url));
    };
  }, [chatImagePreviews]);

  function makeVariationPrompt(prompt) {
    return `${prompt.trim()}\n\nUnique variation seed: ${Date.now()}-${Math.random().toString(36).slice(2)}\n\nCreate a fresh variation. Keep the result close to the user's prompt, but do not repeat the exact same composition, pose, lighting, background, color placement, subject angle, or camera angle as previous outputs.`;
  }

  async function loadSessions(email) {
    try {
      const res = await fetch(`/api/chat?action=sessions&user_email=${encodeURIComponent(email)}`);
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
    clearChatImage();
    try {
      const res = await fetch(`/api/chat?action=messages&user_email=${encodeURIComponent(user.email)}&session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      setChats((data.data || []).map((msg) => ({
        role: msg.role,
        text: msg.content,
        imageUrl: msg.image_url || "",
        imageUrls: Array.isArray(msg.image_urls) && msg.image_urls.length > 0 ? msg.image_urls : msg.image_url ? [msg.image_url] : []
      })));
    } catch {
      alert("Gagal membuka history chat.");
    }
  }

  function newChat() {
    setActiveTool("chat");
    setToolMenuOpen(false);
    setHistorySearch("");
    setActiveSessionId(null);
    setChats([]);
    setMessage("");
    clearChatImage();
  }

  async function renameSession(sessionId) {
    const title = prompt("Nama chat baru:");
    if (!title || !title.trim()) return;
    try {
      await fetch("/api/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, user_email: user.email, title: title.trim() })
      });
      loadSessions(user.email);
    } catch {
      alert("Gagal rename chat.");
    }
  }

  async function deleteSession(sessionId) {
    const ok = confirm("Hapus history chat ini? File gambar di Supabase Storage juga ikut dihapus.");
    if (!ok) return;
    try {
      const res = await fetch(`/api/chat?session_id=${encodeURIComponent(sessionId)}&user_email=${encodeURIComponent(user.email)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        alert(data?.error || "Gagal hapus chat.");
        return;
      }
      if (activeSessionId === sessionId) newChat();
      loadSessions(user.email);
    } catch {
      alert("Gagal hapus chat.");
    }
  }

  function handleChatImageUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setChatImageError("");
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const remainingSlots = CHAT_IMAGE_MAX_COUNT - chatImageFiles.length;
    if (remainingSlots <= 0) {
      setChatImageError(`Maksimal ${CHAT_IMAGE_MAX_COUNT} gambar sekali kirim.`);
      event.target.value = "";
      return;
    }
    const selectedFiles = files.slice(0, remainingSlots);
    const validFiles = [];
    const validPreviews = [];
    for (const file of selectedFiles) {
      if (!allowedTypes.includes(file.type)) {
        setChatImageError("File harus berupa gambar JPG, PNG, atau WEBP.");
        event.target.value = "";
        return;
      }
      if (file.size > CHAT_IMAGE_MAX_SIZE) {
        setChatImageError("Ukuran gambar terlalu besar. Maksimal 4MB per gambar.");
        event.target.value = "";
        return;
      }
      validFiles.push(file);
      validPreviews.push({ url: URL.createObjectURL(file), name: file.name });
    }
    setChatImageFiles((prev) => [...prev, ...validFiles]);
    setChatImagePreviews((prev) => [...prev, ...validPreviews]);
    event.target.value = "";
  }

  function clearChatImage(index = null) {
    if (index === null) {
      chatImagePreviews.forEach((item) => item?.url && URL.revokeObjectURL(item.url));
      setChatImageFiles([]);
      setChatImagePreviews([]);
      setChatImageError("");
      return;
    }
    const target = chatImagePreviews[index];
    if (target?.url) URL.revokeObjectURL(target.url);
    setChatImageFiles((prev) => prev.filter((_, i) => i !== index));
    setChatImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setChatImageError("");
  }

  function closePreviewImage() {
    setPreviewImageUrl("");
  }

  async function downloadImageFromUrl(url, filename = `properside-ai-image-${Date.now()}.png`) {
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Gagal mengambil file gambar.");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  async function sendMessage() {
    if (!message.trim() || loading || !user?.email) return;
    const userText = message.trim();
    const selectedImages = chatImageFiles;
    const localImageUrls = chatImagePreviews.map((item) => item.url);
    setMessage("");
    setLoading(true);
    setChatImageError("");
    setChats((prev) => [...prev, { role: "user", text: selectedImages.length > 0 ? `${userText}\n\n[User mengirim ${selectedImages.length} gambar untuk dianalisis]` : userText, imageUrl: localImageUrls[0] || "", imageUrls: localImageUrls }]);

    try {
      let res;
      if (selectedImages.length > 0) {
        const formData = new FormData();
        formData.append("message", userText);
        formData.append("user_email", user.email);
        formData.append("selected_model", selectedGroqModel);
        if (activeSessionId) formData.append("session_id", activeSessionId);
        selectedImages.forEach((file) => formData.append("images", file));
        res = await fetch("/api/chat", { method: "POST", body: formData });
      } else {
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userText, user_email: user.email, session_id: activeSessionId, selected_model: selectedGroqModel })
        });
      }

      const data = await res.json();
      if (data.session_id && !activeSessionId) setActiveSessionId(data.session_id);

      setChats((prev) => {
        const nextChats = [...prev];
        if (data?.image_urls?.length) {
          for (let i = nextChats.length - 1; i >= 0; i -= 1) {
            if (nextChats[i]?.role === "user" && nextChats[i]?.imageUrls?.length) {
              nextChats[i] = { ...nextChats[i], imageUrl: data.image_urls[0] || "", imageUrls: data.image_urls };
              break;
            }
          }
        } else if (data?.image_url) {
          for (let i = nextChats.length - 1; i >= 0; i -= 1) {
            if (nextChats[i]?.role === "user" && nextChats[i]?.imageUrl) {
              nextChats[i] = { ...nextChats[i], imageUrl: data.image_url, imageUrls: [data.image_url] };
              break;
            }
          }
        }
        return [...nextChats, { role: "ai", text: data.reply || "Tidak ada jawaban." }];
      });
      clearChatImage();
      loadSessions(user.email);
    } catch {
      setChats((prev) => [...prev, { role: "ai", text: "Gagal menghubungi API." }]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTempMails(email) {
    try {
      const res = await fetch(`/api/tempmail?action=list&user_email=${encodeURIComponent(email)}`);
      const data = await res.json();
      const mails = data?.data || [];
      setTempMails(mails);
      if (mails.length > 0 && !activeTempMail) setActiveTempMail(mails[0]);
    } catch {
      console.log("Gagal load tempmail.");
    }
  }

  async function createTempMail() {
    if (!user?.email || tempLoading) return;
    try {
      setTempLoading(true);
      const res = await fetch("/api/tempmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_email: user.email }) });
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
      const res = await fetch(`/api/tempmail?action=check&user_email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(mail.email_token)}`);
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
    return msg?.body || msg?.text || msg?.html || msg?.content || msg?.message || msg?.message_text || msg?.message_html || msg?.description || "Tidak ada isi pesan.";
  }

  async function loginGoogle() {
    if (!supabase) {
      alert("Supabase belum siap. Cek NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di Cloudflare.");
      return;
    }
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin, queryParams: { access_type: "offline", prompt: "select_account" } } });
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setChats([]);
    setSessions([]);
    setHistorySearch("");
    setActiveSessionId(null);
    setTempMails([]);
    setActiveTempMail(null);
    setTempMessages([]);
    setGeneratedImage(null);
    setImageError("");
    setImageHistory([]);
    setSavedImageKeys([]);
    setImageSaveInfo("");
    clearUploadedImage();
    clearChatImage();
    closePreviewImage();
  }

  function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setImageError("File harus berupa gambar.");
      return;
    }
    if (uploadedImagePreview) URL.revokeObjectURL(uploadedImagePreview);
    const previewUrl = URL.createObjectURL(file);
    setUploadedImageFile(file);
    setUploadedImagePreview(previewUrl);
    setGeneratedImage(null);
    setImageError("");
    setImageSaveInfo("");
    if (!["auto", "gemini", "huggingface"].includes(imageProvider)) setImageProvider("huggingface");
  }

  function clearUploadedImage() {
    if (uploadedImagePreview) URL.revokeObjectURL(uploadedImagePreview);
    setUploadedImageFile(null);
    setUploadedImagePreview("");
  }

  function resetImageTool() {
    clearUploadedImage();
    setImagePrompt("");
    setGeneratedImage(null);
    setImageError("");
    setImageSaveInfo("");
    setImageProvider("huggingface");
  }

  async function generateImage() {
    if (!imagePrompt.trim() || imageLoading) return;
    try {
      setImageLoading(true);
      setImageError("");
      setImageSaveInfo("");
      setGeneratedImage(null);
      let res;
      let data;
      if (uploadedImageFile) {
        const formData = new FormData();
        formData.append("prompt", imagePrompt.trim());
        formData.append("provider", "replicate");
        formData.append("image", uploadedImageFile);
        res = await fetch("/api/image-edit", { method: "POST", body: formData });
        data = await res.json();
      } else {
        res = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: makeVariationPrompt(imagePrompt), provider: imageProvider }) });
        data = await res.json();
      }
      if (!res.ok || !data?.success) {
        setImageError(data?.error || "Gagal generate / edit gambar.");
        return;
      }
      setGeneratedImage({
        prompt: imagePrompt.trim(),
        text: data?.text || "",
        mimeType: data?.mimeType || "image/png",
        base64: data?.image || "",
        dataUrl: `data:${data?.mimeType || "image/png"};base64,${data?.image || ""}`,
        provider: data?.provider || imageProvider,
        edited: !!uploadedImageFile || !!data?.edited
      });
    } catch (error) {
      setImageError(error?.message || "Terjadi error saat generate / edit gambar.");
    } finally {
      setImageLoading(false);
    }
  }

  function downloadGeneratedImage() {
    if (!generatedImage?.dataUrl) return;
    const ext = generatedImage?.mimeType?.includes("jpeg") || generatedImage?.mimeType?.includes("jpg") ? "jpg" : generatedImage?.mimeType?.includes("webp") ? "webp" : "png";
    const link = document.createElement("a");
    link.href = generatedImage.dataUrl;
    link.download = `properside-ai-image.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function getGeneratedImageKey(image = generatedImage) {
    if (!image?.base64) return "";
    return [image.provider || imageProvider || "", image.edited ? "edit" : "generate", image.prompt || imagePrompt || "", image.base64.slice(0, 120)].join("|");
  }

  function isGeneratedImageAlreadySaved() {
    const key = getGeneratedImageKey();
    if (!key) return false;
    return savedImageKeys.includes(key);
  }

  async function loadImageHistory(email = user?.email) {
    if (!email) return;

    try {
      setImageHistoryLoading(true);
      setImageRefreshInfo("Sedang refresh history gambar... tunggu beberapa detik ya.");

      const res = await fetch(
        `/api/image-history?user_email=${encodeURIComponent(email)}&t=${Date.now()}`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (data?.success) {
        setImageHistory(data?.data || []);
      }
    } catch {
      console.log("Gagal load image history.");
      setImageRefreshInfo("Gagal refresh history gambar. Coba ulangi lagi.");
    } finally {
      setImageHistoryLoading(false);

      setTimeout(() => {
        setImageRefreshInfo("");
      }, 3500);
    }
  }

  async function saveGeneratedImage() {
    if (!generatedImage?.base64 || !user?.email || imageSaving) return;
    const imageKey = getGeneratedImageKey(generatedImage);
    if (imageKey && savedImageKeys.includes(imageKey)) {
      setImageSaveInfo("Gambar ini sudah tersimpan di history.");
      setTimeout(() => setImageSaveInfo(""), 3500);
      return;
    }
    try {
      setImageSaving(true);
      setImageError("");
      setImageSaveInfo("");
      const res = await fetch("/api/image-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_email: user.email, prompt: generatedImage.prompt || imagePrompt, provider: generatedImage.provider || imageProvider, image_type: generatedImage.edited ? "edit" : "generate", image: generatedImage.base64, mimeType: generatedImage.mimeType || "image/png" })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setImageError(data?.error || "Gagal menyimpan gambar ke history.");
        return;
      }
      if (imageKey) {
        setSavedImageKeys((prev) => (prev.includes(imageKey) ? prev : [...prev, imageKey]));
      }
      const savedItem = data?.data || data?.item || data?.result || data?.image || null;
      if (savedItem?.id && savedItem?.image_url) {
        setImageHistory((prev) => (prev.some((item) => item.id === savedItem.id) ? prev : [savedItem, ...prev]));
      } else {
        await loadImageHistory(user.email);
      }
      setImageSaveInfo("Gambar berhasil disimpan ke history.");
      setTimeout(() => setImageSaveInfo(""), 3500);
    } catch (error) {
      setImageError(error?.message || "Gagal menyimpan gambar.");
    } finally {
      setImageSaving(false);
    }
  }

  async function deleteImageHistoryItem(item) {
    if (!item?.id || !user?.email) return;
    const ok = confirm("Hapus gambar ini dari history? File di Supabase Storage juga ikut dihapus.");
    if (!ok) return;
    try {
      const res = await fetch(`/api/image-history?id=${encodeURIComponent(item.id)}&user_email=${encodeURIComponent(user.email)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        alert(data?.error || "Gagal hapus image history.");
        return;
      }
      setImageHistory((prev) => prev.filter((historyItem) => historyItem.id !== item.id));
    } catch {
      alert("Gagal hapus image history.");
    }
  }

  function useHistoryImage(item) {
    if (!item?.image_url) return;
    setPreviewImageUrl(item.image_url);
  }

  function getProviderLabel(provider) {
    if (provider === "gemini") return "Gemini";
    if (provider === "fal") return "fal.ai";
    if (provider === "huggingface") return "Hugging Face";
    if (provider === "replicate") return "Replicate";
    return "Auto";
  }

  function isLimitError(text = "") {
    const lower = String(text).toLowerCase();
    return lower.includes("quota") || lower.includes("billing") || lower.includes("limit") || lower.includes("credit") || lower.includes("payment");
  }

  function renderChatHistory() {
    return (
      <div className="history-box">
        <button className="new-chat-btn" onClick={newChat}>+ Chat Baru</button>
        <h3>History Chat</h3>
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <input
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="Cari history chat..."
            style={{ width: "100%", borderRadius: 12, border: "1px solid #2f2f35", background: "#0f0f11", color: "#fff", padding: "11px 12px", outline: "none", fontSize: 14, boxSizing: "border-box" }}
          />
          {historySearch.trim() && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", color: "#a1a1aa", fontSize: 12 }}>
              <span>Ditemukan {filteredSessions.length} dari {sessions.length} chat</span>
              <button onClick={() => setHistorySearch("")} style={{ width: "auto", padding: "6px 10px", borderRadius: 10, background: "#27272a", border: "1px solid #3f3f46", fontSize: 12 }}>Reset</button>
            </div>
          )}
        </div>

        <div className="history-list">
          {sessions.length === 0 && <p className="empty-history">Belum ada history.</p>}
          {sessions.length > 0 && filteredSessions.length === 0 && <p className="empty-history">Tidak ada history yang cocok dengan pencarian.</p>}
          {filteredSessions.map((session) => (
            <div key={session.id} className={activeSessionId === session.id ? "history-item active" : "history-item"}>
              <button onClick={() => loadMessages(session.id)}>{session.title}</button>
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

  function renderImageErrorBox() {
    if (!imageError) return null;
    const limit = isLimitError(imageError);
    return (
      <div style={{ background: "rgba(220, 38, 38, 0.15)", color: "#fca5a5", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 14, padding: 14, overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.6 }}>
        <strong style={{ display: "block", marginBottom: 6 }}>{limit ? "Limit Replicate" : "Terjadi Error"}</strong>
        <div>{imageError}</div>
        {limit && <small style={{ display: "block", marginTop: 10, color: "#fecaca" }}>Fitur edit gambar memakai Replicate dan bisa habis kuota. Web tidak rusak. Kamu masih bisa hapus upload gambar lalu generate gambar biasa memakai Hugging Face.</small>}
      </div>
    );
  }

  function renderSaveInfoBox() {
    if (!imageSaveInfo) return null;
    const success = imageSaveInfo.includes("berhasil");
    return (
      <div style={{ background: success ? "rgba(22, 163, 74, 0.15)" : "rgba(37, 99, 235, 0.15)", color: success ? "#86efac" : "#bfdbfe", border: success ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 14, padding: 14, lineHeight: 1.6 }}>
        {imageSaveInfo}
      </div>
    );
  }

  function renderImageTool() {
    const isEditMode = !!uploadedImageFile;
    const quickPrompts = isEditMode
      ? [
          { label: "Ganti Background", text: "Ganti background menjadi laut tropis yang cerah, pertahankan objek utama tetap natural" },
          { label: "Style Anime", text: "Ubah gambar ini menjadi style anime cinematic, warna cerah, detail tinggi" },
          { label: "Cyberpunk", text: "Ubah suasana gambar menjadi cyberpunk malam hari dengan lampu neon biru dan ungu" },
          { label: "Lebih HD", text: "Buat gambar ini terlihat lebih tajam, lebih detail, lighting lebih bagus, tetap natural" }
        ]
      : [
          { label: "Cyberpunk Car", text: "Buat gambar mobil sport cyberpunk di jalan kota malam, neon lights, cinematic, ultra detail" },
          { label: "Mascot Logo", text: "Buat ilustrasi logo maskot kucing lucu memakai hoodie biru, gaya modern flat vector, background putih" },
          { label: "Anime Poster", text: "Buat poster anime fantasy seorang pendekar wanita memegang pedang bercahaya di hutan malam" },
          { label: "Realistic Cat", text: "Buat gambar kucing lucu realistis, mata besar, lighting studio, ultra detail" }
        ];

    const alreadySaved = isGeneratedImageAlreadySaved();

    return (
      <section className="placeholder-panel">
        <div className="placeholder-card" style={{ maxWidth: 980, width: "100%", textAlign: "left" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="placeholder-icon">🖼️</div>
              <h2 style={{ marginBottom: 8 }}>AI Image Studio</h2>
              <p style={{ margin: 0 }}>Buat gambar dari teks atau upload gambar lalu edit memakai AI.</p>
            </div>
            <div style={{ border: "1px solid #2f2f35", background: isEditMode ? "rgba(37, 99, 235, 0.18)" : "rgba(24, 24, 27, 0.95)", color: "#fff", borderRadius: 999, padding: "10px 14px", fontSize: 14 }}>
              {isEditMode ? "Mode: Edit Image" : "Mode: Text to Image"}
            </div>
          </div>

          <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
            <div style={{ background: "#101014", border: "1px solid #27272a", borderRadius: 22, padding: 16, display: "grid", gap: 12 }}>
              <strong>Pilih Mode AI</strong>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {["huggingface", "auto", "gemini"].map((provider) => (
                  <button
                    key={provider}
                    onClick={() => { setImageProvider(provider); setImageError(""); }}
                    style={{ background: imageProvider === provider ? "#3d63dd" : "#18181b", border: imageProvider === provider ? "1px solid #4e74f0" : "1px solid #2f2f35", color: "#fff", borderRadius: 999, padding: "10px 16px", cursor: "pointer", width: "auto" }}
                  >
                    {provider === "huggingface" ? "Hugging Face Generate" : provider === "auto" ? "Auto" : "Gemini"}
                  </button>
                ))}
              </div>
              <small style={{ color: "#a1a1aa", lineHeight: 1.6 }}>Text-to-image memakai provider yang kamu pilih. Kalau kamu upload gambar, tombol edit akan otomatis memakai Replicate Flux Kontext Pro.</small>
              <small style={{ color: "#fbbf24", lineHeight: 1.6, background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: 12, padding: 10, display: "block" }}>
                Catatan: fitur edit gambar memakai Replicate dan bisa terkena limit/free quota. Kalau muncul pesan quota atau billing, berarti jatah Replicate sedang habis. Generate gambar biasa tetap bisa pakai Hugging Face.
              </small>
              {!isEditMode && <small style={{ color: "#93c5fd", lineHeight: 1.6, background: "rgba(37, 99, 235, 0.12)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: 12, padding: 10, display: "block" }}>Mode generate sudah diberi variasi otomatis. Jadi walaupun prompt sama, hasil gambar berikutnya akan dibuat berbeda tapi tetap mengikuti prompt utama.</small>}
            </div>

            <div style={{ background: "#101014", border: "1px solid #27272a", borderRadius: 22, padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <strong>Upload Gambar untuk Edit</strong>
                {uploadedImagePreview && <button onClick={clearUploadedImage} style={{ width: "auto", background: "#18181b", border: "1px solid #2f2f35" }}>Hapus Upload</button>}
              </div>
              <input type="file" accept="image/*" onChange={handleImageUpload} style={{ width: "100%", borderRadius: 14, border: "1px solid #2f2f35", background: "#0f0f11", color: "#fff", padding: 12, boxSizing: "border-box" }} />
              {uploadedImagePreview ? <div style={{ display: "grid", gap: 10 }}><small style={{ color: "#a1a1aa" }}>Preview gambar asli:</small><img src={uploadedImagePreview} alt="Preview upload" style={{ width: "100%", maxHeight: 520, objectFit: "contain", display: "block", borderRadius: 18, background: "#000", border: "1px solid #27272a" }} /></div> : <div style={{ border: "1px dashed #3f3f46", borderRadius: 18, padding: 18, color: "#a1a1aa", textAlign: "center", lineHeight: 1.6 }}>Belum ada gambar upload. Kalau kosong, AI akan membuat gambar baru dari teks.</div>}
            </div>

            <div style={{ background: "#101014", border: "1px solid #27272a", borderRadius: 22, padding: 16, display: "grid", gap: 12 }}>
              <strong>{isEditMode ? "Prompt Edit Gambar" : "Prompt Generate Gambar"}</strong>
              <textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder={isEditMode ? 'Contoh: "Ganti background jadi laut, pertahankan objek utama"' : 'Contoh: "Buat gambar kucing astronaut lucu di bulan, style 3D, detail tinggi"'} rows={5} style={{ width: "100%", borderRadius: 18, border: "1px solid #2f2f35", background: "#0f0f11", color: "#fff", padding: 16, fontSize: 15, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {quickPrompts.map((item) => <button key={item.label} onClick={() => { setImagePrompt(item.text); setImageError(""); setImageSaveInfo(""); }} style={{ background: "#18181b", border: "1px solid #2f2f35", color: "#fff", borderRadius: 999, padding: "10px 14px", cursor: "pointer", width: "auto" }}>{item.label}</button>)}
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <button onClick={generateImage} disabled={imageLoading}>{imageLoading ? isEditMode ? "Editing Image..." : "Generating New Variation..." : isEditMode ? "Edit Image (Replicate)" : `Generate Image (${getProviderLabel(imageProvider)})`}</button>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {generatedImage?.dataUrl && <button onClick={downloadGeneratedImage}>Download Image</button>}
                {generatedImage?.base64 && <button onClick={saveGeneratedImage} disabled={imageSaving || alreadySaved} style={{ width: "auto", background: alreadySaved ? "#3f3f46" : "#16a34a" }}>{imageSaving ? "Saving..." : alreadySaved ? "Sudah Tersimpan" : "Save to History"}</button>}
                <button onClick={resetImageTool} style={{ background: "#18181b", border: "1px solid #2f2f35", width: "auto" }}>Reset</button>
              </div>
            </div>

            {imageLoading && <div style={{ background: "rgba(37, 99, 235, 0.15)", color: "#bfdbfe", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 14, padding: 14, lineHeight: 1.6 }}>{isEditMode ? "AI sedang mengedit gambar. Untuk Replicate biasanya butuh beberapa detik sampai satu menit." : "AI sedang membuat variasi gambar baru dari prompt kamu."}</div>}
            {renderImageErrorBox()}
            {renderSaveInfoBox()}

            {generatedImage?.dataUrl && (
              <div style={{ marginTop: 4, background: "#101014", border: "1px solid #27272a", borderRadius: 22, padding: 16, display: "grid", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div><strong>Hasil AI</strong><p style={{ margin: "6px 0 0", color: "#a1a1aa" }}>{generatedImage.edited ? "Before / after hasil edit gambar" : "Hasil generate variasi gambar dari prompt"}</p></div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={downloadGeneratedImage} style={{ width: "auto" }}>Download</button>
                    {generatedImage?.base64 && <button onClick={saveGeneratedImage} disabled={imageSaving || alreadySaved} style={{ width: "auto", background: alreadySaved ? "#3f3f46" : "#16a34a" }}>{imageSaving ? "Saving..." : alreadySaved ? "Sudah Tersimpan" : "Save"}</button>}
                  </div>
                </div>
                {isEditMode && uploadedImagePreview ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                    <div style={{ display: "grid", gap: 8 }}><small style={{ color: "#a1a1aa" }}>Before</small><img src={uploadedImagePreview} alt="Before edit" style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 18, display: "block", background: "#000", border: "1px solid #27272a" }} /></div>
                    <div style={{ display: "grid", gap: 8 }}><small style={{ color: "#a1a1aa" }}>After</small><img src={generatedImage.dataUrl} alt={generatedImage.prompt} style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 18, display: "block", background: "#000", border: "1px solid #27272a" }} /></div>
                  </div>
                ) : (
                  <img src={generatedImage.dataUrl} alt={generatedImage.prompt} style={{ width: "100%", maxHeight: 720, objectFit: "contain", borderRadius: 18, display: "block", background: "#000", border: "1px solid #27272a" }} />
                )}
                <div style={{ display: "grid", gap: 10, background: "#0f0f11", border: "1px solid #27272a", borderRadius: 18, padding: 14 }}>
                  <div><strong>Provider:</strong><p style={{ marginTop: 6 }}>{generatedImage.edited ? "Replicate / Flux Kontext Pro" : getProviderLabel(generatedImage.provider)}</p></div>
                  <div><strong>Tipe:</strong><p style={{ marginTop: 6 }}>{generatedImage.edited ? "Hasil edit gambar" : "Hasil generate variasi gambar"}</p></div>
                  <div><strong>Prompt:</strong><p style={{ marginTop: 6 }}>{generatedImage.prompt}</p></div>
                  {generatedImage.text ? <div><strong>Keterangan AI:</strong><p style={{ marginTop: 6 }}>{generatedImage.text}</p></div> : null}
                </div>
              </div>
            )}

            <div style={{ background: "#101014", border: "1px solid #27272a", borderRadius: 22, padding: 16, display: "grid", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div><strong>History AI Image</strong><p style={{ margin: "6px 0 0", color: "#a1a1aa" }}>Gambar yang kamu simpan akan muncul di sini.</p></div>
                <button onClick={() => loadImageHistory(user.email)} disabled={imageHistoryLoading} style={{ width: "auto", background: imageHistoryLoading ? "#3f3f46" : "#18181b", border: "1px solid #2f2f35" }}>{imageHistoryLoading ? "Merefresh..." : "Refresh"}</button>
              </div>

              {imageRefreshInfo && <div style={{ background: "rgba(37, 99, 235, 0.15)", color: "#bfdbfe", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 14, padding: 12, lineHeight: 1.6 }}>{imageRefreshInfo}</div>}

              {imageHistory.length === 0 ? (
                <div style={{ border: "1px dashed #3f3f46", borderRadius: 18, padding: 18, color: "#a1a1aa", textAlign: "center", lineHeight: 1.6 }}>Belum ada history gambar. Generate/edit gambar lalu klik Save to History.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                  {imageHistory.map((item) => (
                    <div key={item.id} style={{ background: "#0f0f11", border: "1px solid #27272a", borderRadius: 18, padding: 10, display: "grid", gap: 8 }}>
                      <img src={item.image_url} alt={item.prompt || "AI image history"} onClick={() => useHistoryImage(item)} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 14, cursor: "zoom-in", background: "#000" }} />
                      <small style={{ color: "#a1a1aa", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.prompt || "Tanpa prompt"}</small>
                      <small style={{ color: "#71717a" }}>{item.image_type === "edit" ? "Edit" : "Generate"} · {item.provider || "-"}</small>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
                        <button onClick={() => useHistoryImage(item)} style={{ fontSize: 13, padding: "8px 10px" }}>Preview</button>
                        <button onClick={() => downloadImageFromUrl(item.image_url, `properside-ai-history-${item.id || Date.now()}.png`)} style={{ fontSize: 13, padding: "8px 10px", background: "#16a34a" }}>Download</button>
                        <button onClick={() => deleteImageHistoryItem(item)} style={{ width: "auto", fontSize: 13, padding: "8px 10px", background: "#7f1d1d" }}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
            <p>Pilih tool di menu atas untuk mulai menggunakan AI Chat, AI Image, Tempmail, dan fitur lainnya.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
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
            {chats.length === 0 && <div className="empty-chat"><h2>Apa yang ingin kamu buat hari ini?</h2><p>Tulis pesan, paste kode, atau upload sampai 5 screenshot. Maks 4MB per gambar.</p></div>}
            {chats.map((chat, index) => (
              <div key={index} className={chat.role === "user" ? "message user-message" : "message ai-message"}>
                {(chat.imageUrls?.length > 0 || chat.imageUrl) && (
                  <div style={{ display: "grid", gridTemplateColumns: (chat.imageUrls?.length ? chat.imageUrls : [chat.imageUrl]).length > 1 ? "repeat(auto-fit, minmax(120px, 1fr))" : "1fr", gap: 8, marginBottom: 10 }}>
                    {(chat.imageUrls?.length ? chat.imageUrls : [chat.imageUrl]).map((url, imageIndex) => (
                      <div key={`${url}-${imageIndex}`} style={{ display: "grid", gap: 6 }}>
                        <img src={url} alt={`Gambar chat ${imageIndex + 1}`} onClick={() => setPreviewImageUrl(url)} style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 14, background: "#000", border: "1px solid rgba(255,255,255,0.12)", cursor: "zoom-in" }} />
                        <small style={{ color: "rgba(255,255,255,0.78)", fontSize: 12, textAlign: "center" }}>Tap preview {imageIndex + 1}</small>
                      </div>
                    ))}
                  </div>
                )}
                <MessageContent text={chat.text} />
              </div>
            ))}
            {loading && <div className="message ai-message"><p>Properside AI sedang mengetik...</p></div>}
          </div>

          <div style={{ padding: "10px 14px", borderTop: "1px solid #27272a", background: "#0f0f11", display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 8, background: "#101014", border: "1px solid #27272a", borderRadius: 14, padding: 10 }}>
              <strong style={{ fontSize: 14 }}>Model AI Chat</strong>
              <select value={selectedGroqModel} onChange={(e) => setSelectedGroqModel(e.target.value)} style={{ width: "100%", borderRadius: 12, border: "1px solid #2f2f35", background: "#0f0f11", color: "#fff", padding: 12, outline: "none" }}>
                {GROQ_CHAT_MODELS.map((model) => <option key={model.id} value={model.id}>{model.name} — {model.note}</option>)}
              </select>
              <small style={{ color: "#a1a1aa", lineHeight: 1.5 }}>Kalau upload gambar, sistem otomatis memakai Groq Vision. Selector ini dipakai untuk chat teks biasa.</small>
            </div>

            {chatImagePreviews.length > 0 && (
              <div style={{ background: "#101014", border: "1px solid #27272a", borderRadius: 14, padding: 10, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <small style={{ color: "#a1a1aa" }}>{chatImagePreviews.length} gambar siap dikirim dan akan tersimpan di history chat</small>
                  <button onClick={() => clearChatImage()} style={{ width: "auto", padding: "7px 10px", background: "#18181b", border: "1px solid #2f2f35" }}>Hapus Semua</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                  {chatImagePreviews.map((item, index) => <div key={item.url} style={{ display: "grid", gap: 6 }}><img src={item.url} alt={item.name || `Preview ${index + 1}`} style={{ width: "100%", height: 120, objectFit: "contain", borderRadius: 12, background: "#000", border: "1px solid #27272a" }} /><button onClick={() => clearChatImage(index)} style={{ width: "100%", padding: "7px 10px", background: "#7f1d1d" }}>Hapus</button></div>)}
                </div>
              </div>
            )}

            {chatImageError && <div style={{ background: "rgba(220, 38, 38, 0.15)", color: "#fca5a5", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 12, padding: 10, lineHeight: 1.5 }}>{chatImageError}</div>}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#18181b", border: "1px solid #2f2f35", color: "#fff", borderRadius: 999, padding: "10px 14px", cursor: "pointer", fontSize: 14 }}>
                📎 Upload Gambar
                <input type="file" multiple accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleChatImageUpload} style={{ display: "none" }} />
              </label>
              <small style={{ color: "#a1a1aa", lineHeight: 1.5 }}>Maks 5 gambar • 4MB/gambar • JPG/PNG/WEBP • tersimpan di history chat.</small>
            </div>
          </div>

          <div className="input-area">
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={chatImageFiles.length > 0 ? "Tulis pertanyaan tentang gambar ini..." : "Tulis perintah untuk AI..."} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
            <button onClick={sendMessage} disabled={loading}>{loading ? "Mengirim..." : chatImageFiles.length > 0 ? `Kirim + ${chatImageFiles.length} Gambar` : "Kirim"}</button>
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
            <p>Buat banyak email sementara. Email lama tetap tersimpan dan bisa dicek kembali.</p>
            <button onClick={createTempMail} disabled={tempLoading}>{tempLoading ? "Mohon tunggu..." : "+ Buat Email Baru"}</button>
            <div className="tempmail-list">
              <h3>Daftar Email</h3>
              {tempMails.length === 0 ? <p>Belum ada tempmail.</p> : tempMails.map((mail) => <div key={mail.id} className={activeTempMail?.id === mail.id ? "tempmail-item active" : "tempmail-item"}><button onClick={() => { setActiveTempMail(mail); setTempMessages([]); }}><strong>{mail.email}</strong><small>Expired: {mail.deleted_in || "-"}</small></button><span onClick={() => checkTempMail(mail)}>📥</span></div>)}
            </div>
            {activeTempMail && <><div className="tempmail-box"><h3>Email Aktif</h3><div className="tempmail-email">{activeTempMail.email}</div><p>Expired: {activeTempMail.deleted_in || "-"}</p><button onClick={() => navigator.clipboard.writeText(activeTempMail.email)}>Copy Email</button><button onClick={() => checkTempMail(activeTempMail)} disabled={tempLoading} style={{ marginTop: 10 }}>{tempLoading ? "Mohon tunggu..." : "Check Inbox"}</button></div><div className="tempmail-messages">{tempMessages.length === 0 ? <p>Belum ada pesan masuk untuk email ini.</p> : tempMessages.map((msg, index) => <div key={index} className="tempmail-message"><h4>{msg.subject || msg.title || "No Subject"}</h4><p>From: {msg.from || msg.sender || msg.from_email || "Unknown"}</p><div className="tempmail-content">{getMailBody(msg)}</div></div>)}</div></>}
          </div>
        </section>
      );
    }

    if (activeTool === "image") return renderImageTool();

    return (
      <section className="placeholder-panel">
        <div className="placeholder-card">
          <div className="placeholder-icon">{tools.find((t) => t.id === activeTool)?.icon}</div>
          <h2>{tools.find((t) => t.id === activeTool)?.name}</h2>
          <p>Fitur ini sudah disiapkan sebagai menu. Nanti bisa kita sambungkan ke tool khusus.</p>
          <button>Coming Soon</button>
        </div>
      </section>
    );
  }

  if (!authReady) {
    return <main className="login-page"><div className="login-card"><div className="brand-logo">P</div><h1>Properside AI</h1><p>Sedang menyiapkan login...</p></div></main>;
  }

  if (!user) {
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="brand-logo">P</div>
          <h1>Properside AI</h1>
          <p>Login dengan Google untuk menyimpan history chat dan menggunakan workspace AI.</p>
          {authError && <p style={{ color: "#fca5a5", background: "rgba(220, 38, 38, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 14, padding: 12, marginTop: 12 }}>{authError}</p>}
          <button onClick={loginGoogle}>Login dengan Google</button>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-logo small">P</div><div><h2>Properside</h2><span>AI Workspace</span></div></div>
        <button className="tool-toggle-btn" onClick={() => setToolMenuOpen(!toolMenuOpen)}>{toolMenuOpen ? "Tutup Menu ▲" : "Buka Menu Tools ▼"}</button>
        <div className={toolMenuOpen ? "sidebar-body open" : "sidebar-body"}>
          <nav className="tool-list">
            {tools.map((tool) => <button key={tool.id} className={activeTool === tool.id ? "tool-button active" : "tool-button"} onClick={() => { setActiveTool(tool.id); setToolMenuOpen(false); }}><span>{tool.icon}</span>{tool.name}</button>)}
          </nav>
          <div className="sidebar-footer"><p>{user.email}</p><button onClick={logout}>Logout</button></div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar"><div><h1>{tools.find((t) => t.id === activeTool)?.name}</h1><p>Properside AI Workspace.</p></div><div className="user-pill">{user.email?.charAt(0).toUpperCase()}</div></header>
        {renderActiveTool()}
      </section>

      {previewImageUrl && (
        <div onClick={closePreviewImage} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0, 0, 0, 0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <button onClick={closePreviewImage} style={{ position: "absolute", top: 16, right: 16, width: "auto", background: "rgba(24, 24, 27, 0.95)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", borderRadius: 999, padding: "10px 14px", cursor: "pointer", zIndex: 10000 }}>✕ Tutup</button>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 16, left: 16, display: "flex", gap: 8, flexWrap: "wrap", zIndex: 10000 }}>
            <a href={previewImageUrl} target="_blank" rel="noreferrer" style={{ background: "rgba(24, 24, 27, 0.95)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", borderRadius: 999, padding: "10px 14px", textDecoration: "none", fontSize: 14 }}>Buka Asli</a>
            <button onClick={() => downloadImageFromUrl(previewImageUrl, `properside-ai-preview-${Date.now()}.png`)} style={{ width: "auto", background: "#16a34a", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", borderRadius: 999, padding: "10px 14px", cursor: "pointer", fontSize: 14 }}>Download</button>
          </div>
          <img src={previewImageUrl} alt="Preview gambar besar" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "88vh", objectFit: "contain", borderRadius: 18, background: "#000", border: "1px solid rgba(255,255,255,0.14)" }} />
        </div>
      )}
    </main>
  );
}
