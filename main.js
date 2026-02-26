/* global window, document, fetch */
(function initCurriculumFinder() {
  const state = {
    allRecords: [],
    filteredRecords: [],
    lookup: {
      districts: [],
      districtToSchools: {},
    },
  };

  const els = {
    date: document.getElementById('filterDate'),
    district: document.getElementById('filterDistrict'),
    school: document.getElementById('filterSchool'),
    grade: document.getElementById('filterGrade'),
    clear: document.getElementById('clearFilters'),
    resultsCount: document.getElementById('resultsCount'),
    resultsBody: document.getElementById('resultsBody'),
  };

  // Configuration for the published Google Sheet
  // Replace SHEET_BASE_PUB with your published sheet base URL (no trailing query).
  // From: https://docs.google.com/spreadsheets/d/e/XXXX/pubhtml
  // Use:   https://docs.google.com/spreadsheets/d/e/XXXX/pub
  const CONFIG = {
    SHEET_BASE_PUB: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSE0Mlty0JFy27H58nEULY3GNCsvwyCfIw4CQvf2_KbXsGXa4GIhU_SQojf5eXdz1MkKO7se9lJyjZT/pub',
    SHEETS: {
      pacingGuide: 'Pacing Guide',
      directories: 'School Directories',
    }
  };

  function parseISODate(value) {
    if (!value) return null;
    const d = new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatBookList(books) {
    if (!Array.isArray(books) || books.length === 0) return '—';
    return books.join(', ');
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function setOptions(selectEl, values, allLabel) {
    const opts = ['<option value="">' + allLabel + '</option>']
      .concat(values.map(v => '<option value="' + String(v).replaceAll('"', '&quot;') + '">' + v + '</option>'))
      .join('');
    selectEl.innerHTML = opts;
  }

  function schoolsForDistrict(district) {
    if (district && state.lookup && state.lookup.districtToSchools && state.lookup.districtToSchools[district]) {
      return state.lookup.districtToSchools[district];
    }
    if (!district) {
      // combine all known schools
      const all = Object.values(state.lookup.districtToSchools || {}).flat();
      return uniqueSorted(all.length ? all : state.allRecords.map(r => r.school));
    }
    const fallbackSubset = state.allRecords.filter(r => r.district === district);
    return uniqueSorted(fallbackSubset.map(r => r.school));
  }

  function populateSelectOptions() {
    const districts = (state.lookup && state.lookup.districts && state.lookup.districts.length)
      ? state.lookup.districts
      : uniqueSorted(state.allRecords.map(r => r.district));
    const grades = uniqueSorted(state.allRecords.map(r => String(r.grade)));

    setOptions(els.district, districts, 'All Districts');
    setOptions(els.grade, grades, 'All Grades');
    setOptions(els.school, schoolsForDistrict(els.district.value), 'All Schools');

    els.district.addEventListener('change', () => {
      setOptions(els.school, schoolsForDistrict(els.district.value), 'All Schools');
      applyFiltersAndRender();
    });
  }

  function getSelectedFilters() {
    return {
      date: parseISODate(els.date.value),
      district: els.district.value || null,
      school: els.school.value || null,
      grade: els.grade.value || null,
    };
  }

  function findCurrentModule(record, targetDate) {
    if (!Array.isArray(record.modules)) return null;
    if (!targetDate) return null;
    const targetTime = targetDate.getTime();
    return record.modules.find(m => {
      const start = parseISODate(m.startDate);
      const end = parseISODate(m.endDate);
      if (!start || !end) return false;
      return start.getTime() <= targetTime && targetTime <= end.getTime();
    }) || null;
  }

  function applyFilters() {
    const { date, district, school, grade } = getSelectedFilters();
    const base = state.allRecords.filter(r => {
      if (district && r.district !== district) return false;
      if (school && r.school !== school) return false;
      if (grade && String(r.grade) !== String(grade)) return false;
      return true;
    });

    const withModule = base.map(r => {
      const module = findCurrentModule(r, date);
      return module ? { record: r, module } : null;
    }).filter(Boolean);

    state.filteredRecords = withModule;
  }

  function renderTable() {
    const rows = state.filteredRecords.map(({ record, module }) => {
      const books = formatBookList(module.books);
      return (
        '<tr>' +
          '<td>' + record.district + '</td>' +
          '<td>' + record.school + '</td>' +
          '<td>' + record.grade + '</td>' +
          '<td>' + record.curriculum + '</td>' +
          '<td>' + module.name + '</td>' +
          '<td>' + (module.essentialQuestion || '—') + '</td>' +
          '<td>' + books + '</td>' +
        '</tr>'
      );
    }).join('');

    if (rows.length === 0) {
      els.resultsBody.innerHTML = '<tr><td class="empty" colspan="7">No matching results. Try adjusting filters or date.</td></tr>';
    } else {
      els.resultsBody.innerHTML = rows;
    }
    els.resultsCount.textContent = String(state.filteredRecords.length) + (state.filteredRecords.length === 1 ? ' result' : ' results');
  }

  function applyFiltersAndRender() {
    applyFilters();
    renderTable();
  }

  function setDefaultDate() {
    // Default to today. If unsupported, leave blank.
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    els.date.value = yyyy + '-' + mm + '-' + dd;
  }

  function bindEvents() {
    els.date.addEventListener('change', applyFiltersAndRender);
    els.school.addEventListener('change', applyFiltersAndRender);
    els.grade.addEventListener('change', applyFiltersAndRender);
    els.clear.addEventListener('click', () => {
      setDefaultDate();
      els.district.value = '';
      els.grade.value = '';
      // Reset school options based on cleared district
      const schools = schoolsForDistrict('');
      els.school.innerHTML = ['<option value="">All Schools</option>'].concat(schools.map(s => '<option value="' + s.replaceAll('"', '&quot;') + '">' + s + '</option>')).join('');
      els.school.value = '';
      applyFiltersAndRender();
    });
  }

  // --- CSV utilities ---
  function normalizeHeader(header) {
    return String(header || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[\s\/]+/g, '_');
  }

  function parseCsv(text) {
    // Simple CSV parser with quote support
    const rows = [];
    let i = 0, field = '', row = [], inQuotes = false;
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => { rows.push(row); row = []; };
    while (i < text.length) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += char; i++; continue;
      }
      if (char === '"') { inQuotes = true; i++; continue; }
      if (char === ',') { pushField(); i++; continue; }
      if (char === '\n') { pushField(); pushRow(); i++; continue; }
      if (char === '\r') { i++; continue; }
      field += char; i++;
    }
    // flush last field/row
    pushField();
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) pushRow();

    if (rows.length === 0) return [];
    const headers = rows[0].map(normalizeHeader);
    const dataRows = rows.slice(1);
    return dataRows.map(cols => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (cols[idx] ?? '').trim(); });
      return obj;
    });
  }

  function buildCsvUrls(sheetName) {
    const base = CONFIG.SHEET_BASE_PUB.trim();
    const urls = [];
    // Prefer gviz CSV if possible
    if (base.includes('/gviz/tq')) {
      const joiner = base.includes('?') ? '&' : '?';
      urls.push(base + joiner + 'tqx=out:csv&sheet=' + encodeURIComponent(sheetName));
    } else {
      const gvizBase = base.replace('/pubhtml', '/gviz/tq').replace('/pub', '/gviz/tq');
      const joiner = gvizBase.includes('?') ? '&' : '?';
      urls.push(gvizBase + joiner + 'tqx=out:csv&sheet=' + encodeURIComponent(sheetName));
      // Fallback to legacy published CSV by sheet name
      const csvBase = base.includes('/pub') ? base : base.replace('/pubhtml', '/pub');
      const csvJoiner = csvBase.includes('?') ? '&' : '?';
      urls.push(csvBase + csvJoiner + 'output=csv&sheet=' + encodeURIComponent(sheetName));
    }
    return urls;
  }

  async function fetchCsvSheet(sheetName) {
    const urls = buildCsvUrls(sheetName);
    let lastError = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        const cleaned = text.replace(/^\uFEFF/, '').trim();
        if (!cleaned) throw new Error('Empty CSV');
        const rows = parseCsv(cleaned);
        if (Array.isArray(rows) && rows.length) return rows;
        lastError = new Error('No rows in CSV');
      } catch (e) {
        lastError = e;
        // try next url
      }
    }
    throw new Error('Failed to load sheet: ' + sheetName + (lastError ? ' (' + lastError.message + ')' : ''));
  }

  function toISODateMaybe(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    // If already YYYY-MM-DD, return
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function buildRecordsFromPacing(rows) {
    const keyFor = (d, s, g, c) => [d, s, g, c].map(x => String(x || '').trim()).join('||');
    const normalized = rows.map(r => {
      const obj = {};
      // Map common column names
      const m = new Map(Object.entries(r));
      const get = (...names) => {
        for (const name of names) {
          if (m.has(name)) return m.get(name);
        }
        return '';
      };
      obj.district = get('district');
      obj.school = get('school', 'school_name');
      obj.grade = get('grade', 'grade_level');
      obj.curriculum = get('curriculum');
      const moduleName = get('module', 'module_name', 'current_module');
      const essentialQuestion = get('essential_question', 'eq');
      const startDate = toISODateMaybe(get('start_date', 'start', 'module_start'));
      const endDate = toISODateMaybe(get('end_date', 'end', 'module_end'));
      const booksRaw = get('books', 'book_list', 'texts');
      const books = booksRaw ? booksRaw.split(/[;,\n]/).map(s => s.trim()).filter(Boolean) : [];
      obj.module = { name: moduleName, essentialQuestion, startDate, endDate, books };
      return obj;
    }).filter(r => r.district && r.school && r.grade && r.curriculum && r.module && r.module.name);

    const grouped = new Map();
    for (const r of normalized) {
      const k = keyFor(r.district, r.school, r.grade, r.curriculum);
      if (!grouped.has(k)) {
        grouped.set(k, { district: r.district, school: r.school, grade: r.grade, curriculum: r.curriculum, modules: [] });
      }
      grouped.get(k).modules.push(r.module);
    }
    return Array.from(grouped.values());
  }

  function buildLookupFromDirectories(rows) {
    const districtToSchools = {};
    for (const r of rows) {
      const district = r.district || r.district_name || '';
      const school = r.school || r.school_name || '';
      if (!district || !school) continue;
      if (!districtToSchools[district]) districtToSchools[district] = [];
      districtToSchools[district].push(school);
    }
    // Deduplicate/sort
    Object.keys(districtToSchools).forEach(d => {
      districtToSchools[d] = uniqueSorted(districtToSchools[d]);
    });
    return {
      districts: uniqueSorted(Object.keys(districtToSchools)),
      districtToSchools,
    };
  }

  async function loadData() {
    try {
      const [pacingRows, directoryRowsRaw] = await Promise.all([
        fetchCsvSheet(CONFIG.SHEETS.pacingGuide),
        fetchCsvSheet(CONFIG.SHEETS.directories),
      ]);
      // pacingRows and directoryRowsRaw are arrays of objects with normalized headers
      state.allRecords = buildRecordsFromPacing(pacingRows);
      state.lookup = buildLookupFromDirectories(directoryRowsRaw);
    } catch (err) {
      console.error(err);
      els.resultsBody.innerHTML = '<tr><td class="empty" colspan="7">Unable to load Google Sheets data. Ensure the sheet is published to the web and accessible.</td></tr>';
      return;
    }
  }

  (async function boot() {
    setDefaultDate();
    await loadData();
    populateSelectOptions();
    bindEvents();
    applyFiltersAndRender();
  }());
})();


