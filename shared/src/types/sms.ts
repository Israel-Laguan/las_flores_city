export type SMSAuthor = 'npc' | 'player';

export interface SMSMessage {
  id: string;
  author: SMSAuthor;
  text: string;
  createdAt: string;
  /** Server-side node id this message belongs to. Player messages also record
   *  which choice advanced the dialogue to its next node. */
  nodeId?: string;
  choiceId?: string;
}

export interface SMSThreadPreview {
  characterId: string;
  characterName: string;
  characterTitle: string | null;
  avatarUrl: string | null;
  lastMessage: SMSMessage | null;
  lastNpcMessageAt: string | null;
  friendshipLevel: number;
  romanceLevel: number;
  unread: boolean;
}

export interface SMSThreadChoice {
  id: string;
  text: string;
  next_node_id?: string;
  relationship_change?: {
    stat: 'friendship' | 'romance';
    amount: number;
  };
  time_block_cost?: {
    amount: number;
    description?: string;
  };
  required_flags?: Record<string, boolean>;
  hidden_if?: Record<string, boolean>;
  // Typed condition gates (mirror DialogueChoiceSchema).
  required_state?: Record<string, string>;
  hidden_if_state?: Record<string, string>;
  required_stats?: Record<string, string>;
  hidden_if_stats?: Record<string, string>;
}

export interface SMSThreadDetail {
  characterId: string;
  characterName: string;
  characterTitle: string | null;
  avatarUrl: string | null;
  chatHistory: SMSMessage[];
  currentNodeId: string | null;
  isEnd: boolean;
  choices: SMSThreadChoice[];
  friendshipLevel: number;
  romanceLevel: number;
  unread: boolean;
}

export interface SMSInboxResponse {
  threads: SMSThreadPreview[];
}

export interface SMSStartRequest {
  characterId: string;
}
