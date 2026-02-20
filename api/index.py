import csv
import io
import json
import os
import re
import time
from datetime import date
from urllib.parse import urlencode

import requests
from flask import Flask, jsonify, request, make_response

try:  # Optional dependency for robust CSV + UTF-8 handling
    import pandas as pd  # type: ignore
except Exception:  # noqa: BLE001
    pd = None

# Vercel: export a WSGI Flask app named `app` with ONLY API routes (no static serving)
app = Flask(__name__)

# Track last-seen header order for logging/index mapping
LAST_PACING_HEADERS_ORDER = []
LAST_SCHOOLS_HEADERS_ORDER = []

# Configuration for Google Sheet source
# Defaults point to the user's sheet unless overridden by environment.
SHEET_ID = os.environ.get('SHEET_ID', '12xrUodG0RyTpAlfo6_CO7phNY2LdzjH9mqieJQIV3Xs').strip()
GID_FOR_PACING = os.environ.get('GID_FOR_PACING', os.environ.get('SHEET_GID_PACING', '')).strip()
GID_FOR_SCHOOLS = os.environ.get('GID_FOR_SCHOOLS', os.environ.get('SHEET_GID_SCHOOLS', '')).strip()

# By default, prefer using the user's published sheet links (can be overridden by env).
DEFAULT_PACING_PUBHTML = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSE0Mlty0JFy27H58nEULY3GNCsvwyCfIw4CQvf2_KbXsGXa4GIhU_SQojf5eXdz1MkKO7se9lJyjZT/pubhtml?gid=0&single=true'
DEFAULT_SCHOOLS_PUBHTML = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSE0Mlty0JFy27H58nEULY3GNCsvwyCfIw4CQvf2_KbXsGXa4GIhU_SQojf5eXdz1MkKO7se9lJyjZT/pubhtml?gid=136947076&single=true'


def _pubhtml_to_csv(url: str) -> str:
    u = (url or '').strip()
    if not u:
        return ''
    # Replace pubhtml with pub and enforce output=csv while preserving gid
    u = u.replace('/pubhtml', '/pub')
    # Strip existing query except gid
    m = re.search(r'[?&]gid=([^&#]+)', u)
    gid = m.group(1) if m else ''
    base = u.split('?')[0]
    if gid:
        return f"{base}?output=csv&gid={gid}"
    # Fallback: if no gid, try gviz CSV
    return base.replace('/pub', '/gviz/tq') + '?tqx=out:csv'


# Allow overriding with direct CSV URLs via env; default to the user's specified spreadsheet+gid for Pacing Guides
PACING_CSV = os.environ.get(
    'PACING_CSV',
    'https://docs.google.com/spreadsheets/d/12xrUodG0RyTpAlfo6_CO7phNY2LdzjH9mqieJQIV3Xs/export?format=csv&gid=1707233296'
).strip()
SCHOOLS_CSV = os.environ.get('SCHOOLS_CSV', _pubhtml_to_csv(DEFAULT_SCHOOLS_PUBHTML)).strip()

