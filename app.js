const DATA = window.INTERVIEW_QA_CONTENT || [];
const toc = document.getElementById("toc");
const root = document.getElementById("contentRoot");
const searchInput = document.getElementById("searchInput");
const backToTop = document.getElementById("backToTop");
const themeBtn = document.getElementById("themeBtn");
const audioToggleBtn = document.getElementById("audioToggleBtn");
const readingProgressBar = document.getElementById("readingProgressBar");
const THEME_STORAGE_KEY = "interview-theme";
const AUDIO_AUTOPLAY_STORAGE_KEY = "interview-audio-autoplay";
const AUDIO_BASE_PATH = "./audio";
let cardObserver = null;
let activeAudioTarget = null;
let audioManifest = [];
let isAudioAutoplayEnabled = false;
const hoverAudio = new Audio();

hoverAudio.preload = "metadata";
hoverAudio.addEventListener("ended", () => setActiveAudioTarget(null));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function renderCode(code) {
  if (!code) return "";
  return `
    <div class="code-block">
      <div class="code-header">
        <span>${escapeHtml(code.lang || "code")}</span>
        <button class="copy-btn" type="button" data-copy="${escapeHtml(code.text)}">Copy</button>
      </div>
      <pre><code>${escapeHtml(code.text)}</code></pre>
    </div>
  `;
}

function renderTable(table) {
  if (!table) return "";
  const headers = table.headers.map(h => `<th>${escapeHtml(h)}</th>`).join("");
  const rows = table.rows.map(row => `
    <tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
  `).join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function isPlayableSection(section) {
  return Boolean(
    section &&
    (
      (section.body && section.body.length) ||
      section.quote ||
      (section.table && section.table.rows && section.table.rows.length)
    )
  );
}

function renderSection(section, audioFileName) {
  const paragraphs = (section.body || []).map(p => `<p>${escapeHtml(p)}</p>`).join("");
  const quote = section.quote ? `<blockquote>${escapeHtml(section.quote)}</blockquote>` : "";
  const audioAttributes = audioFileName
    ? ` class="section audio-target" data-audio="${escapeHtml(audioFileName)}"`
    : ` class="section"`;
  return `
    <section${audioAttributes}>
      <h3>${escapeHtml(section.heading)}</h3>
      ${paragraphs}
      ${renderCode(section.code)}
      ${renderTable(section.table)}
      ${quote}
    </section>
  `;
}

function renderCard(item, index) {
  let audioIndex = 1;
  const questionAudioFile = `${item.id}-${audioIndex}.wav`;
  audioManifest.push({
    file: questionAudioFile,
    question_id: item.id,
    block_type: "question",
    title: item.title,
    section_heading: "題目",
  });
  audioIndex += 1;

  const questions = (item.question || []).map(q => `<p>${escapeHtml(q)}</p>`).join("");
  const tags = (item.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const sections = (item.answer || []).map((section) => {
    const shouldAttachAudio = isPlayableSection(section);
    const audioFileName = shouldAttachAudio ? `${item.id}-${audioIndex}.wav` : "";

    if (shouldAttachAudio) {
      audioManifest.push({
        file: audioFileName,
        question_id: item.id,
        block_type: "section",
        title: item.title,
        section_heading: section.heading || "",
      });
      audioIndex += 1;
    }

    return renderSection(section, audioFileName);
  }).join("");

  return `
    <article class="qa-card" id="${escapeHtml(item.id)}" data-topic="${escapeHtml(item.id)}" data-search="${escapeHtml(JSON.stringify(item).toLowerCase())}">
      <header class="qa-header">
        <div class="qa-title-row">
          <div>
            <span class="card-index">Q${index + 1}</span>
            <h2>${escapeHtml(item.title)}</h2>
            <p class="qa-subtitle">${escapeHtml(item.subtitle)}</p>
          </div>
          <span class="toggle-icon">⌄</span>
        </div>
        <div class="tags">${tags}</div>
      </header>
      <div class="qa-body">
        <div class="question-box audio-target" data-audio="${escapeHtml(questionAudioFile)}">
          <h3>題目</h3>
          ${questions}
        </div>
        ${sections}
      </div>
    </article>
  `;
}

function render() {
  audioManifest = [];
  const tocLinks = [
    ...DATA.map(item => `<a href="#${escapeHtml(item.id)}">${escapeHtml(item.title)}</a>`),
    `<a href="#about-me">About Me</a>`,
  ];
  toc.innerHTML = tocLinks.join("");
  root.innerHTML = DATA.map((item, index) => renderCard(item, index)).join("");
  audioManifest.push({
    file: "about-me.wav",
    question_id: "about",
    block_type: "section",
    title: "自我介紹",
    section_heading: "自我介紹",
  });
  setupCardAnimation();
  setupHoverAudio();
  window.INTERVIEW_AUDIO_MANIFEST = audioManifest;
}

function setupCardAnimation() {
  if (cardObserver) cardObserver.disconnect();
  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        cardObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  document.querySelectorAll(".qa-card").forEach((card) => cardObserver.observe(card));
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("theme-dark", isDark);
  themeBtn.textContent = isDark ? "淺色模式" : "深色模式";
  themeBtn.setAttribute("aria-pressed", String(isDark));
}

function initTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const preferDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = storedTheme || (preferDark ? "dark" : "light");
  applyTheme(theme);
}

function updateReadingProgress() {
  const scrollTop = window.scrollY;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? Math.min(scrollTop / scrollable, 1) : 0;
  readingProgressBar.style.transform = `scaleX(${progress})`;
}

function updateCurrentSectionState() {
  const sections = [
    ...DATA.map(item => document.getElementById(item.id)).filter(Boolean),
    document.getElementById("about-me"),
  ].filter(Boolean);
  let current = sections[0]?.id || "";
  for (const section of sections) {
    if (section.getBoundingClientRect().top < 160) current = section.id;
  }

  document.querySelectorAll(".toc a").forEach(link => {
    link.classList.toggle("active", link.getAttribute("href") === `#${current}`);
  });
}

function updateAudioToggleButton() {
  if (!audioToggleBtn) return;
  audioToggleBtn.textContent = isAudioAutoplayEnabled ? "語音：開" : "語音：關";
  audioToggleBtn.setAttribute("aria-pressed", String(isAudioAutoplayEnabled));
}

function initAudioAutoplayPreference() {
  const stored = localStorage.getItem(AUDIO_AUTOPLAY_STORAGE_KEY);
  isAudioAutoplayEnabled = stored === "on";
  updateAudioToggleButton();
}

function setActiveAudioTarget(target) {
  if (activeAudioTarget) activeAudioTarget.classList.remove("audio-playing");
  activeAudioTarget = target;
  if (activeAudioTarget) activeAudioTarget.classList.add("audio-playing");
}

function stopHoverAudio() {
  hoverAudio.pause();
  hoverAudio.currentTime = 0;
  setActiveAudioTarget(null);
}

function playHoverAudio(target) {
  if (!isAudioAutoplayEnabled) return;
  if (!target) return;
  const audioFile = target.dataset.audio;
  if (!audioFile) return;
  const audioSrc = `${AUDIO_BASE_PATH}/${audioFile}`;

  if (!hoverAudio.src.endsWith(`${AUDIO_BASE_PATH}/${audioFile}`)) {
    hoverAudio.src = audioSrc;
  }

  hoverAudio.currentTime = 0;
  hoverAudio.play()
    .then(() => setActiveAudioTarget(target))
    .catch(() => setActiveAudioTarget(null));
}

function setupHoverAudio() {
  document.querySelectorAll(".audio-target").forEach((target) => {
    target.addEventListener("mouseenter", () => playHoverAudio(target));
    target.addEventListener("mouseleave", (event) => {
      const nextTarget = event.relatedTarget?.closest?.(".audio-target");
      if (!nextTarget) stopHoverAudio();
    });
  });
}

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
  });
}

