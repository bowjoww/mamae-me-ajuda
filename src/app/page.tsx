"use client";

import { useEffect, useRef, useState } from "react";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { AppIntroModal } from "./components/AppIntroModal";
import { ImagePreviewBar } from "./components/ImagePreviewBar";
import { ChatInput } from "./components/ChatInput";
import { ConsentModal } from "./components/ConsentModal";
import { MessageList } from "./components/chat/MessageList";
import { TabBar } from "./components/navigation/TabBar";
import { useConsent } from "@/lib/hooks/useConsent";
import { useChatSession } from "@/lib/hooks/useChatSession";
import { useImageUpload } from "@/lib/hooks/useImageUpload";
import { useStudentName } from "@/lib/hooks/useStudentName";
import { useTextToSpeech } from "@/lib/hooks/useTextToSpeech";

export default function Home() {
  const { consentGiven, acceptConsent } = useConsent();
  const { studentName, setStudentName } = useStudentName();
  const [nameInput, setNameInput] = useState("");
  const [input, setInput] = useState("");
  const [introOpen, setIntroOpen] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);

  const { messages, isLoading, startSession, sendMessage } = useChatSession();
  const { imagePreview, handleImageSelect, clearImage } = useImageUpload();
  const { playingIndex, loadingAudio, speak } = useTextToSpeech();

  // When the persisted name hydrates (or Google-derived name resolves),
  // warm up the chat session so the welcome message is already present
  // on screen by the time the user sees it. Without this effect the chat
  // area stays blank until the student sends the first message because
  // the session was started in `handleStartChat`, which we skip when the
  // name is auto-restored from storage on navigation.
  const sessionStartedRef = useRef(false);
  useEffect(() => {
    if (sessionStartedRef.current) return;
    if (studentName && studentName.length > 0 && messages.length === 0) {
      sessionStartedRef.current = true;
      startSession(studentName);
    }
  }, [studentName, messages.length, startSession]);

  // "Pedir ajuda" on the FlashcardDuel drops a contextual prompt into
  // sessionStorage (or the ?ask= URL param as a fallback) before routing
  // here. Pre-fill the input so the student can either hit send as-is or
  // edit before sending. Also read ?ask= because some browsers block
  // sessionStorage from third-party contexts.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let seed = "";
    try {
      seed = window.sessionStorage.getItem("mma.pendingChatSeed") ?? "";
      if (seed) window.sessionStorage.removeItem("mma.pendingChatSeed");
    } catch {
      // sessionStorage disabled — fall through to URL param.
    }
    if (!seed) {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("ask");
      if (fromUrl) {
        seed = fromUrl;
        // Clean the URL so a refresh doesn't reseed the input.
        const clean = window.location.pathname;
        window.history.replaceState(null, "", clean);
      }
    }
    if (seed) setInput(seed);
  }, []);

  const handleStartChat = () => {
    const name = nameInput.trim();
    if (!name) return;
    setStudentName(name);
    sessionStartedRef.current = true;
    startSession(name);
  };

  const handleSend = async () => {
    const textToSend = input;
    const imageToSend = imagePreview;
    setInput("");
    clearImage();
    await sendMessage(textToSend, imageToSend);
    textInputRef.current?.focus();
  };

  // `consentGiven === null` (still reading localStorage) or
  // `studentName === null` (useStudentName still hydrating) both render a
  // blank dark placeholder. Showing the WelcomeScreen during hydration
  // caused the Chat tab bug: every navigation to '/' flashed the name
  // prompt for a frame before the stored name arrived.
  if (consentGiven === null || studentName === null) {
    return (
      <div className="h-dvh bg-[var(--canvas-base)]" aria-hidden="true" />
    );
  }

  if (studentName === "") {
    return (
      <>
        <WelcomeScreen
          nameInput={nameInput}
          onNameChange={setNameInput}
          onStart={handleStartChat}
        />
        {!consentGiven && <ConsentModal onAccept={acceptConsent} />}
      </>
    );
  }

  return (
    <div className="flex flex-col h-dvh max-w-lg mx-auto bg-[var(--canvas-base)]">
      <header
        className="px-4 py-3 border-b border-[var(--line-soft)] shrink-0 flex items-center gap-3"
        style={{ background: "var(--canvas-base)" }}
      >
        <div className="shrink-0 w-9 h-9 rounded-full border border-[var(--line)] flex items-center justify-center">
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={{ color: "var(--violet-action)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6.2A2.2 2.2 0 0 1 6.2 4h11.6A2.2 2.2 0 0 1 20 6.2v11.6A2.2 2.2 0 0 1 17.8 20H6.2A2.2 2.2 0 0 1 4 17.8V6.2Z M4 9h16" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1
            className="font-editorial"
            style={{
              color: "var(--ink-primary)",
              fontSize: "1.25rem",
              lineHeight: 1.1,
            }}
          >
            Tarefa — {studentName}
          </h1>
          <p
            className="font-hud uppercase"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.625rem",
              letterSpacing: "0.18em",
            }}
          >
            Tutora no ar
          </p>
        </div>
        {/* 'Como funciona' escape hatch. Lets the student re-open the
            first-session explainer when they forget what each tab does.
            Clears the dismiss flag + forces the modal open via state. */}
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.removeItem("mma.introSeen");
            } catch {
              // ignore — the modal still opens via local state.
            }
            setIntroOpen(true);
          }}
          aria-label="Como funciona — revela o tutorial de primeiro uso"
          className="ml-auto shrink-0 w-9 h-9 rounded-full border border-[var(--line)] flex items-center justify-center"
          style={{ color: "var(--ink-secondary)" }}
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.3a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.2 1-1.2 2" strokeLinecap="round" />
            <path d="M12 16.5h.01" strokeLinecap="round" strokeWidth="2" />
          </svg>
        </button>
      </header>

      <main
        className="flex-1 flex flex-col min-h-0"
        aria-label="Conversa ativa com a tutora"
      >
        <MessageList
          messages={messages}
          isLoading={isLoading}
          playingIndex={playingIndex}
          loadingAudio={loadingAudio}
          onSpeak={speak}
        />

        {imagePreview && (
          <ImagePreviewBar imagePreview={imagePreview} onRemove={clearImage} />
        )}

        <ChatInput
          input={input}
          isLoading={isLoading}
          hasImagePreview={!!imagePreview}
          onInputChange={setInput}
          onSend={handleSend}
          onImageSelect={handleImageSelect}
          inputRef={textInputRef}
        />
      </main>

      {/* Chat is a full-viewport flex column — a floating TabBar would overlap
          ChatInput at 393×851. `floating={false}` renders the bar as a
          sticky sibling inside the flex flow, giving ChatInput clear space. */}
      <TabBar floating={false} />

      {/* First-session explainer. Mounts AFTER the chat is live so the
          student sees the real UI behind the modal (reinforces the four
          modes are real tabs). AppIntroModal self-gates on
          mma.introSeen in localStorage so it appears exactly once —
          plus the '?' button in the header forces it open on demand. */}
      <AppIntroModal studentName={studentName} forceOpen={introOpen} onClose={() => setIntroOpen(false)} />
    </div>
  );
}
