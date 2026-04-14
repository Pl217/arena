import { writeFile, mkdir } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';

const ignoreTeams = ['PL Studio', 'Plan igre', 'Pregled kola'];
const ignoreLeagues = new Set([
  'MOZZART BET SUPERLIGA',
  'MOZZARTBET SUPERLIGA',
  'MOZZARTBET SUPERLIGA SRBIJE',
  'SUPERLIGA SRBIJE',
  'PRVA LIGA SRBIJE',
  'SRPSKA LIGA BEOGRAD',
  'KUP SRBIJE',
  'KUP BIH',
  'WWIN LIGA BIH',
  'CRNOGORSKA LIGA',
  'SAUDIJSKA LIGA',
]);
const ignoreSports = new Set();

const fetchWithRetry = async (url, maxRetries = 3, delayMs = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      const isRetryable = ['EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET'].includes(
        error.cause?.code
      );

      if (attempt === maxRetries || !isRetryable) {
        throw new Error(
          `Fetch failed after ${attempt} attempts: ${error.message}`,
          { cause: error }
        );
      }

      console.log(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt)); // Exponential backoff
    }
  }
};

export const formatDateForDisplay = (isoDate) => {
  const [, month, day] = isoDate.split('-');
  return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.`;
};

const escapeCSVField = (value) => {
  const str = String(value ?? '');
  if (/[,"\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
};

export const jsonToCsv = (data, fields) => {
  const header = fields.map(({ label }) => escapeCSVField(label)).join(',');

  const rows = data.map((row) =>
    fields
      .map(({ value }) => {
        const cellValue = typeof value === 'function' ? value(row) : row[value];
        return escapeCSVField(cellValue);
      })
      .join(',')
  );

  return [header, ...rows].join('\n');
};

const scrapeAndProcess = async () => {
  const url = 'https://www.tvarenasport.com/tv-scheme';
  const data = await fetchWithRetry(url);

  // Extract TV_SCHEMES data from the script tag
  const schemesMatch = data.match(
    /window\.TV_SCHEMES\s*=\s*(\{[\s\S]*?\})\s*;/
  );

  if (!schemesMatch) {
    throw new Error('Could not find TV_SCHEMES data in page');
  }

  let tvSchemes;
  try {
    tvSchemes = JSON.parse(schemesMatch[1]);
  } catch (err) {
    throw new Error('Failed to parse TV_SCHEMES JSON: ' + err.message);
  }

  const filteredSchemes = {};
  let liveMatches = [];

  // Process each channel
  for (const [channel, channelData] of Object.entries(tvSchemes)) {
    filteredSchemes[channel] = { days: {} };

    // Process each day for this channel
    for (const [date, dayData] of Object.entries(channelData.days || {})) {
      const shows = dayData.emisije || [];
      const filteredShows = [];

      // Process each show
      for (const show of shows) {
        const desc = show.description?.toLowerCase() || '';
        const isLive = desc === 'uzivo' || desc === 'uživo';
        const isReplay = desc === 'snimak';

        // Keep only live matches and replays
        if (!isLive && !isReplay) {
          continue;
        }
        if (!show.sport && !show.category) {
          continue;
        }
        if (ignoreSports.has(show.sport)) {
          continue;
        }
        if (ignoreLeagues.has(show.category)) {
          continue;
        }
        if (ignoreTeams.some((team) => show.content?.includes(team))) {
          continue;
        }

        filteredShows.push(show);

        if (isLive) {
          liveMatches.push({
            date,
            time: show.time,
            channel,
            sport: show.sport,
            teams: show.content,
            league: show.category,
          });
        }
      }

      if (filteredShows.length > 0) {
        filteredSchemes[channel].days[date] = { emisije: filteredShows };
      }
    }
  }

  liveMatches = liveMatches.toSorted((a, b) => {
    const dateComparison = a.date.localeCompare(b.date);
    if (dateComparison !== 0) {
      return dateComparison;
    }
    return a.time.localeCompare(b.time);
  });

  return { filteredSchemes, liveMatches };
};

const run = async () => {
  // Time check for GitHub Actions
  if (
    process.env.GITHUB_ACTIONS &&
    process.env.GITHUB_EVENT_NAME === 'schedule'
  ) {
    const options = {
      timeZone: 'Europe/Belgrade',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    const formatter = new Intl.DateTimeFormat('sr-Latn-RS', options);
    const [hour, minute] = formatter.format(new Date()).split(':').map(Number);
    const totalMinutes = hour * 60 + minute;

    const targetTimes = [
      0 * 60 + 30, // 00:30
      9 * 60 + 0, // 09:00
      12 * 60 + 30, // 12:30
      15 * 60 + 30, // 15:30
      18 * 60 + 30, // 18:30
      21 * 60 + 15, // 21:15
    ];

    const isTargetTime = targetTimes.some((target) => {
      let diff = totalMinutes - target;
      if (diff < 0) {
        diff += 24 * 60;
      }
      return diff >= 0 && diff <= 45; // 45 mins tolerance for cron delays
    });

    if (!isTargetTime) {
      console.log(
        `Current Belgrade time is ${hour}:${minute}. Not a target time. Skipping run.`
      );
      process.exit(0);
    }
  }

  try {
    const { filteredSchemes, liveMatches } = await scrapeAndProcess();

    const today = new Date();
    const todayUTC = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    );
    const todayISO = todayUTC.toISOString().split('T')[0];

    const jsonDir = resolvePath(process.cwd(), 'src/data/json');
    const csvDir = resolvePath(process.cwd(), 'src/data/csv');

    await mkdir(jsonDir, { recursive: true });
    await mkdir(csvDir, { recursive: true });

    const jsonPath = resolvePath(jsonDir, `${todayISO}.json`);
    await writeFile(
      jsonPath,
      JSON.stringify(filteredSchemes, null, 2),
      'utf-8'
    );
    console.log(`Saved JSON to ${jsonPath}`);

    const csvPath = resolvePath(csvDir, `${todayISO}.csv`);
    const fields = [
      { label: 'Datum', value: (row) => formatDateForDisplay(row.date) },
      { label: 'Vreme', value: 'time' },
      { label: 'Kanal', value: 'channel' },
      { label: 'Sport', value: 'sport' },
      { label: 'Ekipe', value: 'teams' },
      { label: 'Takmičenje', value: 'league' },
    ];
    const csvContent = jsonToCsv(liveMatches, fields);
    await writeFile(csvPath, csvContent, 'utf-8');
    console.log(`Saved CSV to ${csvPath}`);
  } catch (error) {
    console.error('Error during scraping:', error);
    process.exit(1);
  }
};

run();
