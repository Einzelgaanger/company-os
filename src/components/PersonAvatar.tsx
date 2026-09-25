import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function PersonAvatar({
  name,
  url,
  className,
}: {
  name: string;
  url?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D3F36B] text-[11px] font-bold text-[#0E1F1A]",
        className,
      )}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

/** Square photo, small enough to store on the person. */
export function readAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not read that photo."));
        return;
      }
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that photo."));
    };
    img.src = objectUrl;
  });
}
