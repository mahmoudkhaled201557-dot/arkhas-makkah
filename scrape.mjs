// =====================================================
// أرخص عروض مكة — أداة سحب العروض
// بتشتغل على سيرفرات GitHub Actions (مجاناً) يوم الأربع والسبت،
// بتفتح ClicFlyer في متصفح حقيقي (Playwright)، تسحب عروض مكة والمجلات،
// تترجمها وتصنفها بالذكاء الاصطناعي (Google Gemini — الخطة المجانية)، وتحفظها في Supabase.
// =====================================================
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || ""; // فاضي = يختار أحدث موديل Flash مجاني تلقائي
const CITY_PATH = "https://clicflyer.com/shoppers/en/oman/mecca"; // مسار مكة في ClicFlyer

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY ناقصين");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// الهايبرات اللي عليها عروض بسعرها مكتوب
const PRICED = { 2: "P", 5: "O", 8: "L", 12: "D", 9: "B", 1258: "A", 1254: "M", 7: "R", 2431: "W", 1102: "PR", 1633: "NO" };
// صفحات المحلات (للمجلات)
const RETAILER_PAGES = {
  P: "hyper-panda-2", O: "abdullah-al-othaim-markets-5", L: "lulu-hypermarkets-8", D: "danube-12",
  B: "bindawood-9", A: "abraj-hypermarket-1258", M: "matajer-alsaudia-1254", R: "alraya-7",
  W: "hyper-al-wafa-2431", PR: "prime-markets-1102", NO: "noori-super-market-1633", X: "extra-21",
  S: "saco-14", DK: "dukan-1026",
};
// أسماء المحلات كما تظهر في أول اسم العرض في ClicFlyer → كود المحل
const PREFIX = [["Abraj hypermarket","A"],["HYPER AL WAFA","W"],["Hyper Al Wafa","W"],["Panda","P"],["Nahdi Pharmacy","N"],["Matajer Al saudia","M"],["Matajer Alsaudia","M"],["Noori Super Market","NO"],["Noori Super","NO"],["eXtra Store","X"],["eXtra","X"],["Prime Supermarket","PR"],["Saco","S"],["Lulu","L"],["Othaim","O"],["Danube","D"],["Alraya","R"],["Bindawood","B"],["Jarir Bookstore","J"],["Dukan","DK"],["Al Dawaa","AD"],["Whites Pharmacy","WH"],["Ghaya pharmacies","G"],["homebox","HB"],["Almanea","AM"],["Tamkeen International","T"],["Yeleqstore","Y"]];
// الأقسام الفرعية اللي بنسحبها (بنستبعد الملابس والأثاث)
const WANTED_SUBS = new Set([...range(1,27), ...range(32,40), ...range(42,47), ...range(51,68), 71, 72, 74, 75]);
function range(a,b){ return Array.from({length:b-a+1},(_,i)=>a+i); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11,19), ...a);

