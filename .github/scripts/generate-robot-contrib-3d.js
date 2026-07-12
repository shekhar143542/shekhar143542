/**
 * Generates a polished, self-explanatory isometric 3D contribution calendar:
 * - Full 7-row grid (every day shown, including zero-contribution days) so
 *   the overall shape reads clearly, like the familiar GitHub contribution graph.
 * - Real GitHub green color scale so it's instantly recognizable.
 * - Month labels + a Less->More legend for orientation.
 * - A small robot that visibly walks the grid and "places" each column's blocks.
 * Pulled live from the GitHub GraphQL API.
 */
const fs = require("fs");
const https = require("https");

const USERNAME = process.env.USERNAME;
const TOKEN = process.env.GITHUB_TOKEN;

if (!USERNAME || !TOKEN) {
  console.error("Missing USERNAME or GITHUB_TOKEN env vars.");
  process.exit(1);
}

const query = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
            weekday
          }
        }
      }
    }
  }
}`;

function graphqlRequest() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables: { login: USERNAME } });
    const req = https.request(
      {
        hostname: "api.github.com",
        path: "/graphql",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `bearer ${TOKEN}`,
          "User-Agent": "robot-3d-contrib-generator",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ---- Isometric constants ----
const TILE_W = 20;
const TILE_H = 10;
const UNIT_EXTRUDE = 3.2;
const MAX_EXTRUDE = 34;
const BASE_THICKNESS = 3; // flat "floor tile" height for zero-contribution days

// GitHub's real contribution green scale
const LEVELS = [
  { top: "#161b22", left: "#0d1117", right: "#11161c" }, // 0
  { top: "#0e4429", left: "#0a331f", right: "#0c3a24" }, // low
  { top: "#006d32", left: "#00551f", right: "#005f27" }, // mid
  { top: "#26a641", left: "#1c8a34", right: "#219c3b" }, // high
  { top: "#39d353", left: "#2bb845", right: "#33c94c" }, // max
];

function levelFor(count, maxCount) {
  if (count === 0) return 0;
  const ratio = count / maxCount;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

function cubePolygons(cx, topY, baseY, colors) {
  const w = TILE_W / 2;
  const h = TILE_H / 2;
  const top = `${cx},${topY - h} ${cx + w},${topY} ${cx},${topY + h} ${cx - w},${topY}`;
  const left = `${cx - w},${topY} ${cx},${topY + h} ${cx},${baseY + h} ${cx - w},${baseY}`;
  const right = `${cx},${topY + h} ${cx + w},${topY} ${cx + w},${baseY} ${cx},${baseY + h}`;
  return { top, left, right };
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function buildSVG(weeks) {
  const recentWeeks = weeks.slice(-20);
  const maxCount = Math.max(
    1,
    ...recentWeeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount))
  );

  const marginLeft = 90;
  const marginTop = 150;
  const gridW = recentWeeks.length * (TILE_W / 2) * 2;
  const gridDepth = 7 * (TILE_H / 2) * 2;

  const originX = marginLeft + (7 - 1) * (TILE_W / 2) + 20;
  const originY = marginTop;

  let floors = "";
  let cubes = "";
  let delayStep = 0;
  const monthMarks = {};
  const columnDelays = [];

  recentWeeks.forEach((week, c) => {
    let colDelay = null;
    week.contributionDays.forEach((day) => {
      const r = day.weekday;
      const count = day.contributionCount;
      const lvl = levelFor(count, maxCount);
      const colors = LEVELS[lvl];
      const extrude = lvl === 0 ? BASE_THICKNESS : Math.min(MAX_EXTRUDE, BASE_THICKNESS + count * UNIT_EXTRUDE);

      const baseX = originX + (c - r) * (TILE_W / 2);
      const baseY = originY + (c + r) * (TILE_H / 2);
      const topY = baseY - extrude;

      const delay = (c * 0.09 + r * 0.015).toFixed(2);
      if (colDelay === null) colDelay = parseFloat(delay);

      const { top, left, right } = cubePolygons(baseX, topY, baseY, colors);
      cubes += `
      <g opacity="0">
        <animate attributeName="opacity" from="0" to="1" begin="${delay}s" dur="0.3s" fill="freeze"/>
        <polygon points="${left}" fill="${colors.left}"/>
        <polygon points="${right}" fill="${colors.right}"/>
        <polygon points="${top}" fill="${colors.top}" stroke="#0d1117" stroke-width="0.4"/>
      </g>`;

      // track month label at the first week of each month
      const d = new Date(day.date);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      if (r === 0 && !(monthKey in monthMarks)) {
        monthMarks[monthKey] = { c, label: MONTH_NAMES[d.getMonth()] };
      }
    });
    columnDelays.push(colDelay || 0);
  });

  // Month labels: fixed straight row above the grid, spaced by column index only.
  // Skip any label that would land too close to the previous one so they never overlap.
  let monthLabels = "";
  let lastMonthX = -999;
  Object.values(monthMarks).forEach(({ c, label }) => {
    const x = marginLeft + c * (TILE_W / 2) + 4;
    if (x - lastMonthX < 28) return;
    lastMonthX = x;
    monthLabels += `<text x="${x}" y="82" fill="#8b949e" font-family="Segoe UI, sans-serif" font-size="11">${label}</text>`;
  });

  // Weekday labels (Mon / Wed / Fri): fixed x column so they never overlap each other or the grid
  const weekdayLabels = [
    { r: 1, label: "Mon" },
    { r: 3, label: "Wed" },
    { r: 5, label: "Fri" },
  ]
    .map(({ r, label }) => {
      const x = marginLeft - 60;
      const y = originY + r * (TILE_H / 2) + 3;
      return `<text x="${x}" y="${y}" fill="#8b949e" font-family="Segoe UI, sans-serif" font-size="10">${label}</text>`;
    })
    .join("");

  // ---- Robot: walks left-to-right along the front edge (row 6), pausing briefly over each column ----
  const robotY = originY + (recentWeeks.length - 1 + 6) * (TILE_H / 2) * 0 ; // unused placeholder
  const robotPathPoints = recentWeeks.map((_, c) => {
    const r = 6;
    const x = originX + (c - r) * (TILE_W / 2);
    const y = originY + (c + r) * (TILE_H / 2) - 26;
    return { x, y };
  });
  let robotPath = "";
  robotPathPoints.forEach((p, i) => {
    robotPath += i === 0 ? `M ${p.x},${p.y} ` : `L ${p.x},${p.y} `;
  });
  const totalDelay = columnDelays[columnDelays.length - 1] + 0.5;
  const robotDuration = totalDelay.toFixed(2);

  const robot = `
    <g id="robot">
      <animateMotion path="${robotPath}" begin="0s" dur="${robotDuration}s" fill="freeze" calcMode="linear"/>
      <ellipse cx="0" cy="13" rx="9" ry="2.5" fill="#000" opacity="0.35"/>
      <rect x="-3" y="1" width="6" height="9" rx="1.5" fill="#9ca3af"/>
      <rect x="-10" y="-10" width="20" height="15" rx="4" fill="#e5e7eb"/>
      <rect x="-10" y="-10" width="20" height="15" rx="4" fill="none" stroke="#c4c9d1" stroke-width="0.6"/>
      <rect x="-7" y="-6" width="14" height="6" rx="2" fill="#1f2937"/>
      <rect x="-5.5" y="-4.3" width="4" height="3" fill="#22d3ee">
        <animate attributeName="opacity" values="1;0.4;1" dur="0.6s" repeatCount="indefinite"/>
      </rect>
      <rect x="1.5" y="-4.3" width="4" height="3" fill="#22d3ee">
        <animate attributeName="opacity" values="1;0.4;1" dur="0.6s" repeatCount="indefinite" begin="0.3s"/>
      </rect>
      <circle cx="0" cy="-15" r="2" fill="#f59e0b"/>
      <line x1="0" y1="-13" x2="0" y2="-10" stroke="#9ca3af" stroke-width="1.4"/>
      <g>
        <rect x="-15" y="-4" width="6" height="4.5" rx="1.5" fill="#e5e7eb">
          <animateTransform attributeName="transform" type="rotate"
            values="0 -12 -2; -35 -12 -2; 0 -12 -2" dur="0.5s" repeatCount="indefinite"/>
        </rect>
      </g>
    </g>`;

  const svgWidth = originX + recentWeeks.length * (TILE_W / 2) + 60;
  const svgHeight = originY + 6 * TILE_H + MAX_EXTRUDE + 70;

  return `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" rx="12"/>
  <text x="24" y="34" fill="#e6edf3" font-family="Segoe UI, sans-serif" font-size="17" font-weight="700">3D Contribution Calendar</text>
  <text x="24" y="54" fill="#8b949e" font-family="Segoe UI, sans-serif" font-size="12">Built cube-by-cube from real GitHub activity 🤖</text>

  ${monthLabels}
  ${weekdayLabels}
  ${cubes}
  ${robot}

  <g transform="translate(${svgWidth - 190}, ${svgHeight - 26})" font-family="Segoe UI, sans-serif" font-size="11" fill="#8b949e">
    <text x="0" y="9">Less</text>
    <rect x="34" y="0" width="10" height="10" rx="2" fill="${LEVELS[0].top}"/>
    <rect x="48" y="0" width="10" height="10" rx="2" fill="${LEVELS[1].top}"/>
    <rect x="62" y="0" width="10" height="10" rx="2" fill="${LEVELS[2].top}"/>
    <rect x="76" y="0" width="10" height="10" rx="2" fill="${LEVELS[3].top}"/>
    <rect x="90" y="0" width="10" height="10" rx="2" fill="${LEVELS[4].top}"/>
    <text x="106" y="9">More</text>
  </g>
</svg>`;
}

(async () => {
  const result = await graphqlRequest();
  if (result.errors) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exit(1);
  }
  const weeks = result.data.user.contributionsCollection.contributionCalendar.weeks;
  const svg = buildSVG(weeks);
  fs.mkdirSync("robot-contrib", { recursive: true });
  fs.writeFileSync("robot-contrib/robot-builder-3d.svg", svg);
  console.log("robot-contrib/robot-builder-3d.svg written.");
})();
