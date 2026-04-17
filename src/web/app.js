(() => {
  const data = window.__DATA__;
  const eventsByDay = data.eventsByDay;
  const recordingsByMatch = data.recordingsByMatch;
  const filters = data.filters;

  const getBelgradeDate = (dateObj = new Date()) => {
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
  };

  const nowBg = getBelgradeDate();
  const todayStr = nowBg.dateStr;

  const availableDates = Object.keys(eventsByDay).toSorted();
  let maxDateStr =
    availableDates.length > 0
      ? availableDates[availableDates.length - 1]
      : todayStr;
  if (maxDateStr < todayStr) {
    maxDateStr = todayStr;
  }

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

  let savedFilters = JSON.parse(localStorage.getItem('tvFilters')) ?? {};
  let savedFavorites = JSON.parse(localStorage.getItem('tvFavorites')) ?? [];

  const toggleFavorite = (matchKey) => {
    const idx = savedFavorites.indexOf(matchKey);
    if (idx > -1) {
      savedFavorites.splice(idx, 1);
    } else {
      savedFavorites.push(matchKey);
    }
    localStorage.setItem('tvFavorites', JSON.stringify(savedFavorites));
    renderTimeline();
  };

  for (const sport in filters) {
    if (!savedFilters[sport]) {
      savedFilters[sport] = { all: true, leagues: {} };
      for (const league of filters[sport]) {
        savedFilters[sport].leagues[league] = true;
      }
    } else {
      const existingVals = Object.values(savedFilters[sport].leagues);
      const anyOn =
        existingVals.length > 0
          ? existingVals.some((v) => v)
          : savedFilters[sport].all;

      for (const league of filters[sport]) {
        if (savedFilters[sport].leagues[league] === undefined) {
          savedFilters[sport].leagues[league] = anyOn;
        }
      }
    }
  }

  const saveFilters = () => {
    localStorage.setItem('tvFilters', JSON.stringify(savedFilters));
  };

  let isDark = localStorage.getItem('theme') === 'dark';
  const applyTheme = () => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };
  applyTheme();

  const toggleTheme = () => {
    isDark = !isDark;
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    applyTheme();
  };

  const renderApp = () => {
    const app = document.getElementById('app');
    app.innerHTML = `
      <header class="header">
        <button id="menu-btn" class="icon-btn" aria-label="Meni">☰</button>
        <h1 id="header-title">Arena sport TV raspored</h1>
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
        <div class="date-selector-wrapper">
          <div class="date-selector">
            <button id="prev-day" class="icon-btn">◀</button>
            <div class="date-display">
              <span id="current-date-display" style="cursor: default;"></span>
            </div>
            <button id="next-day" class="icon-btn">▶</button>
          </div>
          <div class="today-container">
            <div id="go-today" class="go-today">Danas</div>
          </div>
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
      .addEventListener('click', () => changeDay(-1, false));
    document
      .getElementById('next-day')
      .addEventListener('click', () => changeDay(1, false));

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

    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    document.addEventListener(
      'touchstart',
      (e) => {
        if (document.getElementById('drawer').classList.contains('open')) {
          return;
        }
        if (e.target.closest('.drawer') || e.target.closest('.header')) {
          return;
        }
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      },
      { passive: true }
    );

    document.addEventListener(
      'touchend',
      (e) => {
        if (document.getElementById('drawer').classList.contains('open')) {
          return;
        }
        if (e.target.closest('.drawer') || e.target.closest('.header')) {
          return;
        }
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
      },
      { passive: true }
    );

    const handleSwipe = () => {
      const diffX = touchStartX - touchEndX;
      const diffY = touchStartY - touchEndY;

      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) {
          changeDay(1, true);
        } else {
          changeDay(-1, true);
        }
      }
    };

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

    renderFilters();
    updateDateDisplay();
    renderTimeline();

    if (currentDate === todayStr) {
      setTimeout(scrollToCurrentTime, 100);
    }

    const dateSelectorWrapper = document.querySelector(
      '.date-selector-wrapper'
    );
    const headerTitle = document.getElementById('header-title');

    if (dateSelectorWrapper && headerTitle) {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          isDateSelectorVisible =
            entry.isIntersecting || entry.boundingClientRect.top > 0;

          if (!isDateSelectorVisible) {
            headerTitle.textContent = formatDate(currentDate);
          } else {
            headerTitle.textContent = 'Arena sport TV raspored';
          }
        },
        {
          root: null,
          threshold: 0,
          rootMargin: '-70px 0px 0px 0px',
        }
      );
      observer.observe(dateSelectorWrapper);
    }
  };

  let isDateSelectorVisible = true;

  const closeDrawer = () => {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
  };

  let isAnimating = false;

  const changeDay = (delta, animate = false) => {
    if (isAnimating) {
      return;
    }
    const idx = dateList.indexOf(currentDate);
    if (idx !== -1) {
      const newIdx = idx + delta;
      if (newIdx >= 0 && newIdx < dateList.length) {
        if (!animate) {
          currentDate = dateList[newIdx];
          updateDateDisplay();
          renderFilters();
          renderTimeline();
          if (currentDate === todayStr) {
            setTimeout(scrollToCurrentTime, 10);
          } else {
            window.scrollTo({ top: 0 });
          }
          return;
        }

        isAnimating = true;
        const mainContent = document.querySelector('.main-content');

        const outClass =
          delta > 0 ? 'anim-slide-out-left' : 'anim-slide-out-right';
        const inClass =
          delta > 0 ? 'anim-slide-in-right' : 'anim-slide-in-left';

        mainContent.classList.add(outClass);

        setTimeout(() => {
          currentDate = dateList[newIdx];
          updateDateDisplay();
          renderFilters();
          renderTimeline();

          if (currentDate === todayStr) {
            setTimeout(scrollToCurrentTime, 10);
          } else {
            window.scrollTo({ top: 0 });
          }

          mainContent.classList.remove(outClass);
          mainContent.classList.add(inClass);

          setTimeout(() => {
            mainContent.classList.remove(inClass);
            isAnimating = false;
          }, 200);
        }, 200);
      }
    }
  };

  const formatDate = (dateStr) => {
    const options = {
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    const dateObj = new Date(`${dateStr}T00:00:00Z`);
    return new Intl.DateTimeFormat('sr-Latn-RS', options).format(dateObj);
  };

  const updateDateDisplay = () => {
    document.getElementById('current-date-display').textContent =
      formatDate(currentDate);

    document.getElementById('prev-day').disabled =
      dateList.indexOf(currentDate) === 0;
    document.getElementById('next-day').disabled =
      dateList.indexOf(currentDate) === dateList.length - 1;

    const headerTitle = document.getElementById('header-title');
    if (headerTitle && !isDateSelectorVisible) {
      headerTitle.textContent = formatDate(currentDate);
    }
  };

  const renderFilters = () => {
    const container = document.getElementById('filter-list');
    container.innerHTML = '';

    const sports = Object.keys(filters).toSorted();

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

      for (const league of filters[sport]) {
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
          const allChecked = filters[sport].every((l) => sportData.leagues[l]);
          const someChecked = filters[sport].some((l) => sportData.leagues[l]);
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
        for (const league of filters[sport]) {
          sportData.leagues[league] = isChecked;
          document.getElementById(`league-${sport}-${league}`).checked =
            isChecked;
        }
        saveFilters();
        renderTimeline();
      });

      const allChecked = filters[sport].every((l) => sportData.leagues[l]);
      const someChecked = filters[sport].some((l) => sportData.leagues[l]);
      sportCb.checked = allChecked;
      sportCb.indeterminate = someChecked && !allChecked;

      sportDiv.appendChild(leaguesDiv);
      container.appendChild(sportDiv);
    }
  };

  const renderTimeline = () => {
    const container = document.getElementById('timeline');
    container.innerHTML = '';

    const events = eventsByDay[currentDate] ?? [];

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

      const headerInfoEl = document.createElement('div');
      headerInfoEl.className = 'event-header-info';

      const sportEl = document.createElement('span');
      sportEl.className = 'event-sport';
      sportEl.textContent = `${ev.sport} ${ev.category ? '- ' + ev.category : ''}`;

      const matchKey = `${currentDate}-${ev.content}-${ev.sport}`;
      const isFav = savedFavorites.includes(matchKey);

      const starBtn = document.createElement('button');
      starBtn.className = `icon-btn star-btn ${isFav ? 'active' : ''}`;
      starBtn.innerHTML = isFav ? '★' : '☆';
      starBtn.setAttribute(
        'aria-label',
        isFav ? 'Ukloni iz omiljenih' : 'Dodaj u omiljene'
      );

      if (isFav) {
        card.classList.add('is-favorite');
      }

      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(matchKey);
      });

      headerInfoEl.appendChild(channelEl);
      headerInfoEl.appendChild(sportEl);

      headerEl.appendChild(headerInfoEl);
      headerEl.appendChild(starBtn);

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
  };

  const scrollToCurrentTime = () => {
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
  };

  // Start app
  renderApp();
})();
