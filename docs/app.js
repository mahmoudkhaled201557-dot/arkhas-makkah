// =====================================================
// أرخص عروض مكة — منطق الموقع
// =====================================================
const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);

const STORES = {P:"بنده",O:"العثيم",L:"لولو",D:"الدانوب",B:"بن داود",A:"أبراج",M:"متاجر السعودية",R:"الراية",W:"هايبر الوفاء",N:"صيدلية النهدي",NO:"نوري ماركت",X:"إكسترا",PR:"برايم ماركت",S:"ساكو",J:"جرير",DK:"دكان",AD:"صيدلية الدواء",WH:"صيدلية وايتس",G:"صيدلية غاية",HB:"هوم بوكس",AM:"المنيع",T:"تمكين",Y:"يلق ستور"};
const STORE_ORDER = ["P","O","L","D","B","A","M","R","W","PR","NO","X","S","DK"];
const SYN = {"فراخ":"دجاج","فرخة":"دجاج","دجاجة":"دجاج","صدور":"دجاج","لحمة":"لحم","مفرومة":"لحم مفروم","بقري":"لحم بقري","عجل":"لحم بقري","ضاني":"لحم غنم","غنم":"لحم غنم","خروف":"لحم غنم","جمل":"حاشي","جمبري":"روبيان","ارز":"رز","أرز":"رز","لبن":"حليب","نيدو":"حليب بودرة","جبنة":"جبن","جبنه":"جبن","قوطة":"طماطم","بندورة":"طماطم","بطاطا":"بطاطس","مية":"مياه","ماء":"مياه","موية":"مياه","بلح":"تمر","غلاية":"كاتل","براد":"كاتل","غساله":"غسالة","ثلاجه":"ثلاجة","فاكهة":"@فواكه وخضار","فواكه":"@فواكه وخضار","خضار":"@فواكه وخضار","لحوم":"@لحوم","اسماك":"@أسماك","أسماك":"@أسماك"};

let OFFERS = [], PRICED = [], IMAGE = [], FLYERS = [], USER = null, PROFILE = null, LAST_RUN = null;

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const norm = s => String(s||"").trim().toLowerCase().replace(/[إأآ]/g,"ا").replace(/ة\b/g,"ه").replace(/ى/g,"ي").replace(/\s+/g," ");
const fmt = v => (Math.round(v*100)/100).toString();
const nameOf = o => o.name_ar || o.name_en;
const imgLink = o => o.img ? ` · <a class="pic" href="${esc(o.img)}" target="_blank" rel="noopener">📷 صورة العرض</a>` : "";
const when = t => t ? new Date(t).toLocaleString("ar-SA",{dateStyle:"medium",timeStyle:"short"}) : "";

// ===== تحميل البيانات =====
async function loadData(){
  const [{data:o,error:e1},{data:f}] = await Promise.all([
    sb.from("offers").select("*").limit(5000),
    sb.from("flyers").select("*").order("valid_till").limit(500),
  ]);
  if (e1) { $("meta").textContent = "مش قادر أحمّل العروض دلوقتي، جرب تاني."; return; }
  OFFERS = o || []; PRICED = OFFERS.filter(x=>x.kind==="priced"); IMAGE = OFFERS.filter(x=>x.kind==="image");
  const today = new Date(); today.setHours(0,0,0,0);
  FLYERS = (f||[]).filter(x => new Date(x.valid_till+"T23:59:59") >= today);
  const last = OFFERS.reduce((m,x)=> x.updated_at > m ? x.updated_at : m, "");
  $("meta").textContent = `آخر تحديث: ${last ? new Date(last).toLocaleDateString("ar-SA",{weekday:"long",day:"numeric",month:"long"}) : "—"} · ${PRICED.length} عرض بسعره + ${IMAGE.length} بالصورة · ${FLYERS.length} مجلة`;
  renderCats(); renderFlyers();
  try { const s = localStorage.getItem("needs"); if (s && !$("q").value) { $("q").value = s; run(); } } catch {}
}

