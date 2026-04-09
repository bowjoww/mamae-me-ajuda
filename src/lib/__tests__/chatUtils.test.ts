import {
  sanitizeStudentName,
  buildSystemPrompt,
  formatMessage,
  makeWelcomeMessage,
} from "../chatUtils";

describe("sanitizeStudentName", () => {
  it("returns the name unchanged when there are no HTML tags", () => {
    expect(sanitizeStudentName("Ana")).toBe("Ana");
  });

  it("strips HTML tags but keeps text content between them", () => {
    // Tags are removed, inner text is preserved — name is used in a text-only context
    expect(sanitizeStudentName("<script>alert('xss')</script>Ana")).toBe("alert('xss')Ana");
  });

  it("strips tags and trims whitespace", () => {
    expect(sanitizeStudentName("  <b>João</b>  ")).toBe("João");
  });

  it("returns 'estudante' when the result is empty after stripping", () => {
    expect(sanitizeStudentName("<div></div>")).toBe("estudante");
  });

  it("returns 'estudante' for an empty string", () => {
    expect(sanitizeStudentName("")).toBe("estudante");
  });

  it("returns 'estudante' for a whitespace-only string", () => {
    expect(sanitizeStudentName("   ")).toBe("estudante");
  });

  it("preserves names with special characters and accents", () => {
    expect(sanitizeStudentName("Ágatha")).toBe("Ágatha");
  });
});

describe("buildSystemPrompt", () => {
  it("includes the student name in the prompt", () => {
    const prompt = buildSystemPrompt("Lucas");
    expect(prompt).toContain("Lucas");
  });

  it("contains the absolute rule about not giving direct answers", () => {
    const prompt = buildSystemPrompt("any");
    expect(prompt).toContain("NUNCA dê a resposta direta");
  });

  it("mentions 'português brasileiro' as the response language", () => {
    const prompt = buildSystemPrompt("any");
    expect(prompt).toContain("português brasileiro");
  });

  it("references the student name multiple times (greeting + rules)", () => {
    const prompt = buildSystemPrompt("Maria");
    const occurrences = (prompt.match(/Maria/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("returns a non-empty string", () => {
    const prompt = buildSystemPrompt("Test");
    expect(prompt.length).toBeGreaterThan(100);
  });
});

describe("formatMessage", () => {
  it("creates a user message without image", () => {
    const msg = formatMessage("user", "Olá!");
    expect(msg).toEqual({ role: "user", content: "Olá!" });
  });

  it("creates a model message without image", () => {
    const msg = formatMessage("model", "Resposta da tutora");
    expect(msg).toEqual({ role: "model", content: "Resposta da tutora" });
  });

  it("includes image when provided", () => {
    const msg = formatMessage("user", "Veja isso", "data:image/jpeg;base64,abc");
    expect(msg).toEqual({
      role: "user",
      content: "Veja isso",
      image: "data:image/jpeg;base64,abc",
    });
  });

  it("does not add image key when image is undefined", () => {
    const msg = formatMessage("user", "Sem imagem", undefined);
    expect(msg).not.toHaveProperty("image");
  });

  it("does not mutate a previous message object", () => {
    const first = formatMessage("user", "Primeiro");
    const second = formatMessage("user", "Segundo");
    expect(first.content).toBe("Primeiro");
    expect(second.content).toBe("Segundo");
  });
});

describe("makeWelcomeMessage", () => {
  it("returns a model role message", () => {
    const msg = makeWelcomeMessage("Carlos");
    expect(msg.role).toBe("model");
  });

  it("includes the student name in the welcome content", () => {
    const msg = makeWelcomeMessage("Carlos");
    expect(msg.content).toContain("Carlos");
  });

  it("contains a friendly greeting emoji", () => {
    const msg = makeWelcomeMessage("any");
    expect(msg.content).toContain("👋");
  });

  it("does not include an image field", () => {
    const msg = makeWelcomeMessage("any");
    expect(msg.image).toBeUndefined();
  });
});
