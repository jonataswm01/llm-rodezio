/**
 * Logger com cores ANSI para o Rodezio.
 * Ativar logs verbosos: RODEZIO_DEBUG=true ou DEBUG=true
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";

export const isDebug = () =>
  process.env.RODEZIO_DEBUG === "true" || process.env.RODEZIO_DEBUG === "1" || process.env.DEBUG === "true";

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function prefix(tag: string, color: string): string {
  return `${DIM}${ts()}${RESET} ${color}${BOLD}[${tag}]${RESET}`;
}

export const log = {
  /** Log sempre visível */
  info: (msg: string, ...args: unknown[]) => {
    console.log(`${prefix("INFO", BLUE)} ${msg}`, ...args);
  },
  success: (msg: string, ...args: unknown[]) => {
    console.log(`${prefix("OK", GREEN)} ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    console.warn(`${prefix("WARN", YELLOW)} ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    console.error(`${prefix("ERRO", RED)} ${msg}`, ...args);
  },

  /** Logs só quando RODEZIO_DEBUG=true */
  debug: (msg: string, ...args: unknown[]) => {
    if (isDebug()) console.log(`${prefix("DEBUG", DIM)} ${msg}`, ...args);
  },
  step: (msg: string, ...args: unknown[]) => {
    if (isDebug()) console.log(`${prefix("STEP", CYAN)} ${msg}`, ...args);
  },
  agent: (msg: string, ...args: unknown[]) => {
    if (isDebug()) console.log(`${prefix("AGENTE", MAGENTA)} ${msg}`, ...args);
  },
  tool: (msg: string, ...args: unknown[]) => {
    if (isDebug()) console.log(`${prefix("TOOL", YELLOW)} ${msg}`, ...args);
  },
  thinking: (content: string) => {
    if (isDebug()) {
      const lines = content.split("\n").filter(Boolean);
      const header = `${prefix("PENSAMENTO", MAGENTA)}`;
      console.log(`${header}`);
      for (const line of lines) {
        console.log(`  ${DIM}${line}${RESET}`);
      }
    }
  },
};
