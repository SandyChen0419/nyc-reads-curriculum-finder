import csv
import io
import json
import os
import re
import time
import logging
from datetime import date
from urllib.parse import urlencode

import requests

try:  # Optional dependency for robust CSV + UTF-8 handling
    import pandas as pd  # type: ignore
except Exception:  # noqa: BLE001
    pd = None

logger = logging.getLogger("api")
logger.setLevel(logging.INFO)

# Track last-seen header order for logging/index mapping
LAST_PACING_HEADERS_ORDER = []
LAST_SCHOOLS_HEADERS_ORDER = []
LAST_FETCH_INFO = {
    'schools': {'used_url': '', 'candidates': []},
    'pacing': {'used_url': '', 'candidates': []},
}

# Configuration for Google Sheet source
SHEET_ID = os.environ.get('SHEET_ID', '12xrUodG0RyTpAlfo6_CO7phNY2LdzjH9mqieJQIV3Xs').strip()
GID_FOR_PACING = os.environ.get('GID_FOR_PACING', os.environ.get('SHEET_GID_PACING', '')).strip()
GID_FOR_SCHOOLS = os.environ.get('GID_FOR_SCHOOLS', os.environ.get('SHEET_GID_SCHOOLS', '')).strip()

DEFAULT_PACING_PUBHTML = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSE0Mlty0JFy27H58nEULY3GNCsvwyCfIw4CQvf2_KbXsGXa4GIhU_SQojf5eXdz1MkKO7se9lJyjZT/pubhtml?gid=0&single=true'
DEFAULT_SCHOOLS_PUBHTML = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT4AF0prElSWZtki_k9Xv1KPA01lARZf5-ctTFz9vi2qnTpLe2ji_M7aXi2v_Uo-u2_NuizVhINlaua/pubhtml?gid=1673123403&single=true'


def json_response(data: dict, status: int = 200, extra_headers: dict | None = None):
    body = json.dumps(data, ensure_ascii=False)
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    }
    if extra_headers:
        headers.update(extra_headers)
    return (body, status, headers)


def _pubhtml_to_csv(url: str) -> str:
    u = (url or '').strip()
    if not u:
        return ''
    u = u.replace('/pubhtml', '/pub')
    m = re.search(r'[?&]gid=([^&#]+)', u)
    gid = m.group(1) if m else ''
    base = u.split('?')[0]
    if gid:
        return f"{base}?output=csv&gid={gid}"
    return base.replace('/pub', '/gviz/tq') + '?tqx=out:csv'


PACING_CSV = os.environ.get(
    'PACING_CSV',
    'https://docs.google.com/spreadsheets/d/12xrUodG0RyTpAlfo6_CO7phNY2LdzjH9mqieJQIV3Xs/export?format=csv&gid=1707233296'
).strip()
SCHOOLS_CSV = os.environ.get('SCHOOLS_CSV', _pubhtml_to_csv(DEFAULT_SCHOOLS_PUBHTML)).strip()

