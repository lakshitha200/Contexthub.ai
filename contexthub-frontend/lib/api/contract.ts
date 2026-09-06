/** The API surface the UI depends on, implemented by the real backend client. */
import type {
  AskPayload,
  AskResponse,
  AskStreamEvent,
  AuthResponse,
  Collection,
  Conversation,
  ConversationWithMessages,
  CreateConversationPayload,
  CreateWorkspacePayload,
  Document,
  DocumentFilters,
  Invite,
  InviteMemberPayload,
  LoginPayload,
  Message,
  RegisterPayload,
  RegisterResult,
  User,
  Workspace,
  WorkspaceMember,
} from "../types";

export interface Api {
  auth: {
    login(p: LoginPayload): Promise<AuthResponse>;
    register(p: RegisterPayload): Promise<RegisterResult>;
    me(): Promise<User>;
    updateProfile(p: { name?: string; avatarUrl?: string }): Promise<User>;
    logout(): Promise<void>;
    verifyEmail(token: string): Promise<AuthResponse>;
    resendVerification(email: string): Promise<void>;
    forgotPassword(email: string): Promise<void>;
    resetPassword(token: string, newPassword: string): Promise<AuthResponse>;
  };
  workspaces: {
    list(): Promise<Workspace[]>;
    get(id: string): Promise<Workspace>;
    create(p: CreateWorkspacePayload): Promise<Workspace>;
    update(id: string, p: Partial<CreateWorkspacePayload>): Promise<Workspace>;
    remove(id: string): Promise<void>;
    members(id: string): Promise<WorkspaceMember[]>;
    invite(id: string, p: InviteMemberPayload): Promise<{ ok: true }>;
    acceptInvite(token: string): Promise<{ workspaceId: string }>;
    listInvites(id: string): Promise<Invite[]>;
    revokeInvite(id: string, inviteId: string): Promise<void>;
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
    list(workspaceId: string, collectionId: string, filters?: DocumentFilters): Promise<Document[]>;
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
    /**
     * The same question, streamed. Yields `delta` frames as the answer is
     * written, then exactly one `done` (or `error`). Pass a signal to abort.
     */
    askStream(
      workspaceId: string,
      conversationId: string,
      p: AskPayload,
      signal?: AbortSignal,
    ): AsyncGenerator<AskStreamEvent>;
    /**
     * Object URL for the chart/diagram behind an IMAGE citation. The endpoint
     * needs the auth header, so the blob is fetched and wrapped rather than
     * pointed at directly. Callers must revokeObjectURL when done.
     */
    chunkImageUrl(workspaceId: string, chunkId: string): Promise<string>;
  };
}
