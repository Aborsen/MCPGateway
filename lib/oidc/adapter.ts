import { prisma } from "@/lib/db";
import type { Adapter, AdapterPayload } from "oidc-provider";

// Prisma adapter for panva/node-oidc-provider. Maps every model (Session,
// AccessToken, AuthorizationCode, Client, RefreshToken, etc.) into rows of
// the single OidcModel table, keyed by (model, id).
//
// Reference shape: spike used the same interface in scratch/oidc-spike.

export class PrismaAdapter implements Adapter {
  constructor(public readonly name: string) {}

  async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
    await prisma.oidcModel.upsert({
      where: { id: this.key(id) },
      create: {
        id: this.key(id),
        model: this.name,
        payload: payload as object,
        grantId: payload.grantId ?? null,
        userCode: payload.userCode ?? null,
        uid: payload.uid ?? null,
        expiresAt,
      },
      update: {
        payload: payload as object,
        grantId: payload.grantId ?? null,
        userCode: payload.userCode ?? null,
        uid: payload.uid ?? null,
        expiresAt,
        consumedAt: payload.consumed ? new Date(payload.consumed * 1000) : null,
      },
    });
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const row = await prisma.oidcModel.findUnique({ where: { id: this.key(id) } });
    if (!row) return undefined;
    if (row.expiresAt && row.expiresAt < new Date()) {
      await prisma.oidcModel.delete({ where: { id: row.id } }).catch(() => undefined);
      return undefined;
    }
    return row.payload as unknown as AdapterPayload;
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const row = await prisma.oidcModel.findFirst({
      where: { model: this.name, userCode },
    });
    return (row?.payload as unknown as AdapterPayload) ?? undefined;
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const row = await prisma.oidcModel.findFirst({
      where: { model: this.name, uid },
    });
    return (row?.payload as unknown as AdapterPayload) ?? undefined;
  }

  async consume(id: string): Promise<void> {
    const now = new Date();
    const row = await prisma.oidcModel.findUnique({ where: { id: this.key(id) } });
    if (!row) return;
    const payload = (row.payload as Record<string, unknown>) ?? {};
    payload.consumed = Math.floor(now.getTime() / 1000);
    await prisma.oidcModel.update({
      where: { id: row.id },
      data: { payload: payload as object, consumedAt: now },
    });
  }

  async destroy(id: string): Promise<void> {
    await prisma.oidcModel.delete({ where: { id: this.key(id) } }).catch(() => undefined);
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await prisma.oidcModel.deleteMany({ where: { grantId } });
  }

  private key(id: string): string {
    return `${this.name}:${id}`;
  }
}
