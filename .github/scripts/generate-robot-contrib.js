/**
 * Generates an animated SVG showing a little robot "building" your GitHub
 * contribution graph out of blocks — taller & brighter blocks for busier days.
 * Real data, pulled live from the GitHub GraphQL API each time this runs.
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
          "User-Agent": "robot-contrib-generator",
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

function buildSVG(weeks) {
  // Use the most recent 20 weeks so the whole thing fits nicely on a profile README
  const recentWeeks = weeks.slice(-20);
  const maxCount = Math.max(
    1,
    ...recentWeeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount))
  );

  const blockW = 14;
  const gap = 4;
  const colW = blockW + gap;
  const baseY = 150;
  const maxBlockH = 100;

  const totalWidth = recentWeeks.length * colW + 40;
  const svgWidth = totalWidth;
  const svgHeight = 220;

  const colorFor = (count) => {
    if (count === 0) return "#2d2d44";
    const ratio = count / maxCount;
    if (ratio < 0.25) return "#4c1d95";
    if (ratio < 0.5) return "#7c3aed";
    if (ratio < 0.75) return "#a855f7";
    return "#facc15";
  };

  let blocks = "";
  let delayStep = 0;

  recentWeeks.forEach((week, wi) => {
    // collapse each week's 7 days into a single stacked column by total contributions
    const weekTotal = week.contributionDays.reduce((s, d) => s + d.contributionCount, 0);
    const h = Math.max(6, (weekTotal / (maxCount * 7)) * maxBlockH);
    const x = 20 + wi * colW;
    const y = baseY - h;
    const color = colorFor(weekTotal / 7);
    const delay = (delayStep * 0.06).toFixed(2);
    delayStep++;

    blocks += `
      <rect x="${x}" y="${baseY}" width="${blockW}" height="${h}" rx="2"
        fill="${color}" opacity="0">
        <animate attributeName="y" from="${baseY}" to="${y}" begin="${delay}s" dur="0.5s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1"/>
        <animate attributeName="height" from="0" to="${h}" begin="${delay}s" dur="0.5s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1"/>
        <animate attributeName="opacity" from="0" to="1" begin="${delay}s" dur="0.3s" fill="freeze"/>
      </rect>`;
  });

  const robotTravel = totalWidth - 60;
  const robotDuration = (delayStep * 0.06 + 1.2).toFixed(2);

  const robot = `
    <g id="robot">
      <animateMotion path="M 10,${baseY - maxBlockH - 34} h ${robotTravel}"
        begin="0s" dur="${robotDuration}s" fill="freeze" calcMode="linear"/>
      <rect x="-10" y="-10" width="20" height="18" rx="3" fill="#e5e7eb"/>
      <rect x="-6" y="-6" width="5" height="5" fill="#22d3ee">
        <animate attributeName="fill" values="#22d3ee;#0891b2;#22d3ee" dur="0.8s" repeatCount="indefinite"/>
      </rect>
      <rect x="1" y="-6" width="5" height="5" fill="#22d3ee">
        <animate attributeName="fill" values="#22d3ee;#0891b2;#22d3ee" dur="0.8s" repeatCount="indefinite" begin="0.4s"/>
      </rect>
      <rect x="-3" y="8" width="6" height="10" fill="#9ca3af"/>
      <rect x="-14" y="-4" width="6" height="4" fill="#e5e7eb">
        <animateTransform attributeName="transform" type="rotate" values="0 -11 -2;-30 -11 -2;0 -11 -2" dur="0.5s" repeatCount="indefinite"/>
      </rect>
    </g>`;

  return `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0d1117" rx="10"/>
  <text x="20" y="30" fill="#e5e7eb" font-family="Segoe UI, sans-serif" font-size="16" font-weight="600">Building contributions, one block at a time 🤖</text>
  <line x1="15" y1="${baseY}" x2="${svgWidth - 15}" y2="${baseY}" stroke="#30363d" stroke-width="1"/>
  ${blocks}
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
  fs.writeFileSync("robot-contrib/robot-builder.svg", svg);
  console.log("robot-contrib/robot-builder.svg written.");
})();
