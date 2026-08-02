// Futuristic MarketingAgents lockup: a geometric MA monogram paired with a
// compact telemetry-style wordmark. The widest row is 47 columns, leaving
// comfortable space in a standard 80-column terminal and the in-app frame.
export const MARKETINGAGENTS_ASCII_LOGO = [
	"███╗   ███╗ █████╗    M A R K E T I N G",
	"████╗ ████║██╔══██╗   A G E N T S  //  MKT·OS",
	"██╔████╔██║███████║   ─────────────────────────",
	"██║╚██╔╝██║██╔══██║   AI MARKETING SYSTEM",
	"██║ ╚═╝ ██║██║  ██║   FOR TECHNICAL FOUNDERS",
	"╚═╝     ╚═╝╚═╝  ╚═╝   SYS/01 · HUMAN-GUIDED",
];

export const MARKETINGAGENTS_ASCII_LOGO_TEXT = MARKETINGAGENTS_ASCII_LOGO.join("\n");

export const MARKETINGAGENTS_LOGO_HTML = `<style>@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=swap');.logo{width:auto!important;height:auto!important;margin-bottom:16px!important}.marketingagents-wordmark{font-family:'Space Mono',monospace;font-size:34px;font-weight:700;letter-spacing:.1em;color:#e2e8f0;text-transform:uppercase}.marketingagents-mark{color:#7dd3fc;margin-right:.35em}</style><span class="marketingagents-wordmark"><span class="marketingagents-mark">MA/</span>MARKETING AGENTS</span>`;
