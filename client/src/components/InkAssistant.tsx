import { useEffect, useRef, useState, useCallback } from "react";

interface InkAssistantProps {
  message: string;
  onDownloadPDF?: () => void;
  onDownloadCSV?: () => void;
  showDownloadPrompt?: boolean;
  step?: number;
}

export function InkAssistant({
  message,
  onDownloadPDF,
  onDownloadCSV,
  showDownloadPrompt = false,
  step,
}: InkAssistantProps) {
  const [visible, setVisible] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevMessageRef = useRef<string>("");

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setLoading(false);
  }, []);

  const speakMessage = useCallback(
    async (text: string) => {
      stopAudio();
      setLoading(true);
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error("TTS request failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        setLoading(false);
        audio.onplay = () => setSpeaking(true);
        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        await audio.play();
      } catch {
        setLoading(false);
        // Fallback to Web Speech API
        if ("speechSynthesis" in window) {
          const utt = new SpeechSynthesisUtterance(text);
          utt.lang = "en-US";
          utt.rate = 0.9;
          utt.pitch = 1.1;
          utt.onstart = () => setSpeaking(true);
          utt.onend = () => setSpeaking(false);
          window.speechSynthesis.speak(utt);
        }
      }
    },
    [stopAudio]
  );

  // Auto-speak when message changes
  useEffect(() => {
    if (!message || message === prevMessageRef.current) return;
    prevMessageRef.current = message;
    setMinimized(false);
    setVisible(true);
    speakMessage(message);
  }, [message, speakMessage]);

  // Auto-minimize on Results step (step 4) so the table is not obscured
  useEffect(() => {
    if (step === 4) {
      setMinimized(true);
    }
  }, [step]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "12px",
        maxWidth: "400px",
      }}
    >
      {/* Speech bubble */}
      {!minimized && (
        <div
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            border: "2px solid #22c55e",
            borderRadius: "20px 20px 4px 20px",
            padding: "18px 20px",
            boxShadow:
              "0 10px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,197,94,0.15)",
            width: "360px",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
              paddingBottom: "10px",
              borderBottom: "1px solid rgba(34,197,94,0.25)",
            }}
          >
            <span style={{ fontSize: "17px" }}>🎤</span>
            <span
              style={{
                fontWeight: "800",
                fontSize: "13px",
                letterSpacing: "1.5px",
                background: "linear-gradient(90deg, #22c55e, #f0c040)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textTransform: "uppercase",
              }}
            >
              INK ASSISTANT
            </span>
            {/* Sound wave / loading indicator */}
            <span
              style={{
                display: "inline-flex",
                gap: "2px",
                alignItems: "flex-end",
                height: "18px",
                marginLeft: "4px",
              }}
            >
              {loading ? (
                <span style={{ fontSize: "12px", color: "#f0c040" }}>⏳</span>
              ) : speaking ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: "3px",
                      background: "#22c55e",
                      borderRadius: "2px",
                      animation: `soundwave 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
                      height: `${6 + i * 3}px`,
                      display: "inline-block",
                    }}
                  />
                ))
              ) : null}
            </span>
          </div>

          {/* Message */}
          <p
            style={{
              margin: 0,
              color: "#e2e8f0",
              fontSize: "14px",
              lineHeight: "1.65",
              fontWeight: "500",
            }}
          >
            {message}
          </p>

          {/* Download buttons */}
          {showDownloadPrompt && (
            <div
              style={{
                marginTop: "16px",
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={onDownloadPDF}
                style={{
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 16px",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                  flex: 1,
                  boxShadow: "0 3px 10px rgba(239,68,68,0.4)",
                }}
              >
                📄 Download PDF
              </button>
              <button
                onClick={onDownloadCSV}
                style={{
                  background: "linear-gradient(135deg, #22c55e, #16a34a)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 16px",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                  flex: 1,
                  boxShadow: "0 3px 10px rgba(34,197,94,0.4)",
                }}
              >
                📊 Download CSV
              </button>
            </div>
          )}

          {/* Controls */}
          <div
            style={{
              marginTop: "14px",
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
            }}
          >
            {speaking ? (
              <button onClick={stopAudio} style={controlBtnStyle("#ef4444")}>
                ⏹ Stop
              </button>
            ) : (
              <button
                onClick={() => speakMessage(message)}
                style={controlBtnStyle("#3b82f6")}
              >
                🔊 Replay
              </button>
            )}
            <button
              onClick={() => setMinimized(true)}
              style={controlBtnStyle("#6b7280")}
            >
              — Hide
            </button>
            <button
              onClick={() => {
                stopAudio();
                setVisible(false);
              }}
              style={controlBtnStyle("#6b7280")}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Avatar — BIG */}
      <div
        style={{
          position: "relative",
          cursor: minimized ? "pointer" : "default",
          alignSelf: "flex-end",
        }}
        onClick={() => minimized && setMinimized(false)}
        title={minimized ? "Click to open Ink Assistant" : ""}
      >
        {/* Outer pulse ring */}
        {speaking && (
          <div
            style={{
              position: "absolute",
              inset: "-12px",
              borderRadius: "50%",
              border: "3px solid rgba(34,197,94,0.4)",
              animation: "pulse-ring 1.2s ease-out 0.2s infinite",
              pointerEvents: "none",
            }}
          />
        )}
        {/* Inner pulse ring */}
        {speaking && (
          <div
            style={{
              position: "absolute",
              inset: "-6px",
              borderRadius: "50%",
              border: "3px solid #22c55e",
              animation: "pulse-ring 1.2s ease-out infinite",
              pointerEvents: "none",
            }}
          />
        )}

        <img
          src="/ink-assistant-avatar.png"
          alt="Ink Assistant"
          style={{
            width: "170px",
            height: "170px",
            objectFit: "contain",
            objectPosition: "top center",
            borderRadius: "50%",
            border: "5px solid #f0c040",
            background: "#ffffff",
            boxShadow:
              "0 10px 40px rgba(0,0,0,0.5), 0 0 0 2px rgba(240,192,64,0.4)",
            display: "block",
          }}
        />

        {/* Minimized badge */}
        {minimized && (
          <div
            style={{
              position: "absolute",
              top: "-6px",
              right: "-6px",
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              boxShadow: "0 3px 10px rgba(0,0,0,0.4)",
              border: "2px solid #fff",
            }}
          >
            💬
          </div>
        )}

        {/* Name tag */}
        <div
          style={{
            textAlign: "center",
            marginTop: "6px",
            fontSize: "11.5px",
            fontWeight: "800",
            letterSpacing: "1.2px",
            background: "linear-gradient(90deg, #22c55e, #f0c040)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textTransform: "uppercase",
          }}
        >
          Ink Assistant
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes soundwave {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.9; }
          100% { transform: scale(1.5); opacity: 0;   }
        }
      `}</style>
    </div>
  );
}

function controlBtnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "6px 12px",
    fontSize: "12px",
    cursor: "pointer",
    fontWeight: "600",
  };
}
