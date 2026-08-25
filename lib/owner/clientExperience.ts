"use client";

export type OwnerToastTone = "success" | "error";

export type OwnerBackgroundTask = {
  task: () => Promise<void>;
  successMessage: string;
  errorMessage?: string;
};

const TASK_EVENT = "owner:background-task";
const TOAST_EVENT = "owner:toast";
const NAVIGATION_START_EVENT = "owner:navigation-start";
const NAVIGATION_CANCEL_EVENT = "owner:navigation-cancel";

export function runOwnerBackgroundTask(detail: OwnerBackgroundTask) {
  window.dispatchEvent(new CustomEvent<OwnerBackgroundTask>(TASK_EVENT, { detail }));
}

export function showOwnerToast(message: string, tone: OwnerToastTone = "success") {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, tone } }));
}

export function showOwnerNavigationSkeleton() {
  window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
}

export function hideOwnerNavigationSkeleton() {
  window.dispatchEvent(new Event(NAVIGATION_CANCEL_EVENT));
}

export const ownerExperienceEvents = {
  task: TASK_EVENT,
  toast: TOAST_EVENT,
  navigationStart: NAVIGATION_START_EVENT,
  navigationCancel: NAVIGATION_CANCEL_EVENT,
} as const;
