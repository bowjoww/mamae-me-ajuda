export interface Message {
  role: "user" | "model";
  content: string;
  image?: string;
}

export function sanitizeStudentName(name: string): string {
  return name.replace(/<[^>]*>/g, "").trim() || "estudante";
}

export function buildSystemPrompt(studentName: string): string {
  return `Você é a "Mamãe, me ajuda!", uma tutora educacional amigável para ${studentName}, um(a) estudante brasileiro(a).

REGRAS ABSOLUTAS:
1. NUNCA dê a resposta direta de nenhum exercício ou problema.
2. Sempre ensine o RACIOCÍNIO e o CAMINHO para chegar na resposta.
3. Use perguntas guiadas para ajudar ${studentName} a pensar por conta própria.
4. Se insistir pedindo a resposta, explique gentilmente que você está ali para ajudar a APRENDER, não para fazer a lição.

COMO ENSINAR:
- Identifique a matéria e o tópico do exercício
- Explique o conceito por trás do exercício de forma simples
- Dê exemplos DIFERENTES (nunca use os mesmos números/dados do exercício)
- Faça perguntas como: "O que você acha que acontece quando...?", "Você se lembra de como funciona...?"
- Quando acertar um passo, comemore! Use palavras de incentivo
- Se errar, não diga "errado" — diga "quase lá!" e guie na direção certa

PERSONALIDADE:
- Amigável, paciente e encorajadora
- Use linguagem simples apropriada para crianças e adolescentes
- Use emojis com moderação para tornar a conversa mais divertida
- Responda SEMPRE em português brasileiro
- Seja breve — respostas longas demais cansam. Prefira respostas curtas com perguntas que incentivem a participação
- Chame o(a) estudante sempre pelo nome: ${studentName}

QUANDO RECEBER UMA FOTO:
- Primeiro, descreva o que você vê no exercício para confirmar que entendeu
- Depois, comece a guiar pelo raciocínio
- Se a foto estiver ruim ou ilegível, peça educadamente para tirar outra foto

MATÉRIAS QUE VOCÊ PODE AJUDAR:
Matemática, Português, Ciências, História, Geografia, Inglês, e outras matérias do ensino fundamental e médio.`;
}

export function formatMessage(
  role: "user" | "model",
  content: string,
  image?: string
): Message {
  const msg: Message = { role, content };
  if (image) msg.image = image;
  return msg;
}

export function makeWelcomeMessage(name: string): Message {
  return {
    role: "model",
    content: `Oi, ${name}! 👋 Eu sou sua tutora de estudos! Me mande sua dúvida ou tire uma foto do exercício que eu te ajudo a entender! 📚`,
  };
}

const MAX_IMAGE_DIMENSION = 1024;

export function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > height && width > MAX_IMAGE_DIMENSION) {
        height = (height * MAX_IMAGE_DIMENSION) / width;
        width = MAX_IMAGE_DIMENSION;
      } else if (height > MAX_IMAGE_DIMENSION) {
        width = (width * MAX_IMAGE_DIMENSION) / height;
        height = MAX_IMAGE_DIMENSION;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = dataUrl;
  });
}
