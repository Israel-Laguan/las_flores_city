export interface DialogueNode {
  id: string;
  type: string;
  text: string;
  thought?: string;
  speaker_id?: string;
  speaker?: {
    id: string;
    name: string;
    title: string;
    avatar_url: string | null;
  };
  choices?: Array<{
    id: string;
    text: string;
    next_node_id: string;
    time_block_cost?: { amount: number; description: string };
    relationship_change?: { stat: string; amount: number };
  }>;
  effects?: any;
  is_end?: boolean;
}
