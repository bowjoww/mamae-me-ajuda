interface ImagePreviewBarProps {
  imagePreview: string;
  onRemove: () => void;
}

export function ImagePreviewBar({ imagePreview, onRemove }: ImagePreviewBarProps) {
  return (
    <div className="px-4 py-2 bg-white/80 border-t border-violet-100 shrink-0">
      <div className="relative inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagePreview}
          alt="Pré-visualização da imagem selecionada"
          className="h-16 rounded-lg border-2 border-violet-300"
        />
        <button
          onClick={onRemove}
          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow"
          aria-label="Remover imagem selecionada"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
