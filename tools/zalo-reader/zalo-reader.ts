import { chromium, Page } from "playwright";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath, pathToFileURL } from "url";
import { buildSemanticTimelineRooms } from "./parsers";

const execFileAsync =
  promisify(execFile);


  type GroupConfigEntry =
  | string
  | {
      /**
       * Khóa cố định do mình tự đặt.
       *
       * Không đổi khóa này khi nhóm Zalo đổi tên.
       */
      key: string;

      /**
       * Tên nhóm hiện tại dùng để tìm và mở trên Zalo.
       */
      name: string;
    };

type SavedGroupRef = {
  groupId: string;

  /**
   * Tên nhóm tại thời điểm Group ID được lưu.
   * Chỉ dùng để xem và kiểm tra.
   */
  lastKnownName: string;

  savedAt: string;

  source:
    | "active_group_ui"
    | "manual";
};

// NOTE: only the import above is changed in this patch.
