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

  function setDefaultDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    els.date.value = yyyy + '-' + mm + '-' + dd;
  }

  async function loadMeta() {
    try {
      if (els.district) setOptions(els.district, [], 'All Districts');
      if (els.grade) setOptions(els.grade, [], 'All Grades');

      const res = await fetch('/api/meta', { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to load meta');
      const json = await res.json();
      state.meta = json || {};

      const byDistrict = {};
      if (Array.isArray(json.schools)) {
        for (const s of json.schools) {
          const d = String(s.district || '').trim();
          const name = String(s.school || '').trim();
          if (!d || !name) continue;
          if (!byDistrict[d]) byDistrict[d] = [];
          byDistrict[d].push(name);
        }
        Object.keys(byDistrict).forEach(d => {
          byDistrict[d] = Array.from(new Set(byDistrict[d])).sort((a, b) => a.localeCompare(b));
        });
      }
      state.schoolsByDistrict = byDistrict;

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
      setOptions(els.grade, json.grades || [], 'All Grades');
      const allSchools = Object.values(byDistrict).flat().sort((a, b) => a.localeCompare(b));
      setDatalistOptions(els.schoolList, allSchools);
    } catch (e) {
      console.error('Failed to fetch /api/meta', e);
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
    els.schoolInput.value = '';
  }

  function escapeHTML(s){
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
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
        ('<div class="subcard bg-purple section"><h3>Reading List</h3>' + (bookList ? ('<ul class="book-list">' + bookList + '</ul>') : '<div class="empty">Not Available</div>') + '</div>') +
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
    state.lastContext = {
      district: row.district,
      school: row.school,
      grade: row.grade,
      curriculum: row.curriculum,
    };
    const eqRaw = String(row.essential_question || row.essentialQuestion || '')
      .replace(/\s*[\r\n]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const genres = Array.isArray(row.genres) ? row.genres : String(row.text_genres || row.textGenres || '')
      .split(/[\n]+/).map(s => s.trim()).filter(Boolean);
    let books = [];
    if (Array.isArray(row.books)) {
      books = row.books;
    } else {
      const bj = row.books_json;
      if (Array.isArray(bj)) books = bj;
      else if (typeof bj === 'string' && bj.trim()) {
        try {
          const parsed = JSON.parse(bj);
          books = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
        } catch (e) { books = []; }
      } else {
        books = [];
      }
    }
    state.lastDetails = { eqRaw, genres, books };
    const params = new URLSearchParams({ curriculum: String(row.curriculum || ''), grade: String(row.grade || '') });
    fetch('/api/modules?' + params.toString(), { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('modules fetch failed')))
      .then(json => {
        state.modules = Array.isArray(json.modules) ? json.modules : [];
        const currentNum = Number(row.module_number || (row.module ? String(row.module).replace(/^[^0-9]*/, '') : '')) || 0;
        state.activeIndex = Math.max(0, state.modules.findIndex(m => Number(m.module_number) === currentNum));
        renderResultFromState();
        updateNavButtons();
      })
      .catch(() => {
        state.modules = [];
        state.activeIndex = 0;
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
      if (els.search) { els.search.disabled = true; els.search.textContent = 'Searching…'; }
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to search');
      const json = await res.json();
      renderResults(Array.isArray(json.results) ? json.results : []);
    } catch (e) {
      if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">Unable to load search results. Please try again.</div>';
    } finally {
      if (els.search) { els.search.disabled = false; els.search.textContent = 'Find Curriculum'; }
    }
  }

  function bindEvents() {
    const runSearch = () => {
      const districtVal = String(els.district.value || '').trim();
      const schoolVal = String(els.schoolInput.value || '').trim();
      if (!districtVal || !schoolVal) {
        if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">Please select a district and school to search.</div>';
        return;
      }
      void doSearch();
    };

    els.district.addEventListener('change', () => { onDistrictChange(); });
    els.schoolInput.addEventListener('change', () => { /* selection from datalist */ });
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
    if (els.district) setOptions(els.district, [], 'All Districts');
    if (els.grade) setOptions(els.grade, [], 'All Grades');
    setDefaultDate();
    await loadMeta();
    bindEvents();
  }());
})();
