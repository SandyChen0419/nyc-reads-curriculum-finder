/* Dataset: example entries. Adjust/extend as needed. */
const curriculumRows = [
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
        books: ["The Lightning Thief", "The Hero’s Journey (excerpts)"] ,
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

const els = {
    date: document.getElementById("filterDate"),
    district: document.getElementById("filterDistrict"),
    school: document.getElementById("filterSchool"),
    grade: document.getElementById("filterGrade"),
    tableBody: document.querySelector("#resultsTable tbody"),
    resultCount: document.getElementById("resultCount"),
    reset: document.getElementById("resetBtn")
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

function populateFilters() {
    const districts = uniqueSorted(curriculumRows.map(r => r.district));
    const grades = uniqueSorted(curriculumRows.map(r => r.grade));

    setOptions(els.district, ["All"].concat(districts));
    setOptions(els.grade, ["All"].concat(grades));

    // Schools depend on district selection
    repopulateSchools();
}

function setOptions(selectEl, values) {
    const prev = selectEl.value;
    selectEl.innerHTML = "";
    values.forEach((val, idx) => {
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
        ? curriculumRows.filter(r => r.district === selectedDistrict)
        : curriculumRows;
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

function init() {
    populateFilters();
    wireEvents();
    update();
}

document.addEventListener("DOMContentLoaded", init);

