import express from 'express';
import request from 'supertest';
import { ReviewLoginUseCase } from '../application/ReviewLoginUseCase';
import { hashReviewPassword, verifyReviewPassword } from '../infrastructure/reviewPassword';
import { IReviewAccountRepository } from '../ports/IReviewAccountRepository';
import { IUserRepository } from '../ports/IUserRepository';
import { ITokenService } from '../ports/ITokenService';
import { AuthController } from '../interface/AuthController';
import { authRouter } from '../interface/auth.routes';
import { errorMiddleware } from '../../../shared/middleware/error.middleware';

let passwordHash: string;
const password = 'test-only-long-random-password';
beforeAll(async () => { passwordHash = await hashReviewPassword(password); });

function setup({ enabled = true, status = 'active', found = true, allowed = true } = {}) {
  const accounts: IReviewAccountRepository = {
    consumeAttempt: jest.fn().mockResolvedValue(allowed),
    findAccount: jest.fn().mockImplementation(async () => found ? ({
      user: { id: 'review-user', nickname: 'SYAK 심사', profileImage: null, createdAt: new Date(), status },
      passwordHash, enabled,
    }) : null),
  };
  const saveRefreshToken = jest.fn().mockResolvedValue(undefined);
  const users = { saveRefreshToken } as unknown as IUserRepository;
  const tokens = { issueTokens: jest.fn().mockReturnValue({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 }),
    getRefreshExpiry: jest.fn().mockReturnValue(new Date(Date.now() + 86400000)) } as unknown as ITokenService;
  const useCase = new ReviewLoginUseCase(accounts, users, tokens, verifyReviewPassword);
  return { accounts, tokens, saveRefreshToken, useCase };
}

it('전용 계정으로 로그인하고 기존 소비자 세션을 발급한다', async () => {
  const { useCase, saveRefreshToken, tokens } = setup();
  const result = await useCase.execute('syak.review', password, 'ip-hash');
  expect(result.user.id).toBe('review-user');
  expect(result.isNewUser).toBe(false);
  expect(tokens.issueTokens).toHaveBeenCalledWith('review-user');
  expect(saveRefreshToken).toHaveBeenCalledTimes(1);
});

it.each([
  ['비밀번호 불일치', {}, 'wrong'], ['미등록 계정', { found: false }, password],
  ['비활성화 계정', { enabled: false }, password], ['차단 계정', { status: 'banned' }, password],
])('%s는 세션을 발급하지 않는다', async (_label, options, input) => {
  const { useCase, tokens, saveRefreshToken } = setup(options);
  await expect(useCase.execute('syak.review', input, 'ip-hash')).rejects.toMatchObject({ statusCode: 401 });
  expect(tokens.issueTokens).not.toHaveBeenCalled();
  expect(saveRefreshToken).not.toHaveBeenCalled();
});

it('시도 횟수 초과 시 비밀번호 검증 이전에 차단한다', async () => {
  const { useCase, accounts } = setup({ allowed: false });
  await expect(useCase.execute('syak.review', password, 'ip-hash')).rejects.toMatchObject({ statusCode: 429 });
  expect(accounts.findAccount).not.toHaveBeenCalled();
});

it('비밀번호는 매번 다른 salt를 사용하며 잘못된 해시도 실패한다', async () => {
  expect(await hashReviewPassword(password)).not.toBe(passwordHash);
  expect(await verifyReviewPassword(password, 'invalid')).toBe(false);
});

it('라우터는 HttpOnly 쿠키를 설정하고 응답에 토큰/해시를 포함하지 않는다', async () => {
  const { useCase } = setup();
  const controller = new AuthController(undefined!, undefined!, undefined!, undefined!, useCase);
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter(controller));
  app.use(errorMiddleware);
  const response = await request(app).post('/auth/review/login').send({ username: 'syak.review', password });
  expect(response.status).toBe(200);
  expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([
    expect.stringContaining('syak_access=access;'), expect.stringContaining('HttpOnly'),
  ]));
  expect(Object.keys(response.body).sort()).toEqual(['isNewUser', 'user']);
  expect(JSON.stringify(response.body)).not.toContain(passwordHash);
  const invalid = await request(app).post('/auth/review/login').send({ username: {}, password });
  expect(invalid.status).toBe(400);
});
