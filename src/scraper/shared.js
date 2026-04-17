import { z } from 'zod';

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
  const str = `${value ?? ''}`;
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

const ignoreTeams = ['Plan igre', 'Pregled kola', 'Studio', 'Rukometna arena'];
const ignoreLeagues = new Set([
  'MOZZART BET SUPERLIGA',
  'MOZZARTBET SUPERLIGA',
  'MOZZARTBET SUPERLIGA SRBIJE',
  'MB SUPERLIGA',
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

export const scrapeAndProcess = async () => {
  const url = 'https://www.tvarenasport.com/tv-scheme';
  let data;
  try {
    data = await fetchWithRetry(url);
  } catch (error) {
    console.error(`Scraping failed during network request: ${error.message}`);
    return null;
  }

  // Extract TV_SCHEMES data from the script tag
  const schemesMatch = data.match(
    /window\.TV_SCHEMES\s*=\s*(\{[\s\S]*?\})\s*;/
  );

  if (!schemesMatch) {
    console.error('Could not find TV_SCHEMES data in page');
    return null;
  }

  let tvSchemes;
  try {
    const rawJson = JSON.parse(schemesMatch[1]);

    const showSchema = z
      .object({
        content: z.string(),
        time: z.string(),
        category: z.string(),
        sport: z.string(),
        description: z.string(),
      })
      .passthrough();

    const daySchema = z
      .object({
        emisije: z.array(showSchema),
      })
      .passthrough();

    const channelSchema = z
      .object({
        days: z.record(z.string(), daySchema),
      })
      .passthrough();

    const tvSchemesSchema = z.record(z.string(), channelSchema);

    const parsedData = tvSchemesSchema.safeParse(rawJson);

    if (!parsedData.success) {
      console.error('Zod JSON validation failed:', parsedData.error.message);
      return null;
    }
    // Retain the exactly parsed `rawJson` so the field order remains identical, instead of using `parsedData.data`
    tvSchemes = rawJson;
  } catch (err) {
    console.error(`Failed to parse TV_SCHEMES JSON: ${err.message}`);
    return null;
  }

  const allMatches = [];
  const filteredSchemes = {};
  const liveMatches = [];

  // Process each channel
  for (const [channel, channelData] of Object.entries(tvSchemes)) {
    filteredSchemes[channel] = { days: {} };

    // Process each day for this channel
    for (const [date, dayData] of Object.entries(channelData.days ?? {})) {
      const shows = dayData.emisije ?? [];
      const filteredShows = [];

      // Process each show
      for (const show of shows) {
        const desc = show.description?.toLowerCase() ?? '';
        const isLive = desc === 'uzivo' || desc === 'uživo';
        const isReplay = desc === 'snimak';

        allMatches.push({
          date, // Already in YYYY-MM-DD format
          time: show.time,
          channel,
          sport: show.sport,
          teams: show.content,
          league: show.category,
          isLive,
        });

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
        if (
          ignoreTeams.some((team) =>
            show.content?.toLowerCase().includes(team.toLowerCase())
          )
        ) {
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

  const sortedLiveMatches = liveMatches.toSorted((a, b) => {
    const dateComparison = a.date.localeCompare(b.date, 'sr-Latn-RS');
    if (dateComparison !== 0) {
      return dateComparison;
    }
    return a.time.localeCompare(b.time, 'sr-Latn-RS');
  });

  return { allMatches, filteredSchemes, liveMatches: sortedLiveMatches };
};
