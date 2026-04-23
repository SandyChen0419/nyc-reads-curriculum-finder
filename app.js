/*
	Config: Link your Google Sheet
	- If you have a published-to-web link (ends with /pubhtml), set PUBLISHED_SHEET_BASE and tab names below
	- Otherwise, you can still use SHEET_ID + SHEET_NAME (gviz) as a fallback
	If neither is set, the app uses the sample dataset below.
*/
const PUBLISHED_SHEET_BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSE0Mlty0JFy27H58nEULY3GNCsvwyCfIw4CQvf2_KbXsGXa4GIhU_SQojf5eXdz1MkKO7se9lJyjZT/pubhtml";
const PUBLISHED_TABS = {
	primary: "Pacing Guide",
	directory: "School Directories"
};

// Optional legacy config (kept for compatibility)
const SHEET_ID = ""; // e.g. 1AbCDeFgHi... (leave empty when using published sheets)
const SHEET_NAME = "Sheet1"; // Tab name in your sheet (gviz)

/* Sample dataset used as a fallback when no Google Sheet is configured or loading fails. */
const SAMPLE_DATA = [
	{
		district: "Northside ISD",
		school: "Maple Elementary",
		grade: "3",
		curriculum: "HMH Into Reading",
		module: "Module 3: Characters Shape Stories",
		essentialQuestion: "How do characters’ actions drive a story forward?",
		books: ["Because of Winn-Dixie", "Aero and Officer Mike"],
		startDate: "2025-01-06",
		endDate: "2025-02-07"
	},
	{
		district: "Northside ISD",
		school: "Oak Elementary",
		grade: "2",
		curriculum: "EL Education",
		module: "Module 2: Fossils Tell of Earth’s Changes",
		essentialQuestion: "What can we learn from fossils?",
		books: ["The Dog That Dug for Dinosaurs", "Fossils"],
		startDate: "2025-02-10",
		endDate: "2025-03-21"
	},
	{
		district: "Northside ISD",
		school: "Oak Elementary",
		grade: "5",
		curriculum: "Wit & Wisdom",
		module: "Module 1: Resilience in the Great Depression",
		essentialQuestion: "How do people show resilience in hard times?",
		books: ["Bud, Not Buddy", "Children of the Great Depression"],
		startDate: "2024-10-01",
		endDate: "2024-11-08"
	},
	{
		district: "East Valley SD",
		school: "Roosevelt Elementary",
		grade: "4",
		curriculum: "HMH Into Reading",
		module: "Module 4: Problem Solvers",
		essentialQuestion: "How do people solve everyday problems?",
		books: ["The Boy Who Harnessed the Wind (Young Readers)", "One Plastic Bag"],
		startDate: "2025-03-03",
		endDate: "2025-04-04"
	},
	{
		district: "East Valley SD",
		school: "Lakeside Elementary",
		grade: "3",
		curriculum: "EL Education",
		module: "Module 3: Learning from the Past",
		essentialQuestion: "How can we learn from people in the past?",
		books: ["Peter Pan", "My Librarian Is a Camel"],
		startDate: "2025-01-13",
		endDate: "2025-02-21"
	},
	{
		district: "East Valley SD",
		school: "Lakeside Elementary",
		grade: "5",
		curriculum: "Wit & Wisdom",
		module: "Module 2: Liberty!",
		essentialQuestion: "What does it mean to be free?",
		books: ["The Red Bandanna (Young Readers)", "Answering the Cry for Freedom"],
		startDate: "2025-02-24",
		endDate: "2025-03-28"
	},
	{
		district: "River City PS",
		school: "Lincoln Middle",
		grade: "6",
		curriculum: "Wit & Wisdom",
		module: "Module 1: The Hero’s Journey",
		essentialQuestion: "What makes a hero?",
		books: ["The Lightning Thief", "The Hero’s Journey (excerpts)"],
		startDate: "2025-01-06",
		endDate: "2025-02-14"
	},
	{
		district: "River City PS",
		school: "Jefferson Middle",
		grade: "6",
		curriculum: "EL Education",
		module: "Module 1: Climate Science",
		essentialQuestion: "How does climate change impact our world?",
		books: ["Fossil Fuel Frenzy", "Articles & Reports"],
		startDate: "2025-09-02",
		endDate: "2025-10-10"
	},
	{
		district: "River City PS",
		school: "Jefferson Middle",
		grade: "5",
		curriculum: "HMH Into Reading",
		module: "Module 2: Inventors at Work",
		essentialQuestion: "How do inventions change our lives?",
		books: ["The Invention of Hugo Cabret", "The Boy Who Invented TV"],
		startDate: "2025-10-13",
		endDate: "2025-11-21"
	},
	{
		district: "Northside ISD",
		school: "Maple Elementary",
		grade: "2",
		curriculum: "HMH Into Reading",
		module: "Module 2: Nature Watchers",
		essentialQuestion: "How does nature inspire us?",
		books: ["A Seed Is Sleepy", "Owl Moon"],
		startDate: "2024-11-18",
		endDate: "2024-12-20"
	},
	{
		district: "East Valley SD",
		school: "Roosevelt Elementary",
		grade: "3",
		curriculum: "Wit & Wisdom",
		module: "Module 2: American Art & Identity",
		essentialQuestion: "How does art tell a story about who we are?",
		books: ["Come Look With Me: American Art", "Artist biographies"],
		startDate: "2025-01-06",
		endDate: "2025-02-14"
	}
];

