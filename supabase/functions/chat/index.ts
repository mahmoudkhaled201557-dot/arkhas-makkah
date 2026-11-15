// =====================================================
// أرخص عروض مكة — المساعد الذكي (Supabase Edge Function)
// بيستقبل رسايل المستخدم، يجيب عروض الأسبوع من قاعدة البيانات،
// ويسأل Google Gemini (الخطة المجانية)، ويرجّع الرد كـ stream.
// مفتاح Gemini محفوظ في أسرار Supabase ومحدش يشوفه من الموقع.
// =====================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STORES: Record<string, string> = { P:"بنده",O:"العثيم",L:"لولو",D:"الدانوب",B:"بن داود",A:"أبراج",M:"متاجر السعودية",R:"الراية",W:"هايبر الوفاء",N:"صيدلية النهدي",NO:"نوري ماركت",X:"إكسترا",PR:"برايم ماركت",S:"ساكو",J:"جرير",DK:"دكان",AD:"صيدلية الدواء",WH:"صيدلية وايتس",G:"صيدلية غاية",HB:"هوم بوكس",AM:"المنيع",T:"تمكين",Y:"يلق ستور" };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const GEM = "https://generativelanguage.googleapis.com/v1beta";
const KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
let MODELS: string[] | null = null;
async function pickModels(): Promise<string[]> {
  if (MODELS) return MODELS;
  const fixed = Deno.env.get("GEMINI_MODEL");
  if (fixed) return (MODELS = [fixed]);
  try {
    const j = await fetch(`${GEM}/models?pageSize=200`, { headers: { "x-goog-api-key": KEY } }).then(r => r.json());
    const ver = (n: string) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) ?? ["0", "0"])[1]);
    MODELS = (j.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m: { name: string }) => m.name.replace("models/", ""))
      .filter((n: string) => /^gemini-.*flash/.test(n) && !/image|tts|audio|live|embedding|preview|exp|omni/.test(n))
      .sort((x: string, y: string) => ver(y) - ver(x) || x.length - y.length);
  } catch { MODELS = []; }
  if (!MODELS || !MODELS.length) MODELS = ["gemini-flash-latest"];
  return MODELS;
}
const DAILY_LIMIT = Number(Deno.env.get("CHAT_DAILY_LIMIT") ?? "30");
const hits = new Map<string, { day: string; n: number }>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "سجّل دخولك الأول عشان تستخدم المساعد." }, 401);

    // حد أقصى للأسئلة في اليوم لكل مستخدم (يحمي فاتورة الـ API)
    const day = new Date().toISOString().slice(0, 10);
    const h = hits.get(user.id);
    if (h && h.day === day && h.n >= DAILY_LIMIT) return json({ error: `وصلت للحد اليومي (${DAILY_LIMIT} سؤال). جرب بكرة.` }, 429);
    hits.set(user.id, { day, n: h && h.day === day ? h.n + 1 : 1 });

    const { messages } = await req.json();
    if (!Array.isArray(messages) || !messages.length) return json({ error: "رسالة فاضية" }, 400);
    const turns = messages.slice(-12).map((m: { role: string; content: string }) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 2000) }));
    if (turns[0].role !== "user") turns.shift();

    const { data: offers } = await sb.from("offers").select("store,kind,name_ar,name_en,grp,category,price,old_price").limit(3000);
    const { data: flyers } = await sb.from("flyers").select("store,title_ar,title_en,valid_till").limit(300);
    const priced = (offers ?? []).filter(o => o.kind === "priced").map(o => `${STORES[o.store] ?? o.store}|${o.name_ar ?? o.name_en}|${o.grp ?? ""}|${o.price}${o.old_price ? `|قبل ${o.old_price}` : ""}`).join("\n");
    const image = (offers ?? []).filter(o => o.kind === "image").map(o => `${STORES[o.store] ?? o.store}|${o.category ?? ""}|${o.name_ar ?? o.name_en}`).join("\n");
    const fl = (flyers ?? []).map(f => `${STORES[f.store] ?? f.store}|${f.title_ar ?? f.title_en}|لحد ${f.valid_till}`).join("\n");

    const system = `انت "مساعد عروض مكة"، مساعد تسوق في موقع بيجمع عروض الهايبرات في مكة المكرمة.
اتكلم باللهجة المصرية البسيطة، مختصر ومنظم بنقاط قصيرة، ومن غير جداول.
اعتمد فقط على العروض اللي تحت؛ متخترعش أسعار ولا أصناف ولا محلات. لو الصنف مش موجود قول إنه مفيش عرض عليه دلوقتي.
لما تقارن أسعار قول اسم المحل والسعر، ونبّه إن أحجام العبوات ممكن تختلف.
العروض اللي سعرها في الصورة: قول إنها موجودة في المحل الفلاني وإن السعر يتشاف من زرار 📷 في الموقع.
لو حد طلب قايمة مشتريات أو خطة مشوار: رتبها حسب المحل واحسب الإجمالي التقريبي.
لو السؤال ملوش علاقة بالتسوق، رد باختصار ورجّعه للعروض.

عروض بسعرها (المحل|الصنف|المجموعة|السعر|قبل الخصم):
${priced}

عروض سعرها في الصورة (المحل|القسم|الصنف):
${image}

المجلات السارية (المحل|المجلة|سارية لحد):
${fl}`;

    const contents = turns.map((t: { role: string; content: string }) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] }));
    let r: Response | null = null;
    for (const model of (await pickModels()).slice(0, 4)) {
      r = await fetch(`${GEM}/models/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
        body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 1500, temperature: 0.4 } }),
      });
      if (r.ok) break;
    }
    if (!r || !r.ok || !r.body) return json({ error: r && r.status === 429 ? "المساعد عليه ضغط دلوقتي (الحد المجاني)، جرب بعد دقيقة." : "المساعد مش متاح دلوقتي، جرب كمان شوية." }, 502);

    // تحويل stream بتاع Gemini لنص عادي بيوصل للموقع حتة حتة
    const reader = r.body.getReader(); const dec = new TextDecoder(); const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(ctrl) {
        let buf = "";
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop() ?? "";
          for (const l of lines) {
            if (!l.startsWith("data:")) continue;
            try { const ev = JSON.parse(l.slice(5)); const tx = (ev.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join(""); if (tx) ctrl.enqueue(enc.encode(tx)); } catch { /* ignore */ }
          }
        }
        ctrl.close();
      },
    });
    return new Response(stream, { headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return json({ error: "حصلت مشكلة: " + String((e as Error).message ?? e) }, 500);
  }
});
function json(o: unknown, status = 200) { return new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
