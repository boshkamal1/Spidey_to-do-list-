# Spider Tasks — نسخة الويب والتثبيت على iPhone

هذه الحزمة تحول قائمة المهام إلى PWA: تفتح من رابط HTTPS، يمكن إضافتها إلى الشاشة الرئيسية على iPhone، وتحفظ المهام محليًا عند انقطاع الإنترنت. مزامنة الأجهزة تعمل بعد إعداد Firebase مرة واحدة وتسجيل الدخول بنفس الحساب على الجهازين.

## إعداد Firebase

1. افتح [Firebase Console](https://console.firebase.google.com/). المشروع الحالي `spidy-list` وإعداداته موجودة بالفعل في `firebase-config.js`.
2. عند ربط نسخة بمشروع Firebase مختلف، أضف تطبيق Web (أيقونة `</>`)، ثم حدّث إعدادات Firebase في `firebase-config.js` بالقيم التي يعرضها لك. لا تغيّر إعداد Web Push إلا إذا أعددت عامل Cloudflare ومفاتيحه للمشروع الجديد أيضًا:

   ```js
   const spiderFirebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     appId: "...",
     messagingSenderId: "..."
   };
   window.SPIDER_FIREBASE_CONFIG = spiderFirebaseConfig;
   ```

3. من **Authentication → Sign-in method** فعّل **Email/Password**.
4. من **Firestore Database** أنشئ قاعدة بيانات.
5. افتح تبويب **Rules** والصق محتوى `firestore.rules` ثم اضغط **Publish**. القواعد تسمح للمستخدم المسجّل بقراءة وكتابة بيانات حسابه، وتسمح بقراءة مستند Widget واحد فقط عند معرفة رمزه العشوائي.
6. في إعدادات Authentication، أضف نطاق الاستضافة إلى **Authorized domains** إذا ظهر خطأ `unauthorized-domain`.

إعداد الويب الذي يقدمه Firebase مخصص للعميل؛ قواعد Firestore هي التي تحمي البيانات. اترك قواعد القائمة خاصة بالحساب. رمز الودجت يتيح قراءة مهام اليوم وتغيير علامة الإنجاز لمهمة اليوم المعروفة فقط؛ لا يتيح تعديل عنوان المهمة أو حذفها أو استعراض بقية المستندات.

## رفع التطبيق على Firebase Hosting

هذا المشروع مضبوط على Firebase project `spidy-list`. يتطلب النشر تثبيت Node.js وFirebase CLI. من PowerShell افتح مجلد `Spider Tasks PWA` ثم نفّذ:

```powershell
npm install -g firebase-tools
firebase login
firebase.cmd deploy --only hosting
```

يستخدم `.firebaserc` المشروع `spidy-list`، ويستخدم `firebase.json` موقع Hosting المحدد لهذا المشروع ويرفع ملفات تشغيل الموقع فقط. لو اخترت مشروع Firebase مختلفًا، حدّث `.firebaserc` و`firebase.json` و`firebase-config.js` معًا. على PowerShell استخدم `firebase.cmd` لتجنب منع تشغيل سكربت `firebase.ps1`.

## تشغيله على الأجهزة

1. على الكمبيوتر افتح رابط `web.app`، وسجّل الدخول أو أنشئ حسابًا بالبريد وكلمة المرور.
2. من التطبيق القديم الذي يحتوي على مهامك، افتح **Backup & restore → Export backup** ونزّل ملف JSON. إذا كانت المهام موجودة بالفعل في هذا المشروع، تخطّ هذه الخطوة.
3. ارجع إلى رابط `web.app` على الكمبيوتر، واختر **Import backup**، وحدد ملف JSON. عندها تُرفع المهام للحساب.
4. على iPhone افتح الرابط نفسه في Safari، واضغط **Share → Add to Home Screen**، واختر **Open as Web App** إن ظهر الخيار، ثم **Add**.
5. افتح التطبيق من الشاشة الرئيسية وسجّل الدخول بنفس الحساب. سيجلب مهامك من Firebase.

يمكن أيضًا استيراد ملف النسخة الاحتياطية من iPhone إذا نقلته إليه عبر Files أو iCloud Drive. لا تحذف النسخة الاحتياطية بعد الاستيراد حتى تتأكد من ظهور المهام على الجهازين.

## ملاحظات

- التصفح والمهام المحفوظة محليًا يظلان متاحين دون اتصال؛ المزامنة السحابية تحتاج اتصالًا بالإنترنت.
- بعد إتمام المهمة يظهر تقييم ذاتي من 0 إلى 10، ويمكن حفظ تقييم يومي مستقل لكل يوم. تحفظ التقييمات مع القائمة وتزامن بين الأجهزة.
- الثيمات المتاحة هي Miles وComic وClassic Red & Blue وMinimal Dark. أُزيل Neon وSpider-Verse، وأُزيل الـWeekly recap.
- التغييرات المتزامنة على الجهازين تُحفظ على مستوى نسخة القائمة كاملة؛ عند تعديل القائمة نفسها على الجهازين في اللحظة ذاتها، تكون النسخة ذات آخر وقت حفظ هي المعتمدة. احتفظ بنسخة JSON دورية.
- يحتاج التطبيق إلى HTTPS كي يعمل Service Worker وتثبيت PWA. Firebase Hosting يوفّر HTTPS تلقائيًا.
- Firebase SDK يُحمّل من CDN الرسمي، لذلك يحتاج اتصال إنترنت لتسجيل الدخول أو المزامنة.

## نسخة iPhone مع Widgets

مجلد ios يحتوي تطبيق iPhone صغيرًا يفتح نفس قائمة الويب، ومعه Widget للشاشة الرئيسية وWidget لشاشة القفل. الرمز السري يتيح رؤية مهام اليوم وتغيير علامة الإنجاز لمهمة ظاهرة فقط؛ لا يسمح بتغيير عنوان المهمة أو حذفها أو تصفح بقية قاعدة البيانات. عند فتح الموقع، يلتقط التغييرات من الـWidget ويزامنها مع حسابك.

### نشر تحديثات Firebase

بعد حفظ الملفات الجديدة، افتح PowerShell داخل مجلد المشروع وانشر نسخة الموقع وقواعد Firestore المحدّثة:

    firebase deploy --only firestore:rules,hosting

قواعد widgetFeeds تسمح بقراءة مستند واحد عند معرفة رمزه، وتمنع البحث عن بقية الرموز. الكتابة بدون تسجيل دخول مقصورة على مستند صغير لكل مهمة ظاهرة، ويحتوي علامة الإنجاز فقط؛ لا يمكن تغيير اسم المهمة أو حذفها من الودجت. بقية تغييرات بياناتك تتطلب تسجيل الدخول.

### إشعارات المهام والويب آب مغلق — إعداد مجاني

تستخدم الإشعارات Web Push مباشرة، ويشغّل Cloudflare Worker المجاني فحصًا كل دقيقة. لا نستخدم Firebase Cloud Messaging أو Cloud Functions أو خطة Blaze أو وسيلة دفع. العامل يحتفظ باشتراك الإشعارات وجدول التذكيرات القادم في Cloudflare KV. الجدول يتضمن عنوان المهمة ووقت التنبيه والعبارة المختارة، ويغطي 30 يومًا؛ ولا يقرأ العامل قاعدة مهام Firebase أو رمز الودجت. مفتاح Web Push الخاص يبقى في Cloudflare Secret، ولا يدخل GitHub أو التطبيق.

**مهم للخصوصية:** لا تفعّل الخدمة قبل الموافقة على إرسال عناوين مهامك المجدولة وأوقات التنبيه واشتراك إشعارات جهازك إلى Cloudflare لتوصيلها. العامل يستطيع قراءة جدول التذكيرات المخزن لديه. محتوى الإشعار نفسه يُشفّر وفق Web Push قبل إرساله إلى خدمة Apple أو خدمة المتصفح.

لإعدادها بعد الموافقة:

1. تحتاج Node.js المثبت على Windows. من PowerShell داخل مجلد `cloudflare` أنشئ زوج مفاتيح Web Push:

   ```powershell
   node.exe .\generate-vapid-keys.mjs
   ```

   سيظهر المفتاح العام فقط. المفتاح الخاص يُحفظ محليًا في `vapid-private.jwk` ويتجاهله Git.

2. إعداد `cloudflare/wrangler.toml` الحالي مربوط بـKV namespace للمشروع. لو ستستخدم حسابًا أو نسخة Cloudflare أخرى، أنشئ namespace باسم `PUSH_DATA` من **Workers & Pages → Storage & Databases → KV** ثم استبدل قيمة `id` بالمعرّف الجديد.
3. افتح PowerShell في مجلد `cloudflare`، سجّل Wrangler في حساب Cloudflare ثم انشر العامل أول مرة:

   ```powershell
   npx.cmd --yes wrangler login
   npx.cmd wrangler deploy
   ```

4. خزّن المفتاح الخاص كـCloudflare Secret من دون عرضه في سطر الأوامر:

   ```powershell
   Get-Content .\vapid-private.jwk -Raw | npx.cmd wrangler secret put VAPID_PRIVATE_JWK
   ```

   يحفظ Wrangler السر ويعيد نشر العامل. بعد نجاح ذلك احذف الملف المحلي `vapid-private.jwk`. سيظهر رابط ينتهي بـ`.workers.dev`.

5. ضع المفتاح العام الذي ظهر في `webPushPublicKey` ورابط `.workers.dev` في `pushWorkerUrl` داخل `firebase-config.js`.
6. انشر الموقع من مجلد المشروع:

   ```powershell
   firebase.cmd deploy --only hosting
   ```

7. افتح Spider Tasks من أيقونة الشاشة الرئيسية في iPhone، سجّل الدخول، وافتح إعدادات التذكير ثم اضغط **Enable alerts** واسمح بالإشعارات. يتحدث الجدول عند حفظ تغييرات المهام؛ والفحص كل دقيقة، لذلك قد يصل التنبيه بعد موعده بدقيقة تقريبًا.

يستخدم الحساب المجاني حدود Cloudflare المتاحة؛ إذا انتهت حصة مجانية قد تتوقف الطلبات حتى تتجدد، ولا ينبغي اختيار خطة مدفوعة. عند إيقاف التنبيهات يحذف التطبيق جدول التذكيرات من العامل.

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
