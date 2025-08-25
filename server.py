import csv
import io
import os
import time
from dataclasses import dataclass
from datetime import datetime, date
from typing import Dict, List, Optional, Tuple

import requests
from flask import Flask, jsonify, request, send_from_directory


SPREADSHEET_PUB_ID = "2PACX-1vSE0Mlty0JFy27H58nEULY3GNCsvwyCfIw4CQvf2_KbXsGXa4GIhU_SQojf5eXdz1MkKO7se9lJyjZT"
GID_PACING = "0"
GID_DIRECTORY = "136947076"

CSV_TIMEOUT_S = 20
CACHE_TTL_S = 5 * 60


def csv_url(gid: str) -> str:
    return f"https://docs.google.com/spreadsheets/d/e/{SPREADSHEET_PUB_ID}/pub?gid={gid}&single=true&output=csv"


def fetch_csv(gid: str) -> List[Dict[str, str]]:
    url = csv_url(gid)
    resp = requests.get(url, timeout=CSV_TIMEOUT_S, allow_redirects=True)
    resp.raise_for_status()
    content = resp.content.decode("utf-8", errors="replace")
    f = io.StringIO(content)
    reader = csv.DictReader(f)
    rows: List[Dict[str, str]] = []
    for raw_row in reader:
        row = { (k or "").strip(): (v or "").strip() for k, v in raw_row.items() }
        rows.append(row)
    return rows


def normalize_curriculum(value: str) -> str:
    v = (value or "").strip()
    # Normalize common variants
    replacements = {
        "HMH into reading": "HMH Into Reading",
        "hmh into reading": "HMH Into Reading",
        "wit & wisdom": "Wit & Wisdom",
        "el education": "EL Education",
    }
    return replacements.get(v.lower(), v)


def parse_md(value: str) -> Optional[Tuple[int, int]]:
    # Expected formats: "9/8", "09/08", "9-8" (be forgiving)
    if not value:
        return None
    cleaned = value.replace("-", "/").replace(" ", "")
    parts = cleaned.split("/")
    if len(parts) != 2:
        return None
    try:
        m = int(parts[0])
        d = int(parts[1])
        if not (1 <= m <= 12 and 1 <= d <= 31):
            return None
        return (m, d)
    except ValueError:
        return None


def to_date(year: int, md: Tuple[int, int]) -> date:
    m, d = md
    return date(year, m, d)


def overlap(a_start: date, a_end: date, b_start: date, b_end: date) -> bool:
    return not (a_end < b_start or b_end < a_start)


@dataclass
class PacingItem:
    curriculum: str
    grade: str
    module_number: str
    module_title: str
    essential_question: str
    start_md: Optional[Tuple[int, int]]
    end_md: Optional[Tuple[int, int]]
    book_list: List[str]


@dataclass
class DirectoryItem:
    school: str
    district: str
    curriculum: str
    borough: str
    level: str


class DataCache:
    def __init__(self) -> None:
        self._pacing: List[PacingItem] = []
        self._directory: List[DirectoryItem] = []
        self._last: float = 0.0

    def load(self, force: bool = False) -> None:
        now = time.time()
        if not force and self._last and now - self._last < CACHE_TTL_S:
            return

        pacing_rows = fetch_csv(GID_PACING)
        dir_rows = fetch_csv(GID_DIRECTORY)

        pacing: List[PacingItem] = []
        for r in pacing_rows:
            curriculum = normalize_curriculum(r.get("Curriculum", r.get("Curriculum ", "")))
            grade = r.get("Grade", "")
            module_number = r.get("Module_number", r.get("Module Number", ""))
            module_title = r.get("Module_title", r.get("Module Title", ""))
            essential_question = r.get("essential_question", r.get("Essential Question", ""))
            start_md = parse_md(r.get("Start_md", r.get("Start", "")))
            end_md = parse_md(r.get("End_md", r.get("End", "")))

            # Reading list may be split or multi-line; collect from known columns
            books: List[str] = []
            rl = r.get("Reading List", r.get("Reading List ", ""))
            if rl:
                for line in rl.splitlines():
                    line = line.strip()
                    if line:
                        books.append(line)
            # Additional generic columns often named "Column 1..N"
            for i in range(1, 10):
                col = r.get(f"Column {i}", "").strip()
                if col:
                    books.append(col)

            pacing.append(PacingItem(
                curriculum=curriculum,
                grade=grade,
                module_number=str(module_number or "").strip(),
                module_title=str(module_title or "").strip(),
                essential_question=str(essential_question or "").strip(),
                start_md=start_md,
                end_md=end_md,
                book_list=books,
            ))

        directory: List[DirectoryItem] = []
        for r in dir_rows:
            school = r.get("School", "").strip()
            district = str(r.get("District", "")).strip()
            curriculum = normalize_curriculum(r.get("Curriculum", r.get("Curriculum ", "")))
            borough = r.get("Borough", r.get("Borough ", "")).strip()
            level = r.get("School Level", r.get("School Level ", "")).strip()
            if not school:
                continue
            directory.append(DirectoryItem(
                school=school,
                district=district,
                curriculum=curriculum,
                borough=borough,
                level=level,
            ))

        self._pacing = pacing
        self._directory = directory
        self._last = now

    @property
    def pacing(self) -> List[PacingItem]:
        self.load()
        return self._pacing

    @property
    def directory(self) -> List[DirectoryItem]:
        self.load()
        return self._directory


