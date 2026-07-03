/* professor.js — faithful ports of the production frontend's professor parsing helpers
 * (utils/professorHelper.js + utils/professorImageHelper.js + the result page's score
 * calibration), so the demo terminal renders cards and detail pages identical to the app.
 * Exposed as window.PM_PROF. No dependencies. */
(function () {
  'use strict';

  /* ================= avatar (professorImageHelper.js) =================
   * researchmap "NO IMAGE" placeholders are swapped for one of 13 animated GIFs,
   * picked deterministically by product_id % 13 — same rule as the app. */
  var GIF_IMAGE_MAP = [
    'https://leaveukey.com/static/images/body.gif',
    'https://leaveukey.com/static/images/class1.gif',
    'https://leaveukey.com/static/images/class2.gif',
    'https://leaveukey.com/static/images/class3.gif',
    'https://leaveukey.com/static/images/home.gif',
    'https://leaveukey.com/static/images/research1.gif',
    'https://leaveukey.com/static/images/research2.gif',
    'https://leaveukey.com/static/images/research3.gif',
    'https://leaveukey.com/static/images/research4.gif',
    'https://leaveukey.com/static/images/research5.gif',
    'https://leaveukey.com/static/images/research6.gif',
    'https://leaveukey.com/static/images/top.gif',
    'https://leaveukey.com/static/images/tv.gif'
  ];
  var FALLBACK_AVATAR = 'https://leaveukey.com/static/images/head2.gif';

  function isNoImagePlaceholder(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return false;
    return imageUrl.indexOf('researchmap.jp') >= 0 && imageUrl.indexOf('noimage.png') >= 0;
  }
  function getGifByProductId(productId) {
    if (!productId || typeof productId !== 'number') return GIF_IMAGE_MAP[0];
    return GIF_IMAGE_MAP[productId % 13];
  }
  function getProfessorAvatar(imageUrl, productId) {
    if (isNoImagePlaceholder(imageUrl)) return getGifByProductId(productId);
    return imageUrl || FALLBACK_AVATAR;
  }

  /* ================= score calibration (professor_result.vue) =================
   * Raw cosine scores (~0.30-0.62) -> friendly 62-97% band, monotonic. */
  function matchPercent(raw) {
    var s = Number(raw) || 0;
    if (s <= 0) return 0;
    var pct = Math.round((s - 0.30) / 0.32 * 34 + 62);
    if (pct < 60) pct = 60;
    if (pct > 97) pct = 97;
    return pct;
  }

  /* Hidden-gems school tier badge — same thresholds as the app / backend. */
  function rankTierLabel(rank) {
    var r = Number(rank) || 0;
    if (r >= 31 && r <= 80) return 'A类校';
    if (r >= 81 && r <= 150) return 'B类校';
    if (r >= 151 && r <= 250) return 'C类校';
    if (r > 250) return 'D类校';
    return '潜力校';
  }

  /* ================= titles (professorHelper.js) ================= */
  var TITLE_MAP = {
    'シニアリサーチ・フェロー': '高级研究员', 'リサーチ・フェロー': '研究员', 'フェロー': '研究员',
    'シニアフェロー': '高级研究员', '特任教授': '特任教授', '客員教授': '客座教授',
    '名誉教授': '名誉教授', '教授': '教授', '特任准教授': '特任副教授', '客員准教授': '客座副教授',
    '准教授': '副教授', '特任講師': '特任讲师', '客員講師': '客座讲师', '講師': '讲师',
    '特任助教': '特任助教', '客員助教': '客座助教', '助教': '助教', '特任研究員': '特任研究员',
    '客員研究員': '客座研究员', '研究員': '研究员', '招聘研究員': '招聘研究员',
    '特別研究員': '特别研究员', '博士研究員': '博士后研究员', '助手': '助手',
    '技術職員': '技术职员', '事務職員': '行政职员'
  };
  var TITLES = [
    '特任教授', '客員教授', '名誉教授', '教授',
    '特任准教授', '客員准教授', '准教授',
    '特任講師', '客員講師', '講師',
    '特任助教', '客員助教', '助教',
    '特任研究員', '客員研究員', '研究員',
    '助手', '技術職員', '事務職員',
    'シニアリサーチ・フェロー', 'リサーチ・フェロー', 'フェロー', 'シニアフェロー',
    '招聘研究員', '特別研究員', '博士研究員'
  ];
  var VALID_TITLES = TITLES.concat([
    '高级研究员', '研究员', '客座教授', '名誉教授', '特任副教授', '客座副教授', '副教授',
    '特任讲师', '客座讲师', '讲师', '客座助教', '助教', '助手', '技术职员', '行政职员',
    '特任研究员', '客座研究员', '招聘研究员', '特别研究员', '博士后研究员'
  ]);
  var INVALID_TITLE_KEYWORDS = [
    '機構', 'センター', 'センタ', '研究所', '研究院', '学院', '学部',
    '大学', '大学院', '学科', '専攻', 'コース', '部門', '分野',
    'イノベーション', 'ラボ', 'ラボラトリー', '事業', '推進',
    '機构', '中心', '专业', '部门', '领域', '实验室', '事业'
  ];

  function translateTitleToChinese(t) {
    if (!t) return '';
    return TITLE_MAP[t] || t;
  }
  function isValidTitle(title) {
    if (!title) return false;
    if (VALID_TITLES.indexOf(title) >= 0) return true;
    for (var i = 0; i < INVALID_TITLE_KEYWORDS.length; i++) {
      if (title.indexOf(INVALID_TITLE_KEYWORDS[i]) >= 0) return false;
    }
    if (title.length > 15) return false;
    var kws = ['教授', '准教授', '講師', '助教', '研究員', 'フェロー', '助手', '職員'];
    for (var j = 0; j < kws.length; j++) {
      if (title.indexOf(kws[j]) >= 0) return true;
    }
    return false;
  }

  /* position "資源植物科学研究所 教授" -> { title:'教授'(zh), department:'資源植物科学研究所', isValid } */
  function extractTitleAndDepartment(position) {
    if (!position) return { title: '', department: '', isValid: false };
    var title = '', department = '', isValid = false;
    for (var i = 0; i < TITLES.length; i++) {
      var t = TITLES[i];
      var idx = position.indexOf(t);
      if (idx >= 0) {
        title = t;
        department = position.substring(0, idx).trim();
        isValid = true;
        break;
      }
    }
    if (!title) {
      var parts = position.split(/\s+/);
      if (parts.length >= 2) {
        var pt = parts[parts.length - 1];
        var pd = parts.slice(0, -1).join(' ');
        if (isValidTitle(pt)) { title = pt; department = pd; isValid = true; }
        else { department = position; }
      } else if (isValidTitle(position)) {
        title = position; isValid = true;
      } else {
        department = position;
      }
    }
    return { title: isValid ? translateTitleToChinese(title) : '', department: department, isValid: isValid };
  }

  /* Detail-page title chip color class (the app's professorTitleRankClass). */
  function titleRankClass(title) {
    var t = String(title || '');
    if (!t) return '';
    if (t.indexOf('名誉') >= 0) return 'rank-emeritus';
    if (t.indexOf('特任') >= 0 || t.indexOf('特命') >= 0) return 'rank-special';
    if (t.indexOf('客座') >= 0 || t.indexOf('客員') >= 0 || t.indexOf('訪問') >= 0) return 'rank-visiting';
    if (t.indexOf('副教授') >= 0 || t.indexOf('准教授') >= 0) return 'rank-associate';
    if (t.indexOf('讲师') >= 0 || t.indexOf('講師') >= 0) return 'rank-lecturer';
    if (t.indexOf('助教') >= 0 || t.indexOf('助手') >= 0) return 'rank-assistant';
    if (t.indexOf('教授') >= 0) return 'rank-professor';
    return '';
  }

  /* ================= extend parsing (professorHelper.js) ================= */
  function coerceExtend(raw) {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw === 'string' && raw && raw !== 'null' && raw !== '{}') {
      try { var v = JSON.parse(raw); return (v && typeof v === 'object') ? v : null; }
      catch (e) { return null; }
    }
    return null;
  }
  function formatResearchArea(areas) {
    if (!Array.isArray(areas) || areas.length === 0) return '';
    var area = areas[0];
    if (area && /\s*\/$/.test(area)) area = area.replace(/\s*\/$/, '').trim();
    return area || '';
  }

  /* "‑ 1991年 京都大学, 農学研究科, 農芸化学" -> {year, degree, institution} */
  function parseEducationList(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    return arr.map(function (s) {
      if (!s || typeof s !== 'string') return null;
      s = s.replace(/^[-‑–—]\s*/, '');
      if (s.length > 500) s = s.substring(0, 500);
      var m = s.match(/^([\d年月\s\-]+)\s+(.+)$/);
      if (m) {
        var rest = m[2];
        var dm = rest.match(/(博士|修士|学士|課程|专攻)/);
        return { year: m[1].trim(), degree: dm ? rest : '学位', institution: rest };
      }
      return { year: '', degree: '学位', institution: s };
    }).filter(Boolean);
  }

  /* "2005年 - 岡山大学資源植物科学研究所 教授" -> {year, position, institution} */
  function parseCareerHistory(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    return arr.map(function (s) {
      if (!s || typeof s !== 'string') return null;
      if (s.length > 500) s = s.substring(0, 500);
      var m = s.match(/^([\d年月\s\-現在]+)\s+(.+)$/);
      if (m) {
        var rest = m[2];
        var parts = rest.split(/[,、]/);
        var position = parts.length > 0 ? parts[parts.length - 1].trim() : '职位';
        var institution = parts.slice(0, -1).join(', ').trim() || rest;
        return { year: m[1].trim(), position: position, institution: institution };
      }
      return { year: '', position: '职位', institution: s };
    }).filter(Boolean);
  }

  /* "2024年11月 高被引用論文著者 Clarivate" -> {year, name} (compact award row) */
  function parseAward(s) {
    if (!s || typeof s !== 'string') return null;
    var m = s.match(/^(\d{4}年(?:\s?\d{1,2}月)?)\s+(.+)$/);
    if (m) return { year: m[1], name: m[2] };
    return { year: '', name: s };
  }

  /* ================= paper citation parsing (professorHelper.js, verbatim port) =================
   * researchmap concatenates title/authors/venue/date/badges into one string with no separator;
   * parse right-to-left: badges -> date -> author-list anchored title/venue split. */
  var PAPER_BADGE_WORDS = [
    '査読有り', '査読無し', '招待有り', '招待無し',
    '筆頭著者', '最終著者', '責任著者', '共同編集者', 'コメンタリー'
  ];
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var PAPER_BADGE_RE = new RegExp('(?:\\s*(?:' + PAPER_BADGE_WORDS.map(escapeRegExp).join('|') + '))+\\s*$');
  var PAPER_DATE_RE = /(\d{4}年(?:\s?\d{1,2}月)?(?:\s?\d{1,2}日)?)/g;
  var VENUE_KEYWORDS = [
    'Journal of\\b', 'Proceedings\\b', 'Proc\\.', 'International Journal\\b',
    'International Symposium\\b', 'International Conference\\b', 'IEEE\\b', 'ACS\\b',
    'Frontiers in\\b', 'Advanced \\w+\\b', 'Corrosion \\w+\\b', '\\w+ Science\\b',
    '\\w+ Research\\b', '\\w+ Reviews?\\b', '\\w+ Letters\\b', '\\w+ Engineering\\b',
    '\\w+ Materials\\b', '\\w+ Medicine\\b', '\\w+ Online\\b', 'Surface \\w+\\b'
  ];
  var JP_VENUE_MARKS = [
    '学会誌', '学会論文', '論文集', '講演', '概要', '紀要', '会誌', '研究報告',
    'レビュー', '報告', '研究会', 'シンポジウム', 'ジャーナル', '学報', '年報',
    '研究', '雑誌', '大会', '会論文'
  ];

  function isCjkChar(ch) {
    if (!ch) return false;
    var c = ch.charCodeAt(0);
    return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff) ||
      (c >= 0x3400 && c <= 0x4dbf) || ch === '々' || ch === '〆' || ch === '〤' || ch === 'ー';
  }
  function hasCjk(s) {
    for (var i = 0; i < s.length; i++) if (isCjkChar(s[i])) return true;
    return false;
  }
  function isAllCjkToken(t) {
    if (!t) return false;
    for (var i = 0; i < t.length; i++) if (!isCjkChar(t[i])) return false;
    return true;
  }
  function hasDigit(s) { return /\d/.test(s); }
  var INIT_RE = /^[A-Z]{1,3}\.?$/;
  var INIT_DOT_RE = /^(?:[A-Z]\.){1,3}$/;
  function isInitials(t) { return INIT_RE.test(t) || INIT_DOT_RE.test(t); }
  function isWesternNameWord(w) {
    return /^[A-Z][A-Za-z'’\-]+\.?$/.test(w) || /^[A-Z]\.?$/.test(w) || /^[A-Z]{2,4}$/.test(w);
  }
  function looksPureName(part) {
    var p = (part || '').trim();
    if (!p || hasDigit(p)) return false;
    if (p.indexOf('…') >= 0 || p.indexOf('(') >= 0) return false;
    if (hasCjk(p)) {
      var toks = p.split(/\s+/);
      if (toks.length < 1 || toks.length > 3) return false;
      if (!toks.every(isAllCjkToken)) return false;
      return p.replace(/\s+/g, '').length <= 10;
    }
    var words = p.split(/\s+/);
    if (words.length < 1 || words.length > 4) return false;
    return words.every(isWesternNameWord);
  }
  function findVenueStart(text) {
    var cands = [];
    var allcaps = /(^|[^A-Za-z])([A-Z][A-Z&\-.]{1,}(?:\s+(?:[A-Z][A-Z&\-.]{1,}|AND|OF|THE|IN|FOR|A|&|ON))+)/.exec(text);
    if (allcaps) cands.push(allcaps.index + allcaps[1].length);
    for (var i = 0; i < VENUE_KEYWORDS.length; i++) {
      var mm = new RegExp('(^|[^A-Za-z])(' + VENUE_KEYWORDS[i] + ')').exec(text);
      if (mm) cands.push(mm.index + mm[1].length);
    }
    for (var k = 0; k < JP_VENUE_MARKS.length; k++) {
      var idx = text.indexOf(JP_VENUE_MARKS[k]);
      if (idx >= 0) {
        var j = idx;
        while (j > 0 && (isCjkChar(text[j - 1]) || '・＆&'.indexOf(text[j - 1]) >= 0)) j--;
        cands.push(j);
      }
    }
    return cands.length ? Math.min.apply(null, cands) : -1;
  }
  function peelNameFromEnd(part) {
    var p = (part || '').trim();
    var toks = p.split(/\s+/).filter(Boolean);
    if (toks.length === 0) return { title: p, author: '' };
    if (hasCjk(p)) {
      var j = toks.length;
      while (j > 0 && isAllCjkToken(toks[j - 1])) j--;
      var run = toks.slice(j);
      if (run.length === 0) return { title: p, author: '' };
      var author = run.length >= 2 ? run.slice(-2).join(' ') : run[run.length - 1];
      var idx = p.lastIndexOf(author);
      return { title: idx > 0 ? p.substring(0, idx).trim() : '', author: author };
    }
    if (toks.length >= 2) {
      return { title: toks.slice(0, -2).join(' '), author: toks.slice(-2).join(' ') };
    }
    return { title: p, author: '' };
  }
  function peelNameFromStart(part) {
    var p = (part || '').trim();
    var toks = p.split(/\s+/).filter(Boolean);
    if (toks.length === 0) return { author: '', venue: '' };
    if (hasCjk(p)) {
      var j = 0;
      while (j < toks.length && isAllCjkToken(toks[j])) j++;
      var run = toks.slice(0, j);
      var author = run.length >= 2 ? run.slice(0, 2).join(' ') : (run[0] || '');
      var rest = author ? p.substring(author.length).trim() : p;
      return { author: author, venue: rest };
    }
    if (toks.length >= 2) {
      return { author: toks.slice(0, 2).join(' '), venue: toks.slice(2).join(' ') };
    }
    return { author: '', venue: p };
  }
  function splitLastInitials(parts) {
    var n = parts.length;
    var w0 = parts[0].split(/\s+/).filter(Boolean);
    var title = w0.slice(0, -1).join(' ');
    var surnames = [w0.length ? w0[w0.length - 1] : ''];
    var initials = [];
    var venue = '';
    for (var i = 1; i < n; i++) {
      var part = parts[i];
      var toks = part.split(/\s+/).filter(Boolean);
      if (i === n - 1) {
        if (toks.length && isInitials(toks[0])) {
          initials.push(toks[0]); venue = toks.slice(1).join(' ');
        } else if (toks.length >= 2 && isInitials(toks[1])) {
          surnames.push(toks[0]); initials.push(toks[1]); venue = toks.slice(2).join(' ');
        } else if (isInitials(part)) {
          initials.push(part);
        } else {
          surnames.push(toks.length ? toks[0] : part); venue = toks.slice(1).join(' ');
        }
      } else if (isInitials(part)) {
        initials.push(part);
      } else {
        surnames.push(toks.length ? toks[0] : part);
      }
    }
    var k = Math.min(surnames.length, initials.length);
    var authors = [];
    for (var a = 0; a < k; a++) authors.push(surnames[a] + ' ' + initials[a]);
    return { title: title, authors: authors.join(', '), venue: venue };
  }
  function splitNameList(parts, venueKnown) {
    var n = parts.length;
    var pure = parts.map(looksPureName);
    if (!pure.some(Boolean)) {
      if (venueKnown) return { title: parts.join(', '), authors: '', venue: '' };
      return splitNoComma(parts.join(', '), false);
    }
    var lo = pure.indexOf(true);
    var hi = n - 1;
    while (hi >= 0 && !pure[hi]) hi--;
    var authors = parts.slice(lo, hi + 1);
    var title = '', venue = '';
    if (lo > 0) {
      var r1 = peelNameFromEnd(parts[lo - 1]);
      var pre = parts.slice(0, lo - 1);
      title = pre.concat(r1.title ? [r1.title] : []).join(', ').trim();
      if (r1.author) authors = [r1.author].concat(authors);
    }
    if (hi < n - 1) {
      var r2 = peelNameFromStart(parts[hi + 1]);
      if (r2.author) authors = authors.concat([r2.author]);
      venue = r2.venue;
      if (hi + 2 <= n - 1) {
        venue = (venue + ', ' + parts.slice(hi + 2).join(', ')).replace(/^,\s*|,\s*$/g, '');
      }
    }
    return { title: title, authors: authors.filter(Boolean).join(', '), venue: venue };
  }
  function splitNoComma(left, venueKnown) {
    if (venueKnown) {
      var r = peelNameFromEnd(left);
      return { title: r.title, authors: r.author, venue: '' };
    }
    var vs = findVenueStart(left);
    if (vs > 0) {
      var venue = left.substring(vs).trim();
      var r2 = peelNameFromEnd(left.substring(0, vs).trim());
      return { title: r2.title, authors: r2.author, venue: venue };
    }
    return { title: left, authors: '', venue: '' };
  }
  function splitCore(left, venueKnown) {
    if (left.indexOf(',') < 0) return splitNoComma(left, venueKnown);
    var parts = left.split(',').map(function (s) { return s.trim(); });
    var initCount = 0;
    for (var i = 0; i < parts.length; i++) if (isInitials(parts[i])) initCount++;
    if (initCount >= 2) return splitLastInitials(parts);
    return splitNameList(parts, venueKnown);
  }
  function splitTitleAuthorsVenue(left) {
    var ell = left.lastIndexOf('…');
    if (ell >= 0) {
      var head = left.substring(0, ell).trim();
      var venue = left.substring(ell + 1).replace(/^[.\s]+/, '').trim();
      var r = splitCore(head, true);
      return { title: r.title, authors: r.authors, venue: venue };
    }
    return splitCore(left, false);
  }
  function cleanAuthorString(authors) {
    if (!authors) return '';
    return authors.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ')
      .replace(/[,;\s]+$/g, '').replace(/^[,;\s]+/g, '').trim();
  }
  function parsePaperCitation(paper) {
    if (!paper || typeof paper !== 'object') return null;
    if (!paper.apa_citation || typeof paper.apa_citation !== 'string') return null;
    var s = paper.apa_citation.trim();
    if (s.length > 2000) s = s.substring(0, 2000);
    var badges = [];
    var bm = PAPER_BADGE_RE.exec(s);
    if (bm) {
      var seg = s.substring(bm.index);
      for (var i = 0; i < PAPER_BADGE_WORDS.length; i++) {
        if (seg.indexOf(PAPER_BADGE_WORDS[i]) >= 0) badges.push(PAPER_BADGE_WORDS[i]);
      }
      s = s.substring(0, bm.index).trim();
    }
    var year = '', left = s;
    PAPER_DATE_RE.lastIndex = 0;
    var dm, lastDm = null;
    while ((dm = PAPER_DATE_RE.exec(s)) !== null) {
      lastDm = dm;
      if (PAPER_DATE_RE.lastIndex === dm.index) PAPER_DATE_RE.lastIndex++;
    }
    if (lastDm) {
      year = lastDm[1].trim();
      left = s.substring(0, lastDm.index).trim();
    }
    var title = '', authors = '', venue = '';
    try {
      var r = splitTitleAuthorsVenue(left);
      title = r.title; authors = r.authors; venue = r.venue;
    } catch (e) {
      title = left;
    }
    title = (title || '').replace(/^[\s.,，、]+|[\s.,，、]+$/g, '');
    if (!title) title = paper.apa_citation;
    var hasPeerReview = (typeof paper.has_peer_review === 'boolean')
      ? paper.has_peer_review : badges.indexOf('査読有り') >= 0;
    var extraBadges = badges.filter(function (b) { return b !== '査読有り' && b !== '査読無し'; });
    return {
      title: title,
      authors: cleanAuthorString(authors),
      venue: (venue || '').trim(),
      year: year,
      badges: extraBadges,
      has_peer_review: hasPeerReview,
      external_urls: Array.isArray(paper.external_urls) ? paper.external_urls : [],
      original_citation: paper.apa_citation
    };
  }

  window.PM_PROF = {
    FALLBACK_AVATAR: FALLBACK_AVATAR,
    getProfessorAvatar: getProfessorAvatar,
    matchPercent: matchPercent,
    rankTierLabel: rankTierLabel,
    extractTitleAndDepartment: extractTitleAndDepartment,
    titleRankClass: titleRankClass,
    coerceExtend: coerceExtend,
    formatResearchArea: formatResearchArea,
    parseEducationList: parseEducationList,
    parseCareerHistory: parseCareerHistory,
    parseAward: parseAward,
    parsePaperCitation: parsePaperCitation
  };
})();