# Published sheet base URL + tab names (used when direct CSV URLs are not set)
# Use /gviz/tq or /pub base. Tab names must match those in the sheet.
SHEET_BASE_PUB = os.environ.get('SHEET_BASE_PUB', f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/pub').strip()
TAB_PACING = os.environ.get('TAB_PACING', 'Pacing Guide')
TAB_SCHOOLS = os.environ.get('TAB_SCHOOLS', 'School Directories')


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


def json_utf8(data):
    resp = make_response(jsonify(data))
    resp.headers['Content-Type'] = 'application/json; charset=utf-8'
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return resp


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
    """
    Accepts compact ranges like '9/8-11/14' or '05/21–6/26' and returns (start_md, end_md).
    Returns ('','') if not parseable.
    """
    if not cell:
        return '', ''
    txt = str(cell).strip()
    # Normalize en/em dashes to hyphen
    txt = txt.replace('–', '-').replace('—', '-')
    parts = [p.strip() for p in txt.split('-') if p.strip()]
    if len(parts) != 2:
        return '', ''
    return parts[0], parts[1]


def _extract_title_and_url(cell_text: str):
    """
    Extract (title, url) from a Google Sheets cell representation.
    Supports:
    - HYPERLINK("URL","Title") or HYPERLINK('URL','Title')
    - 'Title | URL'
    - Inline http(s) URL in the text
    Falls back to (text, '') when no URL present.
    """
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
    """
    Enumerated-only reader:
      - reading_list_1..20 (normalized, lowercase)
      - reading_url_1..20 (normalized, lowercase)
      - coverimageurl_1..20 (normalized, lowercase)
    Uses _extract_title_and_url to parse HYPERLINK formulas or embedded URLs for title cells.
    """
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
        # Prefer explicit reading_url_N when present
        url = str(raw_url).strip() or (str(link_url).strip() if link_url else '')
        cover = str(raw_cover).strip()
        if not title_text:
            # Skip if no readable title
            continue
        items.append({
            'title': title_text,
            'url': (url if url else None),
            'coverImageUrl': (cover if cover else None),
        })
    return items


def _reading_related_keys(headers):
    """Detect normalized header names related to reading lists (excluding 'recommended')."""
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
    """Build candidate CSV URLs.

    Priority:
    1) If SHEET_ID + gid provided, use direct export URLs.
    2) Otherwise, attempt published base variations (/gviz/tq and /pub) with sheet name.
    """
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
    # Normalize pubhtml links to CSV export if needed
    normalized = url
    if 'pubhtml' in (url or ''):
        normalized = _pubhtml_to_csv(url)
    # Add cache-busting to always fetch live data
    sep = '&' if ('?' in normalized) else '?'
    live_url = f"{normalized}{sep}_cb={int(time.time())}"
    resp = requests.get(live_url, timeout=20, headers={
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
    })
    resp.raise_for_status()
    # Instrumentation for pacing fetches
    if context == 'pacing':
        try:
            app.logger.info("[Pacing] export_url %s", live_url)
            app.logger.info("[Pacing] status %s", getattr(resp, 'status_code', 'n/a'))
        except Exception:
            pass
    if pd is not None:
        decoded = resp.content.decode('utf-8', errors='replace')
        if context == 'pacing':
            try:
                app.logger.info("[Pacing] body_head %s", decoded[:200])
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
                app.logger.info("[Pacing] header_count %d", len(headers_raw))
                read_cover = [h for h in headers_raw if re.search(r"(reading|cover)", h, re.I)]
                app.logger.info("[Pacing] reading/cover headers %s", read_cover)
            except Exception:
                pass
        return rows
    # Fallback to simple CSV parse with explicit utf-8 decode
    decoded = resp.content.decode('utf-8', errors='replace').lstrip('\ufeff').strip()
    if context == 'pacing':
        try:
            app.logger.info("[Pacing] body_head %s", decoded[:200])
            # Peek headers from first line for logging
            first_line = decoded.splitlines()[0] if decoded else ''
            raw_headers = [h.strip() for h in first_line.split(',')] if first_line else []
            app.logger.info("[Pacing] header_count %d", len(raw_headers))
            read_cover = [h for h in raw_headers if re.search(r"(reading|cover)", h, re.I)]
            app.logger.info("[Pacing] reading/cover headers %s", read_cover)
        except Exception:
            pass
    return _csv_from_text(decoded)


def _fetch_schools_csv():
    """Fetch rows from the Schools CSV using direct export if configured."""
    global LAST_SCHOOLS_HEADERS_ORDER
    if SCHOOLS_CSV:
        rows = _fetch_csv_from_url(SCHOOLS_CSV)
        try:
            if rows:
                LAST_SCHOOLS_HEADERS_ORDER = list(rows[0].keys())
        except Exception:
            pass
        return rows
    if SHEET_ID and GID_FOR_SCHOOLS:
        url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID_FOR_SCHOOLS}"
        rows = _fetch_csv_from_url(url)
        try:
            if rows:
                LAST_SCHOOLS_HEADERS_ORDER = list(rows[0].keys())
        except Exception:
            pass
        return rows
    # Fallback to base+tab if direct ids not provided
    rows = _fetch_sheet(TAB_SCHOOLS, GID_FOR_SCHOOLS)
    try:
        if rows:
            LAST_SCHOOLS_HEADERS_ORDER = list(rows[0].keys())
    except Exception:
        pass
    return rows