SHEET_BASE_PUB = os.environ.get('SHEET_BASE_PUB', f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/pub').strip()
TAB_PACING = os.environ.get('TAB_PACING', 'Pacing Guide')
TAB_SCHOOLS = os.environ.get('TAB_SCHOOLS', 'School Directories')

def _norm_key_part(s: str) -> str:
    return str(s or '').strip().lower()


def _normalize_header(h):
    return re.sub(r"[\s/]+", "_", (h or "").strip().lower())


def _csv_from_text(text):
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return []
    headers = [_normalize_header(h) for h in rows[0]]
    result = []
    for r in rows[1:]:
        obj = {}
        for idx, h in enumerate(headers):
            obj[h] = (r[idx] if idx < len(r) else '').strip()
        result.append(obj)
    return result


def normalize_text(s):
    return (s or '').replace('’', "'").replace('“', '"').replace('”', '"').strip()


def split_genres(s: str):
    if not s:
        return []
    unified = str(s).replace('\r\n', '\n').replace('\r', '\n')
    return [g.strip() for g in unified.split('\n') if g.strip()]


def split_questions(s: str):
    s = normalize_text(s)
    if not s:
        return []
    parts = re.split(r"\?\s*|\n+|;+", s)
    items = []
    for p in parts:
        t = (p or '').strip()
        if not t:
            continue
        if not t.endswith('?'):
            t = t + '?'
        items.append(t)
    seen = set()
    out = []
    for q in items:
        if q not in seen:
            seen.add(q)
            out.append(q)
    return out


def _split_date_range(cell: str):
    if not cell:
        return '', ''
    txt = str(cell).strip().replace('–', '-').replace('—', '-')
    parts = [p.strip() for p in txt.split('-') if p.strip()]
    if len(parts) != 2:
        return '', ''
    return parts[0], parts[1]


def _extract_title_and_url(cell_text: str):
    s = str(cell_text or '').strip()
    if not s:
        return '', ''
    m = re.search(r'(?i)HYPERLINK\(\s*"(.*?)"\s*,\s*"(.*?)"\s*\)', s)
    if m:
        url = m.group(1).strip()
        title = normalize_text(m.group(2))
        return (title or url, url)
    m = re.search(r"(?i)HYPERLINK\(\s*'(.*?)'\s*,\s*'(.*?)'\s*\)", s)
    if m:
        url = m.group(1).strip()
        title = normalize_text(m.group(2))
        return (title or url, url)
    if ' | ' in s:
        left, right = s.split(' | ', 1)
        title = normalize_text(left)
        url = right.strip()
        return (title or url, url)
    um = re.search(r"(https?://\S+)", s)
    if um:
        url = um.group(1).rstrip(').,;')
        title = s[: um.start()].strip().strip(':-').strip() or url
        return (normalize_text(title), url)
    return (normalize_text(s), '')


def _collect_reading_list_items_strict(row: dict):
    if not row:
        return []
    items = []
    for idx in range(1, 21):
        title_key = f"reading_list_{idx}"
        link_key = f"reading_url_{idx}"
        cover_key = f"coverimageurl_{idx}"
        raw_title = row.get(title_key, '')
        raw_url = row.get(link_key, '')
        raw_cover = row.get(cover_key, '') or row.get(f"cover_image_url_{idx}", '')
        if not str(raw_title).strip() and not (str(raw_url).strip() or str(raw_cover).strip()):
            continue
        title_text, link_url = _extract_title_and_url(str(raw_title))
        title_text = (title_text or '').strip()
        url = str(raw_url).strip() or (str(link_url).strip() if link_url else '')
        cover = str(raw_cover).strip()
        if not title_text:
            continue
        items.append({
            'title': title_text,
            'url': (url if url else None),
            'coverImageUrl': (cover if cover else None),
        })
    return items


def _reading_related_keys(headers):
    if not headers:
        return []
    tokens = [
        'reading', 'readalike', 'read_alike', 'texts', 'text', 'books', 'book', 'core_text', 'supplemental', 'library'
    ]
    out = []
    for h in headers:
        try:
            if any(tok in h for tok in tokens) and not h.startswith('recommended'):
                out.append(h)
        except Exception:
            continue
    return sorted(set(out))


def _build_csv_urls(sheet_name, sheet_gid=''):
    urls = []
    if SHEET_ID and sheet_gid:
        urls.append(f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={sheet_gid}")
    base = SHEET_BASE_PUB
    if base:
        if '/gviz/tq' in base:
            sep = '&' if '?' in base else '?'
            urls.append(f"{base}{sep}tqx=out:csv&{urlencode({'sheet': sheet_name})}")
        else:
            gviz = base.replace('/pubhtml', '/gviz/tq').replace('/pub', '/gviz/tq')
            sep = '&' if '?' in gviz else '?'
            urls.append(f"{gviz}{sep}tqx=out:csv&{urlencode({'sheet': sheet_name})}")
            csv_base = base if base.endswith('/pub') else base.replace('/pubhtml', '/pub')
            sep2 = '&' if '?' in csv_base else '?'
            urls.append(f"{csv_base}{sep2}output=csv&{urlencode({'sheet': sheet_name})}")
    return urls


def _fetch_sheet(sheet_name, sheet_gid=''):
    last_err = None
    for url in _build_csv_urls(sheet_name, sheet_gid):
        try:
            resp = requests.get(url, timeout=20)
            resp.raise_for_status()
            text = resp.text.lstrip('\ufeff').strip()
            if not text:
                last_err = RuntimeError('empty csv')
                continue
            rows = _csv_from_text(text)
            if rows:
                return rows
            last_err = RuntimeError('no rows parsed')
        except Exception as e:  # noqa: BLE001
            last_err = e
    raise RuntimeError(f"Failed to load sheet '{sheet_name}': {last_err}")


def _fetch_csv_from_url(url: str, context: str = ''):
    normalized = url
    if 'pubhtml' in (url or ''):
        normalized = _pubhtml_to_csv(url)
    sep = '&' if ('?' in normalized) else '?'
    live_url = f"{normalized}{sep}_cb={int(time.time())}"
    resp = requests.get(live_url, timeout=20, headers={
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
    })
    resp.raise_for_status()
    if context == 'pacing':
        try:
            logger.info("[Pacing] export_url %s", live_url)
            logger.info("[Pacing] status %s", getattr(resp, 'status_code', 'n/a'))
        except Exception:
            pass
    if pd is not None:
        decoded = resp.content.decode('utf-8', errors='replace')
        if context == 'pacing':
            try:
                logger.info("[Pacing] body_head %s", decoded[:200])
            except Exception:
                pass
        df = pd.read_csv(io.StringIO(decoded), keep_default_na=False)
        records = df.to_dict(orient='records')
        rows = []
        for rec in records:
            obj = {}
            for k, v in rec.items():
                nk = _normalize_header(str(k))
                obj[nk] = str(v).strip() if v is not None else ''
            rows.append(obj)
        if context == 'pacing':
            try:
                headers_raw = [str(c) for c in df.columns]
                logger.info("[Pacing] header_count %d", len(headers_raw))
                read_cover = [h for h in headers_raw if re.search(r"(reading|cover)", h, re.I)]
                logger.info("[Pacing] reading/cover headers %s", read_cover)
            except Exception:
                pass
        return rows
    decoded = resp.content.decode('utf-8', errors='replace').lstrip('\ufeff').strip()
    if context == 'pacing':
        try:
            logger.info("[Pacing] body_head %s", decoded[:200])
            first_line = decoded.splitlines()[0] if decoded else ''
            raw_headers = [h.strip() for h in first_line.split(',')] if first_line else []
            logger.info("[Pacing] header_count %d", len(raw_headers))
            read_cover = [h for h in raw_headers if re.search(r"(reading|cover)", h, re.I)]
            logger.info("[Pacing] reading/cover headers %s", read_cover)
        except Exception:
            pass
    return _csv_from_text(decoded)


def _fetch_schools_csv():
    global LAST_SCHOOLS_HEADERS_ORDER, LAST_FETCH_INFO
    candidates = []
    # 1) SHEET_ID + GID
    if SHEET_ID and GID_FOR_SCHOOLS:
        candidates.append(f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID_FOR_SCHOOLS}")
    # 2) Explicit CSV with gid
    if SCHOOLS_CSV and 'gid=' in SCHOOLS_CSV:
        candidates.append(SCHOOLS_CSV)
    # 2b) Published School Directory URL -> force convert to CSV (ensures correct gid 1673123403)
    if DEFAULT_SCHOOLS_PUBHTML:
        candidates.append(_pubhtml_to_csv(DEFAULT_SCHOOLS_PUBHTML))
    # 3) Build from tab name as fallback
    for u in _build_csv_urls(TAB_SCHOOLS, GID_FOR_SCHOOLS):
        candidates.append(u)
    # Deduplicate preserving order
    seen = set(); cands = []
    for u in candidates:
        if u not in seen:
            cands.append(u); seen.add(u)
    LAST_FETCH_INFO['schools']['candidates'] = cands
    last_err = None
    for url in cands:
        try:
            rows = _fetch_csv_from_url(url)
            if rows:
                LAST_SCHOOLS_HEADERS_ORDER = list(rows[0].keys())
                LAST_FETCH_INFO['schools']['used_url'] = url
                return rows
            last_err = RuntimeError('no rows parsed')
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"Failed to load School Directories CSV: {last_err}")


def _fetch_pacing_csv():
    global LAST_PACING_HEADERS_ORDER, LAST_FETCH_INFO
    candidates = []
    # 1) Explicit PACING_CSV
    if PACING_CSV:
        candidates.append(PACING_CSV)
    # 2) SHEET_ID + GID
    if SHEET_ID and GID_FOR_PACING:
        candidates.append(f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID_FOR_PACING}")
    # 3) Build from tab name
    for u in _build_csv_urls(TAB_PACING, GID_FOR_PACING):
        candidates.append(u)
    # Deduplicate
    seen = set(); cands = []
    for u in candidates:
        if u not in seen:
            cands.append(u); seen.add(u)
    LAST_FETCH_INFO['pacing']['candidates'] = cands
    last_err = None
    for url in cands:
        try:
            rows = _fetch_csv_from_url(url, context='pacing')
            if rows:
                LAST_PACING_HEADERS_ORDER = list(rows[0].keys())
                LAST_FETCH_INFO['pacing']['used_url'] = url
                return rows
            last_err = RuntimeError('no rows parsed')
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"Failed to load Pacing CSV: {last_err}")


