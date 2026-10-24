import { tokenStore, listMarkdown, readText, createFile, checkToken } from "./github.js";

const $ = (sel) => document.querySelector(sel);
const views = ["home", "write", "saved", "records", "letters", "setup"];

function show(name) {
  views.forEach((v) => ($(`#view-${v}`).hidden = v !== name));
  document.querySelectorAll("[data-tab]").forEach((b) =>
    b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false"));
  $("#tabbar").hidden = ["setup", "write", "saved"].includes(name);
}

// 한국 시간 기준 파일명: 2026-10-25-001930
function kstStamp(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000).toISOString();
  return `${k.slice(0, 10)}-${k.slice(11, 19).replace(/:/g, "")}`;
}
const dayOf = (name) => name.slice(0, 10);

// ---------- 홈 ----------
async function loadHome() {
  const cardsText = await readText("app/cards.json");
  const cards = cardsText ? JSON.parse(cardsText) : [];
  if (cards.length) {
    const today = Number(kstStamp().slice(0, 10).replace(/-/g, ""));
    $("#card").textContent = cards[today % cards.length];
  }

  const [inbox, done] = await Promise.all([listMarkdown("inbox"), listMarkdown("inbox/done")]);
  const days = new Set([...inbox, ...done].map((f) => dayOf(f.name)));
  const dots = $("#week");
  dots.replaceChildren();
  for (let i = 6; i >= 0; i--) {
    const d = kstStamp(new Date(Date.now() - i * 86400000)).slice(0, 10);
    const dot = document.createElement("span");
    dot.className = days.has(d) ? "dot on" : "dot";
    dot.title = d;
    dots.append(dot);
  }
  $("#count").textContent = `지금까지 ${inbox.length + done.length}번 남겼어요`;
  $("#pending").textContent = inbox.length ? `집에서 같이 볼 기록 ${inbox.length}개` : "";
}

// ---------- 쏟아내기 ----------
async function save() {
  const text = $("#entry").value.trim();
  if (!text) return;
  const btn = $("#save");
  btn.disabled = true;
  btn.textContent = "남기는 중…";
  try {
    const stamp = kstStamp();
    await createFile(`inbox/${stamp}.md`, `# ${stamp}\n\n${text}\n`, `inbox: ${stamp}`);
    $("#entry").value = "";
    localStorage.removeItem("draft");
    $("#saved-line").textContent = $("#card").textContent;
    show("saved");
  } catch (e) {
    alertInline(`저장하지 못했어요 (${e.message}). 글은 그대로 남아 있어요.`);
  } finally {
    btn.disabled = false;
    btn.textContent = "남기기";
  }
}

function alertInline(msg) {
  $("#write-error").textContent = msg;
}

// ---------- 기록 (내 글 + Claude 답장) ----------
async function loadRecords() {
  const list = $("#record-list");
  list.replaceChildren(loading());
  const [inbox, done] = await Promise.all([listMarkdown("inbox"), listMarkdown("inbox/done")]);
  const files = [...inbox.map((f) => ({ ...f, dir: "inbox" })), ...done.map((f) => ({ ...f, dir: "inbox/done" }))]
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, 20);
  list.replaceChildren();
  if (!files.length) return list.append(empty("아직 남긴 기록이 없어요."));
  for (const f of files) {
    const [body, reply] = await Promise.all([readText(`${f.dir}/${f.name}`), readText(`replies/${f.name}`)]);
    list.append(entryCard(f.name, body, reply));
  }
}

function entryCard(name, body, reply) {
  const el = document.createElement("article");
  el.className = "entry";
  const h = document.createElement("time");
  h.textContent = `${name.slice(5, 10).replace("-", "/")} ${name.slice(11, 13)}:${name.slice(13, 15)}`;
  const p = document.createElement("p");
  p.textContent = body.replace(/^# .*\n+/, "");
  el.append(h, p);
  if (reply) {
    const r = document.createElement("blockquote");
    r.textContent = reply;
    el.append(r);
  }
  return el;
}

// ---------- 편지 ----------
async function loadLetters() {
  const list = $("#letter-list");
  list.replaceChildren(loading());
  const letters = (await listMarkdown("letters")).sort((a, b) => b.name.localeCompare(a.name));
  list.replaceChildren();
  if (!letters.length) return list.append(empty("첫 편지는 이번 일요일에 도착해요."));
  for (const f of letters) {
    const el = document.createElement("article");
    el.className = "entry letter";
    const t = document.createElement("time");
    t.textContent = f.name.replace(".md", "");
    const p = document.createElement("p");
    p.textContent = await readText(`letters/${f.name}`);
    el.append(t, p);
    list.append(el);
  }
}

const loading = () => Object.assign(document.createElement("p"), { className: "muted", textContent: "불러오는 중…" });
const empty = (t) => Object.assign(document.createElement("p"), { className: "muted", textContent: t });

// ---------- 설정 ----------
async function connect() {
  const t = $("#token").value;
  if (!t.trim()) return;
  tokenStore.set(t);
  try {
    if (!(await checkToken())) throw new Error("저장소를 찾지 못했어요");
    start();
  } catch (e) {
    tokenStore.clear();
    $("#setup-error").textContent = `연결하지 못했어요: ${e.message}`;
  }
}

function start() {
  show("home");
  loadHome().catch((e) => ($("#card").textContent = `불러오지 못했어요 (${e.message})`));
}

// ---------- 이벤트 ----------
document.querySelectorAll("[data-tab]").forEach((b) =>
  b.addEventListener("click", () => {
    show(b.dataset.tab);
    if (b.dataset.tab === "home") loadHome();
    if (b.dataset.tab === "records") loadRecords();
    if (b.dataset.tab === "letters") loadLetters();
  }));
$("#open-write").addEventListener("click", () => {
  show("write");
  $("#write-error").textContent = "";
  $("#entry").value = localStorage.getItem("draft") ?? "";
  $("#entry").focus();
});
$("#entry").addEventListener("input", (e) => localStorage.setItem("draft", e.target.value));
$("#cancel").addEventListener("click", () => show("home"));
$("#save").addEventListener("click", save);
$("#saved-home").addEventListener("click", start);
$("#connect").addEventListener("click", connect);

if (tokenStore.get()) start();
else show("setup");
