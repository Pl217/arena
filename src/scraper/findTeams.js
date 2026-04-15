import { formatDateForDisplay, scrapeAndProcess } from './shared.js';

// ANSI color codes
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

// Normalize string by removing diacritics
const removeDiacritics = (str) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Calculate Damerau-Levenshtein distance for fuzzy matching (handles transpositions)
const damerauLevenshteinDistance = (a, b) => {
  const lenA = a.length;
  const lenB = b.length;
  const maxDist = lenA + lenB;
  const H = {};
  const matrix = Array(lenA + 2)
    .fill(null)
    .map(() => Array(lenB + 2).fill(0));

  matrix[0][0] = maxDist;
  for (let i = 0; i <= lenA; i++) {
    matrix[i + 1][0] = maxDist;
    matrix[i + 1][1] = i;
  }
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j + 1] = maxDist;
    matrix[1][j + 1] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    let DB = 0;
    for (let j = 1; j <= lenB; j++) {
      const k = H[b[j - 1]] || 0;
      const l = DB;
      let cost = 1;

      if (a[i - 1] === b[j - 1]) {
        cost = 0;
        DB = j;
      }

      matrix[i + 1][j + 1] = Math.min(
        matrix[i][j] + cost, // substitution
        matrix[i + 1][j] + 1, // insertion
        matrix[i][j + 1] + 1, // deletion
        matrix[k][l] + (i - k - 1) + 1 + (j - l - 1) // transposition
      );
    }
    H[a[i - 1]] = i;
  }

  return matrix[lenA + 1][lenB + 1];
};

// Check if search term matches team name with typo tolerance
const fuzzyMatch = (teamName, searchTerm) => {
  // Normalize both strings: lowercase, trim, and remove diacritics
  const team = removeDiacritics(teamName.toLowerCase().trim());
  const search = removeDiacritics(searchTerm.toLowerCase().trim());

  // Exact match (after normalization)
  if (team === search) {
    return true;
  }

  // Allow 1 character difference for strings >= 5 chars
  // Allow 2 character difference for strings >= 10 chars
  const maxDistance = search.length >= 10 ? 2 : search.length >= 5 ? 1 : 0;
  const distance = damerauLevenshteinDistance(team, search);

  return distance <= maxDistance;
};

const searchTeamMatches = (allMatches, searchTeams) =>
  allMatches.filter((match) => {
    // Remove any prefix like "Super Bowl LX:" before splitting into teams
    const teamsStr = match.teams.includes(':')
      ? match.teams.substring(match.teams.indexOf(':') + 1).trim()
      : match.teams;

    // Check if match has dash separator
    const dashIndex = teamsStr.indexOf('-');
    if (dashIndex === -1) {
      return false; // No dash, skip this match
    }

    // Split into home and away teams, removing any additional info after comma
    const homeTeam = teamsStr.substring(0, dashIndex).split(',')[0].trim();
    const awayTeam = teamsStr
      .substring(dashIndex + 1)
      .split(',')[0]
      .trim();

    if (searchTeams.length === 1) {
      // Single team: match if it's either home or away
      return (
        fuzzyMatch(homeTeam, searchTeams[0]) ||
        fuzzyMatch(awayTeam, searchTeams[0])
      );
    } else {
      // Two teams: both must be present (order doesn't matter)
      const matchesFirst =
        fuzzyMatch(homeTeam, searchTeams[0]) ||
        fuzzyMatch(awayTeam, searchTeams[0]);
      const matchesSecond =
        fuzzyMatch(homeTeam, searchTeams[1]) ||
        fuzzyMatch(awayTeam, searchTeams[1]);

      return matchesFirst && matchesSecond;
    }
  });

const searchTeams = process.argv.slice(2);

if (searchTeams.length === 0 || searchTeams.length > 2) {
  console.error('Usage: node findTeams.js <team1> [team2]');
  console.error('Examples:');
  console.error('  node findTeams.js Chelsea');
  console.error(
    '  node findTeams.js Chelsea "Real Madrid" (searches for matches with BOTH teams)'
  );
  process.exit(1);
}

if (searchTeams.length === 1) {
  console.log(`Searching for matches with: ${searchTeams[0]}\n`);
} else {
  console.log(
    `Searching for matches with BOTH: ${searchTeams[0]} AND ${searchTeams[1]}\n`
  );
}

try {
  const { allMatches } = await scrapeAndProcess(
    'https://www.tvarenasport.com/tv-scheme'
  );
  const matches = searchTeamMatches(allMatches, searchTeams);

  if (matches.length === 0) {
    console.log(
      `No matches found for the specified team${searchTeams.length ? 's' : ''}.`
    );
  } else {
    console.log(
      `Found ${matches.length} match${matches.length > 1 ? 'es' : ''}:\n`
    );
    matches.forEach((m) => {
      const liveTag = m.isLive ? ` ${RED}[LIVE]${RESET}` : '';
      console.log(
        `${formatDateForDisplay(m.date)} ${m.time} - ${m.channel}${liveTag}`
      );
      console.log(`${m.sport}: ${m.teams}`);
      console.log(`${m.league}\n`);
    });
  }
} catch (error) {
  console.error('Error searching matches:', error);
  process.exit(1);
}