def _md_to_date(md: str, year: int) -> date:
    md = (md or '').strip()
    if not md:
        raise ValueError('empty month-day')
    m = re.match(r"^(\d{1,2})[./\-](\d{1,2})$", md)
    if not m:
        from datetime import datetime
        dt = datetime.strptime(md, '%b %d')
        return date(year, dt.month, dt.day)
    month = int(m.group(1))
    day = int(m.group(2))
    return date(year, month, day)


def _resolve_range(start_md: str, end_md: str, ref: date):
    s = _md_to_date(start_md, ref.year)
    e = _md_to_date(end_md, ref.year)
    if e >= s:
        return s, e
    if s <= ref:
        return s, _md_to_date(end_md, ref.year + 1)
    return _md_to_date(start_md, ref.year - 1), e


def _normalize_school_directories(rows):
    districts = set()
    schools_by_district = {}
    grades = set()
    curricula = set()
    district_candidates = {
        'district', 'district_#', 'district_number', 'district_no', 'district_id', 'districtid',
        _normalize_header('District #'), _normalize_header('District')
    }
    school_candidates = {
        _normalize_header('School Name - NYC DOE'), 'school_name_-_nyc_doe', 'school_name_nyc_doe',
        'school_name', 'school'
    }
    curriculum_candidates = { _normalize_header('Curriculum'), 'curriculum', 'literacy_curriculum' }

    def pick_value(row, candidates, contains_token=None):
        for key in candidates:
            val = row.get(key)
            if val:
                return val
        if contains_token:
            for k, v in row.items():
                if contains_token in k and v:
                    return v
        return ''

    for r in rows:
        district = pick_value(r, district_candidates, contains_token='district')
        school = pick_value(r, school_candidates, contains_token='school')
        curriculum = pick_value(r, curriculum_candidates, contains_token='curriculum')
        if district and school:
            districts.add(district)
            schools_by_district.setdefault(district, set()).add(school)
        if curriculum:
            curricula.add(curriculum)
        grade_cell = (
            r.get('grade') or r.get('grades') or r.get('grades_served')
            or r.get('grade_level') or r.get('grade_levels') or ''
        )
        if grade_cell:
            parts = re.split(r"[^0-9kK]+", grade_cell)
            for p in parts:
                p = p.strip()
                if not p:
                    continue
                if p.lower() == 'k':
                    grades.add('K')
                elif p.isdigit():
                    grades.add(p)

    districts_list = sorted(districts)
    grades_list = sorted(grades, key=lambda g: (g != 'K', int(g) if g.isdigit() else 0))
    curricula_list = sorted(curricula)
    schools_by_district_list = {d: sorted(list(s)) for d, s in schools_by_district.items()}
    return {
        'districts': districts_list,
        'schoolsByDistrict': schools_by_district_list,
        'grades': grades_list,
        'curricula': curricula_list,
    }