async function main() {
  const { data: run } = await sb.from("runs").insert({}).select().single();
  const runId = run?.id ?? Date.now();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: "en-US", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36" });
  const page = await ctx.newPage();
  try {
    await page.goto(`${CITY_PATH}/retailers/${RETAILER_PAGES.O}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(3000);

    // 1) العروض بسعرها
    log("سحب العروض بسعرها…");
    const priced = await page.evaluate(async (PRICED) => {
      const out = [];
      for (const [rid, code] of Object.entries(PRICED)) {
        try {
          const t = await fetch(`${location.pathname.split("/retailers/")[0]}/Retailers/GetFlyerOffersNew?pageno=1&retailerid=${rid}&sorting=1`, { method: "POST" }).then(r => r.text());
          for (const b of t.split('<li class="item').slice(1)) {
            const n = (b.match(/<h4 title="([^"]*)"/) || [])[1];
            const img = (b.match(/src="(https:\/\/cdn[^"]+)"/) || [])[1];
            const old = (b.match(/grey-cross-text">\s*SAR\s*([\d.,]+)/) || [])[1];
            const nw = (b.match(/real-price">\s*SAR\s*([\d.,]+)/) || [])[1];
            if (n && nw) out.push({ code, name: n.replace(/\s+/g, " ").trim(), old: old ? +old.replace(/,/g, "") : null, price: +nw.replace(/,/g, ""), img });
          }
        } catch (e) {}
      }
      return out;
    }, PRICED);
    log("بسعرها:", priced.length);

    // 2) كل العروض حسب الأقسام (السعر في الصورة)
    log("سحب العروض حسب الأقسام…");
    const subs = await page.evaluate(() => {
      const set = new Map();
      for (const m of document.documentElement.innerHTML.matchAll(/category\/[a-z0-9\-]+-(\d+)\?subcategoryid=(\d+)/g)) set.set(m[2], m[1]);
      return [...set.entries()];
    });
    const imageOffers = await page.evaluate(async ({ subs, wanted }) => {
      const out = [];
      const base = location.pathname.split("/retailers/")[0];
      for (const [sub, cat] of subs) {
        if (!wanted.includes(+sub)) continue;
        try {
          const t = await fetch(`${base}/AllOffers/GetFlyerOffersSort?CategoryId=${cat}&subcategoryid=${sub}`, { method: "POST" }).then(r => r.text());
          for (const b of t.split('<li class="item').slice(1)) {
            const n = (b.match(/<h4 title="([^"]*)"/) || [])[1];
            const img = (b.match(/src="(https:\/\/cdn[^"]+)"/) || [])[1];
            if (n && img) out.push({ sub: +sub, name: n.replace(/\s+/g, " ").trim(), img });
          }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 300));
      }
      return out;
    }, { subs, wanted: [...WANTED_SUBS] });
    log("حسب الأقسام:", imageOffers.length);

    // 3) المجلات
    log("سحب المجلات…");
    const flyers = [];
    for (const [code, slug] of Object.entries(RETAILER_PAGES)) {
      try {
        await page.goto(`${CITY_PATH}/retailers/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForSelector("ul.singleflyerpage li", { timeout: 15000 }).catch(() => {});
        await sleep(1500);
        const list = await page.evaluate(() => [...document.querySelectorAll("ul.singleflyerpage li")].map(li => {
          const a = li.querySelector('a[href*="/flyers/"]'); if (!a) return null;
          const txt = li.innerText.replace(/\s+/g, " ").trim();
          const till = (txt.match(/Valid Till ([A-Za-z]{3} \d{1,2}, \d{4})/) || [])[1];
          const img = [...li.querySelectorAll("img")].map(i => i.src).find(s => s.includes("flyerpages")) || "";
          const title = txt.replace(/NEW|[\d.]+[KM]?\+? \+? ?Views|Valid Till.*$/g, "").replace(/\s+/g, " ").trim();
          return { slug: a.href.split("/flyers/")[1], title, till, img };
        }).filter(Boolean));
        for (const f of list) flyers.push({ store: code, ...f });
      } catch (e) { log("مجلات", code, "فشل:", e.message); }
    }
    log("مجلات:", flyers.length);

    // ===== تجهيز البيانات =====
    const storeOf = n => { for (const [p, c] of PREFIX) if (n.toLowerCase().startsWith(p.toLowerCase() + " ")) return [c, n.slice(p.length)]; return [null, n]; };
    const clean = s => s.replace(/\bOffers$/i, "").replace(/\bothers\b/i, "").replace(/\bNULL\b/, "").replace(/\s+/g, " ").trim();
    const decode = s => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&#xA0;/g, " ").replace(/&quot;/g, '"');

    const pricedRows = priced.map(p => {
      const [, rest] = storeOf(decode(p.name));
      return { store: p.code, kind: "priced", name_en: clean(rest), old_price: p.old, price: p.price, img: p.img };
    });
    const seenImg = new Set(pricedRows.map(r => r.img));
    const imageRows = [];
    for (const o of imageOffers) {
      if (seenImg.has(o.img)) continue; seenImg.add(o.img);
      const [code, rest] = storeOf(decode(o.name));
      if (!code) continue;
      imageRows.push({ store: code, kind: "image", name_en: clean(rest), sub: o.sub, img: o.img });
    }
    const uniqFly = new Map();
    for (const f of flyers) {
      if (!f.till) continue;
      const d = new Date(f.till + " 12:00 UTC");
      if (d < new Date(Date.now() - 864e5)) continue;
      uniqFly.set(f.slug, { store: f.store, slug: f.slug, title_en: f.title, valid_till: d.toISOString().slice(0, 10), cover: f.img });
    }
    const flyerRows = [...uniqFly.values()];

    // ===== الترجمة والتصنيف بالذكاء الاصطناعي =====
    if (GEMINI_API_KEY) {
      log("ترجمة وتصنيف بالذكاء الاصطناعي…");
      for (const step of [() => aiEnrich(pricedRows, true), () => aiEnrich(imageRows, false), () => aiFlyerTitles(flyerRows)]) {
        try { await step(); } catch (e) { log("الترجمة وقفت:", e.message); }
      }
    } else {
      log("مفيش GEMINI_API_KEY — الأسماء هتفضل إنجليزي");
    }

    if (pricedRows.length + imageRows.length < 50) throw new Error(`عدد العروض قليل جداً (${pricedRows.length + imageRows.length}) — غالباً ClicFlyer غيّر شكل الموقع. مش هنمسح البيانات القديمة.`);

    // ===== الحفظ =====
    log("حفظ في قاعدة البيانات…");
    const all = [...pricedRows, ...imageRows].map(r => ({ ...r, run_id: runId }));
    for (let i = 0; i < all.length; i += 500) {
      const { error } = await sb.from("offers").insert(all.slice(i, i + 500));
      if (error) throw error;
    }
    await sb.from("offers").delete().neq("run_id", runId);
    if (flyerRows.length) {
      const { error } = await sb.from("flyers").insert(flyerRows.map(r => ({ ...r, run_id: runId })));
      if (error) throw error;
      await sb.from("flyers").delete().neq("run_id", runId);
    }
    await sb.from("runs").update({ finished_at: new Date().toISOString(), offers: all.length, flyers: flyerRows.length, ok: true }).eq("id", runId);
    log(`تم ✓  عروض: ${all.length}  مجلات: ${flyerRows.length}`);
  } catch (e) {
    console.error(e);
    await sb.from("runs").update({ finished_at: new Date().toISOString(), ok: false, note: String(e.message || e).slice(0, 500) }).eq("id", runId);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

// ---------- الذكاء الاصطناعي ----------
const CATS = ["فواكه وخضار","لحوم","دواجن","أسماك","ألبان وبيض","مخبوزات","مجمدات","بقالة","معلبات","سناكس وحلويات","مشروبات","منظفات ومناديل","أطفال","عناية شخصية","أجهزة","أدوات منزلية"];
const GEM = "https://generativelanguage.googleapis.com/v1beta";
let MODELS = null;
// بنسأل Google عن الموديلات المتاحة ونختار موديلات Flash (أسماء الموديلات بتتغير كل فترة)
async function pickModels() {
  if (MODELS) return MODELS;
  if (GEMINI_MODEL) return (MODELS = [GEMINI_MODEL]);
  try {
    const j = await fetch(`${GEM}/models?pageSize=200`, { headers: { "x-goog-api-key": GEMINI_API_KEY }, signal: AbortSignal.timeout(30000) }).then(r => r.json());
    const ver = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
    MODELS = (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace("models/", ""))
      .filter(n => /^gemini-.*flash/.test(n) && !/image|tts|audio|live|embedding|preview|exp|omni/.test(n))
      .sort((x, y) => ver(y) - ver(x) || x.length - y.length);
  } catch (e) { MODELS = []; }
  if (!MODELS.length) MODELS = ["gemini-flash-latest"];
  log("موديلات Gemini:", MODELS.slice(0, 4).join(", "));
  return MODELS;
}
const AI_DEADLINE = Date.now() + 25 * 60 * 1000; // بعد 25 دقيقة نوقف الترجمة ونحفظ اللي خلص
async function claude(prompt, maxTokens = 8000) {
  const models = (await pickModels()).slice(0, 4);
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const model of models) {
      if (Date.now() > AI_DEADLINE) return "";
      try {
        const r = await fetch(`${GEM}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": GEMINI_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2, responseMimeType: "application/json" } }),
          signal: AbortSignal.timeout(120000), // أقصى انتظار دقيقتين للطلب الواحد
        });
        if (r.ok) { const j = await r.json(); await sleep(7000); return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join(""); }
        log("Gemini", model, r.status, (await r.text().catch(() => "")).slice(0, 200));
      } catch (e) {
        log("Gemini", model, "خطأ شبكة/مهلة:", e.name || e.message);
      }
    }
    await sleep(30000 * (attempt + 1)); // الخطة المجانية ليها حد في الدقيقة
  }
  return "";
}
function parseJsonArray(t) { const s = t.indexOf("["), e = t.lastIndexOf("]"); try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; } }

async function aiEnrich(rows, detailed) {
  const B = 40;
  for (let i = 0; i < rows.length; i += B) {
    const chunk = rows.slice(i, i + B);
    const list = chunk.map((r, k) => `${k}|${r.name_en}`).join("\n");
    const prompt = `دي أسماء عروض سوبر ماركت في السعودية بالإنجليزي (رقم|الاسم). لكل واحد رجّع:
- ar: اسم عربي واضح وقصير زي ما الناس في السعودية بتقوله (مثلاً "Sadia Whole Chicken-Frozen" → "دجاج ساديا كامل مجمد"). سيب اسم الماركة.
- g: مجموعة الصنف بكلمة أو اتنين للبحث (أمثلة: رز، زيت، زيت زيتون، دجاج، دجاج مصنع، لحم مفروم، لحم بقري، لحم غنم، حاشي، كبدة، سمك، روبيان، بيض، حليب، حليب بودرة، لبنة، زبادي، جبن، زبدة، طماطم، بصل، بطاطس، موز، تفاح، برتقال، تمر، تونة، مكرونة، شاي، قهوة، مياه، عصير، منظفات، مناديل، حفاضات، كاتل، غسالة، ثلاجة ...).
- c: القسم، واحد بس من: ${CATS.join("، ")}.
رجّع JSON array بس بالشكل: [{"i":0,"ar":"...","g":"...","c":"..."}] من غير أي كلام تاني.

${list}`;
    const arr = parseJsonArray(await claude(prompt, 16000));
    if (!arr) { log("ترجمة دفعة فشلت", i); continue; }
    for (const x of arr) { const r = chunk[x.i]; if (!r) continue; r.name_ar = x.ar; r.grp = x.g; r.category = x.c; }
    log(`ترجمة ${Math.min(i + B, rows.length)}/${rows.length}`);
  }
}
async function aiFlyerTitles(rows) {
  if (!rows.length) return;
  const list = rows.map((r, k) => `${k}|${r.title_en}`).join("\n");
  const arr = parseJsonArray(await claude(`ترجم عناوين مجلات العروض دي لعناوين عربية قصيرة (من غير اسم المحل). رجّع JSON array بس: [{"i":0,"ar":"..."}]\n\n${list}`, 4000));
  if (arr) for (const x of arr) if (rows[x.i]) rows[x.i].title_ar = x.ar;
}

main();
