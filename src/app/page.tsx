"use client";

import { useEffect, useRef, useState } from "react";
import { WelcomeScreen } from "./components/WelcomeScreen";
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
    </div>
  );
}