// ===== البحث =====
function match(term, list){
  const t = term.trim(); if (!t) return [];
  const syn = SYN[t] || SYN[t.replace(/^ال/,"")];
  if (syn && syn.startsWith("@")) return list.filter(o => norm(o.category).includes(norm(syn.slice(1))));
  const key = norm(syn || t);
  if (key === "لحم") return list.filter(o => ["لحم مفروم","لحم بقري","لحم غنم","حاشي","لحم"].includes(o.grp));
  const exact = list.filter(o => norm(o.grp) === key);
  if (exact.length) return exact;
  const k2 = key.replace(/^ال/,"");
  return list.filter(o => [o.grp,o.name_ar,o.name_en].some(v => { const n = norm(v); return n && (n.includes(key) || n.includes(k2)); }));
}
function itemRow(o, best){
  const pct = o.old_price ? Math.round((1-o.price/o.old_price)*100) : null;
  return `<div class="it ${best?'best':''}">${o.img?`<img class="thumb" loading="lazy" src="${esc(o.img)}" alt="">`:""}<div><div class="nm">${esc(nameOf(o))}${best?'<span class="tag">الأرخص</span>':''}</div><div class="st">${STORES[o.store]||o.store}${pct?` · <span class="off">خصم ${pct}%</span>`:''}${imgLink(o)}</div></div><div class="pr"><div class="now">${fmt(o.price)} ر.س</div>${o.old_price?`<div class="old">${fmt(o.old_price)}</div>`:''}</div></div>`;
}
function xRow(o){
  return `<div class="it">${o.img?`<img class="thumb" loading="lazy" src="${esc(o.img)}" alt="">`:""}<div><div class="nm">${esc(nameOf(o))}</div><div class="st">${STORES[o.store]||o.store}${o.category?" · "+esc(o.category):""}</div></div><div class="pr"><a class="pic" href="${esc(o.img)}" target="_blank" rel="noopener">📷 السعر</a></div></div>`;
}
function groupCard(title, list){
  const by = {}; list.forEach(o => (by[o.grp||"أخرى"] = by[o.grp||"أخرى"] || []).push(o));
  let h = `<div class="need"><div class="hd"><b>${esc(title)}</b><span>${list.length} عرض بسعر</span></div>`;
  Object.entries(by).forEach(([g,arr]) => { arr.sort((a,b)=>a.price-b.price); if (Object.keys(by).length>1) h += `<div class="it" style="background:var(--bg)"><div class="st"><b>${esc(g)}</b></div></div>`; arr.forEach((o,i)=> h += itemRow(o, i===0)); });
  return h + `</div>`;
}
function xCard(title, list, limit=60){
  if (!list.length) return "";
  const s = list.slice(0, limit);
  return `<div class="need"><div class="hd"><b>${esc(title)}</b><span>${list.length} عرض · السعر في الصورة</span></div>${s.map(xRow).join("")}${list.length>s.length?`<div class="it st">و${list.length-s.length} عرض كمان…</div>`:""}</div>`;
}