def _meta_from_pacing(rows):
    districts = set()
    schools_by_district = {}
    grades = set()
    curricula = set()
    for r in rows:
        district = r.get('district') or r.get('district_#') or r.get('district_number') or ''
        school = r.get('school') or r.get('school_name') or r.get(_normalize_header('School Name - NYC DOE')) or ''
        grade = r.get('grade') or r.get('grade_level') or ''
        curriculum = r.get('curriculum') or ''
        if district and school:
            districts.add(district)
            schools_by_district.setdefault(district, set()).add(school)
        if grade:
            if str(grade).lower() == 'k':
                grades.add('K')
            elif str(grade).isdigit():
                grades.add(str(grade))
        if curriculum:
            curricula.add(curriculum)
    return {
        'districts': sorted(districts),
        'schoolsByDistrict': {d: sorted(list(s)) for d, s in schools_by_district.items()},
        'grades': sorted(grades, key=lambda g: (g != 'K', int(g) if g.isdigit() else 0)),
        'curricula': sorted(curricula),
    }

def _normalize_grade_tokens(cell: str) -> list[str]:
    """
    Normalize a grade cell (e.g., 'K-5', '6–8', 'K,1,2,3', 'PK') into tokens like ['PK','K','1',...,'12'].
    """
    if not cell:
        return []
    txt = str(cell).strip()
    if not txt:
        return []
    txt = txt.replace('–', '-').replace('—', '-')
    out: list[str] = []
    def add(tok: str):
        t = tok.strip().upper()
        if not t:
            return
        # Map "OK" (often used to denote K) to "K"
        if t == 'OK':
            t = 'K'
        if t in ('PRE-K', 'PREK', 'P K', 'PK'):
            t = 'PK'
        if t in ('KDG', 'KINDERGARTEN'):
            t = 'K'
        if t == 'PK' or t == 'K' or t.isdigit():
            if t not in out:
                out.append(t)
    # First split by comma/semicolon/slash; if none, we'll split by whitespace later
    prelim = re.split(r"[,;/]+", txt)
    if len(prelim) == 1:
        parts_iter = [prelim[0]]
    else:
        parts_iter = prelim
    for part in parts_iter:
        s = part.strip()
        if not s:
            continue
        if '-' in s:
            a, b = [x.strip().upper() for x in s.split('-', 1)]
            def to_num(x: str) -> int:
                return 0 if x == 'PK' else (1 if x == 'K' else (int(x) if x.isdigit() else -1))
            def from_num(n: int) -> str:
                return 'PK' if n == 0 else ('K' if n == 1 else str(n))
            sa, sb = to_num(a), to_num(b)
            if sa >= 0 and sb >= 0:
                if sa <= sb:
                    rng = range(sa, sb + 1)
                else:
                    rng = range(sb, sa + 1)
                for n in rng:
                    add(from_num(n))
                continue
        # If still a long whitespace-delimited list like "OK 1 2 3 4", split by spaces
        subs = re.split(r"\s+", s)
        if len(subs) > 1:
            for sub in subs:
                add(sub)
        else:
            add(s)
    return out


