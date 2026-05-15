/* global window, document, fetch */
(function initApp() {
  console.log('app loaded');
  console.log('district element', document.getElementById('filterDistrict'));
  console.log('grade element', document.getElementById('filterGrade'));
  console.log('boot elements', {
    district: !!document.getElementById('filterDistrict'),
    schoolInput: !!document.getElementById('schoolInput'),
    schoolList: !!document.getElementById('schoolList'),
    grade: !!document.getElementById('filterGrade'),
    date: !!document.getElementById('filterDate'),
    role: !!document.getElementById('filterRole'),
    resultsMount: !!document.getElementById('resultsMount'),
  });

  const els = {
    date: document.getElementById('filterDate'),
    district: document.getElementById('filterDistrict'),
    schoolInput: document.getElementById('schoolInput'),
    schoolList: document.getElementById('schoolList'),
    clearSchool: document.getElementById('clearSchool'),
    grade: document.getElementById('filterGrade'),
    role: document.getElementById('filterRole'),
    clear: document.getElementById('clearFilters'),
    search: document.getElementById('searchBtn'),
    language: document.getElementById('languageSelect'),
    filtersForm: document.getElementById('filtersForm'),
    roleIntroMount: document.getElementById('roleIntroMount'),
    resultsMount: document.getElementById('resultsMount'),
    roleOutroMount: document.getElementById('roleOutroMount'),
    resultsCount: document.getElementById('resultsCount'),
    cards: document.getElementById('cards'),
  };

  const state = {
    meta: null,
    schoolsByDistrict: {},
    gradesBySchool: {}, // key: "district|school" -> ['PK','K','1'...'12']
    modules: [],
    activeIndex: 0,
    selectedLanguage: 'en',
    selectedRole: '',
    lastContext: null,
    lastDetails: { eq: [], genres: [], books: [] },
  };

  const translations = {
    en: {
      heroTitle: 'NYC Reads Curriculum Finder',
      heroSubtitle: 'Discover curriculum, themes, and reading materials for NYC schools',
      aboutTitle: 'About This Tool',
      aboutIntro: 'This curriculum search tool helps identify exactly what students are learning in literacy at a given school — including the curriculum, current module, essential questions, and book lists.',
      disclaimerLabel: 'Disclaimer:',
      disclaimerText: 'This tool is intended to provide general information about district and school curriculum implementation. Timelines and materials may vary by school or classroom. For the most accurate and up-to-date information, please contact your school directly.',
      filtersTitle: 'Find Your Curriculum',
      districtLabel: 'District',
      schoolLabel: 'School',
      schoolPlaceholder: 'Type to search schools…',
      clearSchoolAria: 'Clear school',
      gradeLabel: 'Grade Level',
      dateLabel: 'Date',
      dateHint: '(We’ll find the curriculum module for this date)',
      roleLabel: 'Role',
      languageLabel: 'Language',
      allDistricts: 'All Districts',
      allGrades: 'All Grades',
      allRoles: 'All Roles',
      roleOst: 'OST/Afterschool Provider',
      roleParent: 'Parent or Caregiver',
      roleSchool: 'School Leader or Teacher',
      clearBtn: 'Clear',
      searchBtn: 'Find Curriculum',
      searchingBtn: 'Searching…',
      resultsTitle: 'Curriculum Information',
      feedbackTitle: 'Help Us Improve',
      feedbackPrompt: 'Is your school missing or something not quite right?',
      feedbackButton: 'Submit Feedback Form →',
      feedbackNote: 'We review submissions regularly and use them to improve the tool.',
      noScript: 'This site requires JavaScript to function. Please enable JavaScript in your browser.',
      noDataSheet: 'No data. Please check the connected Google Sheet.',
      noDataMeta: 'No data. Unable to load metadata.',
      noResults: 'No results. Try adjusting filters or date.',
      noResultsGeneric: 'Not Available',
      searchError: 'Unable to load search results. Please try again.',
      schoolRequired: 'Please select a school to search.',
      gradeRequired: 'Please select a grade level to search.',
      dateRequired: 'Please select a date to search.',
      schoolInformation: 'School Information',
      moduleInformation: 'Module Information',
      essentialQuestions: 'Essential Questions',
      textGenres: 'Text Genres',
      readingList: 'Reading List',
      schoolField: 'School:',
      gradeField: 'Grade:',
      districtField: 'District:',
      curriculumField: 'Curriculum:',
      moduleField: 'Module:',
      themeField: 'Theme:',
      dateRangeField: 'Date Range:',
      prevBtn: '‹ Previous',
      nextBtn: 'Next ›',
      dataSource: 'Data Source:',
      highSchoolUnavailable: 'NYC Reads is currently focused on grades K–8. Curriculum information and reading lists for grades 9–12 are not yet available in this tool.',
      learnMoreHere: 'To learn more about NYC Reads, click here.'
    },
    es: {
      heroTitle: 'Buscador de Curriculo NYC Reads',
      heroSubtitle: 'Descubre curriculo, temas y materiales de lectura para las escuelas de NYC',
      aboutTitle: 'Acerca de esta herramienta',
      aboutIntro: 'Esta herramienta ayuda a identificar exactamente lo que estudian los estudiantes en alfabetizacion en una escuela determinada, incluido el curriculo, el modulo actual, las preguntas esenciales y las listas de lectura.',
      disclaimerLabel: 'Aviso:',
      disclaimerText: 'Esta herramienta ofrece informacion general sobre la implementacion del curriculo por distrito y escuela. Los tiempos y materiales pueden variar segun la escuela o el salon. Para obtener la informacion mas precisa y actualizada, comunicate directamente con tu escuela.',
      filtersTitle: 'Encuentra tu curriculo',
      districtLabel: 'Distrito',
      schoolLabel: 'Escuela',
      schoolPlaceholder: 'Escribe para buscar escuelas…',
      clearSchoolAria: 'Borrar escuela',
      gradeLabel: 'Grado',
      dateLabel: 'Fecha',
      dateHint: '(Encontraremos el modulo curricular para esta fecha)',
      roleLabel: 'Rol',
      languageLabel: 'Idioma',
      allDistricts: 'Todos los distritos',
      allGrades: 'Todos los grados',
      allRoles: 'Todos los roles',
      roleOst: 'Proveedor OST/Despues de clases',
      roleParent: 'Padre, madre o cuidador',
      roleSchool: 'Lider escolar o maestro',
      clearBtn: 'Borrar',
      searchBtn: 'Buscar curriculo',
      searchingBtn: 'Buscando…',
      resultsTitle: 'Informacion curricular',
      feedbackTitle: 'Ayudanos a mejorar',
      feedbackPrompt: '¿Falta tu escuela o algo no esta del todo bien?',
      feedbackButton: 'Enviar formulario de comentarios →',
      feedbackNote: 'Revisamos las respuestas regularmente y las usamos para mejorar la herramienta.',
      noScript: 'Este sitio requiere JavaScript para funcionar. Activa JavaScript en tu navegador.',
      noDataSheet: 'No hay datos. Revisa la hoja de calculo conectada.',
      noDataMeta: 'No hay datos. No se pudo cargar la informacion.',
      noResults: 'No hay resultados. Intenta ajustar los filtros o la fecha.',
      noResultsGeneric: 'No disponible',
      searchError: 'No se pudieron cargar los resultados de la busqueda. Intentalo de nuevo.',
      schoolRequired: 'Selecciona una escuela para buscar.',
      gradeRequired: 'Selecciona un grado para buscar.',
      dateRequired: 'Selecciona una fecha para buscar.',
      schoolInformation: 'Informacion escolar',
      moduleInformation: 'Informacion del modulo',
      essentialQuestions: 'Preguntas esenciales',
      textGenres: 'Generos de texto',
      readingList: 'Lista de lectura',
      schoolField: 'Escuela:',
      gradeField: 'Grado:',
      districtField: 'Distrito:',
      curriculumField: 'Curriculo:',
      moduleField: 'Modulo:',
      themeField: 'Tema:',
      dateRangeField: 'Rango de fechas:',
      prevBtn: '‹ Anterior',
      nextBtn: 'Siguiente ›',
      dataSource: 'Fuente de datos:',
      highSchoolUnavailable: 'NYC Reads actualmente se enfoca en los grados K–8. La informacion curricular y las listas de lectura para los grados 9–12 aun no estan disponibles en esta herramienta.',
      learnMoreHere: 'Para obtener mas informacion sobre NYC Reads, haz clic aqui.'
    }
  };

  function t(key) {
    const lang = state.selectedLanguage || 'en';
    return (translations[lang] && translations[lang][key]) || translations.en[key] || key;
  }

  function getStoredLanguage() {
    try {
      return window.localStorage.getItem('selectedLanguage') || 'en';
    } catch (err) {
      console.warn('[i18n] Unable to read selectedLanguage from localStorage', err);
      return 'en';
    }
  }

  function saveStoredLanguage(value) {
    try {
      window.localStorage.setItem('selectedLanguage', value);
    } catch (err) {
      console.warn('[i18n] Unable to save selectedLanguage to localStorage', err);
    }
  }

  function setOptions(selectEl, values, allLabel) {
    if (!selectEl) {
      console.warn('[Options] Missing select element for label', allLabel);
      return;
    }
    const escapeAttr = value => String(value).split('"').join('&quot;');
    const opts = ['<option value="">' + allLabel + '</option>']
      .concat(values.map(v => '<option value="' + escapeAttr(v) + '">' + v + '</option>'))
      .join('');
    selectEl.innerHTML = opts;
    console.log('[Options] Rendered', {
      target: selectEl.id || '(unknown)',
      label: allLabel,
      optionCount: selectEl.options ? selectEl.options.length : 0,
      sample: Array.isArray(values) ? values.slice(0, 8) : [],
    });
  }

  function setDatalistOptions(listEl, values) {
    if (!listEl) {
      console.warn('[Datalist] Missing datalist element');
      return;
    }
    const escapeAttr = value => String(value).split('"').join('&quot;');
    const opts = values.map(v => '<option value="' + escapeAttr(v) + '"></option>').join('');
    listEl.innerHTML = opts;
    console.log('[Datalist] Rendered', {
      target: listEl.id || '(unknown)',
      optionCount: Array.isArray(values) ? values.length : 0,
      sample: Array.isArray(values) ? values.slice(0, 8) : [],
    });
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

  function getDistrictValues() {
    const districtsFromMeta = Array.isArray(state.meta && state.meta.districts) ? state.meta.districts : [];
    const numericSorted = Array.from(new Set(districtsFromMeta))
      .map(d => Number(String(d).trim()))
      .filter(n => !Number.isNaN(n))
      .sort((a, b) => a - b)
      .map(n => String(n));
    if (numericSorted.length) return numericSorted;
    const keys = Object.keys(state.schoolsByDistrict || {});
    return Array.from(new Set(keys))
      .map(d => Number(String(d).trim()))
      .filter(n => !Number.isNaN(n))
      .sort((a, b) => a - b)
      .map(n => String(n));
  }

  function getAllSchoolValues() {
    return Object.values(state.schoolsByDistrict || {}).flat().sort((a, b) => a.localeCompare(b));
  }

  function updateRoleOptions() {
    if (!els.role) return;
    const selected = String(els.role.value || '').trim();
    const optionLabels = {
      '': t('allRoles'),
      'OST/Afterschool Provider': t('roleOst'),
      'Parent or Caregiver': t('roleParent'),
      'School Leader or Teacher': t('roleSchool'),
    };
    Array.from(els.role.options || []).forEach(option => {
      option.text = optionLabels[option.value] || option.value;
    });
    els.role.value = selected;
  }

  function renderFilterControls() {
    const selectedDistrict = els.district ? String(els.district.value || '').trim() : '';
    const selectedGrade = els.grade ? String(els.grade.value || '').trim() : '';
    const districts = getDistrictValues();
    const grades = (state.meta && Array.isArray(state.meta.grades) && state.meta.grades.length)
      ? state.meta.grades
      : defaultGradeTokens();
    setOptions(els.district, districts, t('allDistricts'));
    setOptions(els.grade, grades, t('allGrades'));
    setDatalistOptions(els.schoolList, getAllSchoolValues());
    if (els.district && selectedDistrict) els.district.value = selectedDistrict;
    if (els.grade && selectedGrade) els.grade.value = selectedGrade;
    updateRoleOptions();
  }

  function updateFirstOptionLabel(selectEl, label) {
    if (!selectEl || !selectEl.options || !selectEl.options.length) return;
    if (String(selectEl.options[0].value || '') !== '') return;
    selectEl.options[0].text = label;
  }

  function updateTranslatedFilterLabels() {
    updateFirstOptionLabel(els.district, t('allDistricts'));
    updateFirstOptionLabel(els.grade, t('allGrades'));
    updateRoleOptions();
  }

  function applyLanguage() {
    document.documentElement.lang = state.selectedLanguage || 'en';
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setText('heroTitle', t('heroTitle'));
    setText('heroSubtitle', t('heroSubtitle'));
    setText('aboutTitle', t('aboutTitle'));
    setText('aboutIntro', t('aboutIntro'));
    setText('disclaimerLabel', t('disclaimerLabel'));
    setText('disclaimerText', t('disclaimerText'));
    setText('filtersTitle', t('filtersTitle'));
    setText('districtLabel', t('districtLabel'));
    setText('schoolLabel', t('schoolLabel'));
    setText('gradeLabel', t('gradeLabel'));
    setText('roleLabel', t('roleLabel'));
    setText('languageLabel', t('languageLabel'));
    setText('resultsTitle', t('resultsTitle'));
    setText('feedbackTitle', t('feedbackTitle'));
    setText('feedbackPrompt', t('feedbackPrompt'));
    setText('feedbackButton', t('feedbackButton'));
    setText('feedbackNote', t('feedbackNote'));
    setText('noscriptMessage', t('noScript'));
    if (els.schoolInput) els.schoolInput.placeholder = t('schoolPlaceholder');
    if (els.clearSchool) els.clearSchool.setAttribute('aria-label', t('clearSchoolAria'));
    if (els.clear) els.clear.textContent = t('clearBtn');
    if (els.search && !els.search.disabled) els.search.textContent = t('searchBtn');
    const dateLabel = document.getElementById('dateLabel');
    if (dateLabel) {
      dateLabel.innerHTML = t('dateLabel') + ' <span class="hint" id="dateHint">' + t('dateHint') + '</span>';
    }
    if (els.language) {
      const labels = { en: 'English', es: 'Espanol' };
      Array.from(els.language.options || []).forEach(option => {
        option.text = labels[option.value] || option.value;
      });
    }
    updateTranslatedFilterLabels();
  }

  async function loadMeta() {
    try {
      console.log('[Meta] Starting loadMeta');
      // Always insert defaults first so dropdowns are never empty
      if (els.district) setOptions(els.district, [], t('allDistricts'));
      if (els.grade) setOptions(els.grade, [], t('allGrades'));

      const res = await fetch('/api/meta', { cache: 'no-cache' });
      console.log('[Meta] Response received', {
        ok: res.ok,
        status: res.status,
        contentType: res.headers.get('content-type'),
        url: res.url,
      });
      if (!res.ok) throw new Error('Failed to load meta');
      const json = await res.json();
      state.meta = json || {};
      console.log('[Meta] Raw payload summary', {
        keys: Object.keys(state.meta || {}),
        districtsIsArray: Array.isArray(json && json.districts),
        schoolsIsArray: Array.isArray(json && json.schools),
        gradesIsArray: Array.isArray(json && json.grades),
        districtsCount: Array.isArray(json && json.districts) ? json.districts.length : null,
        schoolsCount: Array.isArray(json && json.schools) ? json.schools.length : null,
        gradesCount: Array.isArray(json && json.grades) ? json.grades.length : null,
        sampleDistricts: Array.isArray(json && json.districts) ? json.districts.slice(0, 8) : [],
        sampleSchools: Array.isArray(json && json.schools) ? json.schools.slice(0, 3) : [],
        sampleGrades: Array.isArray(json && json.grades) ? json.grades.slice(0, 8) : [],
      });

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
      console.log('[Meta] schoolsByDistrict mapped', {
        districtKeys: Object.keys(byDistrict).slice(0, 12),
        districtCount: Object.keys(byDistrict).length,
        sampleDistrictSchoolCounts: Object.keys(byDistrict).slice(0, 6).map(d => ({ district: d, count: byDistrict[d].length })),
      });

      // Fetch grades per school mapping
      try {
        const res2 = await fetch('/api/school-grades', { cache: 'no-cache' });
        console.log('[Meta] /api/school-grades response', {
          ok: res2.ok,
          status: res2.status,
          contentType: res2.headers.get('content-type'),
        });
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
          console.log('[Meta] gradesBySchool mapped', {
            schoolCount: Object.keys(map).length,
            sample: Object.entries(map).slice(0, 5),
          });
        } else {
          console.warn('[Meta] /api/school-grades returned', res2.status);
        }
      } catch (e) {
        console.warn('[Meta] Failed to fetch /api/school-grades', e);
      }

      const districts = getDistrictValues();
      const allSchools = getAllSchoolValues();
      renderFilterControls();
      console.log('[Meta] Final render summary', {
        districtsRendered: districts.length,
        schoolsRendered: allSchools.length,
        gradesRendered: (state.meta.grades || []).length,
        districtSelectOptions: els.district && els.district.options ? els.district.options.length : null,
        gradeSelectOptions: els.grade && els.grade.options ? els.grade.options.length : null,
      });

      console.log('[Meta] Loaded', {
        schoolsCount: Array.isArray(json.schools) ? json.schools.length : 0,
        districtsCount: Array.isArray(json.districts) ? json.districts.length : 0,
        gradesCount: Array.isArray(json.grades) ? json.grades.length : 0,
        sampleDistricts: (json.districts || []).slice(0, 8),
        sampleGrades: (json.grades || []).slice(0, 8),
      });
      if ((!json.districts || json.districts.length === 0) && (!allSchools || allSchools.length === 0)) {
        console.error('Meta is empty from /api/meta');
        if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">' + t('noDataSheet') + '</div>';
      }
    } catch (e) {
      console.error('Failed to fetch /api/meta', e);
      console.error('[Meta] loadMeta failed details', {
        message: e && e.message ? e.message : String(e),
        stack: e && e.stack ? e.stack : null,
      });
      // Ensure placeholders still render even if meta fails
      if (els.district) setOptions(els.district, [], t('allDistricts'));
      if (els.grade) setOptions(els.grade, [], t('allGrades'));
      if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">' + t('noDataMeta') + '</div>';
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
    console.log('[District] Change handled', {
      selectedDistrict: district,
      matchedSchools: sorted.length,
      sampleSchools: sorted.slice(0, 8),
    });
    // Clear the current school input when district changes
    els.schoolInput.value = '';
    // Reset grades to global when district changed and school cleared
    if (state.meta) setOptions(els.grade, state.meta.grades || defaultGradeTokens(), t('allGrades'));
  }

  function recomputeGradeOptionsForSelection() {
    const districtVal = String(els.district.value || '').trim();
    const schoolVal = String(els.schoolInput.value || '').trim();
    const key = schoolKey(districtVal, schoolVal);
    const allowed = (districtVal && schoolVal && state.gradesBySchool && state.gradesBySchool[key] && state.gradesBySchool[key].length)
      ? state.gradesBySchool[key]
      : ((state.meta && state.meta.grades && state.meta.grades.length) ? state.meta.grades : defaultGradeTokens());
    const allowedSorted = sortGradeTokens(allowed);
    setOptions(els.grade, allowedSorted, t('allGrades'));
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

  function currentRoleValue() {
    const stateRole = String(state.selectedRole || '').trim();
    if (stateRole) return stateRole;
    if (!els.role) return '';
    const rawValue = String(els.role.value || '').trim();
    if (rawValue) return rawValue;
    const idx = Number(els.role.selectedIndex);
    const option = idx >= 0 ? els.role.options[idx] : null;
    return option ? String(option.text || '').trim() : '';
  }

  function isOstRoleSelected() {
    const role = currentRoleValue()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return role.indexOf('ost') !== -1 && role.indexOf('afterschool') !== -1 && role.indexOf('provider') !== -1;
  }

  function isParentCaregiverRoleSelected() {
    const role = currentRoleValue()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return role.indexOf('parent') !== -1 && role.indexOf('caregiver') !== -1;
  }

  function isSchoolLeaderTeacherRoleSelected() {
    const role = currentRoleValue()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return role.indexOf('school leader') !== -1 || role.indexOf('teacher') !== -1;
  }

  function renderOstUsageBlock() {
    const lang = state.selectedLanguage || 'en';
    if (isSchoolLeaderTeacherRoleSelected()) {
      const content = lang === 'es'
        ? 'Si eres lider escolar o maestro, usa la herramienta para identificar el aprendizaje por grado en tu escuela y compartirlo con el personal, los socios de afterschool y las familias para apoyar la alineacion. Usala para guiar la planificacion, fortalecer las conexiones entre la instruccion en clase y el enriquecimiento, y asegurar que todos los socios desarrollen conocimiento y vocabulario en torno a temas compartidos. Encuentra mas recursos para la participacion y la alianza con las familias <a href="https://cprl.law.columbia.edu/content/spread-word-nyc-reads-family-partnership-toolkit" target="_blank" rel="noopener noreferrer">aqui</a>.'
        : 'If you are a school leader or teacher, use the tool to identify grade-level learning across your school and share it with staff, afterschool partners, and families to support alignment. Use it to guide planning, strengthen connections between classroom instruction and enrichment, and ensure all partners are building knowledge and vocabulary around shared topics. Find more resources for family partnership and engagement <a href="https://cprl.law.columbia.edu/content/spread-word-nyc-reads-family-partnership-toolkit" target="_blank" rel="noopener noreferrer">here</a>.';
      return (
        '<div class="subcard ost-note-card section">' +
          '<h3>' + (lang === 'es' ? 'Como usar el Buscador de Curriculo NYC Reads' : 'How to Use the NYC Reads Curriculum Finder') + '</h3>' +
          '<p>' + content + '</p>' +
        '</div>'
      );
    }
    if (isParentCaregiverRoleSelected()) {
      const intro = lang === 'es'
        ? 'Si eres padre, madre o cuidador, busca el grado de tu hijo y mira lo que esta aprendiendo. Puedes:'
        : 'If you are a parent or caregiver, look up your child’s grade and see what they are learning about. You can:';
      const items = lang === 'es'
        ? [
          'Leer juntos un libro sobre ese tema usando Sora (la biblioteca digital de NYCPS)',
          'Hacer preguntas sobre el tema como "¿Que aprendiste?" o "¿Que quieres saber mas?"',
          'Hablar del tema durante el dia',
          'Buscar maneras de aprender mas, como un video corto, una visita a la biblioteca o mirar imagenes juntos',
        ]
        : [
          'Read a book together on that topic using Sora (NYCPS’s digital library)',
          'Ask questions about the topic like, “What did you learn?” “What do you want to know more about?”',
          'Talk about the topic during your day (for example, notice plants on a walk if they are learning about trees)',
          'Find ways to learn more (watch a short video, visit the library, or look at pictures together)',
        ];
      return (
        '<div class="subcard ost-note-card section">' +
          '<h3>' + (lang === 'es' ? 'Como usar el Buscador de Curriculo NYC Reads' : 'How to Use the NYC Reads Curriculum Finder') + '</h3>' +
          '<p>' + intro + '</p>' +
          '<ul class="role-guidance-list">' +
            items.map(item => '<li>' + item + '</li>').join('') +
          '</ul>' +
        '</div>'
      );
    }
    const content = lang === 'es'
      ? 'Si eres proveedor de tiempo fuera de la escuela, busca tu escuela y grado, identifica el modulo actual y planifica una actividad alineada usando el <a href="https://drive.google.com/file/d/1KmOwO0uxwQs1jcuXuayQPD3o0v5Nd9C7/view" target="_blank" rel="noopener noreferrer">Knowledge-Building Activity Planning Protocol</a> y el <a href="https://cprl.law.columbia.edu/content/out-school-time-nyc-reads-toolkit" target="_blank" rel="noopener noreferrer">Out-of-School Time NYC Reads Toolkit</a>. Los programas OST son un pilar clave para reforzar el aprendizaje mas alla del dia escolar al desarrollar conocimiento y vocabulario mediante experiencias atractivas del mundo real.'
      : 'If you are an Out-of-School Time provider, find your school and grade, identify the current module, and plan an aligned activity using the <a href="https://drive.google.com/file/d/1KmOwO0uxwQs1jcuXuayQPD3o0v5Nd9C7/view" target="_blank" rel="noopener noreferrer">Knowledge-Building Activity Planning Protocol</a> and the <a href="https://cprl.law.columbia.edu/content/out-school-time-nyc-reads-toolkit" target="_blank" rel="noopener noreferrer">Out-of-School Time NYC Reads Toolkit</a> - OST programs are a critical pillar in reinforcing learning beyond the school day by building knowledge and vocabulary through engaging, real-world experiences.';
    return (
      '<div class="subcard ost-note-card section">' +
        '<h3>' + (lang === 'es' ? 'Como usar el Buscador de Curriculo NYC Reads' : 'How to Use the NYC Reads Curriculum Finder') + '</h3>' +
        '<p>' + content + '</p>' +
      '</div>'
    );
  }

  function renderOstLibraryBlock() {
    return '';
  }

  function clearRoleBlocks() {
    if (els.roleIntroMount) els.roleIntroMount.innerHTML = '';
    if (els.roleOutroMount) els.roleOutroMount.innerHTML = '';
  }

  function renderEmptyMessageFromResponse(json) {
    if (!els.resultsMount) return;
    clearRoleBlocks();
    if (json && json.message_type === 'high_school_not_available') {
      const infoUrl = String((json && json.info_url) || 'https://www.schools.nyc.gov/learning/subjects/literacy/nyc-reads');
      const learnMore = state.selectedLanguage === 'es'
        ? 'Para obtener mas informacion sobre NYC Reads, haz clic <a href="' + infoUrl + '" target="_blank" rel="noopener noreferrer">aqui</a>.'
        : 'To learn more about NYC Reads, click <a href="' + infoUrl + '" target="_blank" rel="noopener noreferrer">here</a>.';
      els.resultsMount.innerHTML =
        '<div class="empty">' +
        t('highSchoolUnavailable') + ' ' +
        learnMore +
        '</div>';
      return;
    }
    els.resultsMount.innerHTML = '<div class="empty">' + escapeHTML((json && json.message) || t('noResults')) + '</div>';
  }

  function applyRoleBlocks(mainHtml) {
    const showRoleIntro = isOstRoleSelected() || isParentCaregiverRoleSelected() || isSchoolLeaderTeacherRoleSelected();
    const introHtml = showRoleIntro ? renderOstUsageBlock() : '';
    const outroHtml = isOstRoleSelected() ? renderOstLibraryBlock() : '';
    clearRoleBlocks();
    if (els.roleIntroMount && els.roleOutroMount) {
      els.roleIntroMount.innerHTML = introHtml;
      els.resultsMount.innerHTML = mainHtml;
      els.roleOutroMount.innerHTML = outroHtml;
      return;
    }
    els.resultsMount.innerHTML = introHtml + mainHtml + outroHtml;
  }

  function renderResultCard(model) {
    const { district, school, grade, curriculum, module_number, module_title, dateLabel, essential_question, text_genres, books } = model;
    const eqParagraph = '<p>' + escapeHTML(essential_question || '') + '</p>';
    const genrePills = (text_genres || []).map(g => '<span class="pill">' + escapeHTML(g) + '</span>').join('');
    const disableBookLinks = isOstRoleSelected();
    const bookList = (books || []).map(b => {
      const title = b && b.title ? String(b.title) : '';
      const link = b && b.url ? String(b.url) : '';
      const cover = b && (b.coverImageUrl || b.coverimageurl) ? String(b.coverImageUrl || b.coverimageurl) : '';
      const imgTag = cover ? ('<img src="' + cover + '" alt="' + escapeHTML(title || 'Book cover') + '" onerror="this.onerror=null; this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';" />') : '';
      const img = !disableBookLinks && link && imgTag
        ? ('<a href="' + link + '" target="_blank" rel="noopener noreferrer">' + imgTag + '</a>')
        : imgTag;
      const fallback = '<div class="book-fallback"' + (cover ? '' : ' style="display:flex;"') + '>' + (state.selectedLanguage === 'es' ? 'Portada no disponible por ahora' : 'Book cover not available for now') + '</div>';
      const titleHtml = (!disableBookLinks && link) ? ('<a href="' + link + '" target="_blank" rel="noopener noreferrer">' + escapeHTML(title) + '</a>') : escapeHTML(title);
      return '<li class="book-item"><div class="book-thumb">' + img + fallback + '</div><div class="book-title">' + titleHtml + '</div></li>';
    }).join('');
    // Recommended Text section removed

    const readingListIntro = isOstRoleSelected()
      ? (
        '<div class="reading-list-intro">' +
          (
            state.selectedLanguage === 'es'
              ? 'La Oficina de Servicios Bibliotecarios de NYCPS preparo estas listas de lectura para apoyar la construccion de conocimiento mas alla del dia escolar. No son exactamente los libros usados en clase, sino textos recomendados para ampliar el aprendizaje e involucrar a los lectores. Estos textos ayudan a desarrollar conocimiento previo, vocabulario y comprension de temas clave que estudian los estudiantes. Los textos se eligieron por su alineacion con los temas del modulo, la representacion diversa y autentica, la calidad del texto, la accesibilidad y el interes estudiantil.'
              : 'The NYCPS Office of Library Services curated these reading lists to support knowledge-building beyond the school day; they are not the exact books used in class, but recommended texts to extend learning and engage readers. These texts help build background knowledge, vocabulary, and understanding of key topics students are studying. The texts were curated using criteria such as alignment to module topics, diverse and authentic representation, text quality, accessibility, and student interests.'
          ) +
          '<br><br>' +
          (
            state.selectedLanguage === 'es'
              ? 'Los enlaces llevan a la Biblioteca Digital de la Ciudad en <a href="https://soraapp.com/welcome/login/310229" target="_blank" rel="noopener noreferrer">Sora</a>, la coleccion digital de NYCPS. Aunque los proveedores OST no tienen acceso directo, estos enlaces se incluyen para que los estudiantes con quienes trabajas puedan acceder a los textos con sus cuentas de NYCPS. Si te interesa usar alguno de estos libros en tu programa, tambien puedes buscar los titulos en la Biblioteca Publica de Nueva York (NYPL), la Biblioteca Publica de Brooklyn (BPL) o la Biblioteca Publica de Queens (QPL). Para aprender mas sobre Sora, haz clic <a href="https://company.overdrive.com/k-12-schools/discover-sora/nyc-edu/" target="_blank" rel="noopener noreferrer">aqui</a>.'
              : 'These reading lists can help you identify texts connected to what students are learning in school. If you are interested in using one of these books in your program, you can look for the titles through the <a href="https://www.nypl.org/" target="_blank" rel="noopener noreferrer">New York Public Library (NYPL)</a>, <a href="https://www.bklynlibrary.org/" target="_blank" rel="noopener noreferrer">Brooklyn Public Library (BPL)</a>, or <a href="http://www.queenslibrary.org/" target="_blank" rel="noopener noreferrer">Queens Public Library (QPL)</a>. You can also download a spreadsheet of the full reading lists here.'
          ) +
        '</div>'
      )
      : isParentCaregiverRoleSelected()
        ? (
          '<div class="reading-list-intro">' +
            (
              state.selectedLanguage === 'es'
                ? 'La Oficina de Servicios Bibliotecarios de NYCPS preparo estas listas de lectura para ayudarte a apoyar el aprendizaje y los intereses de tu hijo. No son exactamente los libros que tu hijo lee en la escuela, pero son excelentes libros para seguir aprendiendo y leyendo en casa. Los libros fueron elegidos para conectar con lo que estudian los estudiantes, sus intereses y una variedad de personas y experiencias.'
                : 'The NYCPS Office of Library Services made these reading lists to help you support your child’s learning and interests. These are not the exact books your child reads in school, but they are great books to keep learning and reading, continuing at home. The books were chosen to match what students are learning, their interests, and to show many different people and experiences.'
            ) +
            '<br><br>' +
            (
              state.selectedLanguage === 'es'
                ? 'Los enlaces te llevan a la Biblioteca Digital de la Ciudad en <a href="https://soraapp.com/welcome/login/310229" target="_blank" rel="noopener noreferrer">Sora</a>, la coleccion digital de NYCPS. Cada estudiante de las Escuelas Publicas de NYC tiene acceso gratuito a la Biblioteca Digital de la Ciudad en Sora. Incluye libros electronicos, audiolibros, comics y revistas para estudiantes desde Pre-K hasta 12 grado. Si tienes preguntas sobre como iniciar sesion en Sora, haz clic aqui para <a href="https://rise.articulate.com/share/fcB-JQs3ozeuQWZHwEw4Az6upNkkYKb-?_gl=1%2Awljhzo%2A_gcl_au%2ANjE5MjA1NTAzLjE3NzU1ODIxMjY.%2A_ga%2AMTA3MTMzNjUzLjE3NzU1ODIxMjA.%2A_ga_J2DYCDLK48%2AczE3NzU1ODIxMjYkbzEkZzEkdDE3NzU1ODIyMjckajYwJGwwJGgw#/lessons/op3g0wQ8oC99f1Rznjn1BW7Q1zG5KrxA" target="_blank" rel="noopener noreferrer">Pre-K–3</a> o <a href="https://rise.articulate.com/share/fcB-JQs3ozeuQWZHwEw4Az6upNkkYKb-?_gl=1%2A882ek0%2A_gcl_au%2ANjE5MjA1NTAzLjE3NzU1ODIxMjY.%2A_ga%2AMTA3MTMzNjUzLjE3NzU1ODIxMjA.%2A_ga_J2DYCDLK48%2AczE3NzU1ODIxMjYkbzEkZzEkdDE3NzU1ODIzNTkkajYwJGwwJGgw#/lessons/aZ9uCcYTZkMiZcWXAehV5mBBPs6dDadq" target="_blank" rel="noopener noreferrer">Grados 4–12</a>. Tambien puedes encontrar muchos de estos libros en la Biblioteca Publica de Nueva York (NYPL), la Biblioteca Publica de Brooklyn (BPL) o la Biblioteca Publica de Queens (QPL).'
                : 'The links take you to the Citywide Digital Library on <a href="https://soraapp.com/welcome/login/310229" target="_blank" rel="noopener noreferrer">Sora</a>, NYCPS’s digital collection. Every NYC Public Schools student has free access to the Citywide Digital Library on Sora. It has eBooks, audiobooks, comics, and magazines for all students from Pre-K to 12th grade. If you have questions about logging into Sora, click here for <a href="https://rise.articulate.com/share/fcB-JQs3ozeuQWZHwEw4Az6upNkkYKb-?_gl=1%2Awljhzo%2A_gcl_au%2ANjE5MjA1NTAzLjE3NzU1ODIxMjY.%2A_ga%2AMTA3MTMzNjUzLjE3NzU1ODIxMjA.%2A_ga_J2DYCDLK48%2AczE3NzU1ODIxMjYkbzEkZzEkdDE3NzU1ODIyMjckajYwJGwwJGgw#/lessons/op3g0wQ8oC99f1Rznjn1BW7Q1zG5KrxA" target="_blank" rel="noopener noreferrer">Pre-K–3</a> or <a href="https://rise.articulate.com/share/fcB-JQs3ozeuQWZHwEw4Az6upNkkYKb-?_gl=1%2A882ek0%2A_gcl_au%2ANjE5MjA1NTAzLjE3NzU1ODIxMjY.%2A_ga%2AMTA3MTMzNjUzLjE3NzU1ODIxMjA.%2A_ga_J2DYCDLK48%2AczE3NzU1ODIxMjYkbzEkZzEkdDE3NzU1ODIzNTkkajYwJGwwJGgw#/lessons/aZ9uCcYTZkMiZcWXAehV5mBBPs6dDadq" target="_blank" rel="noopener noreferrer">Grades 4–12</a>. You can also find many of these books at the New York Public Library (NYPL), Brooklyn Public Library (BPL), or Queens Public Library (QPL).'
            ) +
          '</div>'
        )
      : isSchoolLeaderTeacherRoleSelected()
        ? (
          '<div class="reading-list-intro">' +
            (
              state.selectedLanguage === 'es'
                ? 'La Oficina de Servicios Bibliotecarios de NYCPS preparo estas listas de lectura para apoyar una instruccion alineada y rica en conocimiento, junto con los intereses de los estudiantes. No son exactamente los libros usados en clase, sino textos recomendados para ampliar el aprendizaje, la curiosidad y las preguntas. Estos textos ayudan a desarrollar conocimiento previo, vocabulario y comprension de temas clave que estudian y valoran los estudiantes. Fueron elegidos por su alineacion con los temas del modulo, su representacion diversa y autentica, la calidad del texto y la accesibilidad.'
                : 'The NYCPS Office of Library Services curated these reading lists to support aligned, knowledge-rich instruction, as well as student interests; they are not the exact books used in class, but recommended texts to extend learning, curiosity, and wonderings. These texts can help build background knowledge, vocabulary, and understanding of key topics students are studying and care about. They were chosen based on alignment to module topics, diverse and authentic representation, text quality, and accessibility.'
            ) +
            '<br><br>' +
            (
              state.selectedLanguage === 'es'
                ? 'Los enlaces llevan a la Biblioteca Digital de la Ciudad en <a href="https://soraapp.com/welcome/login/310229" target="_blank" rel="noopener noreferrer">Sora</a>, la coleccion digital de NYCPS, a la que todos los estudiantes de NYCPS pueden acceder gratuitamente. Para aprender mas sobre como usar Sora, haz clic <a href="https://company.overdrive.com/k-12-schools/discover-sora/nyc-edu/" target="_blank" rel="noopener noreferrer">aqui</a>, y accede a los <a href="https://rise.articulate.com/share/fN3jh1drp20vtC616toVONChj5Qm1veP?_ga=2.255888331.1789937731.1686316284-864601938.1686316284#/lessons/jy4Eps279hwoEQjn6rlV9F9u8DVJCzWP" target="_blank" rel="noopener noreferrer">recursos de capacitacion para docentes</a> aqui.'
                : 'The links direct to the Citywide Digital Library on <a href="https://soraapp.com/welcome/login/310229" target="_blank" rel="noopener noreferrer">Sora</a>, NYCPS’s digital collection, which all NYCPS students can access for free. To learn more about using Sora, click <a href="https://company.overdrive.com/k-12-schools/discover-sora/nyc-edu/" target="_blank" rel="noopener noreferrer">here</a>, and access <a href="https://rise.articulate.com/share/fN3jh1drp20vtC616toVONChj5Qm1veP?_ga=2.255888331.1789937731.1686316284-864601938.1686316284#/lessons/jy4Eps279hwoEQjn6rlV9F9u8DVJCzWP" target="_blank" rel="noopener noreferrer">teacher training resources</a> here.'
            ) +
          '</div>'
        )
      : '';
    const soraNote = (isOstRoleSelected() || isParentCaregiverRoleSelected() || isSchoolLeaderTeacherRoleSelected())
      ? ''
      : '<div class="sora-note" style="margin-top:8px;font-size:12px;color:#475569;">' +
        (
          state.selectedLanguage === 'es'
            ? '¿Buscas titulos parecidos? Explora y toma prestado de la Biblioteca Digital de la Ciudad en <a href="https://soraapp.com/welcome/login/310229" target="_blank" rel="noopener">Sora</a>.'
            : 'Looking for similar titles? Browse and borrow from the Citywide Digital Library on <a href="https://soraapp.com/welcome/login/310229" target="_blank" rel="noopener">Sora</a>.'
        ) +
        '</div>';

    return (
      '<div class="card section">' +
        '<div class="grid-2" style="align-items:start;">' +
          '<div>' +
            '<h3>' + t('schoolInformation') + '</h3>' +
            '<p><b>' + t('schoolField') + '</b> ' + escapeHTML(school) + '</p>' +
            '<p><b>' + t('gradeField') + '</b> ' + escapeHTML(grade) + '</p>' +
          '</div>' +
          '<div>' +
            '<h3>&nbsp;</h3>' +
            '<p><b>' + t('districtField') + '</b> ' + escapeHTML(String(district)) + '</p>' +
            '<p><b>' + t('curriculumField') + '</b> ' + escapeHTML(curriculum) + '</p>' +
          '</div>' +
        '</div>' +

        '<div class="subcard bg-blue section">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">' +
            '<h3 style="margin:0;">' + t('moduleInformation') + '</h3>' +
            '<div>' +
              '<button id="btnPrev" class="btn btn-secondary">' + t('prevBtn') + '</button>' +
              '<button id="btnNext" class="btn btn-secondary">' + t('nextBtn') + '</button>' +
            '</div>' +
          '</div>' +
          '<p><b>' + t('moduleField') + '</b> ' + escapeHTML(String(module_number || '')) + '</p>' +
          '<p><b>' + t('themeField') + '</b> ' + escapeHTML(module_title || '—') + '</p>' +
          '<p><b>' + t('dateRangeField') + '</b> ' + escapeHTML(dateLabel || '—') + '</p>' +
        '</div>' +

        (eqParagraph ? ('<div class="subcard bg-green section"><h3>' + t('essentialQuestions') + '</h3>' + eqParagraph + '</div>') : '') +

        (genrePills ? ('<div class="subcard bg-yellow section"><h3>' + t('textGenres') + '</h3><div id="genres">' + genrePills + '</div></div>') : '') +

        ('<div class="subcard bg-purple section"><h3>' + t('readingList') + '</h3>' + readingListIntro + (bookList ? ('<ul class="book-list">' + bookList + '</ul>') : '<div class="empty">' + t('noResultsGeneric') + '</div>') + soraNote + '</div>') +

        '<div class="section" style="font-size:12px;color:#475569;">' + t('dataSource') + ' <a href="https://sites.google.com/schools.nyc.gov/nycpslc/resources-for-core-instruction?utm_source" target="_blank" rel="noopener">NYC DOE Pacing Guides</a></div>' +
      '</div>'
    );
  }

  function renderResults(items) {
    if (!els.resultsMount) return;
    if (!Array.isArray(items) || items.length === 0) {
      clearRoleBlocks();
      els.resultsMount.innerHTML = '<div class="empty">' + t('noResults') + '</div>';
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
    applyRoleBlocks(html);
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
    if (els.role && els.role.value) params.set('role', els.role.value);

    const url = '/api/search' + (params.toString() ? ('?' + params.toString()) : '');
    try {
      console.log('[Search] Request start', url);
      if (els.search) { els.search.disabled = true; els.search.textContent = t('searchingBtn'); }
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to search');
      const json = await res.json();
      console.log('[Search] API response', json);
      const items = Array.isArray(json.results) ? json.results : [];
      if (items.length === 0 && json && json.message) {
        renderEmptyMessageFromResponse(json);
      } else {
        renderResults(items);
      }
    } catch (e) {
      console.error('Failed to fetch /api/search', e);
      clearRoleBlocks();
      if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">' + t('searchError') + '</div>';
    } finally {
      if (els.search) { els.search.disabled = false; els.search.textContent = t('searchBtn'); }
      console.log('[Search] Request end');
    }
  }

  function bindEvents() {
    const runSearch = () => {
      console.log('[Search] Button clicked');
      const districtVal = String(els.district.value || '').trim();
      const schoolVal = String(els.schoolInput.value || '').trim();
      const gradeVal = String(els.grade.value || '').trim();
      const dateVal = String(els.date.value || '').trim();
      state.selectedRole = els.role ? String(els.role.value || '').trim() : '';
      console.log('[Search] Selected role', currentRoleValue());

      // Validation (district optional)
      if (!schoolVal) {
        clearRoleBlocks();
        if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">' + t('schoolRequired') + '</div>';
        return;
      }
      if (!gradeVal) {
        clearRoleBlocks();
        if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">' + t('gradeRequired') + '</div>';
        return;
      }
      if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
        clearRoleBlocks();
        if (els.resultsMount) els.resultsMount.innerHTML = '<div class="empty">' + t('dateRequired') + '</div>';
        return;
      }
      // If district is blank, attempt to infer from meta.schools
      if (!districtVal && state.meta && Array.isArray(state.meta.schools)) {
        const match = state.meta.schools.find(s => String(s.school || '').trim() === schoolVal);
        if (match && match.district) {
          els.district.value = String(match.district);
        }
      }
      void doSearch();
    };

    els.district.addEventListener('change', () => { onDistrictChange(); });
    els.schoolInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
    els.clearSchool.addEventListener('click', () => { els.schoolInput.value = ''; els.schoolInput.focus(); });
    els.grade.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
    els.date.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
    if (els.role) {
      els.role.addEventListener('change', () => {
        state.selectedRole = String(els.role.value || '').trim();
        if (state.lastContext) renderResultFromState();
      });
    }
    if (els.language) {
      els.language.addEventListener('change', () => {
        state.selectedLanguage = els.language.value || 'en';
        saveStoredLanguage(state.selectedLanguage);
        applyLanguage();
        recomputeGradeOptionsForSelection();
        if (state.lastContext) renderResultFromState();
      });
    }
    els.clear.addEventListener('click', () => {
      setDefaultDate();
      els.district.value = '';
      els.grade.value = '';
      if (els.role) els.role.value = '';
      state.selectedRole = '';
      onDistrictChange();
      els.schoolInput.value = '';
      clearRoleBlocks();
      if (els.resultsMount) els.resultsMount.innerHTML = '';
    });
    if (els.search) { els.search.addEventListener('click', (e) => { e.preventDefault(); runSearch(); }); }
    if (els.filtersForm) { els.filtersForm.addEventListener('submit', (e) => { e.preventDefault(); runSearch(); }); }
  }

  (async function boot() {
    state.selectedLanguage = getStoredLanguage();
    if (els.language) els.language.value = state.selectedLanguage;
    applyLanguage();
    // Initialize placeholders so dropdowns are visible immediately
    if (els.district) setOptions(els.district, [], t('allDistricts'));
    if (els.grade) setOptions(els.grade, [], t('allGrades'));
    setDefaultDate();
    console.log('[Boot] Default date set', els.date ? els.date.value : null);
    await loadMeta();
    console.log('[Boot] loadMeta complete', {
      districtOptions: els.district && els.district.options ? els.district.options.length : null,
      gradeOptions: els.grade && els.grade.options ? els.grade.options.length : null,
      schoolOptions: els.schoolList ? els.schoolList.children.length : null,
    });
    bindEvents();
    console.log('[Boot] Event binding complete');
  }());
})();