// ===== خطة المشوار =====
let PLANTXT = "";
function planHTML(terms){
  const byStore = {}, picOnly = [], missing = []; let total = 0, save = 0;
  terms.forEach(t => {
    const m = match(t, PRICED).sort((a,b)=>a.price-b.price);
    if (m.length) { const b = m[0]; (byStore[b.store] = byStore[b.store] || []).push({t,o:b}); total += +b.price; if (b.old_price) save += b.old_price - b.price; return; }
    const xs = match(t, IMAGE); if (xs.length) picOnly.push({t,xs}); else missing.push(t);
  });
  const stores = Object.entries(byStore).sort((a,b)=>b[1].length-a[1].length);
  let txt = "🛒 خطة المشوار\n", h = `<h2>🚗 خطة المشوار</h2>`;
  if (stores.length) {
    h += `<div class="box">`;
    stores.forEach(([s,arr],i) => {
      const sub = arr.reduce((x,y)=>x+ +y.o.price,0);
      h += `<div class="stp"><div class="stph"><b>${i+1}. ${STORES[s]||s}</b><span>${arr.length} صنف · ${fmt(sub)} ر.س</span></div><ul>${arr.map(({t,o})=>`<li><span>${esc(nameOf(o))} <span class="st">(${esc(t)})</span>${imgLink(o)}</span><b>${fmt(o.price)}</b></li>`).join("")}</ul></div>`;
      txt += `\n📍 ${STORES[s]||s} (${fmt(sub)} ر.س)\n` + arr.map(({o})=>`- ${nameOf(o)}: ${fmt(o.price)} ر.س`).join("\n") + "\n";
    });
    h += `<div class="tot"><b>الإجمالي التقريبي: ${fmt(total)} ر.س</b>${save>0?` · <span class="off">توفير حوالي ${fmt(save)} ر.س</span>`:''} · ${stores.length} محل</div></div>`;
    txt += `\nالإجمالي: ${fmt(total)} ر.س\n`;
  }
  if (picOnly.length) {
    h += `<h3>📷 أصناف عليها عروض (قارن السعر من الصورة)</h3><div class="box">`;
    picOnly.forEach(({t,xs}) => { const st = [...new Set(xs.map(x=>x.store))];
      h += `<div class="stp"><div class="stph"><b>${esc(t)}</b><span>في ${st.length} محل</span></div><ul>${xs.slice(0,8).map(x=>`<li><span>${esc(nameOf(x))} <span class="st">· ${STORES[x.store]||x.store}</span></span><a class="pic" href="${esc(x.img)}" target="_blank" rel="noopener">📷 السعر</a></li>`).join("")}</ul></div>`;
      txt += `\n📷 ${t}: موجود في ${st.map(s=>STORES[s]||s).join("، ")}\n`; });
    h += `</div>`;
  }
  if (missing.length) h += `<div class="box st">مفيش عروض دلوقتي على: <b>${missing.map(esc).join("، ")}</b></div>`;
  h += `<div class="row"><button class="ghost" id="cp">📋 انسخ القائمة (للواتساب)</button><a class="ghost" id="wa" style="padding:9px 16px;border-radius:10px;text-decoration:none" target="_blank">واتساب</a><span class="saved" id="cpok"></span></div>`;
  PLANTXT = txt; return h;
}
function run(){
  const terms = $("q").value.split(/[,،\n]+/).map(s=>s.trim()).filter(Boolean);
  try { localStorage.setItem("needs", $("q").value); } catch {}
  if (!terms.length) { $("out").innerHTML = `<div class="empty">اكتب احتياجاتك فوق ودوس «طلّعلي خطة المشوار».</div>`; return; }
  let det = "";
  terms.forEach(t => { const m = match(t, PRICED), xs = match(t, IMAGE); if (m.length) det += groupCard(t,m); if (xs.length) det += xCard(t+" (عروض تانية)", xs, 10); if (!m.length && !xs.length) det += `<div class="need"><div class="hd"><b>${esc(t)}</b></div><div class="none">مفيش عرض عليه دلوقتي.</div></div>`; });
  $("out").innerHTML = planHTML(terms) + `<details class="box"><summary>تفاصيل كل صنف (كل العروض)</summary>${det}</details>`;
  const cp = $("cp"); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(PLANTXT); $("cpok").textContent = "اتنسخت ✓"; } catch { $("cpok").textContent = "النسخ مش متاح"; } };
  const wa = $("wa"); if (wa) wa.href = "https://wa.me/?text=" + encodeURIComponent(PLANTXT);
}
const QUICK = ["رز","زيت","فراخ","لحمة","سمك","بيض","حليب","طماطم","بصل","فاكهة","تونة","جبنة","شاي","مناديل"];
$("quick").innerHTML = QUICK.map(x=>`<button class="chip" data-q="${x}">+ ${x}</button>`).join("");
$("quick").onclick = e => { const x = e.target.dataset.q; if (!x) return; $("q").value = ($("q").value.trim() ? $("q").value.trim()+"، " : "") + x; };
$("go").onclick = () => { run(); saveRequest(); };
$("clr").onclick = () => { $("q").value = ""; run(); };