cache = DataCache()


app = Flask(__name__, static_folder="/workspace", static_url_path="")


@app.route("/")
def root() -> "flask.wrappers.Response":
    return send_from_directory("/workspace", "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok", "ts": int(time.time())}


@app.get("/api/raw/pacing")
def raw_pacing():
    cache.load()
    return jsonify([p.__dict__ for p in cache.pacing])


@app.get("/api/raw/directories")
def raw_directories():
    cache.load()
    return jsonify([d.__dict__ for d in cache.directory])


@app.get("/api/meta")
def meta():
    cache.load()
    districts = sorted({d.district for d in cache.directory if d.district})
    schools = sorted({d.school for d in cache.directory if d.school})
    grades = sorted({p.grade for p in cache.pacing if p.grade})
    curricula = sorted({p.curriculum for p in cache.pacing if p.curriculum})
    return jsonify({
        "districts": districts,
        "schools": schools,
        "grades": grades,
        "curricula": curricula,
    })


def compute_intervals(p: PacingItem, candidate_years: List[int]) -> List[Tuple[date, date]]:
    intervals: List[Tuple[date, date]] = []
    if not p.start_md or not p.end_md:
        return intervals
    sm, sd = p.start_md
    em, ed = p.end_md
    for year in candidate_years:
        start = date(year, sm, sd)
        # wrap across year boundary if needed
        end_year = year if (em > sm or (em == sm and ed >= sd)) else year + 1
        end = date(end_year, em, ed)
        intervals.append((start, end))
    return intervals


@app.get("/api/search")
def search():
    cache.load()
    q_district = request.args.get("district", "").strip()
    q_school = request.args.get("school", "").strip()
    q_grade = request.args.get("grade", "").strip()
    q_from = request.args.get("dateFrom", "").strip()
    q_to = request.args.get("dateTo", "").strip()

    date_from: Optional[date] = None
    date_to: Optional[date] = None
    candidate_years: List[int] = []
    try:
        if q_from:
            date_from = datetime.strptime(q_from, "%Y-%m-%d").date()
            candidate_years.append(date_from.year)
        if q_to:
            date_to = datetime.strptime(q_to, "%Y-%m-%d").date()
            if date_to.year not in candidate_years:
                candidate_years.append(date_to.year)
        if not candidate_years:
            # default to current school year starting Aug 1
            today = date.today()
            base_year = today.year - 1 if today.month < 8 else today.year
            candidate_years = [base_year]
    except ValueError:
        pass

    # Filter directories by district/school first
    directories = [d for d in cache.directory if (
        (not q_district or d.district == q_district) and
        (not q_school or d.school == q_school)
    )]

    # Compose results by joining on curriculum and grade
    results: List[Dict[str, object]] = []
    for d in directories:
        for p in cache.pacing:
            if p.curriculum != d.curriculum:
                continue
            if q_grade and str(p.grade) != q_grade:
                continue

            intervals = compute_intervals(p, candidate_years)
            # If a date range filter is applied, require overlap
            include = True
            if date_from or date_to:
                include = False
                for (s, e) in intervals:
                    df = date_from or s
                    dt = date_to or e
                    if overlap(s, e, df, dt):
                        include = True
                        break
            if not include:
                continue

            # choose the first interval for display
            s_disp, e_disp = (intervals[0] if intervals else (None, None))
            results.append({
                "district": d.district,
                "school": d.school,
                "grade": p.grade,
                "curriculum": p.curriculum,
                "module": p.module_title or p.module_number,
                "moduleNumber": p.module_number,
                "essentialQuestion": p.essential_question,
                "bookList": p.book_list,
                "startDate": s_disp.isoformat() if s_disp else None,
                "endDate": e_disp.isoformat() if e_disp else None,
            })

    # Stable sort
    results.sort(key=lambda r: (
        (r.get("district") or ""),
        (r.get("school") or ""),
        (r.get("grade") or ""),
        (r.get("startDate") or "9999-12-31")
    ))
    return jsonify(results)


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()

