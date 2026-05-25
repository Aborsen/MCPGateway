import { prisma } from "./db";
import { truncateJson } from "./json";

export type AdminEventType =
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "USER_SUSPENDED"
  | "USER_UNSUSPENDED"
  | "USER_PASSWORD_CHANGED"
  | "USER_ROLE_CHANGED"
  | "USER_DATA_SOURCE_ACCESS_CHANGED"
  | "USER_DATA_SOURCE_ACCESS_REVOKED"
  | "WORKSPACE_USER_REMOVED"
  | "WORKSPACE_USER_PERMISSIONS_CHANGED"
  | "TOOL_LEVEL_OVERRIDDEN"
  // Phase 2 PR3 — RBAC admin authoring
  | "ROLE_CREATED"
  | "ROLE_UPDATED"
  | "ROLE_DELETED"
  | "ROLE_ASSIGNED"
  | "ROLE_UNASSIGNED"
  | "PERMISSION_OVERRIDE_GRANTED"
  | "PERMISSION_OVERRIDE_REVOKED";

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
  USER_SUSPENDED: "User Suspended",
  USER_UNSUSPENDED: "User Unsuspended",
  USER_PASSWORD_CHANGED: "Password Changed",
  USER_ROLE_CHANGED: "Role Changed",
  USER_DATA_SOURCE_ACCESS_CHANGED: "Direct Grant Changed",
  USER_DATA_SOURCE_ACCESS_REVOKED: "Direct Grant Revoked",
  WORKSPACE_USER_REMOVED: "Workspace Member Removed",
  WORKSPACE_USER_PERMISSIONS_CHANGED: "Workspace Member Permissions Changed",
  TOOL_LEVEL_OVERRIDDEN: "Tool Level Overridden",
  ROLE_CREATED: "Role Created",
  ROLE_UPDATED: "Role Updated",
  ROLE_DELETED: "Role Deleted",
  ROLE_ASSIGNED: "Role Assigned",
  ROLE_UNASSIGNED: "Role Unassigned",
  PERMISSION_OVERRIDE_GRANTED: "Permission Override Granted",
  PERMISSION_OVERRIDE_REVOKED: "Permission Override Revoked",
};
