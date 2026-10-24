import { tokenStore, listMarkdown, readText, createFile, checkToken } from "./github.js";

const $ = (sel) => document.querySelector(sel);
const views = ["home", "write", "saved", "letters", "setup"];

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

// ---------- 홈: 최근 7일 + 내 기록과 Claude 답장 ----------
async function loadHome() {
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
  const total = inbox.length + done.length;
  $("#count").textContent = total ? `지금까지 ${total}번 남겼어요` : "";
  const records = await loadRecords(inbox, done);
  showQuestion(records);
}

// 가장 최근 기록에 답장이 달려 있으면, 그 답장의 마지막 질문을 맨 위에 띄운다.
// 그 뒤에 새 기록을 남기면(답했든 아니든) 질문은 내려간다.
function showQuestion(records) {
  const latest = records[0];
  const question = latest?.reply
    ?.split("\n").map((l) => l.trim()).filter((l) => l.endsWith("?")).pop();
  $("#question-box").hidden = !question;
  $("#question").textContent = question ?? "";
}

// ---------- 쏟아내기 / 답하기 ----------
function openWrite(question) {
  show("write");
  $("#write-error").textContent = "";
  $("#write-prompt").textContent = question ?? "지금 떠오르는 대로. 정리하지 않아도 돼요.";
  $("#write-prompt").classList.toggle("asking", Boolean(question));
  $("#entry").dataset.question = question ?? "";
  $("#entry").value = localStorage.getItem("draft") ?? "";
  $("#entry").focus();
}

async function save() {
  const text = $("#entry").value.trim();
  if (!text) return;
  const btn = $("#save");
  btn.disabled = true;
  btn.textContent = "남기는 중…";
  try {
    const stamp = kstStamp();
    const question = $("#entry").dataset.question;
    const head = question ? `> 질문: ${question}\n\n` : "";
    await createFile(`inbox/${stamp}.md`, `# ${stamp}\n\n${head}${text}\n`, `inbox: ${stamp}`);
    $("#entry").value = "";
    localStorage.removeItem("draft");
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

// 답장은 replies/<같은 파일명>.md 에 Claude가 남긴다.
async function loadRecords(inbox, done) {
  const list = $("#record-list");
  list.replaceChildren(loading());
  const files = [...inbox.map((f) => ({ ...f, dir: "inbox" })), ...done.map((f) => ({ ...f, dir: "inbox/done" }))]
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, 30);
  const records = await Promise.all(files.map(async (f) => {
    const [body, reply] = await Promise.all([readText(`${f.dir}/${f.name}`), readText(`replies/${f.name}`)]);
    return { name: f.name, body, reply };
  }));
  list.replaceChildren(...records.map((r) => entryCard(r.name, r.body, r.reply)));
  if (!records.length) list.append(empty("아직 남긴 기록이 없어요. 넘칠 때 쏟아내 주세요."));
  return records;
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
  loadHome().catch((e) => $("#record-list").replaceChildren(empty(`불러오지 못했어요 (${e.message})`)));
}

// ---------- 이벤트 ----------
document.querySelectorAll("[data-tab]").forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.tab === "home") return start();
    show(b.dataset.tab);
    loadLetters();
  }));
$("#open-write").addEventListener("click", () => openWrite());
$("#answer").addEventListener("click", () => openWrite($("#question").textContent));
$("#entry").addEventListener("input", (e) => localStorage.setItem("draft", e.target.value));
$("#cancel").addEventListener("click", () => show("home"));
$("#save").addEventListener("click", save);
$("#saved-home").addEventListener("click", start);
$("#connect").addEventListener("click", connect);

if (tokenStore.get()) start();
else show("setup");
