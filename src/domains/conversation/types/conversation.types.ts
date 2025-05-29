export type AiMessage = {
  role: string;
  content: string;
};
export type AiConversation = {
  _id: string;
  title: string;
  created: string;
  updated: string;
  messages: AiMessage[];
  usageEstimate: number;
  userId: string; //the id of the user who owns the conversation
};

export type AiConversationNoId = Omit<AiConversation, "_id">;
