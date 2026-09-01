# tpass-registry

TSchool **T-Pass 服務註冊表**。整個生態系「有哪些服務」的唯一真相就是這個 repo 的 `services.json`。

想讓你的服務上線並出現在門戶大廳（`portal.tschoolsu.org`）？**對這個 repo 開一個 PR，加一個 JSON 物件，就這樣。** 不需要改任何其他 repo 的程式碼。

---

## 這份檔案驅動什麼

| 消費者 | 讀它做什麼 |
| --- | --- |
| `tpass-portal` | 產生門戶大廳的服務卡片（顯示名、圖示、配色、網址） |
| `tpass-auth` | 產生可以發證的服務白名單（不在清單裡 → 登入被拒） |
| `tpass-ops` 的 `deploy.sh` / `ecosystem.config.js` | 決定部署哪些服務、目錄在哪、跑哪個 port、DB 怎麼套 |

所以**這裡改一次，三邊自動跟上**。反過來說：這裡沒改，其他地方改再多也沒用。

---

## 怎麼加一個服務

```bash
# 1. Fork 這個 repo（GitHub 網頁按 Fork，或用 gh）
gh repo fork tschoolsu/tpass-registry --clone
cd tpass-registry

# 2. 開一個分支
git checkout -b add-lost

# 3. 編輯 services.json，在 services 陣列末端加一筆（範例見下）

# 4. 本機先驗一次（不需要安裝任何依賴）
node validate.mjs

# 5. 送出
git commit -am "registry: 登記 lost（遺失物）"
git push -u origin add-lost
gh pr create --fill
```

維運 review + merge 之後，重新部署 `auth` 與 `portal`，你的服務就可以登入、卡片就會出現在大廳。

---

## 欄位

```jsonc
{
  "id": "lost",              // 短名。＝pm2 程序名＝TPASS_SERVICE_ID＝JWT 的 aud 後綴。★ 永不改名
  "name": "T-Lost 遺失物",    // ops 用的長名（CLI、部署 log 顯示）
  "dir": "tpass-lost",       // repo 目錄名（只寫目錄名，不寫路徑）。主機上就是 /home/service/tpass-lost，見〈主機把它放哪〉
  "subdomain": "lost",       // 本機＝lost.lvh.me；正式＝lost.tschoolsu.org
  "port": 3007,              // 內部 port（只綁 127.0.0.1，對外靠 nginx 反代）。撞車會被 validate.mjs 擋下
                             // hosting 是 "external" 時填 null，見下
  "hosting": "host",        // ★ 選填，預設 "host"。"host" = 主機 pm2 跑它，走 deploy.sh；
                             // "external" = 不在主機上跑（例如純前端、掛在 GitHub Pages），
                             // deploy.sh / ecosystem.config.js 會跳過它，port 留 null
  "db": {                    // 沒有資料庫就填 null
    "name": "t_lost",        // 資料庫名（慣例 t_<id>）
    "user": "t_lost",        // 專屬 role（慣例 t_<id>）
    "strategy": "migrate"    // migrate = 有 migrations 歷史（標準做法）；push 僅限原型；
                             // none = 有資料庫但不用 Prisma（自己下 SQL），部署與本機工具都不套 schema
  },
  "enabled": true,           // false = 本機工具與 auth 白名單全部跳過（封存用）
  "deployed": false,         // 產生 pm2 程序清單、決定卡片出不出現。登記時填 false 佔位，
                             // 主機前置備妥、要真正上線時再開一個 PR 翻 true
  "portal": {                // ★ 選填。沒有這塊 = 不進大廳（例如 auth 這種純後端服務）
    "label": "遺失物",        // 卡片顯示名（可以跟 name 不同，通常更短）
    "icon": "Search",        // lucide-react 圖示的 PascalCase 名，見下
    "tone": "orange",        // green | blue | orange | violet | rose
    "category": "service"    // governance | service | event，大廳分區用（見下）
  }
}
```

### 圖示怎麼選

到 https://lucide.dev/icons 找一個，用它的 **PascalCase** 名（網址上的 `clipboard-list` → 寫成 `ClipboardList`）。

portal 為了讓卡片能在伺服器端就渲染出來（不然每次進大廳會先閃一排空卡），維護一份圖示白名單。
**用了白名單以外的名字，portal 一啟動就會直接報錯並印出可用清單**——不會靜默換成別的圖示，
所以絕不會發生「上線後才發現卡片圖不對」。若你要的圖示不在清單裡，在 PR 說明裡提一句，
維運會順手在 `tpass-portal` 的 `src/config/icons.ts` 加一行。

### `portal.category` 怎麼選

大廳依這個欄位把卡片分成三段（2026-09-01 起，取代原本形同虛設、全部填 `all` 的 `roles`）：

