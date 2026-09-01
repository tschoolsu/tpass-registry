#!/usr/bin/env node
// services.json 驗證器。PR CI 跑這支；本機也可以直接 `node validate.mjs`。
// 一次收集所有錯誤再一起印出來——PR 被退回一次就該看到全部問題，不是修一個發現下一個。
import { readFileSync } from "node:fs";

const TONES = ["green", "blue", "orange", "violet", "rose"];
const CATEGORIES = ["governance", "service", "event"];
const STRATEGIES = ["push", "migrate", "none"];
const UNIQUE_KEYS = ["id", "dir", "subdomain", "port"];
// host：主機 pm2 跑它，走 deploy.sh（預設值，缺 hosting 欄位視同這個）。
// external：不在主機上跑（例如純前端 GitHub Pages），deploy.sh/ecosystem.config.js
// 跳過它，port 留 null——tpass status 才不會把「沒人在聽的 port」當成掛掉的服務。
const HOSTING = ["host", "external"];

const errors = [];
const bad = (msg) => errors.push(msg);

let data;
try {
  data = JSON.parse(readFileSync(new URL("./services.json", import.meta.url), "utf8"));
} catch (e) {
  console.error(`✗ services.json 讀不到或不是合法 JSON：${e.message}`);
  process.exit(1);
}

// ── 頂層 ──────────────────────────────────────────────
if (!data.domains?.dev || !data.domains?.prod) bad("domains 必須有 dev 與 prod");
for (const key of ["opsRoot", "servicesRoot"]) {
  const p = data.server?.[key];
  if (!p) bad(`server.${key} 必填（主機路徑約定）`);
  else if (!p.startsWith("/") && !p.startsWith("~/")) bad(`server.${key} 必須是絕對路徑或 ~/ 開頭，收到「${p}」`);
}
if (!Array.isArray(data.services) || data.services.length === 0) {
  console.error("✗ services 必須是非空陣列");
  process.exit(1);
}
if (!data.services.some((s) => s.id === data.issuer)) bad(`issuer「${data.issuer}」不在服務清單中`);

// ── 每筆必填欄位 ──────────────────────────────────────
for (const s of data.services) {
  const where = s.id ? `服務「${s.id}」` : JSON.stringify(s);
  const hosting = s.hosting ?? "host";
  if (!HOSTING.includes(hosting)) bad(`${where} 的 hosting 必須是 ${HOSTING.join(" 或 ")}，收到「${s.hosting}」`);

  // external 沒有 port（不在主機上跑），跳過 port 必填檢查；其餘照舊。
  const requiredKeys = hosting === "external" ? UNIQUE_KEYS.filter((k) => k !== "port") : UNIQUE_KEYS;
  for (const key of [...requiredKeys, "name"]) {
    if (s[key] === undefined || s[key] === null || s[key] === "") bad(`${where} 缺 ${key}`);
  }
  if (hosting === "external" && s.port !== null && s.port !== undefined) {
    bad(`${where}：hosting 是 external 時 port 應留 null（外部託管，非 null 的 port 會被 tpass status 誤判成掛掉的服務）`);
  }
  if (typeof s.enabled !== "boolean") bad(`${where} 的 enabled 必須是 true/false`);
  if (typeof s.deployed !== "boolean") bad(`${where} 的 deployed 必須是 true/false`);
  if (s.deployed && !s.enabled) bad(`${where} 不能 deployed:true 但 enabled:false`);
  if (s.db && !STRATEGIES.includes(s.db.strategy)) bad(`${where} 的 db.strategy 必須是 ${STRATEGIES.join(" 或 ")}`);
  if (s.db && (!s.db.name || !s.db.user)) bad(`${where} 的 db 必須有 name 與 user（沒有資料庫請填 null）`);
}

// ── 撞車檢查（只看可能同時運行的服務；封存的允許保留歷史值）──
for (const key of UNIQUE_KEYS) {
  const seen = new Map();
  for (const s of data.services.filter((x) => x.enabled)) {
    // external 的 port 一律是 null，不是真的撞號，不參與這個檢查。
    if (key === "port" && (s.hosting ?? "host") === "external") continue;
    if (seen.has(s[key])) bad(`${key} 重複：「${s[key]}」同時出現在 ${seen.get(s[key])} 與 ${s.id}`);
    seen.set(s[key], s.id);
  }
}

// ── portal 區塊（選填；有才進大廳）────────────────────
for (const s of data.services.filter((x) => x.portal)) {
  const where = `服務「${s.id}」的 portal`;
  const p = s.portal;
  if (s.id === data.issuer) bad(`${where}：發證端不是使用者的目的地，不該有大廳卡片`);
  if (!p.label) bad(`${where} 缺 label（卡片顯示名）`);
  // 圖示名的「存在性」這裡驗不到（本 repo 不認識 lucide），只驗格式；
  // portal 有一份白名單，用了清單外的名字它會在啟動時直接炸並印出可用清單。
  if (!p.icon) bad(`${where} 缺 icon（lucide-react 的 PascalCase 圖示名，例 ClipboardList）`);
  else if (!/^[A-Z][A-Za-z0-9]*$/.test(p.icon)) bad(`${where}.icon 必須是 PascalCase，收到「${p.icon}」`);
  if (!TONES.includes(p.tone)) bad(`${where}.tone 必須是 ${TONES.join(" | ")}，收到「${p.tone}」`);
  if (!CATEGORIES.includes(p.category)) bad(`${where}.category 必須是 ${CATEGORIES.join(" | ")}，收到「${p.category}」`);
}

if (errors.length > 0) {
  console.error(`✗ services.json 有 ${errors.length} 個問題：`);
  for (const e of errors) console.error(`   • ${e}`);
  process.exit(1);
}

const lobby = data.services.filter((s) => s.enabled && s.deployed && s.portal);
console.log(`✅ services.json 通過驗證：${data.services.length} 筆服務，其中 ${lobby.length} 筆會出現在門戶大廳`);
console.log(`   大廳卡片：${lobby.map((s) => `${s.id}（${s.portal.label}）`).join("、") || "無"}`);