function plainTextExport() {
  return DATA.map(item => {
    const question = item.question.map(q => `- ${q}`).join("\n");
    const answer = item.answer.map(section => {
      const parts = [`## ${section.heading}`];
      if (section.body) parts.push(section.body.join("\n\n"));
      if (section.code) parts.push(`\n\`\`\`${section.code.lang || ""}\n${section.code.text}\n\`\`\``);
      if (section.quote) parts.push(`> ${section.quote}`);
      if (section.table) {
        parts.push(section.table.rows.map(row => row.join("｜")).join("\n"));
      }
      return parts.join("\n\n");
    }).join("\n\n");
    return `# ${item.title}\n${item.subtitle}\n\n題目：\n${question}\n\n${answer}`;
  }).join("\n\n---\n\n");
}

render();
initTheme();
initAudioAutoplayPreference();
updateReadingProgress();
updateCurrentSectionState();

document.addEventListener("click", (event) => {
  const header = event.target.closest(".qa-header");
  if (header) {
    const card = header.closest(".qa-card");
    card.classList.toggle("collapsed");
    if (card.classList.contains("collapsed") && activeAudioTarget && card.contains(activeAudioTarget)) {
      stopHoverAudio();
    }
  }

  const copyBtn = event.target.closest("[data-copy]");
  if (copyBtn) {
    copyText(copyBtn.dataset.copy);
    const original = copyBtn.textContent;
    copyBtn.textContent = "Copied";
    setTimeout(() => copyBtn.textContent = original, 900);
  }
});

document.getElementById("printBtn").addEventListener("click", () => window.print());

document.getElementById("expandBtn").addEventListener("click", () => {
  const cards = [...document.querySelectorAll(".qa-card")];
  const anyCollapsed = cards.some(card => card.classList.contains("collapsed"));
  cards.forEach(card => card.classList.toggle("collapsed", !anyCollapsed));
  document.getElementById("expandBtn").textContent = anyCollapsed ? "全部收合" : "全部展開";
});

document.getElementById("copyAllBtn").addEventListener("click", () => {
  copyText(plainTextExport());
  document.getElementById("copyAllBtn").textContent = "已複製";
  setTimeout(() => document.getElementById("copyAllBtn").textContent = "複製純文字", 1000);
});

themeBtn.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("theme-dark") ? "light" : "dark";
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
});

audioToggleBtn.addEventListener("click", () => {
  isAudioAutoplayEnabled = !isAudioAutoplayEnabled;
  localStorage.setItem(AUDIO_AUTOPLAY_STORAGE_KEY, isAudioAutoplayEnabled ? "on" : "off");
  updateAudioToggleButton();
  if (!isAudioAutoplayEnabled) stopHoverAudio();
});

searchInput.addEventListener("input", () => {
  const keyword = normalizeText(searchInput.value.trim());
  document.querySelectorAll(".qa-card").forEach(card => {
    const matched = !keyword || card.dataset.search.includes(keyword);
    card.style.display = matched ? "" : "none";
    if (!matched && activeAudioTarget && card.contains(activeAudioTarget)) stopHoverAudio();
  });
  updateCurrentSectionState();
});

window.addEventListener("scroll", () => {
  updateReadingProgress();
  backToTop.classList.toggle("show", window.scrollY > 500);
  updateCurrentSectionState();
});

window.addEventListener("resize", () => {
  updateReadingProgress();
  updateCurrentSectionState();
});

backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
