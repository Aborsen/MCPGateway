import { prisma } from "./db";
import { truncateJson } from "./json";

export type AdminEventType =
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "USER_PASSWORD_CHANGED"
  | "USER_ROLE_CHANGED";

export type AdminEventInput = {
  actorId?: string | null;
  targetUserId?: string | null;
  eventType: AdminEventType;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  details?: unknown;
};

export async function writeAdminEvent(event: AdminEventInput): Promise<void> {
  try {
    await prisma.adminEvent.create({
      data: {
        actorId: event.actorId ?? null,
        targetUserId: event.targetUserId ?? null,
        eventType: event.eventType,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        targetLabel: event.targetLabel ?? null,
        detailsJson: event.details === undefined ? null : truncateJson(event.details, 4096),
      },
    });
  } catch (err) {
    console.error("[admin-events] failed to write event", event.eventType, err);
  }
}

export const EVENT_LABELS: Record<AdminEventType, string> = {
  USER_LOGIN: "User Login",
  USER_LOGOUT: "User Sign-out",
  USER_CREATED: "User Created",
  USER_UPDATED: "User Updated",
  USER_DELETED: "User Removed",
  USER_PASSWORD_CHANGED: "Password Changed",
  USER_ROLE_CHANGED: "Role Changed",
};