// ===== البحث والأقسام =====
let st; $("sq").oninput = () => { clearTimeout(st); st = setTimeout(() => {
  const t = $("sq").value.trim(); if (!t) { $("sout").innerHTML = ""; return; }
  const m = match(t, PRICED), xs = match(t, IMAGE);
  $("sout").innerHTML = (m.length?groupCard("عروض بسعرها",m):"") + xCard("عروض السعر في الصورة", xs, 80) + (!m.length && !xs.length ? `<div class="empty">مفيش عروض على «${esc(t)}» دلوقتي.</div>` : "");
}, 250); };
function renderCats(){
  const cats = [...new Set(OFFERS.map(o=>o.category).filter(Boolean))].sort();
  $("cats").innerHTML = cats.map(c=>`<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join("");
  $("cats").onclick = e => { const c = e.target.dataset.c; if (!c) return; [...$("cats").children].forEach(b=>b.classList.toggle("on", b.dataset.c===c));
    const p = PRICED.filter(o=>o.category===c), x = IMAGE.filter(o=>o.category===c);
    $("catout").innerHTML = (p.length?groupCard(c+" — بسعرها",p):"") + xCard(c+" — السعر في الصورة", x, 150); };
  if ($("cats").firstChild) $("cats").firstChild.click();
}

// ===== المجلات =====
function renderFlyers(){
  const by = {}; FLYERS.forEach(f => (by[f.store] = by[f.store] || []).push(f));
  const order = [...STORE_ORDER, ...Object.keys(by).filter(s=>!STORE_ORDER.includes(s))];
  const d = s => new Date(s+"T12:00:00").toLocaleDateString("ar-SA",{day:"numeric",month:"long"});
  $("flyout").innerHTML = order.filter(s=>by[s]).map(s => `<div class="need"><div class="hd"><b>${STORES[s]||s}</b><span>${by[s].length} مجلة</span></div><div class="flygrid">${by[s].map(f=>`<a class="fly" href="https://clicflyer.com/shoppers/en/oman/mecca/flyers/${encodeURI(f.slug)}" target="_blank" rel="noopener">${f.cover?`<img loading="lazy" src="${esc(f.cover)}" alt="">`:""}<div><b>${esc(f.title_ar||f.title_en)}</b><br><span class="st">لحد ${d(f.valid_till)}</span></div></a>`).join("")}</div></div>`).join("") || `<div class="empty">مفيش مجلات سارية دلوقتي.</div>`;
}

// ===== التبويبات =====
function showTab(t){ [...$("tabs").children].forEach(b=>b.classList.toggle("on", b.dataset.t===t)); document.querySelectorAll(".pane").forEach(p=>p.classList.toggle("on", p.id==="p-"+t)); window.scrollTo(0,0); }
$("tabs").onclick = e => { const t = e.target.dataset.t; if (t) showTab(t); };
$("userbtn").onclick = () => showTab("me");

// ===== الحسابات =====
async function refreshUser(){
  const { data: { user } } = await sb.auth.getUser();
  USER = user; PROFILE = null;
  if (USER) { const { data } = await sb.from("profiles").select("*").eq("id", USER.id).single(); PROFILE = data; }
  $("userbtn").textContent = USER ? "👤 " + ((PROFILE && PROFILE.name) || "حسابي") : "👤 دخول";
  $("tabAdmin").style.display = PROFILE && PROFILE.is_admin ? "" : "none";
  $("cnote").textContent = USER ? "المساعد بيرد من عروض الأسبوع اللي في الموقع." : "سجّل دخول من تاب «حسابي» عشان تستخدم المساعد.";
  renderAccount();
  if (PROFILE && PROFILE.is_admin) loadAdmin();
}
function renderAccount(){
  if (!USER) {
    $("acct").innerHTML = `<label for="em">سجّل دخول بإيميلك</label><input class="in" id="em" type="email" placeholder="example@gmail.com" dir="ltr"><div class="row"><button class="go" id="sendlink">ابعتلي لينك الدخول</button><span class="st" id="lnote"></span></div><div class="st" style="margin-top:6px">هيوصلك إيميل فيه لينك، تدوس عليه وتدخل على طول. من غير باسوورد.</div>`;
    $("hist").innerHTML = "";
    $("sendlink").onclick = async () => { const email = $("em").value.trim(); if (!email) return; $("sendlink").disabled = true;
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      $("lnote").textContent = error ? "حصلت مشكلة: " + error.message : "اتبعت ✓ افتح إيميلك ودوس على اللينك."; $("sendlink").disabled = false; };
    return;
  }
  $("acct").innerHTML = `<label for="nm">اسمك</label><input class="in" id="nm" value="${esc(PROFILE && PROFILE.name)}" placeholder="اكتب اسمك"><div class="row"><span class="st">${esc(USER.email)}</span><button class="ghost" id="logout">خروج</button></div>`;
  let t; $("nm").oninput = () => { clearTimeout(t); t = setTimeout(async () => { await sb.from("profiles").update({ name: $("nm").value.trim().slice(0,40) }).eq("id", USER.id); refreshUserLight(); }, 800); };
  $("logout").onclick = async () => { await sb.auth.signOut(); refreshUser(); };
  loadHistory();
}
async function refreshUserLight(){ const { data } = await sb.from("profiles").select("*").eq("id", USER.id).single(); PROFILE = data; $("userbtn").textContent = "👤 " + ((PROFILE && PROFILE.name) || "حسابي"); }
async function loadHistory(){
  const { data } = await sb.from("requests").select("*").eq("user_id", USER.id).order("created_at",{ascending:false}).limit(30);
  $("hist").innerHTML = (data||[]).length ? `<h2>طلباتي السابقة</h2>` + data.map(r=>`<div class="box"><div class="st">${when(r.created_at)}</div><div>${esc(r.needs)}</div><div class="row"><button class="ghost" data-n="${esc(r.needs)}">استخدم الطلب ده تاني</button></div></div>`).join("") : "";
  $("hist").onclick = e => { const n = e.target.dataset.n; if (n == null) return; $("q").value = n; showTab("plan"); run(); };
}
async function saveRequest(){
  if (!USER) return; const needs = $("q").value.trim(); if (!needs) return;
  const items = needs.split(/[,،\n]+/).map(s=>s.trim()).filter(Boolean).slice(0,40);
  const { error } = await sb.from("requests").insert({ user_id: USER.id, needs, items });
  if (!error) { $("sv").textContent = "طلبك اتحفظ ✓"; setTimeout(()=>$("sv").textContent="",2500); }
}
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") refreshUser(); });

// ===== لوحة المالك =====
async function loadAdmin(){
  const [{data:reqs},{data:top},{data:profs},{data:runs}] = await Promise.all([
    sb.from("requests").select("*").order("created_at",{ascending:false}).limit(300),
    sb.from("top_items").select("*").limit(20),
    sb.from("profiles").select("*"),
    sb.from("runs").select("*").order("id",{ascending:false}).limit(8),
  ]);
  const names = Object.fromEntries((profs||[]).map(p=>[p.id, p.name||"بدون اسم"]));
  const users = new Set((reqs||[]).map(r=>r.user_id));
  $("admin").innerHTML = `<div class="box"><h2 style="margin-top:0">نظرة عامة</h2>
    <div class="tot">${(profs||[]).length} مستخدم مسجل · ${users.size} عملوا طلبات · ${(reqs||[]).length} طلب</div>
    ${top && top.length ? `<div class="tot"><b>الأكثر طلباً:</b> ${top.map(t=>`${esc(t.item)} (${t.times})`).join(" · ")}</div>` : ""}</div>
    <div class="box"><h2 style="margin-top:0">آخر مرات التحديث</h2><table><tr><th>الوقت</th><th>عروض</th><th>مجلات</th><th>الحالة</th></tr>${(runs||[]).map(r=>`<tr><td class="st">${when(r.started_at)}</td><td>${r.offers??"—"}</td><td>${r.flyers??"—"}</td><td>${r.ok?"✓":"✗ "+esc(r.note||"")}</td></tr>`).join("")}</table></div>
    <div class="box"><h2 style="margin-top:0">آخر الطلبات</h2><table><tr><th>المستخدم</th><th>الطلب</th><th>الوقت</th></tr>${(reqs||[]).slice(0,100).map(r=>`<tr><td>${esc(names[r.user_id]||"—")}</td><td>${esc(r.needs)}</td><td class="st">${when(r.created_at)}</td></tr>`).join("")}</table></div>`;
}

// ===== المساعد =====
let TURNS = [], BUSY = false;
const msgs = $("msgs");
function addMsg(cls, txt){ const d = document.createElement("div"); d.className = "msg "+cls; d.textContent = txt; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d; }
async function ask(text){
  text = text.trim(); if (!text || BUSY) return;
  if (!USER) { addMsg("bot err", "سجّل دخول الأول من تاب «حسابي» عشان تستخدم المساعد."); return; }
  addMsg("me", text); $("cq").value = ""; TURNS.push({ role: "user", content: text }); while (TURNS.length > 12) TURNS.splice(0,2);
  const b = addMsg("bot", "بيفكر…"); BUSY = true; $("csend").disabled = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/chat`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY }, body: JSON.stringify({ messages: TURNS }) });
    if (!r.ok) { const j = await r.json().catch(()=>({})); throw new Error(j.error || "حصلت مشكلة، جرب تاني."); }
    const reader = r.body.getReader(), dec = new TextDecoder(); let ans = "";
    while (true) { const { done, value } = await reader.read(); if (done) break; ans += dec.decode(value, { stream: true }); b.textContent = ans; msgs.scrollTop = msgs.scrollHeight; }
    if (!ans) throw new Error("مفيش رد، جرب تاني.");
    TURNS.push({ role: "assistant", content: ans });
  } catch (e) { TURNS.pop(); b.remove(); addMsg("bot err", e.message); }
  finally { BUSY = false; $("csend").disabled = false; }
}
$("csend").onclick = () => ask($("cq").value);
$("cq").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); ask($("cq").value); } };
const SUGS = ["فين أرخص فراخ ولحمة؟","اعملي قايمة أسبوعية لأسرة 4 بـ 200 ريال","فيه عروض على كاتل أو غسالة؟","أحسن عروض الخضار والفاكهة"];
$("sugs").innerHTML = SUGS.map(s=>`<button class="chip">${s}</button>`).join("");
$("sugs").onclick = e => { if (e.target.classList.contains("chip")) ask(e.target.textContent); };

// ===== تشغيل =====
loadData(); refreshUser();
