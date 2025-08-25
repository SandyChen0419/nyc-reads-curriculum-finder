/* global window, document, fetch */
(function () {
  const API_META = "/api/meta";
  const API_SEARCH = "/api/search";

  const els = {
    dateFrom: document.getElementById("dateFrom"),
    dateTo: document.getElementById("dateTo"),
    district: document.getElementById("districtSelect"),
    school: document.getElementById("schoolSelect"),
    grade: document.getElementById("gradeSelect"),
    resultsCount: document.getElementById("resultsCount"),
    resetBtn: document.getElementById("resetBtn"),
    table: document.getElementById("resultsTable"),
    tbody: document.getElementById("resultsBody"),
    empty: document.getElementById("emptyState"),
    loading: document.getElementById("loading"),
    error: document.getElementById("error"),
    year: document.getElementById("year")
  };

  function setYear() {
    if (els.year) {
      els.year.textContent = String(new Date().getFullYear());
    }
  }

  function parseDate(value) {
    if (!value) return null;
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function toIsoDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }

  function unique(values) {
    return Array.from(new Set(values)).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }

  function populateSelect(selectEl, options, includeAll = true) {
    const current = selectEl.value;
    selectEl.innerHTML = "";
    if (includeAll) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "All";
      selectEl.appendChild(opt);
    }
    options.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      selectEl.appendChild(opt);
    });
    // try to preserve selection if possible
    if ([...selectEl.options].some(o => o.value === current)) {
      selectEl.value = current;
    }
  }

  let meta = { districts: [], schools: [], grades: [], curricula: [] };

  function buildDerivedOptions() {
    const selectedDistrict = els.district.value;
    populateSelect(els.district, meta.districts);
    const schools = meta.schools.filter(s => {
      // When district is selected, we will constrain via API on fetch.
      return true;
    });
    populateSelect(els.school, schools);
    populateSelect(els.grade, meta.grades);
  }

  function attachListeners() {
    els.district.addEventListener("change", () => {
      // Optionally refine school options in future using server-side meta by district
      loadResults();
    });

    [els.school, els.grade, els.dateFrom, els.dateTo].forEach(el => {
      el.addEventListener("change", loadResults);
      el.addEventListener("input", loadResults);
    });

    els.resetBtn.addEventListener("click", () => {
      els.dateFrom.value = "";
      els.dateTo.value = "";
      els.district.value = "";
      buildDerivedOptions();
      els.school.value = "";
      els.grade.value = "";
      loadResults();
    });
  }

  function render(rows) {
    els.resultsCount.textContent = String(rows.length);

    els.tbody.innerHTML = "";
    rows.forEach(r => {
      const tr = document.createElement("tr");

      const dateTd = document.createElement("td");
      const s = r.startDate ? toIsoDate(r.startDate) : "";
      const e = r.endDate ? toIsoDate(r.endDate) : "";
      dateTd.textContent = s && e ? `${s} → ${e}` : (s || e || "");
      tr.appendChild(dateTd);

      const districtTd = document.createElement("td");
      districtTd.textContent = r.district;
      tr.appendChild(districtTd);

      const schoolTd = document.createElement("td");
      schoolTd.textContent = r.school;
      tr.appendChild(schoolTd);

      const gradeTd = document.createElement("td");
      gradeTd.textContent = String(r.grade);
      tr.appendChild(gradeTd);

      const curriculumTd = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "badge";
      const dot = document.createElement("span");
      dot.className = "dot";
      badge.appendChild(dot);
      const label = document.createElement("span");
      label.textContent = r.curriculum;
      badge.appendChild(label);
      curriculumTd.appendChild(badge);
      tr.appendChild(curriculumTd);

      const moduleTd = document.createElement("td");
      moduleTd.textContent = r.module;
      tr.appendChild(moduleTd);

      const questionTd = document.createElement("td");
      questionTd.textContent = r.essentialQuestion;
      tr.appendChild(questionTd);

      const booksTd = document.createElement("td");
      const list = document.createElement("div");
      list.className = "book-list";
      (Array.isArray(r.bookList) ? r.bookList : []).forEach(title => {
        const chip = document.createElement("span");
        chip.className = "book-chip";
        chip.textContent = title;
        list.appendChild(chip);
      });
      booksTd.appendChild(list);
      tr.appendChild(booksTd);

      els.tbody.appendChild(tr);
    });

    const hasRows = rows.length > 0;
    els.table.hidden = !hasRows;
    els.empty.hidden = hasRows;
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (els.dateFrom.value) params.set("dateFrom", els.dateFrom.value);
    if (els.dateTo.value) params.set("dateTo", els.dateTo.value);
    if (els.district.value) params.set("district", els.district.value);
    if (els.school.value) params.set("school", els.school.value);
    if (els.grade.value) params.set("grade", els.grade.value);
    return params.toString();
  }

  async function loadResults() {
    try {
      els.loading.hidden = false;
      els.error.hidden = true;
      const q = buildQuery();
      const url = q ? `${API_SEARCH}?${q}` : API_SEARCH;
      const rows = await fetchJSON(url);
      els.loading.hidden = true;
      render(rows);
    } catch (err) {
      console.error(err);
      els.loading.hidden = true;
      els.error.hidden = false;
    }
  }

  async function init() {
    setYear();
    try {
      els.loading.hidden = false;
      meta = await fetchJSON(API_META);
      buildDerivedOptions();
      attachListeners();
      await loadResults();
    } catch (err) {
      console.error(err);
      els.loading.hidden = true;
      els.error.hidden = false;
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();

