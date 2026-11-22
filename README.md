# نظام الأرشيف الإلكتروني الذكي — AI Digital Archive System (الصادر والوارد)

منظومة تنفيذية متكاملة (**100% عربي RTL**) لإدارة وأرشفة المراسلات الرسمية (**الصادر والوارد**)، مدعومة بالذكاء الاصطناعي **Gemini 2.5 Flash**، ومبنية على **Next.js (App Router) + Firebase + Vercel** مع **ترحيل آمن** و**مزامنة لحظية 24/7** مع خادم **Microsoft SQL Server (`.aspx`)** المحلي دون أي حذف أو تعديل للبيانات التاريخية.

---

## المكونات الثلاثة للمنظومة (System Architecture)

1. **تطبيق الويب التنفيذي (`src/`) — Next.js + TailwindCSS + Firebase + Gemini API**
   - واجهة عربية بالكامل (`<html lang="ar" dir="rtl">`) بخطوط `IBM Plex Sans Arabic` و `Cairo` وخواص CSS المنطقية بالكامل، مع دعم الوضع الداكن التنفيذي (**Obsidian Dark**) و**وضع النهار (Light Mode)**.
   - **استوديو الإضافة الذكي (`/intake`)**: شاشة مقسومة (نموذج معبأ تلقائياً بـ Gemini يميناً 55% + عارض PDF تفاعلي يساراً 45%)، مع تبديل ديناميكي بين **صادر (مستلم)** و**وارد (مرسل / مزدوج القيد)**.
   - **الأرشيف الموحد (`/archive`)**: بحث فوري (`Ctrl+K`) في الموضوع، الأرقام المرجعية، الجهة، الملخص، والنص الكامل (OCR) داخل ملفات الـ PDF، مع درج جانبي (Slide-Over Drawer) وطباعة ملصق باركود.
   - **إدارة الملفات والجهات (`/taxonomy`)** و**المستخدمين والصلاحيات (`/users`)**.
2. **سكربت الترحيل التاريخي الآمن (`scripts/migrate_legacy.py`)**
   - قراءة فقط (`SELECT` فقط) من قاعدة بيانات SQL Server القديمة، فك ترميز العربية (`cp1256` / `windows-1256`) بدقة 100%، ودعم `--dry-run` واستئناف التشغيل دون تكرار.
3. **خدمة المزامنة اللحظية على ويندوز سيرفر (`server-sync/sync_worker.py`)**
   - تستمع لحظياً لـ Cloud Firestore (`syncedToLegacy == false`)، تحفظ ملف الـ PDF في مجلد `Uploads` المحلي ببادئة `{docId}_` دون استبدال أي ملف قائم، وتنفذ `INSERT` فقط في SQL Server، مرفقة بسكربت تثبيت كخدمة ويندوز عبر **NSSM** (`server-sync/install_service.bat`).

---

## 1. تشغيل تطبيق الويب محلياً والنشر على Vercel

### التثبيت والإعداد
```bash
npm install
cp .env.example .env.local
```
قم بتعبئة المتغيرات في `.env.local`:
- مفاتيح **Firebase Client SDK** (`NEXT_PUBLIC_FIREBASE_*`)
- مفاتيح **Firebase Admin SDK** (`FIREBASE_ADMIN_*`)
- مفتاح **Gemini API** (`GEMINI_API_KEY`)

### نشر قواعد الأمان والفهارس على Firebase
```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### إنشاء أول حساب مدير نظام (`admin`)
1. أنشئ مستخدماً بالبريد وكلمة المرور في **Firebase Console → Authentication**.
2. أنشئ مستنداً في **Cloud Firestore → `users/{uid}`** بالحقول التالية:
   ```json
   {
     "uid": "<AUTH_UID>",
     "email": "admin@organization.gov.eg",
     "displayName": "مدير النظام",
     "role": "admin",
     "active": true,
     "createdAt": "<SERVER_TIMESTAMP>"
   }
   ```
3. بعد تسجيل الدخول، يمكنك إضافة بقية الموظفين وتحديد صلاحياتهم مباشرة من صفحة **المستخدمون والصلاحيات (`/users`)**.

### التشغيل والتحقق
```bash
npm run dev
npm run typecheck
npm run build
```

---

## 2. تشغيل الترحيل التاريخي الآمن (`scripts/migrate_legacy.py`)

على خادم Windows Server الذي يستضيف SQL Server وملفات الـ `.aspx`:

```powershell
cd scripts
pip install -r requirements.txt
copy .env.example .env
```
عدّل `scripts/.env` ليتطابق مع اسم الجدول والأعمدة ومسار مجلد `Uploads` لديك، ثم نفّذ اختباراً آمناً أولاً (**لا يكتب أي شيء**):

```powershell
python migrate_legacy.py --dry-run --limit 20
```
بعد التأكد من سلامة النصوص العربية ومسارات الـ PDF:
```powershell
python migrate_legacy.py
```

---

## 3. تثبيت خدمة المزامنة اللحظية 24/7 (`server-sync/`)

```powershell
cd server-sync
pip install -r requirements.txt
copy .env.example .env
```
عدّل `server-sync/.env` ثم شغّل `install_service.bat` كمسؤول (**Run as Administrator**) لتثبيت الخدمة `MostkblArchiveSync` عبر NSSM مع إعادة تشغيل تلقائي وسجلات دورية في `server-sync/logs/sync_worker.log`.

---

## ضمانات أمان البيانات (Zero-Deletion Guarantee)
- **SQL Server**: لا يحتوي أي سكربت في المشروع على أوامر `DELETE` أو `UPDATE` أو `DROP` أو `TRUNCATE`.
- **مجلد `Uploads` المحلي**: لا يتم استبدال أو حذف أي ملف؛ تُحفظ الملفات الجديدة دائماً باسم `{docId}_{filename}`.
- **Firebase Storage & Firestore**: قواعد الأمان تمنع حذف المستندات المؤرشفة أو ملفات الـ PDF من واجهة العميل (`allow delete: if false;`).