def _fetch_pacing_csv():
    """Fetch rows from the Pacing CSV using direct export if configured."""
    global LAST_PACING_HEADERS_ORDER
    if PACING_CSV:
        rows = _fetch_csv_from_url(PACING_CSV, context='pacing')
        try:
            if rows:
                LAST_PACING_HEADERS_ORDER = list(rows[0].keys())
        except Exception:
            pass
        return rows
    if SHEET_ID and GID_FOR_PACING:
        url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID_FOR_PACING}"
        rows = _fetch_csv_from_url(url, context='pacing')
        try:
            if rows:
                LAST_PACING_HEADERS_ORDER = list(rows[0].keys())
        except Exception:
            pass
        return rows
    # Fallback to base+tab if direct ids not provided
    rows = _fetch_sheet(TAB_PACING, GID_FOR_PACING)
    try:
        if rows:
            LAST_PACING_HEADERS_ORDER = list(rows[0].keys())
    except Exception:
        pass
    return rows


def _md_to_date(md: str, year: int) -> date:
    md = (md or '').strip()
    if not md:
        raise ValueError('empty month-day')
    # Accept formats like 8/15, 08/15, 8-15, 08-15, 8.15
    m = re.match(r"^(\d{1,2})[./\-](\d{1,2})$", md)
    if not m:
        # Try words like 'Aug 15'
        try:
            from datetime import datetime
            dt = datetime.strptime(md, '%b %d')
            return date(year, dt.month, dt.day)
        except Exception as e:  # noqa: BLE001
            raise ValueError(f'Invalid month-day: {md}') from e
    month = int(m.group(1))
    day = int(m.group(2))
    return date(year, month, day)


def _resolve_range(start_md: str, end_md: str, ref: date):
    """Return (start_date, end_date) that contains ref if within the MD window.
    Handles wrap across year boundaries.
    """
    s = _md_to_date(start_md, ref.year)
    e = _md_to_date(end_md, ref.year)
    if e >= s:
        return s, e
    # Wrapped case
    if s <= ref:
        return s, _md_to_date(end_md, ref.year + 1)
    return _md_to_date(start_md, ref.year - 1), e


