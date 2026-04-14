(function () {
  const data = window.__DATA__;
  const eventsByDay = data.eventsByDay;
  const recordingsByMatch = data.recordingsByMatch;
  const filters = data.filters;

  function getBelgradeDate(dateObj = new Date()) {
    const options = {
      timeZone: 'Europe/Belgrade',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };
    const parts = new Intl.DateTimeFormat('sr-Latn-RS', options).formatToParts(
      dateObj
    );
    const p = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    return {
      dateStr: `${p.year}-${p.month}-${p.day}`,
      hour: parseInt(p.hour, 10),
      minute: parseInt(p.minute, 10),
    };
  }

  const nowBg = getBelgradeDate();
  const todayStr = nowBg.dateStr;

  const availableDates = Object.keys(eventsByDay).toSorted();
  let maxDateStr =
    availableDates.length > 0
      ? availableDates[availableDates.length - 1]
      : todayStr;
  if (maxDateStr < todayStr) maxDateStr = todayStr;

  const dateList = [];
  const todayObj = new Date(`${todayStr}T00:00:00Z`);
  const startObj = new Date(todayObj);
  startObj.setUTCDate(startObj.getUTCDate() - 2);

  const endObj = new Date(`${maxDateStr}T00:00:00Z`);

  for (
    let d = new Date(startObj);
    d <= endObj;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dStr = d.toISOString().split('T')[0];
    dateList.push(dStr);
  }

  let currentDate = todayStr;
  if (!dateList.includes(currentDate)) {
    currentDate = dateList[0];
  }

  let savedFilters = JSON.parse(localStorage.getItem('tvFilters')) || {};

  for (const sport in filters) {
    if (!savedFilters[sport]) {
      savedFilters[sport] = { all: true, leagues: {} };
    }
    for (const league of filters[sport]) {
      if (savedFilters[sport].leagues[league] === undefined) {
        savedFilters[sport].leagues[league] = true;
      }
    }
  }

  function saveFilters() {
    localStorage.setItem('tvFilters', JSON.stringify(savedFilters));
  }

  let isDark = localStorage.getItem('theme') === 'dark';
  function applyTheme() {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
  applyTheme();

  function toggleTheme() {
    isDark = !isDark;
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    applyTheme();
  }

  function renderApp() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <header class="header">
        <button id="menu-btn" class="icon-btn" aria-label="Meni">☰</button>
        <h1>TV Raspored</h1>
        <button id="theme-btn" class="icon-btn" aria-label="Tema">${isDark ? '☀️' : '🌘'}</button>
      </header>
      
      <div id="drawer" class="drawer">
        <div class="drawer-header">
          <h2>Filteri</h2>
          <button id="close-drawer" class="icon-btn">✕</button>
        </div>
        <div class="drawer-actions">
          <button id="filter-all">Sve</button>
          <button id="filter-none">Ništa</button>
        </div>
        <div class="drawer-content" id="filter-list"></div>
      </div>
      <div id="drawer-overlay" class="drawer-overlay"></div>

      <main class="main-content">
        <div class="date-selector">
          <button id="prev-day" class="icon-btn">◀</button>
          <div class="date-display-container">
            <div class="date-display">
              <span id="current-date-display"></span>
              <input type="date" id="calendar-picker" class="calendar-picker" min="${dateList[0]}" max="${dateList[dateList.length - 1]}">
            </div>
            <div id="go-today" class="go-today">Danas</div>
          </div>
          <button id="next-day" class="icon-btn">▶</button>
        </div>
        
        <div id="timeline" class="timeline"></div>
      </main>
    `;

    document.getElementById('menu-btn').addEventListener('click', () => {
      document.getElementById('drawer').classList.add('open');
      document.getElementById('drawer-overlay').classList.add('open');
    });

    document
      .getElementById('close-drawer')
      .addEventListener('click', closeDrawer);
    document
      .getElementById('drawer-overlay')
      .addEventListener('click', closeDrawer);
    document.getElementById('theme-btn').addEventListener('click', () => {
      toggleTheme();
      renderApp();
    });

    document
      .getElementById('prev-day')
      .addEventListener('click', () => changeDay(-1));
    document
      .getElementById('next-day')
      .addEventListener('click', () => changeDay(1));

    document.getElementById('go-today').addEventListener('click', () => {
      if (dateList.includes(todayStr) && currentDate !== todayStr) {
        currentDate = todayStr;
        updateDateDisplay();
        renderFilters();
        renderTimeline();
        setTimeout(scrollToCurrentTime, 100);
      } else if (currentDate === todayStr) {
        scrollToCurrentTime();
      }
    });

    document.getElementById('filter-all').addEventListener('click', () => {
      for (const sport in filters) {
        savedFilters[sport].all = true;
        for (const league of filters[sport]) {
          savedFilters[sport].leagues[league] = true;
        }
      }
      saveFilters();
      renderFilters();
      renderTimeline();
    });

    document.getElementById('filter-none').addEventListener('click', () => {
      for (const sport in filters) {
        savedFilters[sport].all = false;
        for (const league of filters[sport]) {
          savedFilters[sport].leagues[league] = false;
        }
      }
      saveFilters();
      renderFilters();
      renderTimeline();
    });

    const calendarPicker = document.getElementById('calendar-picker');
    calendarPicker.addEventListener('change', (e) => {
      if (dateList.includes(e.target.value)) {
        currentDate = e.target.value;
        updateDateDisplay();
        renderFilters();
        renderTimeline();
      }
    });

    renderFilters();
    updateDateDisplay();
    renderTimeline();

    if (currentDate === todayStr) {
      setTimeout(scrollToCurrentTime, 100);
    }
  }

  function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
  }

  function changeDay(delta) {
    const idx = dateList.indexOf(currentDate);
    if (idx !== -1) {
      const newIdx = idx + delta;
      if (newIdx >= 0 && newIdx < dateList.length) {
        currentDate = dateList[newIdx];
        updateDateDisplay();
        renderFilters();
        renderTimeline();
        if (currentDate === todayStr) {
          setTimeout(scrollToCurrentTime, 100);
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    }
  }

  function formatDate(dateStr) {
    const options = {
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    const dateObj = new Date(`${dateStr}T00:00:00Z`);
    return new Intl.DateTimeFormat('sr-Latn-RS', options).format(dateObj);
  }

  function updateDateDisplay() {
    document.getElementById('current-date-display').textContent =
      formatDate(currentDate);
    document.getElementById('calendar-picker').value = currentDate;

    document.getElementById('prev-day').disabled =
      dateList.indexOf(currentDate) === 0;
    document.getElementById('next-day').disabled =
      dateList.indexOf(currentDate) === dateList.length - 1;
  }

  function renderFilters() {
    const container = document.getElementById('filter-list');
    container.innerHTML = '';

    const events = eventsByDay[currentDate] || [];
    const availableFilters = {};
    for (const ev of events) {
      if (!availableFilters[ev.sport]) {
        availableFilters[ev.sport] = new Set();
      }
      availableFilters[ev.sport].add(ev.category);
    }

    const sports = Object.keys(availableFilters).toSorted();

    for (const sport of sports) {
      const sportData = savedFilters[sport];

      const sportDiv = document.createElement('div');
      sportDiv.className = 'filter-group';

      const sportHeader = document.createElement('div');
      sportHeader.className = 'filter-sport';

      const sportCb = document.createElement('input');
      sportCb.type = 'checkbox';
      sportCb.id = `sport-${sport}`;

      const sportLabel = document.createElement('label');
      sportLabel.htmlFor = `sport-${sport}`;
      sportLabel.textContent = sport;

      sportHeader.appendChild(sportCb);
      sportHeader.appendChild(sportLabel);
      sportDiv.appendChild(sportHeader);

      const leaguesDiv = document.createElement('div');
      leaguesDiv.className = 'filter-leagues';

      const leagues = Array.from(availableFilters[sport]).toSorted();

      for (const league of leagues) {
        const leagueRow = document.createElement('div');
        leagueRow.className = 'filter-league';

        const leagueCb = document.createElement('input');
        leagueCb.type = 'checkbox';
        leagueCb.checked = sportData.leagues[league];
        leagueCb.id = `league-${sport}-${league}`;

        const leagueLabel = document.createElement('label');
        leagueLabel.htmlFor = `league-${sport}-${league}`;
        leagueLabel.textContent = league;

        leagueCb.addEventListener('change', (e) => {
          sportData.leagues[league] = e.target.checked;
          const allChecked = leagues.every((l) => sportData.leagues[l]);
          const someChecked = leagues.some((l) => sportData.leagues[l]);
          sportCb.checked = allChecked;
          sportCb.indeterminate = someChecked && !allChecked;
          sportData.all = allChecked;
          saveFilters();
          renderTimeline();
        });

        leagueRow.appendChild(leagueCb);
        leagueRow.appendChild(leagueLabel);
        leaguesDiv.appendChild(leagueRow);
      }

      sportCb.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        sportData.all = isChecked;
        for (const league of leagues) {
          sportData.leagues[league] = isChecked;
          document.getElementById(`league-${sport}-${league}`).checked =
            isChecked;
        }
        saveFilters();
        renderTimeline();
      });

      const allChecked = leagues.every((l) => sportData.leagues[l]);
      const someChecked = leagues.some((l) => sportData.leagues[l]);
      sportCb.checked = allChecked;
      sportCb.indeterminate = someChecked && !allChecked;

      sportDiv.appendChild(leaguesDiv);
      container.appendChild(sportDiv);
    }
  }

  function renderTimeline() {
    const container = document.getElementById('timeline');
    container.innerHTML = '';

    const events = eventsByDay[currentDate] || [];

    const filteredEvents = events.filter((ev) => {
      const sportData = savedFilters[ev.sport];
      if (!sportData) {
        return false;
      }
      if (sportData.leagues[ev.category] === true) {
        return true;
      }
      if (filters[ev.sport] && !filters[ev.sport].includes(ev.category)) {
        return sportData.all;
      }
      return false;
    });

    if (filteredEvents.length === 0) {
      container.innerHTML =
        '<div class="no-events">Nema događaja za izabrani datum i filtere.</div>';
      return;
    }

    for (const ev of filteredEvents) {
      const card = document.createElement('div');
      card.className = 'event-card';
      card.dataset.time = ev.time;

      const timeEl = document.createElement('div');
      timeEl.className = 'event-time';
      timeEl.textContent = ev.time;

      const detailsEl = document.createElement('div');
      detailsEl.className = 'event-details';

      const headerEl = document.createElement('div');
      headerEl.className = 'event-header';

      const channelEl = document.createElement('span');
      channelEl.className = 'event-channel';
      channelEl.textContent = ev.channel;

      const sportEl = document.createElement('span');
      sportEl.className = 'event-sport';
      sportEl.textContent = `${ev.sport} ${ev.category ? '- ' + ev.category : ''}`;

      headerEl.appendChild(channelEl);
      headerEl.appendChild(sportEl);

      const contentEl = document.createElement('div');
      contentEl.className = 'event-content';
      contentEl.textContent = ev.content;

      detailsEl.appendChild(headerEl);
      detailsEl.appendChild(contentEl);

      card.appendChild(timeEl);
      card.appendChild(detailsEl);

      const recordings = recordingsByMatch[ev.content];
      if (recordings && recordings.length > 0) {
        card.classList.add('has-recordings');
        const recContainer = document.createElement('div');
        recContainer.className = 'recordings-container';
        recContainer.style.display = 'none';

        const recTitle = document.createElement('div');
        recTitle.className = 'recordings-title';
        recTitle.textContent = 'Snimci:';
        recContainer.appendChild(recTitle);

        for (const rec of recordings) {
          const recRow = document.createElement('div');
          recRow.className = 'recording-row';
          recRow.textContent = `${formatDate(rec.date)} u ${rec.time} - ${rec.channel}`;
          recContainer.appendChild(recRow);
        }

        detailsEl.appendChild(recContainer);

        card.addEventListener('click', () => {
          const isHidden = recContainer.style.display === 'none';
          recContainer.style.display = isHidden ? 'block' : 'none';
          card.classList.toggle('expanded', isHidden);
        });
      }

      container.appendChild(card);
    }
  }

  function scrollToCurrentTime() {
    const targetHour = nowBg.hour - 2;
    const validHour = targetHour < 0 ? 0 : targetHour;
    const targetTimeStr = `${validHour.toString().padStart(2, '0')}:00`;

    const cards = document.querySelectorAll('.event-card');
    let targetCard = null;

    for (const card of cards) {
      if (card.dataset.time >= targetTimeStr) {
        targetCard = card;
        break;
      }
    }

    if (targetCard) {
      const headerOffset = document.querySelector('.header').offsetHeight + 20;
      const elementPosition = targetCard.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    } else if (cards.length > 0) {
      cards[cards.length - 1].scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }

  // Start app
  renderApp();
})();
