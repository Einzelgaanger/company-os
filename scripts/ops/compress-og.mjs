import sharp from "sharp";

await Promise.all([
  sharp("public/og-image.png")
    .resize(1200, 630, { fit: "cover" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile("public/og-image.jpg"),
  sharp("public/og-whatsapp.png")
    .resize(1200, 1200, { fit: "cover" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile("public/og-whatsapp.jpg"),
]);

console.log("compressed");
