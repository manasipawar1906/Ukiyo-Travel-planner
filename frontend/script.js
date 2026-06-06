const API_BASE_URL = window.location.protocol === "file:"
  ? "http://127.0.0.1:5000"
  : "";

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function stripMarkdownStars(text) {
  return text.replace(/^\*+|\*+$/g, "").trim();
}

function getActivityMeta(text) {
  const timeMatch = text.match(/^(\d{1,2}:\d{2}\s?(?:AM|PM))/i);
  if (timeMatch) {
    return {
      label: timeMatch[1].toUpperCase(),
      icon: "clock",
      category: "timed"
    };
  }

  if (/^morning\b/i.test(text)) {
    return {
      label: "Morning",
      icon: "sunrise",
      category: "morning"
    };
  }

  if (/^afternoon\b/i.test(text)) {
    return {
      label: "Afternoon",
      icon: "sun",
      category: "afternoon"
    };
  }

  if (/^evening\b/i.test(text) || /^night\b/i.test(text)) {
    return {
      label: "Evening",
      icon: "moon",
      category: "evening"
    };
  }

  if (/food|dinner|lunch|breakfast|cafe|restaurant/i.test(text)) {
    return {
      label: "Food Stop",
      icon: "food",
      category: "food"
    };
  }

  if (/hotel|check-in|stay|rest/i.test(text)) {
    return {
      label: "Stay",
      icon: "stay",
      category: "stay"
    };
  }

  if (/train|bus|taxi|flight|airport|departure|arrival|transport/i.test(text)) {
    return {
      label: "Transit",
      icon: "transit",
      category: "transit"
    };
  }

  return {
    label: "Highlight",
    icon: "spark",
    category: "highlight"
  };
}

function getIconSvg(icon) {
  const icons = {
    sunrise: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16h16M6 19h12M12 5v3M7.8 9.8l2.1 2.1M16.2 9.8l-2.1 2.1M8 15a4 4 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    sun: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    moon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 14.5A6.5 6.5 0 0 1 9.5 6 7.5 7.5 0 1 0 18 14.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
    food: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M14 3v18M14 10c3 0 4-2 4-4s-1-3-4-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    transit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v9M7 16h10M8 19h.01M16 19h.01M9 10h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    stay: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 14h16M8 12h.01M16 12h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    spark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3ZM5 16l.9 2.1L8 19l-2.1.9L5 22l-.9-2.1L2 19l2.1-.9L5 16Zm14-1 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" fill="currentColor"/></svg>`
  };

  return icons[icon] || icons.spark;
}

function parseItinerary(text) {
  const lines = text.split(/\r?\n/);
  const summary = [];
  const daySections = [];
  let title = "Your travel itinerary";
  let currentDay = null;

  const ensureCurrentDay = () => {
    if (!currentDay) {
      currentDay = {
        title: "Highlights",
        items: [],
        notes: []
      };
      daySections.push(currentDay);
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const cleanLine = stripMarkdownStars(line);

    if (/^\*\*Day\s+\d+/i.test(line) || /^Day\s+\d+/i.test(cleanLine)) {
      currentDay = {
        title: cleanLine,
        items: [],
        notes: []
      };
      daySections.push(currentDay);
      continue;
    }

    if (/^\*\*.+\*\*$/.test(line) && !daySections.length && !summary.length) {
      title = cleanLine;
      continue;
    }

    if (/^\*/.test(line)) {
      ensureCurrentDay();
      currentDay.items.push(cleanLine.replace(/^\*\s*/, ""));
      continue;
    }

    if (daySections.length) {
      ensureCurrentDay();
      currentDay.notes.push(cleanLine);
    } else {
      summary.push(cleanLine);
    }
  }

  return { title, summary, daySections };
}

function renderItinerary(text) {
  const { title, summary, daySections } = parseItinerary(text);

  const summaryHtml = summary.length
    ? `<div class="overview-copy">${summary.map((line) => `<p>${formatInline(line)}</p>`).join("")}</div>`
    : `<div class="overview-copy"><p>A custom trip plan has been prepared for your journey.</p></div>`;

  const dayCardsHtml = daySections.length
    ? daySections.map((section, index) => {
        const activities = section.items.length
          ? `<div class="activity-list">${section.items.map((item) => {
              const meta = getActivityMeta(item);
              return `
              <article class="activity-card">
                <div class="activity-icon activity-${meta.category}">
                  ${getIconSvg(meta.icon)}
                </div>
                <div class="activity-copy">
                  <div class="activity-meta">
                    <span class="activity-tag activity-${meta.category}">${meta.label}</span>
                  </div>
                  <p>${formatInline(item)}</p>
                </div>
              </article>
            `;
            }).join("")}</div>`
          : "";

        const notes = section.notes.length
          ? `<div class="day-notes">${section.notes.map((note) => `<p>${formatInline(note)}</p>`).join("")}</div>`
          : "";

        return `
          <section class="day-card">
            <div class="day-card-head">
              <span class="day-badge">Day ${index + 1}</span>
              <h3>${formatInline(section.title)}</h3>
            </div>
            ${notes}
            ${activities}
          </section>
        `;
      }).join("")
    : `<section class="day-card"><div class="day-card-head"><span class="day-badge">Plan</span><h3>${formatInline(title)}</h3></div><div class="day-notes"><p>${formatInline(text)}</p></div></section>`;

  return `
    <div class="itinerary-layout">
      <section class="overview-card">
        <p class="mini-label">Trip overview</p>
        <h2 class="itinerary-heading">${formatInline(title)}</h2>
        ${summaryHtml}
      </section>
      <div class="days-stack">
        ${dayCardsHtml}
      </div>
    </div>
  `;
}

async function generateItinerary() {
  const plannerGrid = document.querySelector(".planner-grid");
  const destination = document.getElementById("destination").value.trim();
  const days = document.getElementById("days").value.trim();
  const budget = document.getElementById("budget").value.trim();
  const interests = document.getElementById("interests").value.trim();

  const outputDiv = document.getElementById("output");
  const button = document.getElementById("generate-btn");
  const statusDiv = document.getElementById("status");

  if (!destination || !days || !budget || !interests) {
    plannerGrid.classList.remove("has-results");
    statusDiv.innerText = "Please complete every field before generating your plan.";
    outputDiv.classList.add("output-placeholder");
    outputDiv.innerText = "Add a destination, trip length, budget, and interests to unlock your itinerary.";
    return;
  }

  statusDiv.innerText = "Building your itinerary...";
  outputDiv.classList.add("output-placeholder");
  outputDiv.innerText = "Generating a tailored plan with stops, meals, and pacing suggestions.";
  button.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        destination,
        days,
        budget,
        interests
      })
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      plannerGrid.classList.add("has-results");
      outputDiv.classList.remove("output-placeholder");
      outputDiv.innerHTML = renderItinerary(data.itinerary || "No itinerary was returned.");
      statusDiv.innerText = data.warning || `Powered by ${data.provider || "your configured model"}.`;
    } else {
      plannerGrid.classList.remove("has-results");
      outputDiv.classList.add("output-placeholder");
      outputDiv.innerText = data.error || `Request failed with status ${response.status}.`;
      statusDiv.innerText = "The itinerary could not be generated.";
    }
  } catch (error) {
    plannerGrid.classList.remove("has-results");
    outputDiv.classList.add("output-placeholder");
    outputDiv.innerText = "Could not reach the backend. Start Flask and try again.";
    statusDiv.innerText = "Connection issue detected.";
    console.error(error);
  } finally {
    button.disabled = false;
  }
}

document
  .getElementById("generate-btn")
  .addEventListener("click", generateItinerary);