def build_meta():
    try:
        schools_rows = _fetch_schools_csv()
    except Exception:
        schools_rows = []
    try:
        pacing_rows = _fetch_pacing_csv()
    except Exception:
        pacing_rows = []
    districts_set = set()
    schools_list = []
    curricula_set = set()
    grades_set = set()
    grades_by_school: dict[str, list[str]] = {}
    district_candidates = {
        _normalize_header('District #'), 'district', 'district_number', 'district_no',
        'district_id', 'districtid'
    }
    school_candidates = {
        _normalize_header('School Name - NYC DOE'), 'school_name_-_nyc_doe', 'school_name_nyc_doe',
        'school_name', 'school'
    }
    curriculum_candidates = { _normalize_header('Curriculum'), 'curriculum', 'literacy_curriculum' }
    # Helper to pick flexible header names
    def pick_value(row, candidates, contains_token=None):
        for key in candidates:
            val = row.get(key)
            if val:
                return val
        if contains_token:
            for k, v in row.items():
                if contains_token in k and v:
                    return v
        return ''
    missing_counts = {'district': 0, 'school': 0, 'grade': 0, 'curriculum': 0}

    def extract_district_number(row: dict) -> str:
        # Prefer explicit District # / number
        preferred = [ _normalize_header('District #'), 'district_number', 'district_no' ]
        for k in preferred:
            v = row.get(k)
            if v:
                m = re.search(r"(\d+)", str(v))
                if m:
                    return m.group(1)
        # Fallback: any 'district' containing a number
        v2 = pick_value(row, [], contains_token='district')
        if v2:
            m = re.search(r"(\d+)", str(v2))
            if m:
                return m.group(1)
        return ''

    def extract_school_name(row: dict) -> str:
        for k in school_candidates:
            v = row.get(k)
            if v:
                return str(v).strip()
        v2 = pick_value(row, [], contains_token='school')
        return str(v2 or '').strip()

    for r in schools_rows:
        district = extract_district_number(r)
        school = extract_school_name(r)
        curriculum = ''
        for key in curriculum_candidates:
            val = r.get(key)
            if val:
                curriculum = str(val).strip()
                break
        # Column E (grades served) normalized into tokens
        grade_cell = (
            r.get('grade') or r.get('grades') or r.get('grades_served')
            or r.get('grade_level') or r.get('grade_levels') or ''
        )
        school_grade_tokens = _normalize_grade_tokens(str(grade_cell))
        if not district: missing_counts['district'] += 1
        if not school: missing_counts['school'] += 1
        if not grade_cell: missing_counts['grade'] += 1
        if not curriculum: missing_counts['curriculum'] += 1
        if district:
            districts_set.add(district)
        if district and school:
            schools_list.append({'district': district, 'school': school, 'grades': school_grade_tokens})
            # Build lookup key (district|school), normalized like the UI
            key = f"{_norm_key_part(district)}|{_norm_key_part(school)}"
            grades_by_school[key] = school_grade_tokens
            # Also build a by-school-name map per requirements
        if curriculum:
            curricula_set.add(curriculum)
        for gt in school_grade_tokens:
            grades_set.add(gt)
    for r in pacing_rows:
        grade = r.get(_normalize_header('Grade Level')) or r.get('grade') or r.get('grade_level') or ''
        curriculum = r.get(_normalize_header('Curriculum')) or r.get('curriculum') or ''
        if str(grade).strip():
            g = str(grade).strip()
            grades_set.add('K' if g.lower() == 'k' else g)
        if curriculum:
            curricula_set.add(curriculum.strip())
    if not grades_set and schools_rows:
        for r in schools_rows:
            grade_cell = (
                r.get('grade') or r.get('grades') or r.get('grades_served')
                or r.get('grade_level') or r.get('grade_levels') or ''
            )
            if not grade_cell:
                continue
            parts = re.split(r"[^0-9kK]+", str(grade_cell))
            for p in parts:
                p = (p or '').strip()
                if not p:
                    continue
                if p.lower() == 'k':
                    grades_set.add('K')
                elif p.isdigit():
                    grades_set.add(p)
    grades_sorted = sorted(grades_set, key=lambda g: (g != 'K', int(g) if str(g).isdigit() else 0))
    if not schools_list and pacing_rows:
        derived = _meta_from_pacing(pacing_rows)
        for d in derived.get('districts', []):
            districts_set.add(d)
        sbd = derived.get('schoolsByDistrict') or {}
        for d, schools in sbd.items():
            for s in schools:
                schools_list.append({'district': d, 'school': s})
        for c in derived.get('curricula', []):
            curricula_set.add(c)
        for g in derived.get('grades', []):
            grades_set.add(g)
        grades_sorted = sorted(grades_set, key=lambda g: (g != 'K', int(g) if str(g).isdigit() else 0))
    # Build schoolsByDistrict map (friendly for clients)
    schools_by_district_map: dict[str, list[str]] = {}
    for item in schools_list:
        d = item['district']; s = item['school']
        schools_by_district_map.setdefault(d, []).append(s)
    for d in list(schools_by_district_map.keys()):
        schools_by_district_map[d] = sorted(list(set(schools_by_district_map[d])))
    # Also build mapping keyed by school name only
    grades_by_school_name: dict[str, list[str]] = {}
    for item in schools_list:
        grades_by_school_name[item['school']] = item.get('grades') or []

    meta_out = {
        'districts': sorted(districts_set),
        'schools': sorted(schools_list, key=lambda x: (x['district'], x['school'])),
        'grades': grades_sorted,
        'curricula': sorted(curricula_set),
        'schoolsByDistrict': schools_by_district_map,
        'gradesBySchool': grades_by_school_name,
    }
    # Attach light debug summary for troubleshooting (not heavy rows)
    try:
        meta_out['_debug_summary'] = {
            'row_count_raw': len(schools_rows),
            'header_row': list(schools_rows[0].keys()) if schools_rows else [],
            'missing_field_counts': missing_counts,
        }
    except Exception:
        pass
    return meta_out

