import { Request, Response, NextFunction, CookieOptions } from 'express';
import { SocialLoginUseCase } from '../application/SocialLoginUseCase';
import { RefreshTokenUseCase } from '../application/RefreshTokenUseCase';
import { SignOutUseCase } from '../application/SignOutUseCase';
import { LinkSocialAccountUseCase } from '../application/LinkSocialAccountUseCase';
import { SocialProvider } from '../domain/User';
import { AuthToken } from '../domain/AuthToken';
import { Errors } from '../../../shared/errors/AppError';
import { getAdminSSE } from '../../admin/infrastructure/AdminSSEService';

const ACCESS_MAX_AGE  = 15 * 60 * 1000;        // 15분
const REFRESH_MAX_AGE = 24 * 60 * 60 * 1000;   // 1일

const VALID_PROVIDERS: SocialProvider[] = ['kakao', 'naver', 'apple'];

export class AuthController {
  constructor(
    private readonly socialLogin: SocialLoginUseCase,
    private readonly refreshToken: RefreshTokenUseCase,
    private readonly signOut: SignOutUseCase,
    private readonly linkAccount: LinkSocialAccountUseCase,
  ) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const provider = req.params.provider as SocialProvider;
    if (!VALID_PROVIDERS.includes(provider)) {
      return next(Errors.validation({ provider: '지원하지 않는 소셜 로그인 방식입니다' }));
    }
    const { access_token } = req.body;
    if (!access_token) {
      return next(Errors.validation({ access_token: 'access_token이 필요합니다' }));
    }
    try {
      const result = await this.socialLogin.execute(provider, access_token);
      this.setCookies(res, result.token);
      if (result.isNewUser) void getAdminSSE()?.pushNow();
      res.status(result.isNewUser ? 201 : 200).json({
        user: result.user,
        isNewUser: result.isNewUser,
      });
    } catch (err) {
      next(err);
    }
  };

  link = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const provider = req.params.provider as SocialProvider;
    if (!VALID_PROVIDERS.includes(provider)) {
      return next(Errors.validation({ provider: '지원하지 않는 소셜 로그인 방식입니다' }));
    }
    const { access_token } = req.body;
    if (!access_token) {
      return next(Errors.validation({ access_token: 'access_token이 필요합니다' }));
    }
    try {
      const result = await this.linkAccount.execute(req.user!.sub, provider, access_token);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const refreshToken = req.cookies?.syak_refresh as string | undefined;
    if (!refreshToken) {
      return next(Errors.refreshInvalid());
    }
    try {
      const tokens = await this.refreshToken.execute(refreshToken);
      this.setCookies(res, tokens);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.signOut.execute(req.user!.sub);
      this.clearCookies(res);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  private cookieBase(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: (process.env.COOKIE_SAME_SITE ?? 'lax') as CookieOptions['sameSite'],
    };
  }

  private setCookies(res: Response, tokens: AuthToken): void {
    const base = this.cookieBase();
    res.cookie('syak_access', tokens.accessToken, { ...base, maxAge: ACCESS_MAX_AGE });
    res.cookie('syak_refresh', tokens.refreshToken, {
      ...base,
      maxAge: REFRESH_MAX_AGE,
      path: '/api/v1/auth/token/refresh',
    });
  }

  private clearCookies(res: Response): void {
    const base = this.cookieBase();
    res.clearCookie('syak_access', base);
    res.clearCookie('syak_refresh', { ...base, path: '/api/v1/auth/token/refresh' });
  }
}
