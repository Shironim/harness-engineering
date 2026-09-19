const fs = require('fs');
const path = require('path');

const MAIN_MCP_CONFIG = path.resolve(__dirname, '../../config/mcp_config.json');
const PLUGINS_DIR = path.resolve(__dirname, '../../config/plugins');
const MCP_TOOL_SCHEMAS_DIR = path.resolve(__dirname, '../../antigravity-cli/mcp');

// Known capability summaries for established MCP servers (compact, high-density)
const KNOWN_CAPABILITIES = {
  'codegraph': 'Backend symbol exploration, incoming/outgoing call graph, blast radius, cross-file relations',
  'septum': 'Domain boundary validation, vertical slice tracing (septum_trace_vertical_slice), symbol location (septum_locate_symbol), impact analysis, domain catalog',
  'context-mode': 'Sandboxed Bun/Node execution (ctx_execute), batch file aggregation (<=30 lines), large-data condensation, FTS5 search (ctx_search)',
  'sequential-thinking': 'Deep hypothesis formulation, multi-step architectural reasoning before code edits',
  'strata-mcp': 'Frontend AST parsing, Vue/TS component inspect (inspect_component), state tracing (trace_state), component trees',
  'playwright': 'Browser automation, E2E UI testing, visual inspection',
  'shadcn': 'Shadcn UI component installation and inspection',
  'shadcn-vue': 'Shadcn Vue component installation and styling',
  'strata-db': 'Database schema inspection and SQL query verification',
  'pencil': 'GUI wireframing and design mockup editing',
  'sysflow': 'System workflow and architectural diagramming',
  'github': 'GitHub Issues, PRs, and repository management',
  'knowledge-mcp': 'Knowledge engine query and vector documentation search',
  'basic-memory': 'Persistent key-value knowledge store',
  'jollimemory': 'Long-term session memory store'
};

let cachedCatalog = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5000; // 5-second in-memory cache

/**
 * Pemindai SSOT untuk menemukan seluruh MCP Server yang sedang aktif (disabled !== true).
 */
function getActiveMcpServers() {
  const now = Date.now();
  if (cachedCatalog && (now - lastCacheTime < CACHE_TTL_MS)) {
    return cachedCatalog;
  }

  const activeServers = new Map();

  // 1. Baca konfigurasi utama mcp_config.json
  try {
    if (fs.existsSync(MAIN_MCP_CONFIG)) {
      const parsed = JSON.parse(fs.readFileSync(MAIN_MCP_CONFIG, 'utf-8'));
      const servers = parsed.mcpServers || {};
      for (const [name, conf] of Object.entries(servers)) {
        if (conf && conf.disabled !== true) {
          activeServers.set(name, {
            name,
            command: conf.command,
            args: conf.args || [],
            source: 'config/mcp_config.json'
          });
        }
      }
    }
  } catch (_) {}

  // 2. Baca konfigurasi plugin
  try {
    if (fs.existsSync(PLUGINS_DIR)) {
      const plugins = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
      for (const p of plugins) {
        if (p.isDirectory()) {
          const pluginMcpConf = path.join(PLUGINS_DIR, p.name, 'mcp_config.json');
          if (fs.existsSync(pluginMcpConf)) {
            try {
              const parsed = JSON.parse(fs.readFileSync(pluginMcpConf, 'utf-8'));
              const servers = parsed.mcpServers || {};
              for (const [name, conf] of Object.entries(servers)) {
                if (conf && conf.disabled !== true) {
                  activeServers.set(name, {
                    name,
                    command: conf.command,
                    args: conf.args || [],
                    source: `plugins/${p.name}`
                  });
                }
              }
            } catch (_) {}
          }
        }
      }
    }
  } catch (_) {}

  // 3. Ekstrak tool yang tersedia untuk masing-masing server aktif
  const result = [];
  for (const [serverName, srv] of activeServers.entries()) {
    const tools = [];
    const schemaDir = path.join(MCP_TOOL_SCHEMAS_DIR, serverName);
    if (fs.existsSync(schemaDir)) {
      try {
        const files = fs.readdirSync(schemaDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            tools.push(file.replace(/\.json$/, ''));
          }
        }
      } catch (_) {}
    }

    result.push({
      name: serverName,
      tools,
      capability: KNOWN_CAPABILITIES[serverName] || `Custom MCP Server (${tools.join(', ') || 'native tools'})`
    });
  }

  cachedCatalog = result;
  lastCacheTime = now;
  return result;
}

/**
 * Menghasilkan representasi teks ringkas untuk konsumsi prompt Jev (Token-Efficient).
 */
function getCompactCapabilityCatalog() {
  const active = getActiveMcpServers();
  if (active.length === 0) {
    return 'No external MCP servers currently active.';
  }

  return active
    .map(srv => {
      const toolList = srv.tools.length > 0 ? ` [tools: ${srv.tools.join(', ')}]` : '';
      return `• ${srv.name}${toolList}: ${srv.capability}`;
    })
    .join('\n');
}

module.exports = {
  getActiveMcpServers,
  getCompactCapabilityCatalog
};
