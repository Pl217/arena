import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.join(process.cwd(), 'src', 'data');
const webDir = path.join(process.cwd(), 'src', 'web');
const outDir = process.cwd();

// 1. Read data/
let files = [];
try {
  files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
} catch (e) {
  console.warn('No data directory found');
}

// Group by date and find latest version
const latestFiles = {};
for (const file of files) {
  const match = file.match(/^(\d{4}-\d{2}-\d{2})-v(\d+)\.json$/);
  if (match) {
    const date = match[1];
    const version = parseInt(match[2], 10);
    if (!latestFiles[date] || latestFiles[date].version < version) {
      latestFiles[date] = { file, version };
    }
  }
}

// Merge data
const sortedDates = Object.keys(latestFiles).sort();
const mergedData = {};

for (const date of sortedDates) {
  const filePath = path.join(dataDir, latestFiles[date].file);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  for (const channel in content) {
    if (!mergedData[channel]) mergedData[channel] = { days: {} };
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

      if (!sportsAndLeagues[sport]) {
        sportsAndLeagues[sport] = new Set();
      }
      sportsAndLeagues[sport].add(category);

      const eventObj = {
        time: em.time,
        channel: channel,
        content: em.content.trim(),
        category: category,
        sport: sport,
        desc: em.description ? em.description.trim().toLowerCase() : '',
      };

      if (eventObj.desc === 'uzivo') {
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
  filters[sport] = Array.from(sportsAndLeagues[sport]).sort();
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
  eventsByDay[date].sort((a, b) => {
    if (a.time !== b.time) {
      return a.time.localeCompare(b.time);
    }
    return getChannelRank(a.channel) - getChannelRank(b.channel);
  });
}

for (const match in recordingsByMatch) {
  recordingsByMatch[match].sort((a, b) => {
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
const htmlTemplate = fs.readFileSync(path.join(webDir, 'index.html'), 'utf-8');
const cssContent = fs.readFileSync(path.join(webDir, 'styles.css'), 'utf-8');
const jsContent = fs.readFileSync(path.join(webDir, 'app.js'), 'utf-8');

// Inject
let finalHtml = htmlTemplate.replace('/*INJECT_CSS*/', cssContent);
finalHtml = finalHtml.replace('/*INJECT_DATA*/', JSON.stringify(finalData));
finalHtml = finalHtml.replace('/*INJECT_JS*/', jsContent);

fs.writeFileSync(path.join(outDir, 'index.html'), finalHtml);
console.log('Build complete. Generated index.html');
