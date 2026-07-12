/**
 * Generates an animated SVG: a true isometric 3D contribution calendar,
 * built cube-by-cube by a little robot, using real GitHub contribution data
 * pulled live via the GraphQL API.
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

// Isometric projection helpers
const TILE_W = 18;   // width of a cube's top face
const TILE_H = 9;    // half-height of the rhombus top face
const UNIT_EXTRUDE = 3; // px of height per contribution "level"
const MAX_EXTRUDE = 30; // cap so busy days don't dwarf everything

function colorFor(count, maxCount) {
  if (count === 0) return { top: "#21262d", left: "#161b22", right: "#1c2128" };
  const ratio = Math.min(1, count / maxCount);
  if (ratio < 0.25) return { top: "#5b3aa0", left: "#432b78", right: "#4c3189" };
  if (ratio < 0.5) return { top: "#8b5cf6", left: "#6d3fd1", right: "#7a4ade" };
  if (ratio < 0.75) return { top: "#c084fc", left: "#a855f7", right: "#b566fa" };
  return { top: "#fde047", left: "#facc15", right: "#fbd41f" };
}

function cubeSVG(cx, topY, baseY, colors, delay) {
  const w = TILE_W / 2;
  const h = TILE_H / 2;
  // Top rhombus
  const top = `${cx},${topY - h} ${cx + w},${topY} ${cx},${topY + h} ${cx - w},${topY}`;
  // Left face
  const left = `${cx - w},${topY} ${cx},${topY + h} ${cx},${baseY + h} ${cx - w},${baseY}`;
  // Right face
  const right = `${cx},${topY + h} ${cx + w},${topY} ${cx + w},${baseY} ${cx},${baseY + h}`;

  return `
    <g opacity="0">
      <animate attributeName="opacity" from="0" to="1" begin="${delay}s" dur="0.25s" fill="freeze"/>
      <polygon points="${left}" fill="${colors.left}"/>
      <polygon points="${right}" fill="${colors.right}"/>
      <polygon points="${top}" fill="${colors.top}"/>
    </g>`;
}

function buildSVG(weeks) {
  const recentWeeks = weeks.slice(-18);
  const maxCount = Math.max(
    1,
    ...recentWeeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount))
  );

  const originX = 260;
  const originY = 60;

  let cubes = "";
  let delayStep = 0;
  const positions = []; // for robot path

  recentWeeks.forEach((week, c) => {
    week.contributionDays.forEach((day, r) => {
      const count = day.contributionCount;
      const extrude = Math.min(MAX_EXTRUDE, count * UNIT_EXTRUDE) || 2;

      const baseX = originX + (c - r) * (TILE_W / 2);
      const baseY = originY + (c + r) * (TILE_H / 2);
      const topY = baseY - extrude;

      const colors = colorFor(count, maxCount);
      const delay = (delayStep * 0.025).toFixed(2);
      cubes += cubeSVG(baseX, topY, baseY, colors, delay);
      positions.push({ x: baseX, y: topY - 14, delay: parseFloat(delay) });
      delayStep++;
    });
  });

  // Robot path: hop between a sampled subset of positions so the motion stays readable
  const sampled = positions.filter((_, i) => i % 6 === 0);
  let pathD = "";
  sampled.forEach((p, i) => {
    pathD += i === 0 ? `M ${p.x},${p.y} ` : `L ${p.x},${p.y} `;
  });
  const totalDuration = (delayStep * 0.025 + 1.5).toFixed(2);

  const robot = `
    <g id="robot">
      <animateMotion path="${pathD}" begin="0s" dur="${totalDuration}s" fill="freeze" calcMode="linear"/>
      <rect x="-9" y="-9" width="18" height="16" rx="3" fill="#e5e7eb"/>
      <rect x="-5" y="-5" width="4" height="4" fill="#22d3ee">
        <animate attributeName="fill" values="#22d3ee;#0891b2;#22d3ee" dur="0.7s" repeatCount="indefinite"/>
      </rect>
      <rect x="1" y="-5" width="4" height="4" fill="#22d3ee">
        <animate attributeName="fill" values="#22d3ee;#0891b2;#22d3ee" dur="0.7s" repeatCount="indefinite" begin="0.35s"/>
      </rect>
      <rect x="-3" y="7" width="6" height="9" fill="#9ca3af"/>
      <rect x="-13" y="-3" width="5" height="4" fill="#e5e7eb">
        <animateTransform attributeName="transform" type="rotate" values="0 -10 -1;-40 -10 -1;0 -10 -1" dur="0.4s" repeatCount="indefinite"/>
      </rect>
    </g>`;

  const svgWidth = originX + recentWeeks.length * (TILE_W / 2) + 60;
  const svgHeight = originY + 7 * TILE_H + MAX_EXTRUDE + 50;

  return `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0d1117" rx="10"/>
  <text x="20" y="28" fill="#e5e7eb" font-family="Segoe UI, sans-serif" font-size="16" font-weight="600">3D Contribution Calendar — built live, cube by cube 🤖</text>
  ${cubes}
  ${robot}
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