def build_meta_debug():
    """
    Returns detailed debug info for meta building without affecting /api/meta output.
    """
    try:
        schools_rows = _fetch_schools_csv()
    except Exception as e:
        schools_rows = []
        logger.error("Fetch schools failed: %s", e)
    try:
        pacing_rows = _fetch_pacing_csv()
    except Exception as e:
        pacing_rows = []
        logger.error("Fetch pacing failed: %s", e)
    header_row = list(schools_rows[0].keys()) if schools_rows else []
    first_3 = schools_rows[:3] if schools_rows else []
    # Compute missing field counts with flexible mapping
    district_candidates = {
        _normalize_header('District #'), 'district', 'district_number', 'district_no',
        'district_id', 'districtid'
    }
    school_candidates = {
        _normalize_header('School Name - NYC DOE'), 'school_name_-_nyc_doe', 'school_name_nyc_doe',
        'school_name', 'school'
    }
    curriculum_candidates = { _normalize_header('Curriculum'), 'curriculum', 'literacy_curriculum' }
    def pick_value(row, candidates, contains_token=None):
        for key in candidates:
            val = row.get(key)
            if val:
                return val
        if contains_token:
            for k, v in row.items():
                if contains_token in k and v:
                    return v
        return ''
    missing = {'district': 0, 'school': 0, 'grade': 0, 'curriculum': 0}
    for r in schools_rows:
        d = ''
        for key in district_candidates:
            val = r.get(key)
            if val: d = str(val).strip(); break
        if not d: d = str(pick_value(r, [], contains_token='district') or '').strip()
        s = ''
        for key in school_candidates:
            val = r.get(key)
            if val: s = str(val).strip(); break
        if not s: s = str(pick_value(r, [], contains_token='school') or '').strip()
        c = ''
        for key in curriculum_candidates:
            val = r.get(key)
            if val: c = str(val).strip(); break
        gcell = r.get('grade') or r.get('grades') or r.get('grades_served') or r.get('grade_level') or r.get('grade_levels') or ''
        if not d: missing['district'] += 1
        if not s: missing['school'] += 1
        if not gcell: missing['grade'] += 1
        if not c: missing['curriculum'] += 1
    debug = {
        'sheet_urls_used': {
            'schools': LAST_FETCH_INFO['schools']['used_url'],
            'pacing': LAST_FETCH_INFO['pacing']['used_url'],
        },
        'tabs_gids_used': {
            'TAB_SCHOOLS': TAB_SCHOOLS,
            'TAB_PACING': TAB_PACING,
            'GID_FOR_SCHOOLS': GID_FOR_SCHOOLS,
            'GID_FOR_PACING': GID_FOR_PACING,
        },
        'candidates': {
            'schools': LAST_FETCH_INFO['schools']['candidates'],
            'pacing': LAST_FETCH_INFO['pacing']['candidates'],
        },
        'row_count_raw': len(schools_rows),
        'header_row': header_row,
        'first_3_rows': first_3,
        'missing_field_counts': missing,
    }
    return debug


