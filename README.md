# professor-match

> AI matching of prospective graduate students to Japanese university professors — a RAG
> pipeline (vector search + LLM query expansion + multi-signal tiering) extracted from a
> production system into a clean, self-hostable service. Ships with a **5,000-professor sample
> index**, so it runs end-to-end with **zero API keys** out of the box.

**Live demo:** https://kafkaesque-luk.github.io/professor-match/ — the same terminal, wired to a
read-only, rate-limited endpoint backed by the full production index (~180k professors).

You describe a research interest (in Chinese or Japanese); the system returns matched professors
organized into three independent views:

| Tier | 中文 | What it means |
|------|------|----------------|
| **Best match** | 海选匹配 | Most relevant professors by semantic similarity. |
| **Prime-age** | 年富力强 | Relevant professors confidently estimated to be **33–55** (likely supervising for years), with age inferred from their researchmap CV. |
| **Value picks** | 潜力洼地 | Strong matches at **non-top-30** schools — easier admission / better value. |

The tiers are three *views* over one recall pool (overlap allowed), not a relevance list cut into thirds.

---

## Quickstart

```bash
git clone <your-fork>
cd professor-match
cp .env.example .env

docker compose up -d            # Qdrant + API + web terminal
docker compose run --rm seed    # restore the bundled 5,000-professor vector index

# open the deployment terminal:
open http://localhost:8000
```

Searching the bundled sample needs **no API keys** — the vectors are pre-built. You only need a
key to embed *brand-new* queries (DashScope or OpenAI) or to rebuild the index from your own data.
Set one in `.env`, or configure it live in the terminal's **Setup** tab.

> Want to try the algorithm without Docker? `python scripts/verify_pipeline.py` runs the whole
> retrieval → tiering → grouping chain against the sample in an in-memory Qdrant.

---

## How it works

```text
query
  └─▶ keyword expansion        (LLM; optional — degrades to the raw query)
  └─▶ discipline → cate_id      (deterministic hard filter; "economics" can't return law)
  └─▶ embed                     (DashScope text-embedding-v4 / OpenAI)
  └─▶ Qdrant vector search      (+ payload filters: region / rank / school-type / university)
  └─▶ three-tier bucketing      (relevance · prime-age 33–55 · value non-top-30)
  └─▶ group by school + stats
```

The deterministic core — age estimation, discipline detection, filter conversion, tiering,
school grouping — is a faithful port of the production PHP and is covered by tests
(`api/tests/test_core.py`). The professor age estimator infers a birth year from multiple CV
signals (explicit birth year, degree years, first appointment + title) and reports a confidence;
the prime-age tier keeps only high/medium-confidence ages in `[33, 55]`.

## Configuration

All via environment (`.env`). The important ones:

| Variable | Default | Notes |
|----------|---------|-------|
| `QDRANT_URL` | `http://qdrant:6333` | Vector DB. |
| `EMBEDDING_PROVIDER` | `dashscope` | `dashscope` (matches the bundled index) or `openai`. |
| `EMBEDDING_API_KEY` / `QWEN_API_KEY` | — | DashScope key (only needed to embed new queries). |
| `OPENAI_API_KEY` | — | If using `openai` (different model/dim → rebuild the index). |
| `LLM_PROVIDER` | `dashscope` | Keyword expansion: `dashscope` / `openai` / `none`. |
| `DEMO_MODE` | `false` | Disables admin config endpoints (use for a public demo). |
| `ADMIN_TOKEN` | — | Enables the terminal's live config (sent as `X-Admin-Token`). |

> If you switch to OpenAI embeddings, the dimensionality changes — you must rebuild the index
> (`scripts/build_index.py`); the bundled DashScope vectors are not comparable to OpenAI vectors.

## The web terminal

A single-page, zero-dependency console served at `/`. It is **backend-agnostic** — the API base
is configurable — so the same UI can point at:

- your **self-hosted Python** API (the bundled sample), or
- a **live upstream** deployment (e.g. behind a read-only proxy) for a full-scale preview.

It does double duty: a **Setup** tab (connection, health, runtime provider/key config) and a
**Match** tab. Match results render in a **desktop web layout carrying every element of the
production mobile app** — the three-tier tabs (counts + info tooltips), school groups, professor
cards (avatar, title badge, estimated-age tag, match-score pill, research-keyword chips, hover
lift), and a click-through **professor detail page**: a hero header (avatar, name, affiliation,
age/title ribbon) above a two-column body with **publications first** in the main column
(parsed citations, peer-review badges, external links, copy-citation; always rendered — an
honest empty state when the CV has none), education/career timelines, awards and patents, and
an info sidebar (basic info, research keywords/field, output statistics). The card/detail
parsing logic (`web/professor.js`) is a faithful port of the production frontend helpers.

