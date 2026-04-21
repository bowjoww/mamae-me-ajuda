"use client";

import { useCallback, useState } from "react";
import { compressImage } from "@/lib/chatUtils";

export function useImageUpload(): {
  imagePreview: string | null;
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearImage: () => void;
} {
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        compressImage(dataUrl)
          .then(setImagePreview)
          .catch(() => setImagePreview(dataUrl));
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const clearImage = useCallback(() => setImagePreview(null), []);

  return { imagePreview, handleImageSelect, clearImage };
}
