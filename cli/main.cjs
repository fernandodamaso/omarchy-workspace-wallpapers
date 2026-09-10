'use strict';
const crypto = require('node:crypto');
const Model = require('../ConfigModel.js');
const Config = require('./config.cjs');
const { inspectImage, validateImages } = require('./images.cjs');
const { executeLive } = require('./live.cjs');
const { failure, envelope, errorEnvelope } = require('./result.cjs');
const VERSION = require('../manifest.json').version;
const HELP = `Workspace Wallpapers (Node 22+)\n\nworkspace-wallpapers config validate [--config PATH] [--json]\nworkspace-wallpapers config migrate [--dry-run] [--config PATH] [--json]\nworkspace-wallpapers assign KEY PATH [--config PATH] [--json]\nworkspace-wallpapers clear KEY [--config PATH] [--json]\nworkspace-wallpapers config apply [--dry-run] [--config PATH] [--timeout MS] [--json]\nworkspace-wallpapers status [--timeout MS] [--json]\nworkspace-wallpapers doctor [--config PATH] [--timeout MS] [--json]\nworkspace-wallpapers --help | --version [--json]\n\nEdits and migration update desired JSON only. Only explicit config apply changes\napplied wallpapers. Dry-run, validation, status and doctor never write state.\nKeys: id:2 or name: Work (quote exact names). Image paths must be absolute.\nAbsent mappings follow the global background; ID mappings take precedence.\nTimeout: 1..120000 ms (default 10000), shared by live IPC and completion polling.\nOn timeout/restart/unknown completion, inspect status; never blindly apply again.\nApplied/persisted does not prove rendered pixels. No prompts or auto-fixes.\n`;

function parseArgs(argv) {
  const options = {};
  const words = [];
  let literal = false;
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i];
    if (word === '--' && !literal) { literal = true; continue; }
    if (!literal && word.startsWith('--')) {
      if (!['--json', '--config', '--dry-run', '--timeout', '--help', '--version'].includes(word)) throw failure('usage', 'Unknown option: ' + word, 2);
      const key = word.slice(2);
      if (Object.hasOwn(options, key)) throw failure('usage', 'Duplicate option: ' + word, 2);
      if (key === 'config' || key === 'timeout') {
        if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw failure('usage', word + ' requires a value.', 2);
        options[key] = argv[++i];
      } else options[key] = true;
    } else words.push(word);
  }
  if (options.help || options.version) {
    if (words.length || (options.help && options.version) || options.config !== undefined || options.timeout !== undefined || options['dry-run']) throw failure('usage', 'Help and version do not accept command arguments.', 2);
    return { command: options.help ? 'help' : 'version', options, args: [] };
  }
  const command = words[0] === 'config' ? words.splice(0, 2).join(' ') : words.shift();
  const counts = { 'config validate': 0, 'config migrate': 0, 'config apply': 0, assign: 2, clear: 1, status: 0, doctor: 0 };
  if (!Object.hasOwn(counts, command) || words.length !== counts[command]) throw failure('usage', 'Invalid command or argument count. Run workspace-wallpapers --help.', 2);
  if (options['dry-run'] && !['config migrate', 'config apply'].includes(command)) throw failure('usage', '--dry-run is supported only by config migrate or config apply.', 2);
  if (options.timeout !== undefined) {
    if (!['config apply', 'status', 'doctor'].includes(command) || !/^[1-9][0-9]*$/.test(options.timeout)
        || !Number.isSafeInteger(Number(options.timeout)) || Number(options.timeout) > 120000)
      throw failure('usage', '--timeout must be an integer from 1 to 120000 for a live command.', 2);
    options.timeout = Number(options.timeout);
  }
  if (command === 'status' && options.config !== undefined) throw failure('usage', 'Status reads applied runtime state, not a selected desired file.', 2);
  return { command, options, args: words };
}

async function execute(parsed, requestId, env = process.env) {
  const { command, options, args } = parsed;
  const success = (phase, message, data) => envelope(command, requestId, phase, 'ok', message, data);
  if (command === 'help') return success('read', 'Command help.', { help: HELP });
  if (command === 'version') return success('read', 'CLI version.', { version: VERSION });
  if (['config apply', 'status', 'doctor'].includes(command)) return executeLive(parsed, requestId, env);
  const paths = Config.pathsFor(env, options.config);
  if (command === 'config validate') {
    const { config, revision } = Config.readConfig(paths.config);
    const images = validateImages(config);
    return success('validated', 'Desired configuration is valid; nothing was applied.', { configPath: paths.config, revision, desiredHash: Config.configHash(config), images, applyRequired: true });
  }
  if (command === 'config migrate') {
    if (Config.readRaw(paths.config, true).revision !== null) throw failure('config-exists', 'Desired configuration already exists; migration will not overwrite it.', 4);
    const legacy = Config.readConfig(paths.legacy);
    validateImages(legacy.config);
    if (Config.readRaw(paths.legacy).revision !== legacy.revision) throw failure('config-conflict', 'Legacy assignments changed while migration was being prepared.', 4);
    if (!options['dry-run']) Config.writeConfig(paths.config, legacy.config, { expectedRevision: null, createOnly: true });
    return success(options['dry-run'] ? 'planned' : 'written', options['dry-run'] ? 'Migration preview; no files created.' : 'Desired configuration created; legacy data preserved.', { configPath: paths.config, legacyPath: paths.legacy, config: legacy.config, applyRequired: true });
  }
  const key = args[0];
  if (!Model.validKey(key)) throw failure('invalid-workspace-key', 'Use a canonical id:positive-integer or name:exact-name key; special workspaces are excluded.', 2);
  const current = Config.readConfig(paths.config, { allowMissing: true });
  const next = Model.validateConfig(current.config);
  if (command === 'assign') {
    inspectImage(args[1]);
    next.assignments[key] = args[1];
  } else delete next.assignments[key];
  const saved = Config.writeConfig(paths.config, next, { expectedRevision: current.revision });
  return success('written', 'Desired configuration updated; nothing was applied.', { configPath: paths.config, revision: saved.revision, desiredHash: Config.configHash(next), applyRequired: true });
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const requestId = crypto.randomUUID();
  const json = argv.includes('--json');
  let command = 'unknown';
  try {
    if (Number(process.versions.node.split('.')[0]) < 22) throw failure('dependency-unavailable', 'Node 22 or newer is required.', 3);
    const parsed = parseArgs(argv);
    command = parsed.command;
    const result = await execute(parsed, requestId, env);
    process.stdout.write(json ? JSON.stringify(result) + '\n' : result.data?.help || (command === 'version' ? VERSION + '\n' : result.message + '\n' + (['status', 'doctor', 'config apply'].includes(command) ? JSON.stringify(result.data, null, 2) + '\n' : '')));
    return 0;
  } catch (error) {
    const result = errorEnvelope(command, requestId, error);
    if (json) process.stdout.write(JSON.stringify(result) + '\n');
    process.stderr.write(result.code + ': ' + result.message + '\n');
    return Number.isInteger(error.exitCode) ? error.exitCode : 6;
  }
}
module.exports = { HELP, parseArgs, execute, main };
