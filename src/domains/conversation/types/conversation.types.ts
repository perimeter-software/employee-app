//src/domain/conversion/types
export type AiMessage = {
  role: string;
  content: string;
  created?: string;
};

export type AiConversation = {
  id?: string | undefined;
  _id?: string;
  title: string;
  created?: string;
  updated?: string;
  messages: AiMessage[];
  userId: string;
};

export type CreateAiConversation = Omit<
  AiConversation,
  "_id" | "created" | "updated" | "messages"
>;
export type UpdateAiConversation = Partial<
  Omit<AiConversation, "_id" | "created" | "messages">
>;
export type AiConversationWithId = AiConversation & {
  _id: string;
};
