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
6. افتح تبويب **Rules** والصق محتوى `firestore.rules` ثم اضغط **Publish**. القواعد تسمح للمستخدم المسجّل بقراءة وكتابة بيانات حسابه، وتسمح بقراءة مستند Widget واحد فقط عند معرفة رمزه العشوائي.
7. في إعدادات Authentication، أضف نطاق الاستضافة إلى **Authorized domains** إذا ظهر خطأ `unauthorized-domain`.

إعداد الويب الذي يقدمه Firebase مخصص للعميل؛ قواعد Firestore هي التي تحمي البيانات. اترك قواعد القائمة خاصة بالحساب. رمز الودجت يتيح قراءة مهام اليوم وتغيير علامة الإنجاز لمهمة اليوم المعروفة فقط؛ لا يتيح تعديل عنوان المهمة أو حذفها أو استعراض بقية المستندات.

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

## نسخة iPhone مع Widgets

مجلد ios يحتوي تطبيق iPhone صغيرًا يفتح نفس قائمة الويب، ومعه Widget للشاشة الرئيسية وWidget لشاشة القفل. الرمز السري يتيح رؤية مهام اليوم وتغيير علامة الإنجاز لمهمة ظاهرة فقط؛ لا يسمح بتغيير عنوان المهمة أو حذفها أو تصفح بقية قاعدة البيانات. عند فتح الموقع، يلتقط التغييرات من الـWidget ويزامنها مع حسابك.

### نشر تحديثات Firebase

بعد حفظ الملفات الجديدة، افتح PowerShell داخل مجلد المشروع وانشر نسخة الموقع وقواعد Firestore المحدّثة:

    firebase deploy --only firestore:rules,hosting

قواعد widgetFeeds تسمح بقراءة مستند واحد عند معرفة رمزه، وتمنع البحث عن بقية الرموز. الكتابة بدون تسجيل دخول مقصورة على مستند صغير لكل مهمة ظاهرة، ويحتوي علامة الإنجاز فقط؛ لا يمكن تغيير اسم المهمة أو حذفها من الودجت. بقية تغييرات بياناتك تتطلب تسجيل الدخول.

### بناء ملف iPhone من GitHub

من مجلد المشروع نفّذ:

    git add .gitignore .github ios index.html firestore.rules README.md
    git commit -m "Add iPhone app and widgets"
    git push

ثم افتح مستودع spidy-list-ios على GitHub:

1. اختر Actions ثم Build iPhone app.
2. اضغط Run workflow وانتظر اكتمال البناء.
3. من صفحة التشغيل نزّل Artifact باسم spider-tasks-ios. بداخله SpiderTasks-unsigned.ipa.

البناء يعمل على macOS مستضاف من GitHub، ولا يحتاج Mac عندك. في المستودع الخاص تُحسب دقائق macOS من حصة GitHub Actions المجانية، لذا شغّل البناء عند الحاجة فقط.

لمنع أي رسوم بعد انتهاء الحصة المجانية، افتح GitHub **Settings → Billing and licensing → Budgets and alerts**، وأنشئ ميزانية Actions بقيمة 0 دولار مع تفعيل **Stop usage when budget limit is reached**. سيظل البناء يعمل ضمن الاستخدام المجاني المتاح، ويتوقف بدل بدء رسوم إضافية إذا انتهت الحصة.

### توقيع وتثبيت الـIPA على iPhone

ملف الـIPA الخارج من GitHub غير موقّع. استخدم AltStore Classic وAltServer على Windows لتوقيعه وتثبيته بحساب Apple المجاني. اتبع [دليل AltStore الرسمي لـWindows](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows) لتثبيت AltServer، ثم استخدم خيار Sideload .ipa واختر الملف الذي نزلته. بعد التثبيت قد يطلب iPhone تفعيل Developer Mode والثقة بحساب Apple.

حساب Apple المجاني يجعل التثبيت صالحًا 7 أيام، وبعدها يلزم تحديث التوقيع من AltServer؛ أبقِ AltServer على الكمبيوتر، ووصل iPhone به عبر USB أو نفس شبكة Wi-Fi حتى يتمكن AltStore من تحديثه.

### إضافة الـWidgets

1. افتح Spider Tasks على iPhone وسجّل الدخول بنفس حساب Firebase المستخدم على الكمبيوتر.
2. في لوحة مزامنة الحساب انسخ Secret widget code.
3. أضف Widget باسم Spider Tasks Today إلى الشاشة الرئيسية أو شاشة القفل.
4. اضغط مطولًا على الـWidget، افتح Edit Widget، والصق الرمز.

يعرض Widget الشاشة الرئيسية قائمة مختصرة بمهام اليوم وأوقاتها. تعرض Widgets شاشة القفل عدد المهام وأقرب مهمة. iOS يحدد بنفسه توقيت تحديث الـWidget، لذلك قد يتأخر ظهوره قليلًا بعد تعديل المهام، ويجلب التطبيق مهام اليوم عند فتحه.
