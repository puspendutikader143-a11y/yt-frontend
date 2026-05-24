import { useState, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

const STATUS = {
  IDLE: "idle",
  PENDING: "pending",
  PROCESSING: "processing",
  DONE: "done",
  FAILED: "failed",
  NO_CAPTIONS: "no_captions",
  INVALID: "invalid",
};

const ERROR_LABELS = {
  invalid_url: "Invalid URL",
  no_captions: "No captions",
  transcripts_disabled: "Captions disabled",
  video_unavailable: "Video unavailable",
};

const FORMAT_OPTIONS = [
  { value: "txt", label: "TXT", icon: "📄" },
  { value: "srt", label: "SRT", icon: "🎬" },
  { value: "docx", label: "DOCX", icon: "📝" },
  { value: "pdf", label: "PDF", icon: "📕" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

const API_BASE = "https://yt-backend-72xi.onrender.com/api";

function parseUrls(text) {
  return text
    .split(/[\n,]+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

function base64ToBlob(b64, mimeType) {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

const MIME = { txt: "text/plain", srt: "text/plain", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pdf: "application/pdf" };

function autoDownload(b64, filename, fmt) {
  const blob = base64ToBlob(b64, MIME[fmt] || "text/plain");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, error }) {
  const map = {
    [STATUS.IDLE]: { color: "#4a5568", bg: "#2d3748", label: "Queued" },
    [STATUS.PENDING]: { color: "#a0aec0", bg: "#2d3748", label: "Waiting…" },
    [STATUS.PROCESSING]: { color: "#63b3ed", bg: "#1a365d", label: "Processing…" },
    [STATUS.DONE]: { color: "#68d391", bg: "#1c4532", label: "Done ✓" },
    [STATUS.FAILED]: { color: "#fc8181", bg: "#3d1a1a", label: ERROR_LABELS[error] || "Failed" },
    [STATUS.NO_CAPTIONS]: { color: "#f6ad55", bg: "#3d2610", label: "No captions" },
    [STATUS.INVALID]: { color: "#fc8181", bg: "#3d1a1a", label: "Invalid URL" },
  };
  const { color, bg, label } = map[status] || map[STATUS.IDLE];
  return (
    <span style={{ background: bg, color, padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
      {status === STATUS.PROCESSING && <span style={{ display: "inline-block", animation: "spin 1s linear infinite", marginRight: 4 }}>⟳</span>}
      {label}
    </span>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

function ProgressBar({ done, total, failed }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const blocks = 20;
  const filled = Math.round((pct / 100) * blocks);
  return (
    <div style={{ fontFamily: "'Courier New', monospace", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <span style={{ color: "#a0aec0" }}>
          {"["}
          <span style={{ color: "#4ade80" }}>{"█".repeat(filled)}</span>
          <span style={{ color: "#2d3748" }}>{"░".repeat(blocks - filled)}</span>
          {"]"}
        </span>
        <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{pct}%</span>
        <span style={{ color: "#718096" }}>
          {done}/{total} done
          {failed > 0 && <span style={{ color: "#fc8181", marginLeft: 8 }}>{failed} failed</span>}
        </span>
      </div>
    </div>
  );
}

// ─── VideoRow ─────────────────────────────────────────────────────────────────

function VideoRow({ item, index }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      borderRadius: 10,
      background: index % 2 === 0 ? "#1a202c" : "#161b27",
      borderLeft: `3px solid ${item.status === STATUS.DONE ? "#4ade80" : item.status === STATUS.PROCESSING ? "#60a5fa" : item.status === STATUS.FAILED || item.status === STATUS.INVALID ? "#fc8181" : "#2d3748"}`,
      transition: "border-color 0.3s",
    }}>
      <span style={{ color: "#4a5568", fontSize: 11, width: 22, textAlign: "right", flexShrink: 0 }}>{index + 1}</span>
      <span style={{ color: "#718096", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.url}
      </span>
      {item.videoId && <span style={{ color: "#4a5568", fontSize: 11, flexShrink: 0 }}>{item.videoId}</span>}
      <StatusBadge status={item.status} error={item.error} />
      {item.status === STATUS.DONE && item.filename && (
        <button onClick={() => autoDownload(item.content_b64, item.filename, item.format)}
          style={{ background: "#1e3a2f", color: "#4ade80", border: "1px solid #2d6a4f", borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>
          ↓ Re-download
        </button>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [urlText, setUrlText] = useState("");
  const [format, setFormat] = useState("txt");
  const [lang, setLang] = useState("en");
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);
  const [autoDownloadOn, setAutoDownloadOn] = useState(true);
  const [darkMode] = useState(true);
  const [zipLoading, setZipLoading] = useState(false);
  const abortRef = useRef(false);

  const updateItem = useCallback((index, patch) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }, []);

  const doneCnt = items.filter((i) => i.status === STATUS.DONE).length;
  const failedCnt = items.filter((i) => i.status === STATUS.FAILED || i.status === STATUS.NO_CAPTIONS || i.status === STATUS.INVALID).length;
  const total = items.length;

  async function handleStart() {
    const urls = parseUrls(urlText);
    if (!urls.length) return;

    abortRef.current = false;
    const initialItems = urls.map((url) => ({
      url, status: STATUS.IDLE, videoId: null, error: null,
      filename: null, content_b64: null, format,
    }));
    setItems(initialItems);
    setRunning(true);

    // Stream processing
    try {
      const resp = await fetch(`${API_BASE}/transcript/bulk/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, format, lang }),
      });

      if (!resp.ok) throw new Error(`API error ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      // Mark all as pending while streaming starts
      setItems((prev) => prev.map((it) => ({ ...it, status: STATUS.PENDING })));

      while (true) {
        if (abortRef.current) break;
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const result = JSON.parse(line);
            const idx = result.index;

            // Mark previous as pending → current as processing (visual effect)
            if (idx > 0) {
              // already updated
            }

            // Show processing state briefly
            setItems((prev) =>
              prev.map((it, i) => {
                if (i === idx) {
                  return { ...it, status: STATUS.PROCESSING };
                }
                return it;
              })
            );

            // Short visual delay then apply real result
            await new Promise((r) => setTimeout(r, 200));

            let status = STATUS.DONE;
            if (!result.success) {
              status = result.error === "no_captions" || result.error === "transcripts_disabled"
                ? STATUS.NO_CAPTIONS
                : result.error === "invalid_url"
                ? STATUS.INVALID
                : STATUS.FAILED;
            }

            setItems((prev) =>
              prev.map((it, i) =>
                i === idx
                  ? {
                      ...it,
                      status,
                      videoId: result.video_id,
                      error: result.error,
                      filename: result.filename,
                      content_b64: result.content_b64,
                      format: result.format,
                    }
                  : it
              )
            );

            // Auto-download
            if (result.success && result.content_b64 && autoDownloadOn) {
              autoDownload(result.content_b64, result.filename, result.format);
            }
          } catch (e) {
            console.error("Parse error:", e);
          }
        }
      }
    } catch (err) {
      console.error("Stream error:", err);
      // Mark all still-pending as failed
      setItems((prev) =>
        prev.map((it) =>
          it.status === STATUS.PENDING || it.status === STATUS.IDLE
            ? { ...it, status: STATUS.FAILED, error: err.message }
            : it
        )
      );
    }

    setRunning(false);
  }

  async function handleZip() {
    const urls = parseUrls(urlText);
    if (!urls.length) return;
    setZipLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/transcript/zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, format, lang }),
      });
      if (!resp.ok) throw new Error("ZIP failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transcripts.zip";
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      alert("ZIP download failed: " + e.message);
    }
    setZipLoading(false);
  }

  function handleStop() {
    abortRef.current = true;
    setRunning(false);
  }

  const urlCount = parseUrls(urlText).length;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0d111c 0%, #0f1729 60%, #0a0f1e 100%)",
      color: "#e2e8f0",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Syne:wght@400;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0d111c; }
        ::-webkit-scrollbar-thumb { background: #2d3748; border-radius: 3px; }
        textarea:focus, button:focus, select:focus { outline: 2px solid #4ade80; outline-offset: 2px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: "1px solid #1a2035",
        padding: "18px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(13,17,28,0.85)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #4ade80, #06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>▶</div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, color: "#fff", letterSpacing: -0.5 }}>
              YT Transcript Bulk
            </div>
            <div style={{ fontSize: 10, color: "#4a5568", letterSpacing: 1 }}>DOWNLOADER v1.0</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#4a5568" }}>
          Free · No login · Open source
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "36px 20px 80px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 40, animation: "fadeUp 0.5s ease" }}>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "clamp(28px, 5vw, 48px)",
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.1,
            marginBottom: 12,
            letterSpacing: -1,
          }}>
            Bulk YouTube{" "}
            <span style={{ background: "linear-gradient(90deg, #4ade80, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Transcript
            </span>{" "}
            Downloader
          </h1>
          <p style={{ color: "#718096", fontSize: 15, maxWidth: 520, margin: "0 auto" }}>
            Paste 1–100+ YouTube links. Transcripts auto-download one-by-one. No account needed.
          </p>
        </div>

        {/* Input Card */}
        <div style={{
          background: "#111827",
          border: "1px solid #1e2a3a",
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
          animation: "fadeUp 0.5s ease 0.1s both",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: "#718096", fontWeight: 600, letterSpacing: 1 }}>
              YOUTUBE URLs {urlCount > 0 && <span style={{ color: "#4ade80" }}>({urlCount} detected)</span>}
            </label>
            <button onClick={() => setUrlText("")}
              style={{ background: "none", border: "none", color: "#4a5568", cursor: "pointer", fontSize: 11 }}>
              Clear
            </button>
          </div>
          <textarea
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            placeholder={"https://youtube.com/watch?v=abc123\nhttps://youtu.be/def456\nhttps://youtube.com/watch?v=ghi789\n\nPaste one URL per line (or comma-separated)"}
            style={{
              width: "100%",
              height: 160,
              background: "#0d111c",
              border: "1px solid #1e2a3a",
              borderRadius: 10,
              color: "#e2e8f0",
              fontSize: 13,
              fontFamily: "'IBM Plex Mono', monospace",
              padding: 14,
              resize: "vertical",
              lineHeight: 1.6,
            }}
            disabled={running}
          />
        </div>

        {/* Options Row */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
          animation: "fadeUp 0.5s ease 0.2s both",
        }}>
          {/* Format */}
          <div style={{ flex: "1 1 200px" }}>
            <div style={{ fontSize: 11, color: "#718096", marginBottom: 6, letterSpacing: 1 }}>FORMAT</div>
            <div style={{ display: "flex", gap: 6 }}>
              {FORMAT_OPTIONS.map((f) => (
                <button key={f.value} onClick={() => setFormat(f.value)}
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    borderRadius: 8,
                    border: format === f.value ? "1px solid #4ade80" : "1px solid #1e2a3a",
                    background: format === f.value ? "#1c4532" : "#111827",
                    color: format === f.value ? "#4ade80" : "#718096",
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontWeight: 600,
                  }}>
                  {f.icon}<br />{f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div style={{ flex: "0 0 140px" }}>
            <div style={{ fontSize: 11, color: "#718096", marginBottom: 6, letterSpacing: 1 }}>LANGUAGE</div>
            <select value={lang} onChange={(e) => setLang(e.target.value)}
              style={{
                width: "100%",
                background: "#0d111c",
                border: "1px solid #1e2a3a",
                color: "#e2e8f0",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
                fontFamily: "'IBM Plex Mono', monospace",
              }}>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="pt">Portuguese</option>
              <option value="ar">Arabic</option>
              <option value="hi">Hindi</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="zh">Chinese</option>
              <option value="ru">Russian</option>
            </select>
          </div>

          {/* Auto-download toggle */}
          <div style={{ flex: "0 0 160px" }}>
            <div style={{ fontSize: 11, color: "#718096", marginBottom: 6, letterSpacing: 1 }}>AUTO-DOWNLOAD</div>
            <button onClick={() => setAutoDownloadOn(!autoDownloadOn)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: autoDownloadOn ? "1px solid #4ade80" : "1px solid #1e2a3a",
                background: autoDownloadOn ? "#1c4532" : "#111827",
                color: autoDownloadOn ? "#4ade80" : "#718096",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "'IBM Plex Mono', monospace",
                fontWeight: 600,
              }}>
              {autoDownloadOn ? "● ON" : "○ OFF"}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap", animation: "fadeUp 0.5s ease 0.3s both" }}>
          {!running ? (
            <button onClick={handleStart}
              disabled={!urlCount}
              style={{
                flex: "1 1 200px",
                padding: "14px 28px",
                borderRadius: 10,
                border: "none",
                background: urlCount
                  ? "linear-gradient(135deg, #16a34a, #0891b2)"
                  : "#1a2035",
                color: urlCount ? "#fff" : "#4a5568",
                fontSize: 14,
                fontWeight: 700,
                cursor: urlCount ? "pointer" : "not-allowed",
                fontFamily: "'Syne', sans-serif",
                letterSpacing: 0.5,
                transition: "transform 0.1s, opacity 0.2s",
              }}
              onMouseDown={(e) => urlCount && (e.currentTarget.style.transform = "scale(0.98)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              ▶ Start Processing {urlCount > 0 ? `(${urlCount} URLs)` : ""}
            </button>
          ) : (
            <button onClick={handleStop}
              style={{
                flex: "1 1 200px",
                padding: "14px 28px",
                borderRadius: 10,
                border: "1px solid #fc8181",
                background: "#3d1a1a",
                color: "#fc8181",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "'Syne', sans-serif",
                animation: "pulse 1.5s ease infinite",
              }}>
              ■ Stop Processing
            </button>
          )}

          <button onClick={handleZip}
            disabled={running || !urlCount || zipLoading}
            style={{
              flex: "0 1 auto",
              padding: "14px 20px",
              borderRadius: 10,
              border: "1px solid #1e2a3a",
              background: "#111827",
              color: "#718096",
              fontSize: 13,
              fontWeight: 600,
              cursor: running || !urlCount ? "not-allowed" : "pointer",
              fontFamily: "'IBM Plex Mono', monospace",
            }}>
            {zipLoading ? "⟳ Zipping…" : "⬇ Download All ZIP"}
          </button>
        </div>

        {/* Progress */}
        {total > 0 && (
          <div style={{
            background: "#111827",
            border: "1px solid #1e2a3a",
            borderRadius: 14,
            padding: "20px 24px",
            marginBottom: 20,
            animation: "fadeUp 0.4s ease",
          }}>
            <div style={{ marginBottom: 14 }}>
              <ProgressBar done={doneCnt + failedCnt} total={total} failed={failedCnt} />
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 20, fontSize: 11, color: "#4a5568", marginBottom: 16 }}>
              <span>✓ <span style={{ color: "#4ade80" }}>{doneCnt}</span> done</span>
              <span>✗ <span style={{ color: "#fc8181" }}>{failedCnt}</span> failed</span>
              <span>⧖ <span style={{ color: "#60a5fa" }}>{total - doneCnt - failedCnt}</span> remaining</span>
            </div>

            {/* Video list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
              {items.map((item, i) => (
                <VideoRow key={i} item={item} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Done Banner */}
        {!running && total > 0 && doneCnt + failedCnt === total && (
          <div style={{
            background: "linear-gradient(135deg, #1c4532, #1a3a4a)",
            border: "1px solid #2d6a4f",
            borderRadius: 12,
            padding: "16px 24px",
            textAlign: "center",
            animation: "fadeUp 0.4s ease",
          }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>🎉</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "#4ade80", fontSize: 16 }}>
              All done! {doneCnt} transcript{doneCnt !== 1 ? "s" : ""} downloaded.
            </div>
            {failedCnt > 0 && <div style={{ color: "#fc8181", fontSize: 12, marginTop: 4 }}>{failedCnt} failed.</div>}
          </div>
        )}

        {/* How it works */}
        {total === 0 && (
          <div style={{ animation: "fadeUp 0.5s ease 0.4s both" }}>
            <div style={{ fontSize: 11, color: "#4a5568", letterSpacing: 1, marginBottom: 14, textAlign: "center" }}>HOW IT WORKS</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { n: "01", t: "Paste URLs", d: "Drop any number of YouTube links — one per line or comma-separated" },
                { n: "02", t: "Pick Format", d: "Choose TXT, SRT, DOCX, or PDF export format" },
                { n: "03", t: "Auto-download", d: "Each transcript downloads immediately — no waiting for the whole batch" },
                { n: "04", t: "Or ZIP it", d: "Prefer one file? Hit Download All ZIP for a bundle" },
              ].map((s) => (
                <div key={s.n} style={{
                  flex: "1 1 180px",
                  background: "#111827",
                  border: "1px solid #1e2a3a",
                  borderRadius: 12,
                  padding: "16px 18px",
                }}>
                  <div style={{ color: "#4ade80", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{s.n}</div>
                  <div style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{s.t}</div>
                  <div style={{ color: "#718096", fontSize: 12, lineHeight: 1.5 }}>{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      <footer style={{
        borderTop: "1px solid #1a2035",
        padding: "16px 32px",
        textAlign: "center",
        fontSize: 11,
        color: "#2d3748",
      }}>
        Powered by youtube-transcript-api · FastAPI backend · Free forever
      </footer>
    </div>
  );
}
 
