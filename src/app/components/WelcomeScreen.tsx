"use client";

interface WelcomeScreenProps {
  nameInput: string;
  onNameChange: (value: string) => void;
  onStart: () => void;
}

export function WelcomeScreen({ nameInput, onNameChange, onStart }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col h-dvh max-w-lg mx-auto items-center justify-center px-6">
      <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="text-6xl mb-4" role="img" aria-label="Livros">📚</div>
        <h1 className="text-2xl font-bold text-violet-600 mb-2">
          Mamãe, me ajuda!
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Seu ajudante de estudos
        </p>
        <label htmlFor="student-name" className="block text-gray-700 text-sm mb-2">
          Qual é o seu nome?
        </label>
        <input
          id="student-name"
          type="text"
          value={nameInput}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onStart()}
          placeholder="Digite seu nome..."
          className="w-full bg-gray-100 rounded-full px-4 py-3 text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-violet-300 transition-all mb-4 text-center"
          autoFocus
          autoComplete="given-name"
        />
        <button
          onClick={onStart}
          disabled={!nameInput.trim()}
          className="w-full bg-violet-600 text-white rounded-full py-3 text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Começar!
        </button>
      </div>
    </div>
  );
}
