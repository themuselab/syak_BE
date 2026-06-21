import { IPartnerCodeRepository } from '../ports/IPartnerCodeRepository';
import { Errors } from '../../../shared/errors/AppError';

// 혼동 방지 charset: 0/O/1/I 제외
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const EXPIRY_DAYS = 7;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

export class GeneratePartnerCodeUseCase {
  constructor(private readonly codeRepo: IPartnerCodeRepository) {}

  async execute(shopId: string): Promise<{ code: string; expiresAt: Date }> {
    if (!shopId) throw Errors.validation({ shopId: 'shopId가 필요합니다' });

    let code: string = '';
    let attempts = 0;
    while (true) {
      if (attempts++ > 10) throw Errors.internal();
      code = generateCode();
      const existing = await this.codeRepo.findByCode(code);
      if (!existing) break;
    }

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86_400_000);
    await this.codeRepo.create(code, shopId, expiresAt);
    return { code, expiresAt };
  }
}