def build_modules(curriculum: str, grade: str):
    if not curriculum or not grade:
        return {'modules': []}
    try:
        pacing_rows = _fetch_pacing_csv()
    except Exception:
        pacing_rows = []
    modules = []
    for r in pacing_rows:
        r_curr = normalize_text((r.get(_normalize_header('Curriculum')) or r.get('curriculum') or '').strip())
        r_grade = normalize_text((r.get(_normalize_header('Grade Level')) or r.get('grade') or r.get('grade_level') or '').strip())
        if r_curr != normalize_text(curriculum) or str(r_grade) != str(grade):
            continue
        module_number = (r.get(_normalize_header('Module')) or r.get('module') or r.get('module_number') or '').strip()
        module_title = normalize_text((r.get(_normalize_header('Theme')) or r.get('module_title') or r.get('theme') or '').strip())
        start_md = (r.get(_normalize_header('start_md')) or r.get('start_md') or r.get('start') or '').strip()
        end_md = (r.get(_normalize_header('end_md')) or r.get('end_md') or r.get('end') or '').strip()
        if not (start_md and end_md):
            dr = (r.get(_normalize_header('Date Range')) or r.get('date_range') or '').strip()
            s_md, e_md = _split_date_range(dr)
            start_md = start_md or s_md
            end_md = end_md or e_md
        if not module_number:
            continue
        try:
            num = int(str(module_number).strip())
        except Exception:
            m = re.search(r"(\d+)", str(module_number))
            num = int(m.group(1)) if m else 0
        modules.append({
            'module_number': num,
            'module_title': module_title,
            'start_md': start_md,
            'end_md': end_md,
        })
    modules.sort(key=lambda m: int(m.get('module_number') or 0))
    return {'modules': modules}


