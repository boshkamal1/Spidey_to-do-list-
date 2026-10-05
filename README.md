# Spider Tasks — نسخة الويب والتثبيت على iPhone

هذه الحزمة تحول قائمة المهام إلى PWA: تفتح من رابط HTTPS، يمكن إضافتها إلى الشاشة الرئيسية على iPhone، وتحفظ المهام محليًا عند انقطاع الإنترنت. مزامنة الأجهزة تعمل بعد إعداد Firebase مرة واحدة وتسجيل الدخول بنفس الحساب على الجهازين.

## إعداد Firebase

1. افتح [Firebase Console](https://console.firebase.google.com/) وأنشئ مشروعًا.
2. من صفحة المشروع أضف تطبيق Web (أيقونة `</>`)، ثم انسخ كائن إعدادات Firebase الذي يعرضه لك.
3. افتح `firebase-config.js` واستبدل `null` بكائن الإعدادات. مثال للشكل فقط — استخدم القيم التي يعطيها مشروعك:

   ```js
   window.SPIDER_FIREBASE_CONFIG = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     appId: "...",
     messagingSenderId: "..."
   };
   ```

4. من **Authentication → Sign-in method** فعّل **Email/Password**.
5. من **Firestore Database** أنشئ قاعدة بيانات.
6. افتح تبويب **Rules** والصق محتوى `firestore.rules` ثم اضغط **Publish**. القواعد تسمح للمستخدم المسجّل فقط بقراءة وكتابة بيانات UID الخاص بحسابه.
7. في إعدادات Authentication، أضف نطاق الاستضافة إلى **Authorized domains** إذا ظهر خطأ `unauthorized-domain`.

إعداد الويب الذي يقدمه Firebase مخصص للعميل؛ قواعد Firestore هي التي تحمي البيانات. لا تفتح القراءة والكتابة للعامة، واترك ملف القواعد كما هو.

## رفع التطبيق على Firebase Hosting

يتطلب هذا المسار تثبيت Node.js وFirebase CLI على الكمبيوتر. من PowerShell افتح مجلد `Spider Tasks PWA` ثم نفّذ:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only hosting
```

عند `firebase use --add` اختر المشروع الذي أنشأته. إعداد `firebase.json` موجود بالفعل، ويضبط هذا المجلد كمجلد الملفات الثابتة. بعد النشر سيظهر رابط مثل `https://PROJECT_ID.web.app`.

## تشغيله على الأجهزة

1. على الكمبيوتر افتح رابط `web.app`، وسجّل الدخول أو أنشئ حسابًا بالبريد وكلمة المرور.
2. افتح ملف `Spider Tasks.html` الأصلي من المتصفح الذي يحتوي على مهامك. من **Backup & restore → Export backup** نزّل ملف JSON.
3. ارجع إلى رابط `web.app` على الكمبيوتر، واختر **Import backup**، وحدد ملف JSON. عندها تُرفع المهام للحساب.
4. على iPhone افتح الرابط نفسه في Safari، واضغط **Share → Add to Home Screen**، واختر **Open as Web App** إن ظهر الخيار، ثم **Add**.
5. افتح التطبيق من الشاشة الرئيسية وسجّل الدخول بنفس الحساب. سيجلب مهامك من Firebase.

يمكن أيضًا استيراد ملف النسخة الاحتياطية من iPhone إذا نقلته إليه عبر Files أو iCloud Drive. لا تحذف النسخة الاحتياطية بعد الاستيراد حتى تتأكد من ظهور المهام على الجهازين.

## ملاحظات

- التصفح والمهام المحفوظة محليًا يظلان متاحين دون اتصال؛ المزامنة السحابية تحتاج اتصالًا بالإنترنت.
- التغييرات المتزامنة على الجهازين تُحفظ على مستوى نسخة القائمة كاملة؛ عند تعديل القائمة نفسها على الجهازين في اللحظة ذاتها، تكون النسخة ذات آخر وقت حفظ هي المعتمدة. احتفظ بنسخة JSON دورية.
- يحتاج التطبيق إلى HTTPS كي يعمل Service Worker وتثبيت PWA. Firebase Hosting يوفّر HTTPS تلقائيًا.
- Firebase SDK يُحمّل من CDN الرسمي، لذلك يحتاج اتصال إنترنت لتسجيل الدخول أو المزامنة.
