import fs from 'node:fs/promises';
import path from 'node:path';

async function build() {
  const dataDir = path.join(process.cwd(), 'src', 'data', 'json');
  const webDir = path.join(process.cwd(), 'src', 'web');
  const outDir = process.cwd();

  // 1. Read data/
  let files = [];
  try {
    const dirFiles = await fs.readdir(dataDir);
    files = dirFiles.filter((f) => f.endsWith('.json'));
  } catch (e) {
    console.warn('No data directory found');
  }

  // Group by date
  const latestFiles = {};
  for (const file of files) {
    const match = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (match) {
      const date = match[1];
      latestFiles[date] = { file };
    }
  }

  // Merge data
  const sortedDates = Object.keys(latestFiles).toSorted();
  const datesToProcess = [];

  if (sortedDates.length > 0) {
    const latestDate = sortedDates[sortedDates.length - 1];
    const latestDateObj = new Date(`${latestDate}T00:00:00Z`);
    latestDateObj.setUTCDate(latestDateObj.getUTCDate() - 1);
    const dayBefore = latestDateObj.toISOString().split('T')[0];

    if (latestFiles[dayBefore]) {
      datesToProcess.push(dayBefore);
    }
    datesToProcess.push(latestDate);
  }

  const mergedData = {};

  for (const date of datesToProcess) {
    const filePath = path.join(dataDir, latestFiles[date].file);
    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    for (const channel in content) {
      if (!mergedData[channel]) {
        mergedData[channel] = { days: {} };
      }
      const days = content[channel].days;
      for (const day in days) {
        mergedData[channel].days[day] = days[day];
      }
    }
  }

  // Process data
  const eventsByDay = {};
  const recordingsByMatch = {};
  const sportsAndLeagues = {};

  for (const channel in mergedData) {
    const days = mergedData[channel].days;
    for (const date in days) {
      const emisije = days[date].emisije || [];
      for (const em of emisije) {
        if (!em.content || !em.time) {
          continue;
        }

        const sport = em.sport ? em.sport.trim() : 'Ostalo';
        const category = em.category ? em.category.trim() : 'Ostalo';

        const eventObj = {
          time: em.time,
          channel: channel,
          content: em.content.trim(),
          category: category,
          sport: sport,
          desc: em.description ? em.description.trim().toLowerCase() : '',
        };

        if (eventObj.desc === 'uzivo') {
          if (!sportsAndLeagues[sport]) {
            sportsAndLeagues[sport] = new Set();
          }
          sportsAndLeagues[sport].add(category);

          if (!eventsByDay[date]) {
            eventsByDay[date] = [];
          }
          eventsByDay[date].push(eventObj);
        } else if (eventObj.desc === 'snimak') {
          const matchKey = eventObj.content;
          if (!recordingsByMatch[matchKey]) {
            recordingsByMatch[matchKey] = [];
          }
          recordingsByMatch[matchKey].push({
            date: date,
            time: eventObj.time,
            channel: eventObj.channel,
          });
        }
      }
    }
  }

  const filters = {};
  for (const sport in sportsAndLeagues) {
    filters[sport] = Array.from(sportsAndLeagues[sport]).toSorted();
  }

  function getChannelRank(channel) {
    const matchPremium = channel.match(/Arena Premium (\d+)/);
    if (matchPremium) {
      return 10 + parseInt(matchPremium[1]);
    }

    const matchSport = channel.match(/Arena Sport (\d+)/);
    if (matchSport) {
      return 20 + parseInt(matchSport[1]);
    }

    if (channel === 'Arena 1X2') {
      return 40;
    }
    if (channel === 'Arena Tenis') {
      return 50;
    }
    if (channel === 'Adrenalin') {
      return 60;
    }

    return 100;
  }

  for (const date in eventsByDay) {
    eventsByDay[date] = eventsByDay[date].toSorted((a, b) => {
      if (a.time !== b.time) {
        return a.time.localeCompare(b.time);
      }
      return getChannelRank(a.channel) - getChannelRank(b.channel);
    });
  }

  for (const match in recordingsByMatch) {
    recordingsByMatch[match] = recordingsByMatch[match].toSorted((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      if (a.time !== b.time) {
        return a.time.localeCompare(b.time);
      }
      return getChannelRank(a.channel) - getChannelRank(b.channel);
    });
  }

  const finalData = {
    eventsByDay,
    recordingsByMatch,
    filters,
  };

  // Read template and assets
  const htmlTemplate = await fs.readFile(
    path.join(webDir, 'index.html'),
    'utf-8'
  );
  const cssContent = await fs.readFile(
    path.join(webDir, 'styles.css'),
    'utf-8'
  );
  const jsContent = await fs.readFile(path.join(webDir, 'app.js'), 'utf-8');

  // Inject
  let finalHtml = htmlTemplate.replace('/*INJECT_CSS*/', cssContent);
  finalHtml = finalHtml.replace('/*INJECT_DATA*/', JSON.stringify(finalData));
  finalHtml = finalHtml.replace('/*INJECT_JS*/', jsContent);

  await fs.writeFile(path.join(outDir, 'index.html'), finalHtml);
  console.log('Build complete. Generated index.html');
}

build().catch(console.error);