def build_search(params: dict):
    q_date = (params.get('date') or '').strip()
    q_district = (params.get('district') or '').strip()
    q_school = (params.get('school') or '').strip()
    q_grade = (params.get('grade') or '').strip()
    ref = None
    try:
        if q_date:
            y, m, d = [int(x) for x in q_date.split('-')]
            ref = date(y, m, d)
    except Exception:
        ref = None
    try:
        schools_rows = _fetch_schools_csv()
    except Exception:
        schools_rows = []
    resolved_curriculum = ''
    for r in schools_rows:
        rd = (r.get(_normalize_header('District #')) or r.get('district') or '').strip()
        rs = (r.get(_normalize_header('School Name - NYC DOE')) or r.get('school') or '').strip()
        if rd == q_district and rs == q_school:
            resolved_curriculum = (r.get(_normalize_header('Curriculum')) or r.get('curriculum') or '').strip()
            if resolved_curriculum:
                break
    try:
        pacing_rows = _fetch_pacing_csv()
    except Exception:
        pacing_rows = []
    results = []
    for r in pacing_rows:
        curriculum = (r.get(_normalize_header('Curriculum')) or r.get('curriculum') or '').strip()
        grade = (r.get(_normalize_header('Grade Level')) or r.get('grade') or r.get('grade_level') or '').strip()
        start_md = (r.get(_normalize_header('start_md')) or r.get('start_md') or r.get('start') or '').strip()
        end_md = (r.get(_normalize_header('end_md')) or r.get('end_md') or r.get('end') or '').strip()
        if not (start_md and end_md):
            dr = (r.get(_normalize_header('Date Range')) or r.get('date_range') or '').strip()
            s_md, e_md = _split_date_range(dr)
            start_md = start_md or s_md
            end_md = end_md or e_md
        module_number = (r.get(_normalize_header('Module')) or r.get('module') or r.get('module_number') or '').strip()
        module_title = normalize_text((r.get(_normalize_header('Theme')) or r.get('module_title') or r.get('theme') or '').strip())
        essential_question = normalize_text((r.get(_normalize_header('Essential Questions')) or r.get('essential_question') or '').strip())
        text_genres = normalize_text((r.get(_normalize_header('Text Genres')) or r.get('text_genres') or '').strip())
        # Build books strictly from enumerated Reading List columns
        books_items = _collect_reading_list_items_strict(r)
        if not (curriculum and grade and start_md and end_md and module_number):
            continue
        if resolved_curriculum and curriculum != resolved_curriculum:
            continue
        if q_grade and str(grade) != str(q_grade):
            continue
        if ref is not None:
            try:
                start_dt, end_dt = _resolve_range(start_md, end_md, ref)
            except Exception:
                continue
            if not (start_dt <= ref <= end_dt):
                continue
            start_iso = start_dt.isoformat()
            end_iso = end_dt.isoformat()
        item = {
            'district': q_district,
            'school': q_school,
            'grade': str(grade),
            'curriculum': resolved_curriculum or curriculum,
            'module_number': str(module_number),
            'module_title': module_title,
            'essential_question': essential_question,
            'questions': split_questions(essential_question or (r.get(_normalize_header('Essential Questions')) or '')),
            'text_genres': text_genres,
            'genres': split_genres(text_genres),
            'books': books_items,
            'books_json': json.dumps(books_items, ensure_ascii=False),
            'books_source': 'enumerated_strict',
        }
        if ref is not None:
            item['dateRange'] = {'start': start_iso, 'end': end_iso}
        results.append(item)
    return {'results': results}


def build_school_grades():
    """
    Returns mapping of grades per school using the School Directories tab.
    Output:
      {
        "items": [
          {"district": "3", "school": "Flushing High School", "grades": ["9","10","11","12"]},
          ...
        ]
      }
    """
    try:
        schools_rows = _fetch_schools_csv()
    except Exception:
        schools_rows = []
    district_candidates = {
        _normalize_header('District #'), 'district', 'district_number', 'district_no',
        'district_id', 'districtid'
    }
    school_candidates = {
        _normalize_header('School Name - NYC DOE'), 'school_name_-_nyc_doe', 'school_name_nyc_doe',
        'school_name', 'school'
    }
    items = []
    for r in schools_rows:
        district = ''
        for key in district_candidates:
            val = r.get(key)
            if val:
                district = str(val).strip()
                break
        school = ''
        for key in school_candidates:
            val = r.get(key)
            if val:
                school = str(val).strip()
                break
        grade_cell = (
            r.get('grade') or r.get('grades') or r.get('grades_served')
            or r.get('grade_level') or r.get('grade_levels') or ''
        )
        grades = _normalize_grade_tokens(str(grade_cell))
        if district and school:
            items.append({'district': district, 'school': school, 'grades': grades})
    return {'items': items}
