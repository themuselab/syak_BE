export interface PartnerCode {
  code: string;
  shopId: string;
  used: boolean;
  usedBy: string | null;
  expiresAt: Date;
}

export interface IPartnerCodeRepository {
  findByCode(code: string): Promise<PartnerCode | null>;
  markUsed(code: string, ownerId: string): Promise<void>;
  create(code: string, shopId: string, expiresAt: Date): Promise<void>;
}
