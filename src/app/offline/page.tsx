"use client";

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-violet-50 px-6 text-center">
      <div className="text-7xl mb-6" role="img" aria-label="Sem conexão">
        📵
      </div>
      <h1 className="text-2xl font-bold text-violet-800 mb-3">
        Sem conexão com a internet
      </h1>
      <p className="text-violet-600 text-base max-w-xs leading-relaxed mb-6">
        Parece que você está sem internet agora. Verifique sua conexão e tente
        de novo!
      </p>
      <button
        onClick={() => window.location.reload()}
        className="bg-violet-600 text-white font-semibold px-6 py-3 rounded-2xl shadow-md active:scale-95 transition-transform"
      >
        Tentar de novo
      </button>
    </div>
  );
}
