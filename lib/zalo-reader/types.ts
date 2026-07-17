export type IncomingZaloImage = {
  name?: string;
  mimeType?: string;
  base64?: string;
};

export type IncomingZaloVideo = {
  sourceUrl?: string;
  thumbnailUrl?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
};

export type IncomingZaloReaderIssue = {
  level?: string;
  index?: number | null;
  message?: string;
  sourceUrl?: string | null;
};

export type ZaloImportIssueStage =
  | "reader"
  | "image"
  | "video"
  | "thumbnail"
  | "database"
  | "media";

export type ZaloImportIssue = {
  level: "warning" | "error";
  stage: ZaloImportIssueStage;
  index: number | null;
  message: string;
  sourceUrl?: string | null;
};

export type ZaloImportStage =
  | "request"
  | "auth"
  | "parse-request"
  | "lookup-existing"
  | "parse-room"
  | "resolve-room"
  | "batch-insert"
  | "image-upload"
  | "image-insert"
  | "video-upload"
  | "video-insert"
  | "batch-update"
  | "pending-insert"
  | "response";

export type ZaloImportRequestBody = {
  groupName: string;
  senderName: string;
  rawText: string;
  sourceMessageId: string | null;
  sourceHash: string;
  sentAt: string | null;
  images: IncomingZaloImage[];
  videos: IncomingZaloVideo[];
  expectedImageCount: number;
  expectedVideoCount: number;
  readerIssues: ZaloImportIssue[];
};