- **governance**：學生自治正式流程——開會、選舉、查法規（`meeting`／`vote`／`law`）
- **service**：日常隨時會用到的功能性工具（`form`／`msg`／`appeals`／`notes`）
- **event**：限定活動的臨時服務，活動結束就下架（`buddy`）

分類軸線是「這是什麼性質的工具」，不是「誰在用」——大部分服務前台對全體開放、
後台限幹部，天生就不是乾淨的受眾二分。拿不準選哪個就照這三句話的定義判斷，
不要照猜的受眾分。

### 主機把它放哪

`dir` **只寫目錄名**，不寫路徑。路徑由頂層的 `server` 區塊決定：

```jsonc
"server": {
  "opsRoot": "~/tpass",          // ops repo（deploy.sh / ecosystem.config.js / 這份註冊表的 clone）
  "servicesRoot": "/home/service" // 各服務 repo 的家
}
```

所以主機上你的服務會被 clone 到 **`/home/service/tpass-lost`**，pm2 的 `cwd` 也是它。

```
/home/service/          ← 只放服務 repo，一個服務一層，不放別的東西
├── tpass-auth/
├── tpass-portal/
├── tpass-lost/         ← 你的
~/tpass/                ← ops repo（腳本、部署、文件）+ tpass-registry
```

服務 repo 不再與 `tpass-registry` 並排，所以**主機上**的 `../tpass-registry` 相對路徑不成立——
註冊表位置由 ops 層透過 `TPASS_REGISTRY_PATH` 注入（`ecosystem.config.js` 的 env + `deploy.sh` build 前 export），
你的服務程式碼**不用為此改任何一行**，`.env.local` 也不用寫這個 key。

> **本機不受影響**：本機沿用「repo 並排」的佈局（`tpass-registry` 與各服務同層），`../tpass-registry` 照常成立。

### 卡片網址不寫在這裡

大廳卡片的網址由 `subdomain` + 頂層 `domains` + `port` **自動推導**：

- 本機 → `https://<subdomain>.lvh.me:<port>`
- 正式 → `https://<subdomain>.tschoolsu.org`（無 port）

**不要**在任何地方寫死網域。這是刻意的設計：寫死的話本機門戶會把人送去正式站，本機根本測不了 SSO 互通。

### 卡片什麼時候才會出現

三個條件同時成立：`enabled: true` **且** `deployed: true` **且**有 `portal` 區塊。

所以還沒上線的服務可以先登記進來（`deployed: false`）佔住 id 與 port，不會提早出現在大廳。

> ⚠️ `deployed` 同時也決定 **pm2 的程序清單**（`hosting: "host"` 的服務才算，見上）。
> 主機第一次部署你的服務**之前**就必須翻成 `true`，否則部署腳本找不到你的服務。翻 `true`
> 的時機是「主機前置（DNS / nginx / DB）都備妥、要真正上線了」，不是「部署成功之後」——
> 順序見 `tpass-ops` 的 `docs/NEW-SERVICE.md`〈部署〉。
>
> `hosting: "external"` 的服務不受這條約束——它本來就不歸 pm2 管，`deployed: true` 只代表
> 「卡片可以出現在大廳」，翻 true 前不需要先在主機備妥任何東西。

---

## 驗證規則

`node validate.mjs`（CI 每個 PR 都會跑）檢查：

- `id` / `dir` / `subdomain` / `port` 在**啟用中**的服務之間不重複（封存服務允許保留歷史值）
- 必填欄位齊全、`enabled` / `deployed` 是布林、不能 `deployed:true` 但 `enabled:false`
- `db` 要嘛是 `null`（沒有資料庫），要嘛有 `name` + `user` + 合法的 `strategy`（`migrate` / `push` / `none`）
- `portal.tone` / `portal.roles` 只能是允許的值、`label` 與 `icon` 非空
- 發證端（`issuer`）不得有 `portal` 區塊——它不是使用者的目的地

---

## 相關文件

- **開新服務 → 串登入 → 上線**（部員動手版）：`tschoolsu/tpass-ops` 的 `docs/NEW-SERVICE.md`
- **SSO 串接契約**（驗章四鐵則、payload、錯誤碼）：`tschoolsu/tpass-auth` 的 `INTEGRATION.md`
- **開發與維運手冊**：`tschoolsu/tpass-ops` 的 `docs/ONBOARDING.md`

---

## 這裡沒有秘密

本 repo 刻意公開，讓任何部員 fork + PR 就能提註冊，不必先被加成 collaborator。
裡面**沒有任何密鑰**：port 只綁 `127.0.0.1`，DB 名稱與 role 名不含密碼（密碼在各服務主機上的 `.env.local`，不進 git）。
**任何密鑰都不該出現在這個 repo。**
