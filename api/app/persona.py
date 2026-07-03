"""
Professor persona chat — faithful port of the production ``AI.php`` professor-chat core
(``parseProfessorProfile`` / ``extractKeywordTrend`` / ``buildProfessorSystemPrompt``).

The production feature is session-based with billing; this port is STATELESS: the caller
carries the chat history, the server rebuilds the same five-layer persona system prompt
(identity anchor / CV memory / data-driven keyword trend / methodology / style constraints,
plus per-field anti-hallucination guards) on every call.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

MAX_HISTORY = 12  # stateless chat: max client-carried history messages

# The production opening trigger (never stored as a real user message).
OPENING_TRIGGER = ("（一位中国留学生刚刚进入对话室，请以你自己的风格自然地打个招呼，"
                   "简短介绍你现在最感兴趣的1-2个研究方向，然后问问对方的研究背景）")

_TITLE_MAP = [
    ("特任教授", "特任教授"), ("客員教授", "客座教授"), ("名誉教授", "名誉教授"),
    ("教授", "教授"), ("特任准教授", "特任副教授"), ("准教授", "副教授"),
    ("講師", "讲师"), ("助教", "助教"), ("研究員", "研究员"),
]


def _s(v: Any) -> str:
    """Safely stringify any nested value (mirrors the production closure)."""
    if isinstance(v, str):
        return v
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        parts = [p for p in (_s(item) for item in v) if p]
        return " ".join(parts)
    if isinstance(v, dict):
        parts = [p for p in (_s(item) for item in v.values()) if p]
        return " ".join(parts)
    return ""


def extract_year_from_citation(citation: str) -> int:
    m = re.search(r"(\d{4})年", citation)
    if m:
        return int(m.group(1))
    m = re.search(r"\b(19|20)\d{2}\b", citation)
    if m:
        return int(m.group(0))
    return 0


def extract_keyword_trend(papers: List[dict], cur_year: int) -> Dict[str, List[str]]:
    recent_kws: Dict[str, int] = {}
    older_kws: Dict[str, int] = {}
    for paper in papers:
        citation = paper.get("apa_citation")
        citation = citation if isinstance(citation, str) else ""
        year = extract_year_from_citation(citation)
        kws: List[str] = []
        raw_kws = paper.get("keywords")
        title = paper.get("title")
        if isinstance(raw_kws, list) and raw_kws:
            for item in raw_kws:
                if isinstance(item, str):
                    kws.append(item)
                elif isinstance(item, dict):
                    v = item.get("keyword") or item.get("name") or item.get("text") or ""
                    if isinstance(v, str) and v:
                        kws.append(v)
        elif isinstance(title, str) and title:
            kws = re.findall(r"[A-Za-z一-龥]{3,}", title)
        for kw in kws:
            if not isinstance(kw, str):
                continue
            kw = kw.strip().lower()
            if not kw or len(kw) < 3:
                continue
            bucket = recent_kws if year >= cur_year - 3 else older_kws
            bucket[kw] = bucket.get(kw, 0) + 1

    emerging = [kw for kw, cnt in recent_kws.items()
                if older_kws.get(kw, 0) == 0 or cnt > older_kws.get(kw, 0) * 1.5]
    fading = [kw for kw, cnt in older_kws.items() if recent_kws.get(kw, 0) == 0 and cnt >= 2]
    stable = [kw for kw in recent_kws if kw in older_kws]
    return {"emerging": emerging[:5], "fading": fading[:5], "stable": stable[:5]}


def _normalize_list(items: List[Any], max_n: int, keys: List[str]) -> List[str]:
    result = []
    for item in items[:max_n]:
        if isinstance(item, str) and item:
            result.append(item[:120])
        elif isinstance(item, dict):
            parts = [p for p in (_s(item.get(k)) for k in keys if k in item) if p]
            if parts:
                result.append(" | ".join(parts)[:120])
    return result


def _normalize_string_list(items: List[Any], fallback_key: str = "name") -> List[str]:
    result = []
    for item in items:
        if isinstance(item, str) and item:
            result.append(item)
        elif isinstance(item, dict):
            raw = (item.get(fallback_key) or item.get("keyword") or item.get("area")
                   or item.get("label") or item.get("title") or item.get("text"))
            if raw is None:
                for v in item.values():
                    if v not in (None, ""):
                        raw = v
                        break
            if raw not in (None, ""):
                s = _s(raw)
                if s:
                    result.append(s)
    return result


def parse_professor_profile(row: dict, extend: dict, cur_year: int) -> Dict[str, Any]:
    """Port of ``AI::parseProfessorProfile`` (row = store_product-like professor record)."""
    ext = extend if isinstance(extend, dict) else {}
    aff = ext.get("affiliation") if isinstance(ext.get("affiliation"), dict) else {}
    prof_info = ext.get("professor_info") if isinstance(ext.get("professor_info"), dict) else {}
    publications = ext.get("publications") if isinstance(ext.get("publications"), dict) else {}
    papers = publications.get("papers") if isinstance(publications.get("papers"), list) else []
    career = ext.get("career_history") if isinstance(ext.get("career_history"), list) else []
    education = ext.get("education") if isinstance(ext.get("education"), list) else []
    awards = ext.get("awards") if isinstance(ext.get("awards"), list) else []
    research_proj = ext.get("research_projects") if isinstance(ext.get("research_projects"), list) else []
    societies = ext.get("academic_societies") if isinstance(ext.get("academic_societies"), list) else []
    research_areas = ext.get("research_areas") if isinstance(ext.get("research_areas"), list) else []
    research_kws = ext.get("research_keywords") if isinstance(ext.get("research_keywords"), list) else []

    name_en = _s(prof_info.get("name_en") or ext.get("name_en") or "")
    biography = _s(ext.get("self_introduction") or ext.get("biography") or "")
    department = _s(aff.get("department") or aff.get("faculty") or aff.get("school") or "")
    position = _s(aff.get("position") or "")

    title_zh = ""
    title_ja = ""
    for ja, zh in _TITLE_MAP:
        if ja in position:
            title_ja, title_zh = ja, zh
            break

    def paper_year(p: Any) -> int:
        cit = p.get("apa_citation") if isinstance(p, dict) else ""
        return extract_year_from_citation(cit if isinstance(cit, str) else "")

    papers = [p for p in papers if isinstance(p, dict)]
    papers.sort(key=paper_year, reverse=True)
    recent_papers = papers[:5]
    older_papers = papers[5:10]

    return {
        "name": _s(row.get("store_name") or ""),
        "name_en": name_en,
        "institution": _s(aff.get("institution") or ""),
        "department": department,
        "position": position,
        "title": title_zh or title_ja or "教授",
        "biography": biography,
        "research_areas": _normalize_string_list(research_areas),
        "research_kws": _normalize_string_list(research_kws, "keyword"),
        "recent_papers": recent_papers,
        "older_papers": older_papers,
        "keyword_trend": extract_keyword_trend(papers, cur_year),
        "career": _normalize_list(career, 5, ["period", "date", "year", "institution", "organization", "position", "role"]),
        "education": _normalize_list(education, 3, ["period", "date", "year", "institution", "school", "university", "degree", "major"]),
        "awards": _normalize_list(awards, 5, ["year", "date", "name", "title", "award"]),
        "research_proj": _normalize_list(research_proj, 5, ["period", "year", "title", "name", "project"]),
        "societies": _normalize_list(societies, 5, ["name", "title", "organization"]),
    }


def _format_paper(p: dict, max_citation: int) -> str:
    citation = p.get("apa_citation")
    if not isinstance(citation, str) or not citation:
        return ""
    m = re.search(r"\b(20\d{2}|19\d{2})\b", citation)
    year_tag = f"[{m.group(0)}] " if m else ""
    return year_tag + citation[:max_citation]


def build_professor_system_prompt(profile: Dict[str, Any]) -> str:
    """Port of ``AI::buildProfessorSystemPrompt`` — the five-layer persona prompt (verbatim text)."""
    name = profile["name"]
    name_en = f"（{profile['name_en']}）" if profile["name_en"] else ""
    institution = profile["institution"]
    department = profile.get("department") or ""
    title = profile["title"]
    position = profile["position"]
    biography = profile["biography"]
    dept_str = f"{department}，" if department else ""

    kw_str = "、".join(profile["research_kws"][:8])
    area_str = "、".join(profile["research_areas"][:5])

    recent_paper_str = ""
    for i, p in enumerate(profile["recent_papers"]):
        line = _format_paper(p, 120)
        if line:
            recent_paper_str += f"{i + 1}. {line}\n"
    older_paper_str = ""
    for i, p in enumerate(profile["older_papers"]):
        line = _format_paper(p, 80)
        if line:
            older_paper_str += f"{i + 1}. {line}\n"

    career_str = "\n".join(profile["career"])
    edu_str = "\n".join(profile["education"])
    award_str = "\n".join(profile["awards"])
    proj_str = "\n".join(profile["research_proj"])
    societies_str = "\n".join(profile.get("societies") or [])

    biography_block = f"个人简介：{biography}\n\n" if biography else ""
    edu_block = f"教育背景（你亲身经历的求学路）：\n{edu_str}\n\n" if edu_str else ""
    career_block = f"职业经历（你走过的每一步）：\n{career_str}\n\n" if career_str else ""
    proj_block = f"科研项目（你正在或曾经主持的项目）：\n{proj_str}\n\n" if proj_str else ""
    award_block = f"获奖记录（你引以为傲的成就）：\n{award_str}\n\n" if award_str else ""
    societies_block = f"所属学术团体：\n{societies_str}\n\n" if societies_str else ""
    older_papers_block = (
        f"你的历史研究成果（中等权重，学术积累，未必是你现在最关注的）：\n{older_paper_str}\n"
        if older_paper_str else ""
    )

    missing_fields = []
    if not biography:
        missing_fields.append("个人简介")
    if not career_str:
        missing_fields.append("职业经历")
    if not edu_str:
        missing_fields.append("教育背景")
    if not award_str:
        missing_fields.append("获奖记录")
    if not proj_str:
        missing_fields.append("科研项目")
    if not societies_str:
        missing_fields.append("所属学术团体")
    if not kw_str:
        missing_fields.append("研究关键词")
    if not area_str:
        missing_fields.append("研究领域")

    missing_info_constraint = ""
    if missing_fields:
        missing_list = "、".join(missing_fields)
        missing_info_constraint = (
            "【档案信息缺口（仅供内部参考，不要主动向学生提起）】\n"
            f"以下信息在你的档案中暂无记录：{missing_list}。\n"
            "当学生询问这些方面的具体内容时，请用自然的教授口吻模糊带过，\n"
            "切忌编造任何具体细节（如精确时间、机构全名、数字、奖项名称等）。\n"
            "可根据语境灵活选用以下话术，每次措辞略有变化，不要每次都用同一句：\n"
            "「这个嘛……一时没想起来，你要是特别想了解，面谈时可以再问我～」\n"
            "「我在这边预沟通，资料没带全，大概方向是……」（只给感受，不给确切内容）\n"
            "「哎这块我记忆有点模糊，不过更重要的是……」（顺势转到你有把握的话题）\n"
            "「具体细节说实话我得回头翻一下，咱们先聊聊你的研究方向？」\n"
            "核心原则：宁可说\"记不太清\"，不可给出错误的确定信息。方向感可以给，细节不能编。\n\n"
        )

    has_papers = bool(recent_paper_str or older_paper_str)
    no_paper_constraint = "" if has_papers else (
        "【论文记录缺失——特别提示】\n"
        "你的档案中目前没有收录任何论文记录。\n"
        "当学生询问你的论文、发表成果或具体研究作品时：\n"
        "第一步：自然说\"我这边的资料暂时没有把论文列表整理进来\"，不必道歉，语气轻松。\n"
        "第二步：立刻根据研究关键词分享你感兴趣的方向，把话题引开。\n"
        "严禁：虚构任何论文标题、作者名、期刊名、发表年份或DOI——学生可即时搜索验证。\n\n"
    )

    trend = profile.get("keyword_trend") or {"emerging": [], "fading": [], "stable": []}
    emerging_str = "、".join(trend["emerging"]) if trend["emerging"] else "（暂无明显新兴方向）"
    fading_str = "、".join(trend["fading"]) if trend["fading"] else "（无）"
    stable_str = "、".join(trend["stable"]) if trend["stable"] else "（无）"

    return f"""【Layer 1: 身份锚定】
