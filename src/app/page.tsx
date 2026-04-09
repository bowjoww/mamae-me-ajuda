"use client";

import { useState, useRef, useEffect } from "react";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ChatMessage } from "./components/ChatMessage";
import { TypingIndicator } from "./components/TypingIndicator";
import { ImagePreviewBar } from "./components/ImagePreviewBar";
import { ChatInput } from "./components/ChatInput";

interface Message {
  role: "user" | "model";
  content: string;
  image?: string;
}

function makeWelcomeMessage(name: string): Message {
  return {
    role: "model",
    content: `Oi, ${name}! 👋 Eu sou sua tutora de estudos! Me mande sua dúvida ou tire uma foto do exercício que eu te ajudo a entender! 📚`,
  };
}

export default function Home() {
  const [studentName, setStudentName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleStartChat = () => {
    const name = nameInput.trim();
    if (!name) return;
    setStudentName(name);
    setMessages([makeWelcomeMessage(name)]);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const compressImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_SIZE) {
          height = (height * MAX_SIZE) / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width = (width * MAX_SIZE) / height;
          height = MAX_SIZE;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = dataUrl;
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const compressed = await compressImage(dataUrl);
      setImagePreview(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput && !imagePreview) return;
    if (isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: trimmedInput,
      image: imagePreview || undefined,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setImagePreview(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.slice(1),
          studentName,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages([...newMessages, { role: "model", content: data.error }]);
      } else {
        setMessages([...newMessages, { role: "model", content: data.response }]);
      }
    } catch {
      setMessages([
        ...newMessages,
        {
          role: "model",
          content:
            "Ops! Não consegui me conectar. Verifica sua internet e tenta de novo! 🔌",
        },
      ]);
    } finally {
      setIsLoading(false);
      textInputRef.current?.focus();
    }
  };

  const handleSpeak = async (text: string, index: number) => {
    if (playingIndex === index) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingIndex(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setLoadingAudio(index);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        setLoadingAudio(null);
        return;
      }

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        setPlayingIndex(null);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      audioRef.current = audio;
      setLoadingAudio(null);
      setPlayingIndex(index);
      await audio.play();
    } catch {
      setLoadingAudio(null);
      setPlayingIndex(null);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (!studentName) {
    return (
      <WelcomeScreen
        nameInput={nameInput}
        onNameChange={setNameInput}
        onStart={handleStartChat}
      />
    );
  }

  return (
    <div className="flex flex-col h-dvh max-w-lg mx-auto">
      <header className="bg-violet-600 text-white px-4 py-3 shadow-lg flex items-center gap-3 shrink-0">
        <div className="text-3xl" role="img" aria-label="Livros">📚</div>
        <div>
          <h1 className="text-lg font-bold leading-tight">Mamãe, me ajuda!</h1>
          <p className="text-violet-200 text-xs">Seu ajudante de estudos</p>
        </div>
      </header>

      <main
        className="flex-1 overflow-y-auto chat-scroll px-4 py-4 space-y-3"
        aria-label="Conversa com a tutora"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            role={msg.role}
            content={msg.content}
            image={msg.image}
            index={i}
            playingIndex={playingIndex}
            loadingAudio={loadingAudio}
            onSpeak={handleSpeak}
          />
        ))}

        {isLoading && <TypingIndicator />}

        <div ref={chatEndRef} aria-hidden="true" />
      </main>

      {imagePreview && (
        <ImagePreviewBar
          imagePreview={imagePreview}
          onRemove={() => setImagePreview(null)}
        />
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
    </div>
  );
}
