// GitHub Contents API 래퍼. 기록의 원본은 개인 비공개 저장소(hongchal/life)다.
const REPO = "hongchal/life";
const API = `https://api.github.com/repos/${REPO}/contents`;

export const tokenStore = {
  get: () => localStorage.getItem("gh_token"),
  set: (t) => localStorage.setItem("gh_token", t.trim()),
  clear: () => localStorage.removeItem("gh_token"),
};

async function request(path, init = {}) {
  const res = await fetch(`${API}/${encodeURI(path)}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokenStore.get()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

const toBase64 = (text) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const fromBase64 = (b64) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

// 디렉토리의 .md 파일 목록. 없으면 빈 배열.
export async function listMarkdown(dir) {
  const items = await request(dir);
  return (items ?? []).filter((i) => i.type === "file" && i.name.endsWith(".md") && i.name !== "README.md");
}

export async function readText(path) {
  const file = await request(path);
  return file ? fromBase64(file.content) : null;
}

export async function createFile(path, text, message) {
  return request(path, {
    method: "PUT",
    body: JSON.stringify({ message, content: toBase64(text) }),
  });
}

export async function checkToken() {
  return (await request("inbox")) !== null;
}
