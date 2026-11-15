# أرخص عروض مكة — دليل التشغيل على السيرفر

المشروع ده بيشتغل لوحده من غير لاب توب ومن غير سيرفر تدفع فيه إيجار:

| الجزء | فين بيشتغل | التكلفة |
|---|---|---|
| قاعدة البيانات + الحسابات + المساعد | **Supabase** | مجاني (الخطة المجانية) |
| سحب العروض كل أربع وسبت | **GitHub Actions** | مجاني |
| الموقع نفسه | **GitHub Pages** | مجاني |
| الترجمة والمساعد الذكي | **Google Gemini API** | مجاني (الخطة المجانية، بحد يومي) |

```
scraper/        أداة السحب (Playwright) + الترجمة بالذكاء الاصطناعي
.github/        جدول التشغيل التلقائي (الأربع والسبت 8:47 م بتوقيت السعودية)
supabase/       قاعدة البيانات (schema.sql) + دالة المساعد (functions/chat)
docs/           الموقع (index.html + app.js + config.js)
```

---

## الخطوات (مرة واحدة بس، حوالي 30 دقيقة)

### 1) Supabase — قاعدة البيانات
1. ادخل https://supabase.com واعمل حساب (Sign up بحساب GitHub أسهل).
2. **New project** → اسم: `arkhas` → اختار باسوورد لقاعدة البيانات واحفظه → Region: **Frankfurt** (أو أقرب حاجة) → Create.
3. من القايمة الشمال: **SQL Editor** → New query → الصق محتوى `supabase/schema.sql` كله → **Run**.
4. من **Project Settings → API** انسخ 3 حاجات في نوتة:
   - `Project URL`
   - `anon public` key
   - `service_role` key ⚠️ (سري — متحطوش في الموقع ولا تبعته لحد)

### 2) Google Gemini — مفتاح الذكاء الاصطناعي (مجاني)
1. ادخل https://aistudio.google.com/apikey بحساب Google بتاعك.
2. **Create API key** → انسخه. (من غير كارت بنكي.)

### 3) GitHub — رفع المشروع
1. ادخل https://github.com واعمل حساب.
2. **New repository** → اسم: `arkhas-makkah` → Public → Create.
3. في صفحة الـ repo دوس **uploading an existing file** → اسحب كل محتويات الفولدر ده (بما فيها فولدر `.github`) → **Commit changes**.
4. **Settings → Secrets and variables → Actions → New repository secret**، وضيف 3 أسرار:
   - `SUPABASE_URL` = الـ Project URL
   - `SUPABASE_SERVICE_KEY` = الـ service_role key
   - `GEMINI_API_KEY` = مفتاح Gemini

### 4) أول تحديث للعروض
1. في الـ repo: تبويب **Actions** → لو طلب تفعيل دوس **I understand… enable**.
2. اختار **تحديث العروض** → **Run workflow**.
3. استنى 5–10 دقايق لحد ما تبقى ✓ خضرا. (لو بقت ✗ حمراء افتحها وابعتلي الرسالة.)
4. من دلوقتي هيشتغل لوحده كل **أربع وسبت 8:47 مساءً**.

### 5) الموقع
1. في الـ repo افتح `docs/config.js` → ✏️ Edit → حط `Project URL` و `anon public` key مكان القيم → Commit.
2. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` → Folder: `/docs` → Save.
3. بعد دقيقة هيظهرلك لينك الموقع، زي: `https://USERNAME.github.io/arkhas-makkah/` — ده اللينك اللي تشاركه للناس.
4. ارجع Supabase → **Authentication → URL Configuration** → حط لينك الموقع في **Site URL** وفي **Redirect URLs** → Save.

### 6) المساعد الذكي (الشات)
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor** → اسم: `chat`.
2. امسح الكود اللي فيه والصق محتوى `supabase/functions/chat/index.ts` → **Deploy**.
3. **Edge Functions → Secrets** → Add: `GEMINI_API_KEY` = مفتاح Gemini → Save.

### 7) خليك أدمن
1. افتح الموقع → تاب **حسابي** → سجّل بإيميلك ودوس على اللينك اللي هيوصلك.
2. Supabase → SQL Editor → شغّل (بإيميلك):
```sql
update public.profiles set is_admin = true
  where id = (select id from auth.users where email = 'mahmoud.khaled201557@gmail.com');
```
3. اعمل refresh للموقع — هيظهرلك تاب **📊 لوحة المالك** (المستخدمين، الطلبات، الأكثر طلباً، وحالة كل تحديث).

---

## ملاحظات
- **حدود المساعد:** كل مستخدم له 30 سؤال في اليوم (تتغير من `CHAT_DAILY_LIMIT` في أسرار الـ Edge Function) عشان الحد المجاني ميخلصش. الكود بيختار أحدث موديل Flash متاح تلقائي؛ لو عايز تثبت موديل معين ضيف سر اسمه `GEMINI_MODEL`.
- **الخطة المجانية لـ Gemini** ليها حد طلبات في الدقيقة واليوم، وGoogle ممكن تستخدم الطلبات المجانية لتحسين منتجاتها. لو المستخدمين كتروا هتحتاج تفعّل الدفع.
- **لو ClicFlyer غيّر شكل موقعه:** التحديث هيفشل والبيانات القديمة هتفضل زي ما هي (مش هتتمسح)، وهتشوف السبب في لوحة المالك.
- **مصدر البيانات:** العروض جاية من ClicFlyer. للاستخدام الشخصي والتجربة تمام؛ قبل ما تبيع اشتراكات، الأفضل تتفق مع ClicFlyer أو مع الهايبرات مباشرة.
- **Supabase المجاني** بيوقف المشروع لو مفيش أي نشاط أسبوع — التحديث مرتين في الأسبوع بيمنع ده.