let curriculumRows = [];
let directoryRows = [];

const els = {
	date: document.getElementById("filterDate"),
	district: document.getElementById("filterDistrict"),
	school: document.getElementById("filterSchool"),
	grade: document.getElementById("filterGrade"),
	tableBody: document.querySelector("#resultsTable tbody"),
	resultCount: document.getElementById("resultCount"),
	reset: document.getElementById("resetBtn"),
	dataSourceBadge: document.getElementById("dataSourceBadge")
};

function toDate(value) {
	if (!value) return null;
	// Force local midnight to avoid TZ issues
	const parts = String(value).split("-");
	if (parts.length === 3) {
		return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
	}
	const d = new Date(value);
	return isNaN(d.getTime()) ? null : d;
}

function formatBooks(books) {
	if (!Array.isArray(books)) return "";
	return books.join(", ");
}

function curriculumBadgeClass(name) {
	if (!name) return "badge";
	if (name.toLowerCase().includes("hmh")) return "badge hmh";
	if (name.toLowerCase().includes("el education")) return "badge el";
	if (name.toLowerCase().includes("wit")) return "badge ww";
	return "badge";
}

function uniqueSorted(values) {
	return Array.from(new Set(values)).filter(Boolean).sort((a,b)=>String(a).localeCompare(String(b)));
}

function setControlsDisabled(disabled) {
	[els.date, els.district, els.school, els.grade, els.reset].forEach(el => { if (el) el.disabled = disabled; });
}

function setLoading(isLoading, message = "Loading...") {
	if (isLoading) {
		els.resultCount.textContent = message;
		setControlsDisabled(true);
	} else {
		setControlsDisabled(false);
	}
}

function setDataSourceBadge(text, css = "") {
	if (!els.dataSourceBadge) return;
	els.dataSourceBadge.textContent = text;
	els.dataSourceBadge.className = `badge source ${css}`.trim();
}

// -------- Google Sheets CSV Loader --------
const HEADER_ALIASES = {
	district: ["district"],
	school: ["school", "campus"],
	grade: ["grade", "grade level", "gradelevel"],
	curriculum: ["curriculum", "program", "adoption"],
	module: ["module", "unit", "module/unit", "unit/module"],
	essentialQuestion: ["essential question", "essentialquestion", "guiding question", "big question", "eq"],
	books: ["book list", "books", "texts", "text set", "textset", "booklist"],
	startDate: ["start date", "start", "from", "begin", "begin date", "beginning"],
	endDate: ["end date", "end", "to", "through", "until", "finish", "finish date"],
	date: ["date", "as of", "on date"]
};

function normalizeHeader(h) {
	return String(h || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function buildHeaderMap(headers) {
	const normalized = headers.map(h => normalizeHeader(h));
	const map = {};
	for (const [target, aliases] of Object.entries(HEADER_ALIASES)) {
		let idx = -1;
		for (const alias of aliases) {
			const aliasNorm = normalizeHeader(alias);
			idx = normalized.indexOf(aliasNorm);
			if (idx !== -1) break;
		}
		if (idx !== -1) map[target] = idx;
	}
	return map;
}

function parseCsv(text) {
	// Simple CSV parser with quote support
	const rows = [];
	let cur = [];
	let val = "";
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i+1] === '"') { val += '"'; i++; } else { inQuotes = false; }
			} else {
				val += ch;
			}
		} else {
			if (ch === '"') { inQuotes = true; }
			else if (ch === ',') { cur.push(val); val = ""; }
			else if (ch === '\n') { cur.push(val); rows.push(cur); cur = []; val = ""; }
			else if (ch === '\r') { /* ignore */ }
			else { val += ch; }
		}
	}
	// flush
	if (val.length > 0 || cur.length > 0) { cur.push(val); rows.push(cur); }
	return rows;
}