The **AI simulated dialog** button on the detail page opens a chat drawer that actually works:
the backend rebuilds the production five-layer persona prompt (identity anchor / CV memory /
data-driven keyword trend / methodology / style constraints, plus anti-hallucination guards)
from the professor's public CV and answers in character. The chat is stateless — the browser
carries the history; nothing is stored server-side.

The detail page is powered by `GET /api/professor/{id}` and the chat by
`POST /api/professor/{id}/chat` (needs an LLM key; returns a clear error otherwise). When
pointing at a different backend, set `detailPath` / `chatPath` in `config.js` (`'{id}'`
placeholder) alongside `matchPath`.

**Publishing your own demo to GitHub Pages:** the included workflow (`.github/workflows/pages.yml`)
deploys `web/` to Pages. Point it at your backend by setting repository variables `DEMO_API_BASE`
(+ optional `DEMO_MATCH_PATH` / `DEMO_DETAIL_PATH` / `DEMO_CHAT_PATH`) under Settings → Secrets
and variables → Actions → Variables; leave them unset and the build ships the same-origin
default, so forks never silently call someone else's backend.

## Bring your own data

The bundled sample is exact production vectors (zero-cost, instant). To use your own professors:

1. Prepare rows as JSONL (`product_id`, `store_name`, `extend`, `school_rank`, `school_name`,
   `school_type`, `school_region_id`, `cate_id`, `image`). `extend` is a researchmap-style CV JSON.
2. `python scripts/build_index.py --rows data/your_rows.jsonl` (needs an embedding key; re-embeds).

`scripts/export_from_prod.py` is a read-only reference exporter for pulling a sample from an
existing CRMEB-style MySQL + Qdrant source over SSH (configure via `PM_*` env vars).

## Project layout

```text
api/        FastAPI service
  app/      pipeline + deterministic core + providers + qdrant client
  tests/    behavioural tests for the core
  seed.py   restore the snapshot into Qdrant
web/        the deployment terminal (static, no build)
data/       professors_5000.jsonl.gz + qdrant_snapshot/ (pre-built vectors)
scripts/    export / build_index / verify
```

## Development

```bash
cd api && pip install -r requirements.txt && python -m pytest -q
```

## Data & privacy

The sample is drawn from public [researchmap](https://researchmap.jp) academic profiles (names,
affiliations, publication links). It contains no contact details and no business data. If you
prefer, pseudonymize before publishing your own export.

## License

[MIT](LICENSE). Set the copyright holder in `LICENSE` to your name/org before publishing.

---

## 中文说明

**professor-match** 是把一套生产中的「AI 教授匹配」功能抽离成的独立、可自部署服务：输入研究兴趣
（中文或日文），按语义检索匹配的日本大学教授，分三档呈现——**海选匹配**（最相关）、**年富力强**
（据履历推算 33–55 岁、还能稳妥带人）、**潜力洼地**（非顶尖校、性价比高）。三档是同一召回池的三个
独立视角，允许重叠。

仓库自带 **5000 位教授的预建向量索引**，`docker compose up` + `docker compose run --rm seed`
即可**零密钥**端到端运行。只有在为**新查询**做嵌入或用**自有数据**重建索引时才需要 DashScope /
OpenAI 密钥（在 `.env` 或终端「设置」页填写）。

**算法忠实性**：年龄估算、学科硬过滤、筛选转换、三档分桶、按校分组等确定性逻辑，是对生产 PHP 的
逐行移植，并有测试覆盖（`api/tests/`）。检索复用生产同款嵌入模型与向量，结果与生产同源。

**网页终端**后端无关：同一套界面既能连本机自部署的 Python，也能（经只读代理）连线上满血部署做效果预览
（线上演示背后是生产全量约 18 万教授索引；自部署跑的是自带的 5000 教授样本）。
匹配结果以**电脑端网页布局**承载生产 App 的全部要素——三档页签、按校分组、教授卡片（头像/职称/预估年龄/匹配度/研究关键词），
点击卡片进入**教授详情页**：英雄区（头像、姓名、所属、年龄/职称绶带）+ 双栏正文，**研究论文置顶主栏**
（解析出标题/作者/期刊/日期，査読徽章、外链、引用复制，无论文时诚实提示），教育背景/职业经历时间轴、获奖、专利，
侧栏为基本信息、研究关键词/分野、成果统计。详情页的「AI模拟对话」是真实可用的：后端按教授公开履历重建生产同款
五层 persona prompt（身份锚定/档案记忆/关键词趋势/科研手法/风格约束+防幻觉），以教授第一人称作答；
对话无状态，历史由浏览器携带，服务端不存任何记录。

数据来自公开的 [researchmap](https://researchmap.jp) 学术主页，不含联系方式与业务数据。
