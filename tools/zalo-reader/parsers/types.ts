export type SemanticMediaBias =
  | "auto"
  | "before"
  | "after";

export type SemanticBuildingBoundary =
  | "address-or-separator"
  | "address"
  | "separator";

export type SemanticParserOptions = {
  mediaBias?: SemanticMediaBias;
  buildingBoundary?: SemanticBuildingBoundary;
  splitBySender?: boolean;
  allowMediaOnly?: boolean;
  allowTextOnly?: boolean;
  maxMediaGapMs?: number;
  boundaryGapMs?: number;
  uncertainScoreDelta?: number;
};

export type SemanticIndexedDbMessage = {
  msgId: string;
  cliMsgId: string;
  msgType: number;
  kind: "text" | "image" | "other";
  text: string;
  imageUrls: string[];
  groupLayoutId: string | number | null;
  imageIndex: string | number | null;
  totalImages: string | number | null;
  sendDttm: number;
  serverTime: number;
  fromUid: string;
  toUid: string;
  senderName: string;
  originMsgType: string;
  videoUrls: string[];
  videoThumbUrls: string[];
  videoDebug?: any;
  contentSource?: "zdb" | "sidx" | "dom";
  domHydration?: {
    order: number;
    timeText?: string;
    approxTimestamp?: number | null;
  };
};

export type SemanticVideoPayload = {
  sourceUrl: string;
  thumbnailUrl?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
};

export type SemanticAlbumPreview = {
  albumKey: string;
  groupLayoutId: string | number | null;
  expectedImageCount: number | null;
  actualImageCount: number;
  complete: boolean;
  imageMessageIds: string[];
  imageUrls: string[];
};

export type SemanticRoomPreview = {
  sourceHash: string;
  groupId: string;
  senderUid: string;
  houseInfoText: string;
  markerText: string;
  descriptionTexts: string[];
  fullText: string;
  markerMessageId: string;
  markerTimestamp: number;
  albums: SemanticAlbumPreview[];
  imageUrls: string[];
  imageMessageIds: string[];
  hasVideo: boolean;
  videoMessageIds: string[];
  videoUrls: string[];
  videoThumbUrls: string[];
  videos: SemanticVideoPayload[];
  warnings: string[];
};

export type RoomAnchor = {
  id: string;
  messageId: string;
  messageIndex: number;
  timestamp: number;
  senderUid: string;
  markerText: string;
  roomCode: string;
  descriptionTexts: string[];
};

export type MediaBundle = {
  id: string;
  kind: "album" | "video";
  messageIds: string[];
  messageIndexes: number[];
  firstMessageIndex: number;
  lastMessageIndex: number;
  firstTimestamp: number;
  lastTimestamp: number;
  senderUid: string;
  album?: SemanticAlbumPreview;
  videos?: SemanticVideoPayload[];
  videoUrls?: string[];
  videoThumbUrls?: string[];
};

export type BuildingSegment = {
  id: string;
  messages: SemanticIndexedDbMessage[];
  sourceIndexes: number[];
  buildingTexts: string[];
  knownAddressKey: string;
  warnings: Set<string>;
};

export type ClassifiedTextMessage = {
  cleanedText: string;
  buildingStart: boolean;
  projectHeader: boolean;
  addressKey: string;
  roomAnchors: Array<{
    markerText: string;
    roomCode: string;
  }>;
  buildingLines: string[];
  otherLines: string[];
  separator: boolean;
};