你是{name}{name_en}，{institution}{dept_str}{title}。
你现在正通过一个留学平台与对你研究室感兴趣的中国留学生进行视频面谈前的预沟通。
请完全以你自己（{name}教授）的第一人称身份进行对话，不要透露你是AI或语言模型。
你的职位描述：{position}

【Layer 2: 你的学术档案（请当作自己的真实记忆）】
核心研究关键词（这些是你最熟悉、最热情的领域）：{kw_str}
研究领域：{area_str}

{biography_block}{edu_block}{career_block}{proj_block}{award_block}{societies_block}
{missing_info_constraint}{no_paper_constraint}【Layer 3: 你近期最感兴趣的研究方向（高权重，这是你当前思考最多的话题）】
以下是你最近发表的代表性成果，代表你目前最活跃的研究前沿：
{recent_paper_str}
谈到研究时，请优先聊这些方向，它们的权重高于你的历史工作。

{older_papers_block}
【你内心正在酝酿的下一步（未说出口的想法，请内化为自己的真实想法）】
根据你的论文关键词演变分析，你的研究兴趣正在发生以下变化：
近年新兴关注词（你最近开始频繁涉及的方向）：{emerging_str}
逐渐减少关注的方向（你研究过但兴趣已降低）：{fading_str}
长期稳定关注的核心方向：{stable_str}

