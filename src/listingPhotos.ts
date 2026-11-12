export async function prepareListingPhotos(files: FileList | null, available: number): Promise<string[]> {
  const selected = Array.from(files || []);
  if (!selected.length) return [];
  if (selected.length > available) throw new Error(`You may add only ${available} more photo(s) (maximum six).`);
  if (selected.some(file => !["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 8_000_000))
    throw new Error("Choose JPEG, PNG or WebP images of 8 MB or less.");
  return Promise.all(selected.map(async file => {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      let width = img.naturalWidth, height = img.naturalHeight;
      const scale = Math.min(1, 1100 / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      for (let attempt = 0; attempt < 7; attempt++) {
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Unable to process images in this browser.");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const data = canvas.toDataURL("image/jpeg", Math.max(.43, .77-attempt*.05));
        if (data.length <= 280_000) return data;
        width = Math.max(1, Math.round(width * .8));
        height = Math.max(1, Math.round(height * .8));
      }
      throw new Error("The selected image is too large. Try a smaller photograph.");
    } finally { URL.revokeObjectURL(url); }
  }));
}
