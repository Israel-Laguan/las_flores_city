// ── Types ──────────────────────────────────────────────────────

export interface FullStateRow {
  id: string;
  username: string;
  current_location_id: string | null;
  time_blocks: number;
  credits: number;
  gold_credits: number;
  current_node_id: string | null;
  current_day: number;
  alignment: string;
  story_beat: string;
  flags: Record<string, boolean>;
  // Categorical story variables (string values).
  state: Record<string, string>;
  // Numeric accumulating stats (number values).
  stats: Record<string, number>;
  last_login: string;
  created_at: string;
  updated_at: string;
  is_nsfw_unlocked: boolean;
  patreon_tier: string;
}

export type MoveResultOk = {
  success: true;
  from_location_id: string;
  to_location_id: string;
  tb_cost: number;
  time_blocks_remaining: number;
};

export type MoveResultFail = {
  success: false;
  error: 'already_here' | 'exhausted';
};

export type MoveResultType = MoveResultOk | MoveResultFail;

export interface SleepResult {
  time_blocks: number;
  credits: number;
  current_day: number;
  credits_deducted: number;
  previous_day: number;
  rent_paid: true;
  overdraft: boolean;
}

// ── Read Methods ───────────────────────────────────────────────

export {
  getFullState,
  getForChoiceFilter,
  getCurrentLocation,
  getDialogueCursor,
  getBalancesForLedger,
} from './PlayerStateRepository.read.js';

// ── Write Methods ───────────────────────────────────────────────

export {
  modifyBalance,
  chargeCurrency,
  getBalances,
  spendTimeBlocksWithLocation,
  spendTimeBlocks,
  setDialogueCursor,
  setDialogueChunkCursor,
  initDialogueChunkState,
  clearDialogueAndSimulation,
  move,
  sleep,
  setStoryBeat,
  setAlignment,
  enterSimulation,
  mergeFlags,
  mergeState,
  mergeStats,
  partialUpdate,
  createForNewUser,
} from './PlayerStateRepository.write.js';

// ── Repository Class (for static access pattern) ──────────────────

import * as readMethods from './PlayerStateRepository.read.js';
import * as writeMethods from './PlayerStateRepository.write.js';

export class PlayerStateRepository {
  static getFullState = readMethods.getFullState;
  static getForChoiceFilter = readMethods.getForChoiceFilter;
  static getCurrentLocation = readMethods.getCurrentLocation;
  static getDialogueCursor = readMethods.getDialogueCursor;
  static getBalancesForLedger = readMethods.getBalancesForLedger;
  static getBalances = writeMethods.getBalances;
  static modifyBalance = writeMethods.modifyBalance;
  static chargeCurrency = writeMethods.chargeCurrency;
  static spendTimeBlocksWithLocation = writeMethods.spendTimeBlocksWithLocation;
  static spendTimeBlocks = writeMethods.spendTimeBlocks;
  static setDialogueCursor = writeMethods.setDialogueCursor;
  static setDialogueChunkCursor = writeMethods.setDialogueChunkCursor;
  static initDialogueChunkState = writeMethods.initDialogueChunkState;
  static clearDialogueAndSimulation = writeMethods.clearDialogueAndSimulation;
  static move = writeMethods.move;
  static sleep = writeMethods.sleep;
  static setStoryBeat = writeMethods.setStoryBeat;
  static setAlignment = writeMethods.setAlignment;
  static enterSimulation = writeMethods.enterSimulation;
  static mergeFlags = writeMethods.mergeFlags;
  static mergeState = writeMethods.mergeState;
  static mergeStats = writeMethods.mergeStats;
  static partialUpdate = writeMethods.partialUpdate;
  static createForNewUser = writeMethods.createForNewUser;
}
