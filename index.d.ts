import type { Client } from 'discord.js';

export interface BotOptions {
  token?: string;
  prefix?: string | string[];
  mentionPrefix?: boolean;
  ignoreBots?: boolean;
  owners?: string | string[];
  intents?: 'default' | 'all' | Array<string | number>;
  syncSlash?: boolean;
  slashGuild?: string | null;
  timezone?: string;
  allowedMentions?: object;
  debug?: boolean;
  handleSignals?: boolean;
  /** Nyalakan $eval / $jsEval / bot.evalCommand (hanya untuk ID di `owners`). Bawaan: false */
  eval?: boolean;
  database?: { path?: string; memory?: boolean; saveDelay?: number } | Database;
  messages?: { cooldown?: string; error?: string };
  status?: { text: string; type?: 'Playing' | 'Streaming' | 'Listening' | 'Watching' | 'Competing'; status?: 'online' | 'idle' | 'dnd' | 'invisible' };
  onError?: (error: Error, ctx: Context) => unknown;
  client?: Client;
  discord?: unknown;
}

export interface CommandDef { name: string; aliases?: string[]; code: string }
export interface SlashOption {
  name: string;
  description: string;
  type?: 'string' | 'integer' | 'boolean' | 'user' | 'channel' | 'role' | 'mentionable' | 'number' | 'attachment';
  required?: boolean;
  choices?: Array<{ name: string; value: string | number }>;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  /** Pilihan dinamis; daftarkan handler dengan bot.autocomplete(). Tidak bisa bersama `choices`. */
  autocomplete?: boolean;
}
export interface AutocompleteDef { command: string; option?: string; code: string }
export interface ContextMenuDef { name: string; menu: 'user' | 'message'; code: string }
export interface SlashDef { name: string; description: string; options?: SlashOption[]; code: string }
export interface ComponentDef { customId: string; code: string }
export type EventType = 'ready' | 'memberJoin' | 'memberLeave' | 'messageDelete' | 'messageUpdate' | 'reactionAdd' | 'reactionRemove' | 'guildJoin' | 'guildLeave' | 'message'
  | 'memberBan' | 'memberUnban' | 'channelCreate' | 'channelDelete' | 'roleCreate' | 'roleDelete' | 'threadCreate' | 'voiceJoin' | 'voiceLeave';
export interface EventDef { type: EventType; channel?: string; code: string }
export interface CustomFunction {
  name: string;
  params?: number;
  min?: number;
  max?: number;
  brackets?: 'none' | 'optional' | 'required';
  override?: boolean;
  signature?: string;
  description?: string;
  run: (ctx: Context, args: string[]) => unknown | Promise<unknown>;
}

export class Context {
  bot: Bot;
  client: Client;
  kind: 'message' | 'slash' | 'component' | 'event';
  guild: any;
  channel: any;
  member: any;
  user: any;
  message: any;
  interaction: any;
  args: string[];
  rawArgs: string;
}

export class Database {
  constructor(options?: { path?: string; memory?: boolean; saveDelay?: number });
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  keys(prefix?: string): string[];
  flush(): void;
}

export class Bot {
  constructor(options?: BotOptions);
  client: Client | null;
  db: Database;
  command(def: CommandDef): this;
  slashCommand(def: SlashDef): this;
  button(def: ComponentDef): this;
  select(def: ComponentDef): this;
  modal(def: ComponentDef): this;
  autocomplete(def: AutocompleteDef): this;
  contextMenu(def: ContextMenuDef): this;
  /** Pasang command eval siap pakai (butuh `eval: true` dan `owners`). */
  evalCommand(def?: { name?: string; aliases?: string[] }): this;
  event(def: EventDef): this;
  onMemberBan(code: string | Omit<EventDef, 'type'>): this;
  onMemberUnban(code: string | Omit<EventDef, 'type'>): this;
  onChannelCreate(code: string | Omit<EventDef, 'type'>): this;
  onChannelDelete(code: string | Omit<EventDef, 'type'>): this;
  onRoleCreate(code: string | Omit<EventDef, 'type'>): this;
  onRoleDelete(code: string | Omit<EventDef, 'type'>): this;
  onThreadCreate(code: string | Omit<EventDef, 'type'>): this;
  onVoiceJoin(code: string | Omit<EventDef, 'type'>): this;
  onVoiceLeave(code: string | Omit<EventDef, 'type'>): this;
  onReady(code: string | Omit<EventDef, 'type'>): this;
  onMemberJoin(code: string | Omit<EventDef, 'type'>): this;
  onMemberLeave(code: string | Omit<EventDef, 'type'>): this;
  onMessageDelete(code: string | Omit<EventDef, 'type'>): this;
  onMessageUpdate(code: string | Omit<EventDef, 'type'>): this;
  onReactionAdd(code: string | Omit<EventDef, 'type'>): this;
  onReactionRemove(code: string | Omit<EventDef, 'type'>): this;
  onGuildJoin(code: string | Omit<EventDef, 'type'>): this;
  onGuildLeave(code: string | Omit<EventDef, 'type'>): this;
  onMessage(code: string | Omit<EventDef, 'type'>): this;
  variables(vars: Record<string, string | number | boolean>): this;
  addFunction(fn: CustomFunction): this;
  loadCommands(dir: string): this;
  validate(): true;
  getVar(scope: 'user' | 'server' | 'channel' | 'global', name: string, id?: string | null): string;
  setVar(scope: 'user' | 'server' | 'channel' | 'global', name: string, value: unknown, id?: string | null): void;
  resetVar(scope: 'user' | 'server' | 'channel' | 'global', name: string, id?: string | null): void;
  connect(token?: string): Promise<this>;
  destroy(): Promise<void>;
}

export class BotError extends Error {}
export class ParseError extends BotError { line?: number; col?: number }
export class ValidationError extends BotError { problems: string[] }
