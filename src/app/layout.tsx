import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Cairo } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { PwaManager } from "@/components/pwa/PwaManager";

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
  preload: true,
});

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["600", "700"],
  variable: "--font-cairo",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "نظام الأرشيف الإلكتروني الذكي — الصادر والوارد",
  description:
    "منظومة تنفيذية متكاملة لإدارة وأرشفة المراسلات الرسمية (الصادر والوارد) مدعومة بالذكاء الاصطناعي.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "الأرشيف الذكي",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f8" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies the saved theme before first paint to avoid a flash of the wrong theme.
const themeBootScript = `(function(){try{var t=localStorage.getItem('mostkbl_archive_theme');var r=document.documentElement;if(t==='light'){r.classList.remove('dark');r.classList.add('light');}else{r.classList.add('dark');r.classList.remove('light');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${ibmPlexArabic.variable} ${cairo.variable} dark`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <PwaManager />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