function splitBooks(value) {
	if (!value) return [];
	return String(value)
		.split(/[;,]/)
		.map(s => s.trim())
		.filter(Boolean);
}

function mapCsvRowToModel(row, headerMap) {
	const get = key => {
		const idx = headerMap[key];
		return idx != null ? row[idx] : "";
	};
	let startDate = get('startDate');
	let endDate = get('endDate');
	const singleDate = get('date');
	if (!startDate && singleDate) startDate = singleDate;
	if (!endDate && singleDate) endDate = singleDate;

	return {
		district: get('district') || "",
		school: get('school') || "",
		grade: String(get('grade') || ""),
		curriculum: get('curriculum') || "",
		module: get('module') || "",
		essentialQuestion: get('essentialQuestion') || "",
		books: splitBooks(get('books')),
		startDate: startDate || "",
		endDate: endDate || ""
	};
}

// Build URL for published-to-web CSV for a given tab name
function buildPublishedCsvUrl(publishedBase, sheetName) {
	const basePrefix = String(publishedBase).split('/pubhtml')[0];
	return `${basePrefix}/pub?output=csv&sheet=${encodeURIComponent(sheetName)}`;
}

async function fetchPublishedCsv(publishedBase, sheetName) {
	const url = buildPublishedCsvUrl(publishedBase, sheetName);
	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) throw new Error(`Published CSV request failed: ${res.status}`);
	const text = await res.text();
	const rows = parseCsv(text);
	if (!rows.length) return [];
	const headers = rows[0];
	const headerMap = buildHeaderMap(headers);
	const dataRows = rows.slice(1).filter(r => r.some(c => String(c).trim().length > 0));
	return dataRows.map(r => mapCsvRowToModel(r, headerMap));
}

// Legacy gviz loader
async function fetchGoogleSheetCsv(sheetId, sheetName) {
	const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) throw new Error(`Google Sheets request failed: ${res.status}`);
	const text = await res.text();
	const rows = parseCsv(text);
	if (!rows.length) return [];
	const headers = rows[0];
	const headerMap = buildHeaderMap(headers);
	const dataRows = rows.slice(1).filter(r => r.some(c => String(c).trim().length > 0));
	return dataRows.map(r => mapCsvRowToModel(r, headerMap));
}

async function loadData() {
	// Prefer published-to-web multi-tab config
	if (PUBLISHED_SHEET_BASE) {
		try {
			setLoading(true, "Loading Google Sheets (published)...");
			const [primary, directory] = await Promise.all([
				fetchPublishedCsv(PUBLISHED_SHEET_BASE, PUBLISHED_TABS.primary),
				fetchPublishedCsv(PUBLISHED_SHEET_BASE, PUBLISHED_TABS.directory)
			]);
			curriculumRows = Array.isArray(primary) && primary.length ? primary : [];
			directoryRows = Array.isArray(directory) ? directory : [];
			if (!curriculumRows.length) {
				curriculumRows = SAMPLE_DATA.slice();
				setDataSourceBadge("Sample data (empty primary)", "warn");
			} else {
				setDataSourceBadge(`Google Sheets: ${PUBLISHED_TABS.primary} + ${PUBLISHED_TABS.directory}`);
			}
		} catch (err) {
			console.error(err);
			curriculumRows = SAMPLE_DATA.slice();
			directoryRows = [];
			setDataSourceBadge("Sample data (load failed)", "warn");
		} finally {
			setLoading(false);
		}
		return;
	}

	// Fallback: single gviz sheet
	if (SHEET_ID) {
		try {
			setLoading(true, "Loading Google Sheet...");
			const data = await fetchGoogleSheetCsv(SHEET_ID, SHEET_NAME);
			if (Array.isArray(data) && data.length) {
				curriculumRows = data;
				setDataSourceBadge(`Google Sheets: ${SHEET_NAME}`);
			} else {
				curriculumRows = SAMPLE_DATA.slice();
				setDataSourceBadge("Sample data (empty sheet)", "warn");
			}
		} catch (err) {
			console.error(err);
			curriculumRows = SAMPLE_DATA.slice();
			setDataSourceBadge("Sample data (load failed)", "warn");
		} finally {
			setLoading(false);
		}
		return;
	}

	// Default: sample data
	curriculumRows = SAMPLE_DATA.slice();
	setDataSourceBadge("Sample data");
}

