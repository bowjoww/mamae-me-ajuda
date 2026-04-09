export function TypingIndicator() {
  return (
    <div className="message-appear flex justify-start" role="status" aria-label="Tutora está pensando">
      <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm flex items-center gap-1">
        <span className="text-xs text-gray-400 mr-2" aria-hidden="true">Pensando</span>
        <span className="w-2 h-2 bg-violet-400 rounded-full dot-1 inline-block" aria-hidden="true"></span>
        <span className="w-2 h-2 bg-violet-400 rounded-full dot-2 inline-block" aria-hidden="true"></span>
        <span className="w-2 h-2 bg-violet-400 rounded-full dot-3 inline-block" aria-hidden="true"></span>
      </div>
    </div>
  );
}
