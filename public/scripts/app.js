/* global window, document, fetch */
(function initApp() {
  const els = {
    date: document.getElementById('filterDate'),
    district: document.getElementById('filterDistrict'),
    schoolInput: document.getElementById('schoolInput'),
    schoolList: document.getElementById('schoolList'),
    clearSchool: document.getElementById('clearSchool'),
    grade: document.getElementById('filterGrade'),
    clear: document.getElementById('clearFilters'),
    search: document.getElementById('searchBtn'),
    filtersForm: document.getElementById('filtersForm'),
    resultsMount: document.getElementById('resultsMount'),
    resultsCount: document.getElementById('resultsCount'),
    cards: document.getElementById('cards'),
  };

  const state = {
    meta: null,
    schoolsByDistrict: {},
    gradesBySchool: {}, // key: "district|school" -> ['PK','K','1'...'12']
    modules: [],
    activeIndex: 0,
    lastContext: null,
    lastDetails: { eq: [], genres: [], books: [] },
  };

  function setOptions(selectEl, values, allLabel) {
    const opts = ['<option value="">' + allLabel + '</option>']
      .concat(values.map(v => '<option value="' + String(v).replaceAll('"', '&quot;') + '">' + v + '</option>'))
      .join('');
    selectEl.innerHTML = opts;
  }

  function setDatalistOptions(listEl, values) {
    const opts = values.map(v => '<option value="' + String(v).replaceAll('"', '&quot;') + '"></option>').join('');
    listEl.innerHTML = opts;
  }

  function sortGradeTokens(tokens) {
    const order = t => (t === 'PK' ? 0 : (t === 'K' ? 1 : (10 + Number(t))));
    return Array.from(new Set((tokens || []).map(String))).sort((a, b) => order(a) - order(b));
  }

  function defaultGradeTokens() {
    const out = ['PK', 'K'];
    for (let i = 1; i <= 12; i++) out.push(String(i));
    return out;
  }

  function schoolKey(district, school) {
    return String(district || '').trim() + '|' + String(school || '').trim();
  }

  function setDefaultDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    els.date.value = yyyy + '-' + mm + '-' + dd;
  }

  async function loadMeta() {
    try {
      // Always insert defaults first so dropdowns are never empty
      if (els.district) setOptions(els.district, [], 'All Districts');
      if (els.grade) setOptions(els.grade, [], 'All Grades');

      const res = await fetch('/api/meta', { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to load meta');
      const json = await res.json();
      state.meta = json || {};

      // Ensure we always have a global grade list as fallback
      if (!state.meta.grades || !Array.isArray(state.meta.grades) || state.meta.grades.length === 0) {
        state.meta.grades = defaultGradeTokens();
        console.warn('[Meta] No global grades from API; using default PK–12');
      }

      // Build schoolsByDistrict from flat schools array if provided
      const byDistrict = {};
      if (Array.isArray(json.schools)) {
        for (const s of json.schools) {
          const d = String(s.district || '').trim();
          const name = String(s.school || '').trim();
          if (!d || !name) continue;
          if (!byDistrict[d]) byDistrict[d] = [];
          byDistrict[d].push(name);
        }
        // dedupe/sort
        Object.keys(byDistrict).forEach(d => {
          byDistrict[d] = Array.from(new Set(byDistrict[d])).sort((a, b) => a.localeCompare(b));
        });
      }
      state.schoolsByDistrict = byDistrict;

      // Fetch grades per school mapping
      try {
        const res2 = await fetch('/api/school-grades', { cache: 'no-cache' });
        if (res2.ok) {
          const j2 = await res2.json();
          const map = {};
          if (j2 && Array.isArray(j2.items)) {
            for (const it of j2.items) {
              const k = schoolKey(it.district, it.school);
              const graded = Array.isArray(it.grades) ? sortGradeTokens(it.grades) : [];
              map[k] = graded;
            }
          }
          state.gradesBySchool = map;
        } else {
          console.warn('[Meta] /api/school-grades returned', res2.status);
        }
      } catch (e) {
        console.warn('[Meta] Failed to fetch /api/school-grades', e);
      }

      // Sort districts numerically, render as strings; fallback from schoolsByDistrict keys
      const districtsFromMeta = Array.isArray(json.districts) ? json.districts : [];
      const numericSorted = Array.from(new Set(districtsFromMeta))
        .map(d => Number(String(d).trim()))
        .filter(n => !Number.isNaN(n))
        .sort((a, b) => a - b)
        .map(n => String(n));
      let districts = numericSorted;
      if (!districts.length) {
        const keys = Object.keys(byDistrict || {});
        districts = Array.from(new Set(keys))
          .map(d => Number(String(d).trim()))
          .filter(n => !Number.isNaN(n))
          .sort((a, b) => a - b)
          .map(n => String(n));
      }
      setOptions(els.district, districts, 'All Districts');
      setOptions(els.grade, state.meta.grades || defaultGradeTokens(), 'All Grades');
      const allSchools = Object.values(byDistrict).flat().sort((a, b) => a.localeCompare(b));
      setDatalistOptions(els.schoolList, allSchools);

      console.log('[Meta] Loaded', {
        schoolsCount: Array.isArray(json.schools) ? json.schools.length : 0,
        districtsCount: Array.isArray(json.districts) ? json.districts.length : 0,
        gradesCount: Array.isArray(json.grades) ? json.grades.length : 0,
        sampleDistricts: (json.districts || []).slice(0, 8),
        sampleGrades: (json.grades || []).slice(0, 8),
      });
      if ((!json.districts || json.districts.length === 0) && (!allSchools || allSchools.length === 0)) {
        console.error('Meta is empty from /api/meta');
        if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">No data. Please check the connected Google Sheet.</div>';
      }
    } catch (e) {
      console.error('Failed to fetch /api/meta', e);
      // Ensure placeholders still render even if meta fails
      if (els.district) setOptions(els.district, [], 'All Districts');
      if (els.grade) setOptions(els.grade, [], 'All Grades');
      if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">No data. Unable to load metadata.</div>';
    }
  }

  function onDistrictChange() {
    const district = String(els.district.value || '').trim();
    const schools = district
      ? ((state.schoolsByDistrict && state.schoolsByDistrict[district]) || [])
      : (Object.values(state.schoolsByDistrict || {}).flat());
    const sorted = Array.from(new Set((schools || []).map(s => String(s).trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
    setDatalistOptions(els.schoolList, sorted);
    // Clear the current school input when district changes
    els.schoolInput.value = '';
    // Reset grades to global when district changed and school cleared
    if (state.meta) setOptions(els.grade, state.meta.grades || defaultGradeTokens(), 'All Grades');
  }

  function recomputeGradeOptionsForSelection() {
    const districtVal = String(els.district.value || '').trim();
    const schoolVal = String(els.schoolInput.value || '').trim();
    const key = schoolKey(districtVal, schoolVal);
    const allowed = (districtVal && schoolVal && state.gradesBySchool && state.gradesBySchool[key] && state.gradesBySchool[key].length)
      ? state.gradesBySchool[key]
      : ((state.meta && state.meta.grades && state.meta.grades.length) ? state.meta.grades : defaultGradeTokens());
    const allowedSorted = sortGradeTokens(allowed);
    setOptions(els.grade, allowedSorted, 'All Grades');
    // If current selection is not allowed, reset to All
    const cur = String(els.grade.value || '').trim();
    if (cur && allowedSorted.indexOf(cur) === -1) {
      els.grade.value = '';
    }
  }

  function escapeHTML(s){
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function splitBooks(raw) {
    return String(raw || '')
      .split(/[\n;]+/)
      .map(s => s.trim())
      .filter(Boolean);
    }

  function renderResultCard(model) {
    const { district, school, grade, curriculum, module_number, module_title, dateLabel, essential_question, text_genres, books } = model;
    const eqParagraph = '<p>' + escapeHTML(essential_question || '') + '</p>';
    const genrePills = (text_genres || []).map(g => '<span class="pill">' + escapeHTML(g) + '</span>').join('');
    const bookList = (books || []).map(b => {
      const title = b && b.title ? String(b.title) : '';
      const link = b && b.url ? String(b.url) : '';
      const cover = b && (b.coverImageUrl || b.coverimageurl) ? String(b.coverImageUrl || b.coverimageurl) : '';
      const imgTag = cover ? ('<img src="' + cover + '" alt="' + escapeHTML(title || 'Book cover') + '" onerror="this.onerror=null; this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';" />') : '';
      const img = link && imgTag
        ? ('<a href="' + link + '" target="_blank" rel="noopener noreferrer">' + imgTag + '</a>')
        : imgTag;
      const fallback = '<div class="book-fallback"' + (cover ? '' : ' style="display:flex;"') + '>Book cover not available for now</div>';
      const titleHtml = link ? ('<a href="' + link + '" target="_blank" rel="noopener noreferrer">' + escapeHTML(title) + '</a>') : escapeHTML(title);
      return '<li class="book-item"><div class="book-thumb">' + img + fallback + '</div><div class="book-title">' + titleHtml + '</div></li>';
    }).join('');
    // Recommended Text section removed

    const soraNote = '<div class="sora-note" style="margin-top:8px;font-size:12px;color:#475569;">Looking for similar titles? Browse and borrow from the Citywide Digital Library on <a href="https://soraapp.com/welcome/login/310229" target="_blank" rel="noopener">Sora</a>.</div>';

    return (
      '<div class="card section">' +
        '<div class="grid-2" style="align-items:start;">' +
          '<div>' +
            '<h3>School Information</h3>' +
            '<p><b>School:</b> ' + escapeHTML(school) + '</p>' +
            '<p><b>Grade:</b> ' + escapeHTML(grade) + '</p>' +
          '</div>' +
          '<div>' +
            '<h3>&nbsp;</h3>' +
            '<p><b>District:</b> ' + escapeHTML(String(district)) + '</p>' +
            '<p><b>Curriculum:</b> ' + escapeHTML(curriculum) + '</p>' +
          '</div>' +
        '</div>' +

        '<div class="subcard bg-blue section">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">' +
            '<h3 style="margin:0;">Module Information</h3>' +
            '<div>' +
              '<button id="btnPrev" class="btn btn-secondary">‹ Previous</button>' +
              '<button id="btnNext" class="btn btn-secondary">Next ›</button>' +
            '</div>' +
          '</div>' +
          '<p><b>Module:</b> ' + escapeHTML(String(module_number || '')) + '</p>' +
          '<p><b>Theme:</b> ' + escapeHTML(module_title || '—') + '</p>' +
          '<p><b>Date Range:</b> ' + escapeHTML(dateLabel || '—') + '</p>' +
        '</div>' +

        (eqParagraph ? ('<div class="subcard bg-green section"><h3>Essential Questions</h3>' + eqParagraph + '</div>') : '') +

        (genrePills ? ('<div class="subcard bg-yellow section"><h3>Text Genres</h3><div id="genres">' + genrePills + '</div></div>') : '') +

        ('<div class="subcard bg-purple section"><h3>Reading List</h3>' + (bookList ? ('<ul class="book-list">' + bookList + '</ul>') : '<div class="empty">Not Available</div>') + soraNote + '</div>') +

        '<div class="section" style="font-size:12px;color:#475569;">Data Source: <a href="https://sites.google.com/schools.nyc.gov/nycpslc/resources-for-core-instruction?utm_source" target="_blank" rel="noopener">NYC DOE Pacing Guides</a></div>' +
      '</div>'
    );
  }

  function renderResults(items) {
    if (!els.resultsMount) return;
    if (!Array.isArray(items) || items.length === 0) {
      els.resultsMount.innerHTML = '<div class="empty">No results. Try adjusting filters or date.</div>';
      return;
    }
    const row = items[0];
    console.log('[Search] Raw row sample', {
      books_json: row && row.books_json,
      text_genres: row && row.text_genres,
    });
    if (row && typeof row.books_source !== 'undefined') {
      try {
        const bj = row.books_json;
        let tmpBooks = [];
        if (Array.isArray(bj)) tmpBooks = bj;
        else if (typeof bj === 'string' && bj.trim()) {
          try { const parsed = JSON.parse(bj); tmpBooks = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []); } catch (e) {}
        }
        console.log('[Search] books_source', row.books_source, 'books_len', Array.isArray(tmpBooks) ? tmpBooks.length : 0);
      } catch (e) {}
    }
    // Keep current selection context
    state.lastContext = {
      district: row.district,
      school: row.school,
      grade: row.grade,
      curriculum: row.curriculum,
    };
    // Details from matched row
    const eqRaw = String(row.essential_question || row.essentialQuestion || '')
      .replace(/\s*[\r\n]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const genres = Array.isArray(row.genres) ? row.genres : String(row.text_genres || row.textGenres || '')
      .split(/[\n]+/).map(s => s.trim()).filter(Boolean);
    let books = [];
    // Prefer new 'books' array from API; fallback to books_json for compatibility
    if (Array.isArray(row.books)) {
      books = row.books;
    } else {
      const bj = row.books_json;
      if (Array.isArray(bj)) {
        books = bj;
      } else if (typeof bj === 'string' && bj.trim()) {
        try {
          const parsed = JSON.parse(bj);
          books = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
        } catch (e) { books = []; }
      } else {
        books = [];
      }
    }
    console.log('[Debug] Essential Questions raw:', eqRaw);
    console.log('[Search] Parsed books', { books_len: books.length, sample: books.slice(0, 3) });
    state.lastDetails = { eqRaw, genres, books };

    // Load modules and set active index
    const params = new URLSearchParams({ curriculum: String(row.curriculum || ''), grade: String(row.grade || '') });
    fetch('/api/modules?' + params.toString(), { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('modules fetch failed')))
      .then(json => {
        state.modules = Array.isArray(json.modules) ? json.modules : [];
        const currentNum = Number(row.module_number || (row.module ? String(row.module).replace(/^[^0-9]*/, '') : '')) || 0;
        state.activeIndex = Math.max(0, state.modules.findIndex(m => Number(m.module_number) === currentNum));
        console.log('[Search] Rendering result', {
          district: state.lastContext.district,
          school: state.lastContext.school,
          grade: state.lastContext.grade,
          curriculum: state.lastContext.curriculum,
          module_number: state.modules[state.activeIndex] ? state.modules[state.activeIndex].module_number : ''
        });
        renderResultFromState();
        updateNavButtons();
      })
      .catch(err => {
        console.error('Failed to load modules', err);
        state.modules = [];
        state.activeIndex = 0;
        console.log('[Search] Rendering result (no modules)', {
          district: state.lastContext.district,
          school: state.lastContext.school,
          grade: state.lastContext.grade,
          curriculum: state.lastContext.curriculum
        });
        renderResultFromState();
      });
  }

  function renderResultFromState() {
    if (!els.resultsMount || !state.lastContext) return;
    const ctx = state.lastContext;
    const mod = (state.modules && state.modules[state.activeIndex]) || null;
    const dateLabel = (mod && mod.start_md && mod.end_md) ? (mod.start_md + ' – ' + mod.end_md) : '';
    const html = renderResultCard({
      district: ctx.district,
      school: ctx.school,
      grade: ctx.grade,
      curriculum: ctx.curriculum,
      module_number: mod ? mod.module_number : '',
      module_title: mod ? mod.module_title : '',
      dateLabel,
      essential_question: state.lastDetails.eqRaw || '',
      text_genres: state.lastDetails.genres || [],
      books: state.lastDetails.books || [],
    });
    els.resultsMount.innerHTML = html;
    const prevBtn = document.getElementById('btnPrev');
    const nextBtn = document.getElementById('btnNext');
    if (prevBtn && nextBtn) {
      prevBtn.onclick = () => { if (state.activeIndex > 0) { state.activeIndex--; renderResultFromState(); updateNavButtons(); } };
      nextBtn.onclick = () => { if (state.activeIndex < state.modules.length - 1) { state.activeIndex++; renderResultFromState(); updateNavButtons(); } };
    }
  }

  function updateNavButtons(){
    const prevBtn = document.getElementById('btnPrev');
    const nextBtn = document.getElementById('btnNext');
    if (!prevBtn || !nextBtn) return;
    prevBtn.disabled = (state.activeIndex <= 0);
    nextBtn.disabled = (state.activeIndex >= (state.modules ? state.modules.length - 1 : 0));
  }

  async function doSearch() {
    const params = new URLSearchParams();
    if (els.date.value) params.set('date', els.date.value);
    if (els.district.value) params.set('district', els.district.value);
    const schoolValue = String(els.schoolInput.value || '').trim();
    if (schoolValue) params.set('school', schoolValue);
    if (els.grade.value) params.set('grade', els.grade.value);

    const url = '/api/search' + (params.toString() ? ('?' + params.toString()) : '');
    try {
      console.log('[Search] Request start', url);
      if (els.search) { els.search.disabled = true; els.search.textContent = 'Searching…'; }
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to search');
      const json = await res.json();
      console.log('[Search] API response', json);
      renderResults(Array.isArray(json.results) ? json.results : []);
    } catch (e) {
      console.error('Failed to fetch /api/search', e);
      if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">Unable to load search results. Please try again.</div>';
    } finally {
      if (els.search) { els.search.disabled = false; els.search.textContent = 'Find Curriculum'; }
      console.log('[Search] Request end');
    }
  }

  function bindEvents() {
    const runSearch = () => {
      console.log('[Search] Button clicked');
      const districtVal = String(els.district.value || '').trim();
      const schoolVal = String(els.schoolInput.value || '').trim();
      if (!districtVal || !schoolVal) {
        if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">Please select a district and school to search.</div>';
        return;
      }
      void doSearch();
    };

    els.district.addEventListener('change', () => { onDistrictChange(); });
    els.schoolInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
    els.clearSchool.addEventListener('click', () => { els.schoolInput.value = ''; els.schoolInput.focus(); });
    els.grade.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
    els.date.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
    els.clear.addEventListener('click', () => {
      setDefaultDate();
      els.district.value = '';
      els.grade.value = '';
      onDistrictChange();
      els.schoolInput.value = '';
      if (els.resultsMount) els.resultsMount.innerHTML = '';
    });
    if (els.search) { els.search.addEventListener('click', (e) => { e.preventDefault(); runSearch(); }); }
    if (els.filtersForm) { els.filtersForm.addEventListener('submit', (e) => { e.preventDefault(); runSearch(); }); }
  }

  (async function boot() {
    // Initialize placeholders so dropdowns are visible immediately
    if (els.district) setOptions(els.district, [], 'All Districts');
    if (els.grade) setOptions(els.grade, [], 'All Grades');
    setDefaultDate();
    await loadMeta();
    bindEvents();
  }());
})();

