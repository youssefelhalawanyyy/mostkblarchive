import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "نظام الأرشيف الإلكتروني الذكي — الصادر والوارد",
    short_name: "الأرشيف الذكي",
    description:
      "منظومة تنفيذية متكاملة لإدارة وأرشفة المراسلات الرسمية (الصادر والوارد) بالذكاء الاصطناعي.",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#09090b",
    theme_color: "#09090b",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "تسجيل مستند جديد",
        short_name: "مستند جديد",
        description: "رفع وتحليل مستند PDF جديد بالذكاء الاصطناعي",
        url: "/intake",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "أرشيف الصادر والوارد",
        short_name: "الأرشيف",
        description: "البحث والاستعراض الفوري لجميع المراسلات",
        url: "/archive",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}