function populateFilters() {
	const districts = uniqueSorted([
		...curriculumRows.map(r => r.district),
		...directoryRows.map(r => r.district)
	]);
	const grades = uniqueSorted([
		...curriculumRows.map(r => r.grade),
		...directoryRows.map(r => r.grade)
	]);

	setOptions(els.district, ["All"].concat(districts));
	setOptions(els.grade, ["All"].concat(grades));

	// Schools depend on district selection
	repopulateSchools();
}

function setOptions(selectEl, values) {
	const prev = selectEl.value;
	selectEl.innerHTML = "";
	values.forEach((val) => {
		const opt = document.createElement("option");
		opt.value = val === "All" ? "" : val;
		opt.textContent = val === "All" ? "— All —" : val;
		selectEl.appendChild(opt);
	});
	// Try to preserve previous selection when possible
	const match = Array.from(selectEl.options).find(o => o.value === prev);
	if (match) selectEl.value = prev;
}

function repopulateSchools() {
	const selectedDistrict = els.district.value;
	const relevant = selectedDistrict
		? [...curriculumRows, ...directoryRows].filter(r => r.district === selectedDistrict)
		: [...curriculumRows, ...directoryRows];
	const schools = uniqueSorted(relevant.map(r => r.school));
	setOptions(els.school, ["All"].concat(schools));
}

function getActiveFilters() {
	return {
		date: toDate(els.date.value),
		district: els.district.value,
		school: els.school.value,
		grade: els.grade.value
	};
}

function matchesFilters(row, filters) {
	if (filters.district && row.district !== filters.district) return false;
	if (filters.school && row.school !== filters.school) return false;
	if (filters.grade && row.grade !== filters.grade) return false;

	if (filters.date) {
		const start = toDate(row.startDate);
		const end = toDate(row.endDate);
		if (start && filters.date < start) return false;
		if (end && filters.date > end) return false;
	}
	return true;
}

function render(rows) {
	const body = els.tableBody;
	body.innerHTML = "";

	rows.forEach(row => {
		const tr = document.createElement("tr");

		const tdDistrict = document.createElement("td");
		tdDistrict.textContent = row.district;
		tr.appendChild(tdDistrict);

		const tdSchool = document.createElement("td");
		tdSchool.textContent = row.school;
		tr.appendChild(tdSchool);

		const tdGrade = document.createElement("td");
		tdGrade.textContent = row.grade;
		tr.appendChild(tdGrade);

		const tdCurr = document.createElement("td");
		const span = document.createElement("span");
		span.className = curriculumBadgeClass(row.curriculum);
		span.textContent = row.curriculum;
		tdCurr.appendChild(span);
		tr.appendChild(tdCurr);

		const tdModule = document.createElement("td");
		tdModule.textContent = row.module;
		tr.appendChild(tdModule);

		const tdEQ = document.createElement("td");
		tdEQ.textContent = row.essentialQuestion;
		tr.appendChild(tdEQ);

		const tdBooks = document.createElement("td");
		tdBooks.textContent = formatBooks(row.books);
		tr.appendChild(tdBooks);

		body.appendChild(tr);
	});

	const count = rows.length;
	els.resultCount.textContent = `${count} ${count === 1 ? "result" : "results"}`;
}

function update() {
	const filters = getActiveFilters();
	const rows = curriculumRows.filter(r => matchesFilters(r, filters));
	render(rows);
}

function resetFilters() {
	els.date.value = "";
	els.district.value = "";
	repopulateSchools();
	els.school.value = "";
	els.grade.value = "";
	update();
}

function wireEvents() {
	els.date.addEventListener("input", update);
	els.district.addEventListener("change", () => { repopulateSchools(); update(); });
	els.school.addEventListener("change", update);
	els.grade.addEventListener("change", update);
	els.reset.addEventListener("click", resetFilters);
}

async function init() {
	setLoading(true);
	await loadData();
	populateFilters();
	wireEvents();
	update();
}

document.addEventListener("DOMContentLoaded", init);