/** The API surface the UI depends on, implemented by the real backend client. */
import type {
  AskPayload,
  AskResponse,
  AuthResponse,
  Collection,
  Conversation,
  ConversationWithMessages,
  CreateConversationPayload,
  CreateWorkspacePayload,
  Document,
  DocStatus,
  InviteMemberPayload,
  LoginPayload,
  Message,
  RegisterPayload,
  User,
  Workspace,
  WorkspaceMember,
} from "../types";

export interface Api {
  auth: {
    login(p: LoginPayload): Promise<AuthResponse>;
    register(p: RegisterPayload): Promise<AuthResponse>;
    me(): Promise<User>;
    updateProfile(p: { name?: string; avatarUrl?: string }): Promise<User>;
    logout(): Promise<void>;
    requestMagicLink(email: string, name?: string): Promise<void>;
    verifyMagicLink(token: string): Promise<AuthResponse>;
  };
  workspaces: {
    list(): Promise<Workspace[]>;
    get(id: string): Promise<Workspace>;
    create(p: CreateWorkspacePayload): Promise<Workspace>;
    update(id: string, p: Partial<CreateWorkspacePayload>): Promise<Workspace>;
    remove(id: string): Promise<void>;
    members(id: string): Promise<WorkspaceMember[]>;
    invite(id: string, p: InviteMemberPayload): Promise<{ ok: true }>;
    removeMember(id: string, userId: string): Promise<void>;
    leave(id: string): Promise<void>;
  };
  collections: {
    list(workspaceId: string): Promise<Collection[]>;
    create(workspaceId: string, name: string): Promise<Collection>;
    update(workspaceId: string, id: string, name: string): Promise<Collection>;
    remove(workspaceId: string, id: string): Promise<void>;
  };
  documents: {
    list(workspaceId: string, collectionId: string, status?: DocStatus): Promise<Document[]>;
    get(workspaceId: string, collectionId: string, id: string): Promise<Document>;
    upload(workspaceId: string, collectionId: string, file: File): Promise<Document>;
    reprocess(workspaceId: string, collectionId: string, id: string): Promise<void>;
    remove(workspaceId: string, collectionId: string, id: string): Promise<void>;
    /** Authenticated download — fetches the blob and saves it in the browser. */
    download(workspaceId: string, collectionId: string, id: string, filename: string): Promise<void>;
  };
  chat: {
    listConversations(workspaceId: string): Promise<Conversation[]>;
    getConversation(workspaceId: string, id: string): Promise<ConversationWithMessages>;
    createConversation(workspaceId: string, p: CreateConversationPayload): Promise<Conversation>;
    updateConversation(
      workspaceId: string,
      id: string,
      p: { title?: string; pinned?: boolean },
    ): Promise<Conversation>;
    removeConversation(workspaceId: string, id: string): Promise<void>;
    listMessages(workspaceId: string, id: string): Promise<Message[]>;
    ask(workspaceId: string, conversationId: string, p: AskPayload): Promise<AskResponse>;
  };
}
