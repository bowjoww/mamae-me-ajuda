import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeScreen } from "../WelcomeScreen";
import { TypingIndicator } from "../TypingIndicator";
import { ImagePreviewBar } from "../ImagePreviewBar";
import { ChatMessage } from "../ChatMessage";

// ---------------------------------------------------------------------------
// WelcomeScreen
// ---------------------------------------------------------------------------

describe("WelcomeScreen", () => {
  const defaultProps = {
    nameInput: "",
    onNameChange: jest.fn(),
    onStart: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it("renders the title and input", () => {
    render(<WelcomeScreen {...defaultProps} />);
    expect(screen.getByText(/Mamãe, me ajuda!/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Digite seu nome/i)).toBeInTheDocument();
  });

  it("disables the start button when name is empty", () => {
    render(<WelcomeScreen {...defaultProps} nameInput="" />);
    const btn = screen.getByRole("button", { name: /Começar/i });
    expect(btn).toBeDisabled();
  });

  it("enables the start button when name has content", () => {
    render(<WelcomeScreen {...defaultProps} nameInput="Ana" />);
    const btn = screen.getByRole("button", { name: /Começar/i });
    expect(btn).toBeEnabled();
  });

  it("calls onNameChange when the input changes", () => {
    const onNameChange = jest.fn();
    render(<WelcomeScreen {...defaultProps} onNameChange={onNameChange} />);
    fireEvent.change(screen.getByPlaceholderText(/Digite seu nome/i), {
      target: { value: "Lucas" },
    });
    expect(onNameChange).toHaveBeenCalledWith("Lucas");
  });

  it("calls onStart when the button is clicked", () => {
    const onStart = jest.fn();
    render(<WelcomeScreen {...defaultProps} nameInput="Ana" onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: /Começar/i }));
    expect(onStart).toHaveBeenCalled();
  });

  it("calls onStart when Enter is pressed in the input", () => {
    const onStart = jest.fn();
    render(<WelcomeScreen {...defaultProps} nameInput="Ana" onStart={onStart} />);
    fireEvent.keyDown(screen.getByPlaceholderText(/Digite seu nome/i), { key: "Enter" });
    expect(onStart).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TypingIndicator
// ---------------------------------------------------------------------------

describe("TypingIndicator", () => {
  it("renders the thinking status indicator", () => {
    render(<TypingIndicator />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Pensando")).toBeInTheDocument();
  });

  it("has accessible aria-label", () => {
    render(<TypingIndicator />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Tutora está pensando"
    );
  });
});

// ---------------------------------------------------------------------------
// ImagePreviewBar
// ---------------------------------------------------------------------------

describe("ImagePreviewBar", () => {
  const onRemove = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it("renders the image preview", () => {
    render(
      <ImagePreviewBar
        imagePreview="data:image/jpeg;base64,abc"
        onRemove={onRemove}
      />
    );
    const img = screen.getByAltText(/Pré-visualização/i);
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "data:image/jpeg;base64,abc");
  });

  it("renders the remove button", () => {
    render(
      <ImagePreviewBar imagePreview="data:image/jpeg;base64,abc" onRemove={onRemove} />
    );
    expect(screen.getByRole("button", { name: /Remover imagem/i })).toBeInTheDocument();
  });

  it("calls onRemove when the remove button is clicked", () => {
    render(
      <ImagePreviewBar imagePreview="data:image/jpeg;base64,abc" onRemove={onRemove} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Remover imagem/i }));
    expect(onRemove).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ChatInput
// ---------------------------------------------------------------------------

import { ChatInput } from "../ChatInput";

describe("ChatInput", () => {
  const baseProps = {
    input: "",
    isLoading: false,
    hasImagePreview: false,
    onInputChange: jest.fn(),
    onSend: jest.fn(),
    onImageSelect: jest.fn(),
    inputRef: { current: null } as React.RefObject<HTMLInputElement | null>,
  };

  beforeEach(() => jest.clearAllMocks());

  it("renders the text input", () => {
    render(<ChatInput {...baseProps} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("disables send button when input is empty and no image", () => {
    render(<ChatInput {...baseProps} input="" hasImagePreview={false} />);
    expect(screen.getByRole("button", { name: /Enviar/i })).toBeDisabled();
  });

  it("enables send button when input has text", () => {
    render(<ChatInput {...baseProps} input="Olá" />);
    expect(screen.getByRole("button", { name: /Enviar/i })).toBeEnabled();
  });

  it("enables send button when there is an image preview", () => {
    render(<ChatInput {...baseProps} hasImagePreview={true} />);
    expect(screen.getByRole("button", { name: /Enviar/i })).toBeEnabled();
  });

  it("disables input when loading", () => {
    render(<ChatInput {...baseProps} isLoading={true} input="Texto" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("calls onSend when send button is clicked", () => {
    const onSend = jest.fn();
    render(<ChatInput {...baseProps} input="Texto" onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));
    expect(onSend).toHaveBeenCalled();
  });

  it("calls onSend when Enter is pressed", () => {
    const onSend = jest.fn();
    render(<ChatInput {...baseProps} input="Texto" onSend={onSend} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSend).toHaveBeenCalled();
  });

  it("does not call onSend on Shift+Enter", () => {
    const onSend = jest.fn();
    render(<ChatInput {...baseProps} input="Texto" onSend={onSend} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("calls onInputChange when typing", () => {
    const onInputChange = jest.fn();
    render(<ChatInput {...baseProps} onInputChange={onInputChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "oi" } });
    expect(onInputChange).toHaveBeenCalledWith("oi");
  });
});

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

describe("ChatMessage", () => {
  const baseProps = {
    role: "model" as const,
    content: "Vamos pensar juntos!",
    index: 0,
    playingIndex: null,
    loadingAudio: null,
    onSpeak: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it("renders model message content", () => {
    render(<ChatMessage {...baseProps} />);
    expect(screen.getByText("Vamos pensar juntos!")).toBeInTheDocument();
  });

  it("renders user message without listen button", () => {
    render(<ChatMessage {...baseProps} role="user" />);
    expect(screen.queryByRole("button", { name: /Ouvir/i })).not.toBeInTheDocument();
  });

  it("renders listen button on model messages", () => {
    render(<ChatMessage {...baseProps} />);
    expect(screen.getByRole("button", { name: /Ouvir resposta/i })).toBeInTheDocument();
  });

  it("calls onSpeak when listen button is clicked", () => {
    const onSpeak = jest.fn();
    render(<ChatMessage {...baseProps} onSpeak={onSpeak} />);
    fireEvent.click(screen.getByRole("button", { name: /Ouvir resposta/i }));
    expect(onSpeak).toHaveBeenCalledWith("Vamos pensar juntos!", 0);
  });

  it("shows 'Parar' when this message is playing", () => {
    render(<ChatMessage {...baseProps} playingIndex={0} />);
    expect(screen.getByRole("button", { name: /Parar/i })).toBeInTheDocument();
  });

  it("shows loading state when audio is loading", () => {
    render(<ChatMessage {...baseProps} loadingAudio={0} />);
    expect(screen.getByText(/Carregando/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ouvir/i })).toBeDisabled();
  });

  it("renders an image when provided", () => {
    render(
      <ChatMessage
        {...baseProps}
        role="user"
        image="data:image/jpeg;base64,abc"
      />
    );
    expect(
      screen.getByAltText(/Foto do exercício/i)
    ).toBeInTheDocument();
  });
});
