/* global window, document, fetch */
(function () {
  const DATA_URL = "/data/sample-data.json";

  /** @type {Array<any>} */
  let allRows = [];

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

  function buildDerivedOptions() {
    const districts = unique(allRows.map(r => r.district));
    populateSelect(els.district, districts);

    const selectedDistrict = els.district.value;
    const schools = unique(allRows
      .filter(r => !selectedDistrict || r.district === selectedDistrict)
      .map(r => r.school));
    populateSelect(els.school, schools);

    const grades = unique(allRows.map(r => r.grade));
    populateSelect(els.grade, grades);
  }

  function attachListeners() {
    els.district.addEventListener("change", () => {
      // rebuild school options constrained by district
      const selectedDistrict = els.district.value;
      const schools = unique(allRows
        .filter(r => !selectedDistrict || r.district === selectedDistrict)
        .map(r => r.school));
      populateSelect(els.school, schools);
      render();
    });

    [els.school, els.grade, els.dateFrom, els.dateTo].forEach(el => {
      el.addEventListener("change", render);
      el.addEventListener("input", render);
    });

    els.resetBtn.addEventListener("click", () => {
      els.dateFrom.value = "";
      els.dateTo.value = "";
      els.district.value = "";
      buildDerivedOptions();
      els.school.value = "";
      els.grade.value = "";
      render();
    });
  }

  function rowMatchesFilters(row) {
    const from = parseDate(els.dateFrom.value);
    const to = parseDate(els.dateTo.value);
    const rowDate = parseDate(row.date);

    if (from && rowDate && rowDate < from) return false;
    if (to && rowDate && rowDate > to) return false;

    if (els.district.value && row.district !== els.district.value) return false;
    if (els.school.value && row.school !== els.school.value) return false;
    if (els.grade.value && String(row.grade) !== els.grade.value) return false;

    return true;
  }

  function render() {
    const rows = allRows.filter(rowMatchesFilters);
    els.resultsCount.textContent = String(rows.length);

    els.tbody.innerHTML = "";
    rows.forEach(r => {
      const tr = document.createElement("tr");

      const dateTd = document.createElement("td");
      dateTd.textContent = toIsoDate(r.date);
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

  async function init() {
    setYear();
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      allRows = Array.isArray(data) ? data : [];
      els.loading.hidden = true;
      buildDerivedOptions();
      attachListeners();
      render();
    } catch (err) {
      console.error(err);
      els.loading.hidden = true;
      els.error.hidden = false;
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();