def _normalize_school_directories(rows):
    districts = set()
    schools_by_district = {}
    grades = set()
    curricula = set()

    # Candidate header keys (already normalized by _csv_from_text)
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
            # Fallback: find any key that contains the token
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

        # Attempt to collect grades from common columns
        grade_cell = (
            r.get('grade')
            or r.get('grades')
            or r.get('grades_served')
            or r.get('grade_level')
            or r.get('grade_levels')
            or ''
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


@app.get('/meta')

def api_meta():
    # Debug short-circuit: allow ?debug=1 to verify routing without touching Sheets
    try:
        if str(request.args.get('debug', '')).lower() in ('1', 'true', 'yes'):
            return json_utf8({'ok': True, 'route': 'meta'})
    except Exception:
        pass
    # Load schools (for districts/schools/curricula)
    schools_headers = set()
    try:
        schools_rows = _fetch_schools_csv()
    except Exception:
        schools_rows = []
    if schools_rows:
        schools_headers = set(schools_rows[0].keys())

    # Load pacing (for grades and curricula if needed)
    pacing_headers = set()
    try:
        pacing_rows = _fetch_pacing_csv()
    except Exception:
        pacing_rows = []
    if pacing_rows:
        pacing_headers = set(pacing_rows[0].keys())

    districts_set = set()
    schools_list = []
    curricula_set = set()
    grades_set = set()

    # Column mapping for SCHOOLS tab
    district_candidates = {
        _normalize_header('District #'), 'district', 'district_number', 'district_no',
        'district_id', 'districtid'
    }
    school_candidates = {
        _normalize_header('School Name - NYC DOE'), 'school_name_-_nyc_doe', 'school_name_nyc_doe',
        'school_name', 'school'
    }
    curriculum_candidates = { _normalize_header('Curriculum'), 'curriculum', 'literacy_curriculum' }
    for r in schools_rows:
        # pick first non-empty by candidates
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
        curriculum = ''
        for key in curriculum_candidates:
            val = r.get(key)
            if val:
                curriculum = str(val).strip()
                break
        if district:
            districts_set.add(district)
        if district and school:
            schools_list.append({'district': district, 'school': school})
        if curriculum:
            curricula_set.add(curriculum)

    # Column mapping for PACING tab
    for r in pacing_rows:
        grade = r.get(_normalize_header('Grade Level')) or r.get('grade') or r.get('grade_level') or ''
        curriculum = r.get(_normalize_header('Curriculum')) or r.get('curriculum') or ''
        if str(grade).strip():
            g = str(grade).strip()
            grades_set.add('K' if g.lower() == 'k' else g)
        if curriculum:
            curricula_set.add(curriculum.strip())

    # Defensive fallback: derive grades from schools dataset if not present in pacing
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
    # Fallback: if Schools tab unavailable/empty, derive districts + schools from Pacing
    if not schools_list and pacing_rows:
        derived = _meta_from_pacing(pacing_rows)
        for d in derived.get('districts', []):
            districts_set.add(d)
        # Flatten schoolsByDistrict to list of {district, school}
        sbd = derived.get('schoolsByDistrict') or {}
        for d, schools in sbd.items():
            for s in schools:
                schools_list.append({'district': d, 'school': s})
        # Also merge curricula from pacing-derived if any
        for c in derived.get('curricula', []):
            curricula_set.add(c)
        # Merge grades as well
        for g in derived.get('grades', []):
            grades_set.add(g)
        grades_sorted = sorted(grades_set, key=lambda g: (g != 'K', int(g) if str(g).isdigit() else 0))

    meta = {
        'districts': sorted(districts_set),
        'schools': sorted(schools_list, key=lambda x: (x['district'], x['school'])),
        'grades': grades_sorted,
        'curricula': sorted(curricula_set),
    }
    # Always log summary for debugging
    try:
        app.logger.info(
            "Meta summary: schools_rows=%d pacing_rows=%d -> districts=%d grades=%d (example districts=%s, grades=%s)",
            len(schools_rows), len(pacing_rows), len(meta['districts']), len(meta['grades']),
            ','.join(list(meta['districts'])[:5]), ','.join(list(meta['grades'])[:5])
        )
    except Exception:
        pass
    # Log when meta is unexpectedly empty to aid debugging
    if (not meta['districts']) or (not meta['grades']):
        app.logger.warning(
            "Meta computation empty: districts=%d grades=%d (schools_rows=%d pacing_rows=%d) headers: schools=%s pacing=%s",
            len(meta['districts']), len(meta['grades']), len(schools_rows), len(pacing_rows),
            sorted(list(schools_headers))[:12], sorted(list(pacing_headers))[:12]
        )
    return json_utf8(meta)


def _parse_reading_list(cell: str):
    items = []
    if not cell:
        return items
    for raw in re.split(r"[\n;]+", cell):
        t = raw.strip()
        if not t:
            continue
        # Prefer explicit "Title | URL" pattern
        if " | " in t:
            left, right = t.split(" | ", 1)
            title = normalize_text(left)
            url = right.strip()
            items.append({'title': title or url, 'url': url, 'coverImageUrl': ''})
            continue
        url_match = re.search(r"(https?://\S+)", t)
        if url_match:
            url = url_match.group(1).rstrip(').,;')
            title = t[: url_match.start()].strip().strip(':-').strip()
            if not title:
                title = url
            items.append({'title': normalize_text(title), 'url': url, 'coverImageUrl': ''})
        else:
            items.append({'title': normalize_text(t), 'url': '', 'coverImageUrl': ''})
    return items


@app.get('/search')
@app.get('/api/search')
def api_search():
    # Query params
    q_date = request.args.get('date', '').strip()
    q_district = request.args.get('district', '').strip()
    q_school = request.args.get('school', '').strip()
    q_grade = request.args.get('grade', '').strip()

    # Resolve reference date
    ref = None
    try:
        if q_date:
            y, m, d = [int(x) for x in q_date.split('-')]
            ref = date(y, m, d)
    except Exception:  # noqa: BLE001
        ref = None

    # Resolve curriculum from SCHOOLS by (district, school)
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

    # Load PACING rows
    try:
        pacing_rows = _fetch_pacing_csv()
    except Exception:
        pacing_rows = []
    try:
        hdrs = list(LAST_PACING_HEADERS_ORDER) if LAST_PACING_HEADERS_ORDER else (list(pacing_rows[0].keys()) if pacing_rows else [])
        idx_map = {h: i for i, h in enumerate(hdrs)}
        app.logger.info("Search dataset: pacing_rows=%d headers_count=%d", len(pacing_rows), len(hdrs))
        # Detect reading/recommended related columns and print indexes
        reading_cols = _reading_related_keys(hdrs)
        rec_cols = [h for h in hdrs if 'recommended' in h]  # logging only
        app.logger.info("Detected reading list columns: %s", [(c, idx_map.get(c, -1)) for c in reading_cols])
        app.logger.info("Detected recommended columns (not used): %s", [(c, idx_map.get(c, -1)) for c in rec_cols])
    except Exception:
        pass

    results = []
    for r in pacing_rows:
        curriculum = (r.get(_normalize_header('Curriculum')) or r.get('curriculum') or '').strip()
        grade = (r.get(_normalize_header('Grade Level')) or r.get('grade') or r.get('grade_level') or '').strip()
        start_md = (r.get(_normalize_header('start_md')) or r.get('start_md') or r.get('start') or '').strip()
        end_md = (r.get(_normalize_header('end_md')) or r.get('end_md') or r.get('end') or '').strip()
        if not (start_md and end_md):
            # Support 'Date Range' like '9/8-11/14'
            dr = (r.get(_normalize_header('Date Range')) or r.get('date_range') or '').strip()
            s_md, e_md = _split_date_range(dr)
            start_md = start_md or s_md
            end_md = end_md or e_md
        module_number = (r.get(_normalize_header('Module')) or r.get('module') or r.get('module_number') or '').strip()
        module_title = normalize_text((r.get(_normalize_header('Theme')) or r.get('module_title') or r.get('theme') or '').strip())
        essential_question = normalize_text((r.get(_normalize_header('Essential Questions')) or r.get('essential_question') or '').strip())
        text_genres = normalize_text((r.get(_normalize_header('Text Genres')) or r.get('text_genres') or '').strip())
        headers_here = list(r.keys())
        # Build books strictly from enumerated Reading List columns
        books_items = _collect_reading_list_items_strict(r)
        books_source = 'enumerated_strict'
        books_json_str = json.dumps(books_items, ensure_ascii=False)
        try:
            if curriculum and grade and module_number:
                # Log raw values for detected reading columns
                rl_keys = [k for k in headers_here if (k in _reading_related_keys(headers_here) or k.startswith('reading_list_') or k.startswith('coverimageurl_') or k.startswith('cover_image_url_'))]
                rl_raw = {k: r.get(k) for k in rl_keys}
                app.logger.info(
                    "Row debug: curr=%s grade=%s module=%s RL_cols=%d books_items=%d",
                    curriculum, grade, module_number, len(rl_raw.keys()), len(books_items)
                )
                app.logger.info("Detected reading list columns: %s", rl_keys)
                app.logger.info("Raw reading list values for row: %s", [r.get(k) for k in rl_keys])
                app.logger.info("Final parsed reading list sent to UI: %s", books_items[:5])
                if books_items:
                    b0 = books_items[0]
                    app.logger.info("Sample book -> title=%s url=%s cover=%s", b0.get('title'), b0.get('url'), b0.get('coverImageUrl'))
        except Exception:
            pass

        if not (curriculum and grade and start_md and end_md and module_number):
            continue

        # Filter by resolved curriculum and selected grade
        if resolved_curriculum and curriculum != resolved_curriculum:
            continue
        if q_grade and str(grade) != str(q_grade):
            continue

        # Date filter
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
            'books_json': books_json_str,
            'books_source': books_source,
        }
        if ref is not None:
            item['dateRange'] = {'start': start_iso, 'end': end_iso}
        results.append(item)

    # Log response summary
    try:
        sample = (results[0] if results else {})
        app.logger.info("[/search] response: count=%d sample_keys=%s books_source=%s",
                        len(results), list(sample.keys())[:10], sample.get('books_source', ''))
    except Exception:
        pass
    return json_utf8({'results': results})


@app.get('/modules')
@app.get('/api/modules')
def api_modules():
    curriculum = normalize_text(request.args.get('curriculum', '').strip())
    grade = normalize_text(request.args.get('grade', '').strip())
    if not curriculum or not grade:
        return json_utf8({'modules': []})

    try:
        pacing_rows = _fetch_pacing_csv()
    except Exception:
        pacing_rows = []

    modules = []
    for r in pacing_rows:
        r_curr = normalize_text((r.get(_normalize_header('Curriculum')) or r.get('curriculum') or '').strip())
        r_grade = normalize_text((r.get(_normalize_header('Grade Level')) or r.get('grade') or r.get('grade_level') or '').strip())
        if r_curr != curriculum or str(r_grade) != str(grade):
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
            # attempt to parse if formatted like 'Module 2'
            m = re.search(r"(\d+)", str(module_number))
            num = int(m.group(1)) if m else 0
        modules.append({
            'module_number': num,
            'module_title': module_title,
            'start_md': start_md,
            'end_md': end_md,
        })

    modules.sort(key=lambda m: int(m.get('module_number') or 0))
    return json_utf8({'modules': modules})


@app.get('/health')
@app.get('/api/health')
def api_health():
    return json_utf8({'ok': True})