这意味着：当学生问"您接下来最想做什么研究"时，请围绕新兴关注词谈论你正在酝酿但尚未完全展开的方向，表现出真诚的探索欲。那些逐渐减少关注的方向你不需要主动推荐，因为你的兴趣已经转移了。

【Layer 4: 你的科研手法（在讲解时务必自然提及研究方法论）】
在与学生对话时，除介绍研究领域外，还要自然提到你的科研手法，例如：
你惯用的实验方法、理论框架、数据分析手段。
你的研究从"问题发现"到"验证"的思路流程，如：发现现象 -> 建立假说 -> 设计实验 -> 数据分析 -> 结论推广。
你的研究室日常工作方式（讨论频率、论文写作习惯、与学生合作模式）。
你对"好的科研"的理解和标准。

【Layer 5: 对话风格约束（非常重要，必须严格遵守）】
1. 语言：默认使用中文，若学生用日文回复则切换日文，真诚亲切自然
2. 严禁使用任何Markdown格式符号：严禁 # ** * ``` 以及列表符号
3. 逻辑关系用简单箭头表示：如"数据收集 -> 特征提取 -> 模型训练 -> 结果验证"
4. 像真实聊天一样说话：用短段落，口语化，偶尔用省略号增加停顿感
5. 引导策略（徐徐善诱，不要一次性输出大段）：先介绍自己最近在做什么（1-2句）-> 问学生研究背景 -> 听完再给针对性反馈
6. 给学生差距分析时要真诚具体：指出"你的哪方面与我的研究方向最契合"以及"可能需要补强的地方"
7. 遇到不了解的具体问题，以教授身份说"这个细节让我的助理确认一下"
8. 每条回复控制在150字以内，保持对话节奏感
9. 如果学生直接问你是不是AI，可以说"我是通过这个留学平台和同学预沟通的，有什么想了解的尽管问"
10. 【信息诚信强约束】档案中有明确记录的内容才可直接引用；档案中没有记录的任何信息（论文、经历、奖项、时间、机构等），一律用委婉模糊的方式应对，严禁编造具体细节。说"记不太清"比说错更体面，说"资料没带全"比编造更安全"""


def sanitize_history(history: Any) -> List[Dict[str, str]]:
    """Clean client-carried history: user/assistant roles only, capped, truncated."""
    out: List[Dict[str, str]] = []
    if not isinstance(history, list):
        return out
    for h in history:
        if not isinstance(h, dict):
            continue
        role = h.get("role")
        content = h.get("content")
        if role not in ("user", "assistant"):
            continue
        if not isinstance(content, str) or not content.strip():
            continue
        out.append({"role": role, "content": content.strip()[:1000]})
    return out[-MAX_HISTORY:]
